import os
import json
import struct
import shutil
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional
from app.crypto_service import CryptoService, IntegrityError, CryptoError
from app.vault_service import VaultService

MAGIC = b"SVLT"
FORMAT_VERSION = 2
BACKUP_AAD = b"vault_backup|v2"


class BackupService:
    def __init__(self, vault_service: VaultService, data_dir: Optional[str] = None):
        self.vault = vault_service
        self.data_dir = data_dir or os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
        os.makedirs(self.data_dir, exist_ok=True)

    def _ensure_unlocked(self):
        if not self.vault.is_unlocked():
            raise ValueError("Vault is locked")

    def export_vault(self, target_filepath: Optional[str] = None) -> Dict[str, Any]:
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        row = conn.execute(
            "SELECT kdf_salt, kdf_params, wrapped_vault_key, verifier FROM vault_meta WHERE id = 1"
        ).fetchone()
        if not row:
            raise ValueError("Vault metadata not found")

        salt = row["kdf_salt"]
        kdf_params_bytes = row["kdf_params"].encode("utf-8")
        wrapped_key = row["wrapped_vault_key"]
        verifier = row["verifier"]
        vault_key = self.vault.get_vault_key()

        # Dump all encrypted database tables as JSON bundle
        backup_data = {
            "version": 2,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "items": [dict(r) for r in conn.execute("SELECT * FROM items").fetchall()],
            "projects": [dict(r) for r in conn.execute("SELECT * FROM projects").fetchall()],
            "categories": [dict(r) for r in conn.execute("SELECT * FROM categories").fetchall()],
            "templates": [dict(r) for r in conn.execute("SELECT * FROM templates").fetchall()],
            "settings": [dict(r) for r in conn.execute("SELECT * FROM settings").fetchall()],
            "settings_enc": [dict(r) for r in conn.execute("SELECT * FROM settings_enc").fetchall()],
        }

        # Convert blobs to hex strings for serialization
        for table in ["items", "projects", "categories", "templates", "settings_enc"]:
            for item in backup_data[table]:
                for k, v in item.items():
                    if isinstance(v, bytes):
                        item[k] = v.hex()

        raw_bytes = json.dumps(backup_data).encode("utf-8")
        encrypted_body = CryptoService.encrypt_payload(vault_key, raw_bytes, BACKUP_AAD)

        # Assemble file format
        # Header: MAGIC (4B) + VERSION (2B)
        # Salt (16B)
        # KDF Params length (2B) + KDF Params
        # Wrapped Key length (2B) + Wrapped Key
        # Verifier length (2B) + Verifier
        # Encrypted Body
        header = bytearray(MAGIC)
        header.extend(struct.pack(">H", FORMAT_VERSION))
        header.extend(salt)
        header.extend(struct.pack(">H", len(kdf_params_bytes)))
        header.extend(kdf_params_bytes)
        header.extend(struct.pack(">H", len(wrapped_key)))
        header.extend(wrapped_key)
        header.extend(struct.pack(">H", len(verifier)))
        header.extend(verifier)

        final_data = bytes(header) + encrypted_body

        now_str = datetime.now().strftime("%Y%m%d-%H%M")
        filename = f"vault-{now_str}.vault"
        out_path = target_filepath or os.path.join(self.data_dir, filename)

        with open(out_path, "wb") as f:
            f.write(final_data)

        # Mandatory Post-export Verification (Section 9.5)
        verification_result = self.verify_backup_file(out_path, vault_key)
        if not verification_result["valid"]:
            try:
                os.remove(out_path)
            except Exception:
                pass
            raise IntegrityError(f"Post-export verification failed: {verification_result.get('error')}")

        # Update last_backup_at
        now_iso = datetime.now(timezone.utc).isoformat()
        with conn:
            conn.execute("UPDATE vault_meta SET last_backup_at = ? WHERE id = 1", (now_iso,))

        return {
            "success": True,
            "filename": os.path.basename(out_path),
            "filepath": os.path.abspath(out_path),
            "size_bytes": len(final_data),
            "verified": True,
            "items_count": len(backup_data["items"]),
        }

    def verify_backup_file(self, filepath: str, vault_key: Optional[bytes] = None) -> Dict[str, Any]:
        if not os.path.exists(filepath):
            return {"valid": False, "error": "File does not exist"}

        with open(filepath, "rb") as f:
            content = f.read()

        if len(content) < 60:
            return {"valid": False, "error": "File too small to be a valid vault backup"}

        if content[:4] != MAGIC:
            return {"valid": False, "error": "Invalid magic header"}

        version = struct.unpack(">H", content[4:6])[0]
        if version != FORMAT_VERSION:
            return {"valid": False, "error": f"Unsupported backup format version: {version}"}

        offset = 6
        salt = content[offset : offset + 16]
        offset += 16

        kdf_len = struct.unpack(">H", content[offset : offset + 2])[0]
        offset += 2
        kdf_params = json.loads(content[offset : offset + kdf_len].decode("utf-8"))
        offset += kdf_len

        wrapped_key_len = struct.unpack(">H", content[offset : offset + 2])[0]
        offset += 2
        wrapped_key = content[offset : offset + wrapped_key_len]
        offset += wrapped_key_len

        verifier_len = struct.unpack(">H", content[offset : offset + 2])[0]
        offset += 2
        verifier = content[offset : offset + verifier_len]
        offset += verifier_len

        encrypted_body = content[offset:]

        if vault_key:
            # Check verifier
            if not CryptoService.check_verifier(vault_key, verifier):
                return {"valid": False, "error": "Verifier check failed"}
            # Decrypt body and verify GCM tag
            try:
                decrypted_bytes = CryptoService.decrypt_payload(vault_key, encrypted_body, BACKUP_AAD)
                data = json.loads(decrypted_bytes.decode("utf-8"))
                return {
                    "valid": True,
                    "items_count": len(data.get("items", [])),
                    "version": version,
                }
            except Exception as e:
                return {"valid": False, "error": f"Payload integrity verification failed: {str(e)}"}

        return {"valid": True, "version": version, "requires_password_for_deep_check": True}

    def import_vault(self, filepath: str, master_password: str, confirm_overwrite: bool = False) -> Dict[str, Any]:
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Backup file not found: {filepath}")

        # Check if current vault exists
        if self.vault.is_initialized() and not confirm_overwrite:
            return {
                "requires_confirmation": True,
                "status_code": 409,
                "message": "A vault already exists. Overwriting will replace all data. Safety snapshot will be taken.",
            }

        with open(filepath, "rb") as f:
            content = f.read()

        if content[:4] != MAGIC:
            raise ValueError("Invalid vault backup file")

        offset = 6
        salt = content[offset : offset + 16]
        offset += 16

        kdf_len = struct.unpack(">H", content[offset : offset + 2])[0]
        offset += 2
        kdf_params = json.loads(content[offset : offset + kdf_len].decode("utf-8"))
        offset += kdf_len

        wrapped_key_len = struct.unpack(">H", content[offset : offset + 2])[0]
        offset += 2
        wrapped_key = content[offset : offset + wrapped_key_len]
        offset += wrapped_key_len

        verifier_len = struct.unpack(">H", content[offset : offset + 2])[0]
        offset += 2
        verifier = content[offset : offset + verifier_len]
        offset += verifier_len

        encrypted_body = content[offset:]

        # Derive KEK and unwrap key
        try:
            kek = CryptoService.derive_kek(master_password, salt, kdf_params)
            backup_vault_key = CryptoService.unwrap_vault_key(kek, wrapped_key)
            if not CryptoService.check_verifier(backup_vault_key, verifier):
                raise IntegrityError("Verifier check failed")
            decrypted_bytes = CryptoService.decrypt_payload(backup_vault_key, encrypted_body, BACKUP_AAD)
            backup_data = json.loads(decrypted_bytes.decode("utf-8"))
        except Exception:
            raise ValueError("Invalid master password or corrupted backup file")

        # Create safety snapshot of current vault if initialized and unlocked
        if self.vault.is_initialized() and self.vault.is_unlocked():
            snapshot_path = os.path.join(
                self.data_dir,
                f"safety_snapshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.vault",
            )
            try:
                self.export_vault(snapshot_path)
            except Exception:
                pass

        # Write data to current DB
        conn = self.vault.get_connection()
        now_iso = datetime.now(timezone.utc).isoformat()
        with conn:
            conn.execute("DELETE FROM items")
            conn.execute("DELETE FROM projects")
            conn.execute("DELETE FROM categories")
            conn.execute("DELETE FROM templates")
            conn.execute("DELETE FROM settings")
            conn.execute("DELETE FROM settings_enc")
            conn.execute("DELETE FROM vault_meta")

            conn.execute(
                """
                INSERT INTO vault_meta (
                    id, format_version, kdf_salt, kdf_params, wrapped_vault_key, verifier, password_hint, created_at, updated_at, last_backup_at
                ) VALUES (1, 2, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    salt,
                    json.dumps(kdf_params),
                    wrapped_key,
                    verifier,
                    None,
                    now_iso,
                    now_iso,
                    now_iso,
                ),
            )

            # Insert items
            for it in backup_data.get("items", []):
                conn.execute(
                    """
                    INSERT INTO items (
                        id, project_id, category_id, is_favorite, is_pinned, is_archived,
                        expires_at, created_at, updated_at, last_used_at, deleted_at,
                        payload_enc, schema_version
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        it["id"], it["project_id"], it["category_id"], it["is_favorite"], it["is_pinned"], it["is_archived"],
                        it["expires_at"], it["created_at"], it["updated_at"], it["last_used_at"], it["deleted_at"],
                        bytes.fromhex(it["payload_enc"]) if isinstance(it["payload_enc"], str) else it["payload_enc"],
                        it.get("schema_version", 2),
                    ),
                )

            for p in backup_data.get("projects", []):
                conn.execute(
                    "INSERT INTO projects (id, sort_order, created_at, updated_at, payload_enc) VALUES (?, ?, ?, ?, ?)",
                    (
                        p["id"], p["sort_order"], p["created_at"], p["updated_at"],
                        bytes.fromhex(p["payload_enc"]) if isinstance(p["payload_enc"], str) else p["payload_enc"],
                    ),
                )

            for c in backup_data.get("categories", []):
                conn.execute(
                    "INSERT INTO categories (id, sort_order, created_at, updated_at, payload_enc) VALUES (?, ?, ?, ?, ?)",
                    (
                        c["id"], c["sort_order"], c["created_at"], c["updated_at"],
                        bytes.fromhex(c["payload_enc"]) if isinstance(c["payload_enc"], str) else c["payload_enc"],
                    ),
                )

            for t in backup_data.get("templates", []):
                conn.execute(
                    "INSERT INTO templates (id, is_builtin, sort_order, created_at, updated_at, payload_enc) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        t["id"], t["is_builtin"], t["sort_order"], t["created_at"], t["updated_at"],
                        bytes.fromhex(t["payload_enc"]) if isinstance(t["payload_enc"], str) else t["payload_enc"],
                    ),
                )

            for s in backup_data.get("settings", []):
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (s["key"], s["value"]))

            for se in backup_data.get("settings_enc", []):
                conn.execute(
                    "INSERT OR REPLACE INTO settings_enc (key, payload_enc) VALUES (?, ?)",
                    (se["key"], bytes.fromhex(se["payload_enc"]) if isinstance(se["payload_enc"], str) else se["payload_enc"]),
                )

        # Reload and unlock
        self.vault.unlock(master_password)
        return {
            "success": True,
            "message": "Vault successfully imported and verified",
            "items_restored": len(backup_data.get("items", [])),
        }

    def get_backup_health(self) -> Dict[str, Any]:
        row = self.vault.get_connection().execute("SELECT last_backup_at FROM vault_meta WHERE id = 1").fetchone()
        if not row or not row["last_backup_at"]:
            return {
                "health": "danger",
                "days_since_last_backup": None,
                "last_backup_at": None,
                "message": "No verified backup has ever been performed. Export a backup now!",
            }

        last_b = datetime.fromisoformat(row["last_backup_at"])
        delta_days = (datetime.now(timezone.utc) - last_b).days
        if delta_days >= 30:
            health = "danger"
            msg = f"Last backup was {delta_days} days ago. Vault is at risk!"
        elif delta_days >= 7:
            health = "warning"
            msg = f"Last backup was {delta_days} days ago. Recommended to backup."
        else:
            health = "ok"
            msg = f"Backup health is good. Last backup was {delta_days} days ago."

        return {
            "health": health,
            "days_since_last_backup": delta_days,
            "last_backup_at": row["last_backup_at"],
            "message": msg,
        }

    # --- V2: Unencrypted JSON/CSV Export (Migration path) ---
    def export_unencrypted(self, format_type: str = "json") -> Tuple[str, str, bytes]:
        self._ensure_unlocked()
        items = [it for it in self.vault.items_index.values() if it.get("deleted_at") is None]
        now_str = datetime.now().strftime("%Y%m%d_%H%M%S")

        if format_type == "json":
            unencrypted_data = {
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "warning": "PLAINTEXT EXPORT: Contains unencrypted secret credentials.",
                "items": [
                    {
                        "id": it["id"],
                        "project_id": it["project_id"],
                        "category_id": it["category_id"],
                        "title": it.get("payload", {}).get("title"),
                        "website_url": it.get("payload", {}).get("website_url"),
                        "description": it.get("payload", {}).get("description"),
                        "tags": it.get("payload", {}).get("tags", []),
                        "fields": it.get("payload", {}).get("fields", []),
                    }
                    for it in items
                ],
            }
            content_bytes = json.dumps(unencrypted_data, indent=2, ensure_ascii=False).encode("utf-8")
            return f"vault_export_{now_str}.json", "application/json", content_bytes
        elif format_type == "csv":
            import csv
            import io
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(["item_id", "title", "website_url", "tags", "field_label", "field_type", "is_secret", "field_value"])
            for it in items:
                p = it.get("payload", {})
                title = p.get("title", "")
                url = p.get("website_url", "")
                tags = ";".join(p.get("tags") or [])
                for f in p.get("fields", []):
                    val = f.get("value")
                    if val is None and f.get("values"):
                        val = json.dumps(f["values"])
                    writer.writerow([it["id"], title, url, tags, f.get("label", ""), f.get("type", ""), f.get("is_secret", False), str(val or "")])
            content_bytes = buf.getvalue().encode("utf-8")
            return f"vault_export_{now_str}.csv", "text/csv", content_bytes
        else:
            raise ValueError(f"Unsupported format: {format_type}")
