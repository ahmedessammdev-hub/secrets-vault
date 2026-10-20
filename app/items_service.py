import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from app.crypto_service import CryptoService
from app.vault_service import VaultService
from app.models import ItemModel, ItemPayload, ItemField, ItemCreateRequest, ItemUpdateRequest, BulkActionRequest
from app.clipboard import copy_to_clipboard


class ItemsService:
    def __init__(self, vault_service: VaultService):
        self.vault = vault_service

    def _ensure_unlocked(self):
        if not self.vault.is_unlocked():
            raise ValueError("Vault is locked")

    def list_items(
        self,
        search: Optional[str] = None,
        project_id: Optional[str] = None,
        category_id: Optional[str] = None,
        tag: Optional[str] = None,
        is_favorite: Optional[bool] = None,
        is_archived: Optional[bool] = False,
        in_trash: bool = False,
        smart_view: Optional[str] = None,
        sort_by: str = "updated_at",  # "updated_at", "title", "last_used_at", "expires_at"
    ) -> List[Dict[str, Any]]:
        self._ensure_unlocked()
        items = list(self.vault.items_index.values())

        # Filter trash vs active
        if in_trash:
            items = [it for it in items if it.get("deleted_at") is not None]
        else:
            items = [it for it in items if it.get("deleted_at") is None]

        # Filter archive
        if not in_trash:
            if is_archived is not None:
                items = [it for it in items if it.get("is_archived") == is_archived]

        if is_favorite is not None:
            items = [it for it in items if it.get("is_favorite") == is_favorite]

        if project_id:
            items = [it for it in items if it.get("project_id") == project_id]

        if category_id:
            items = [it for it in items if it.get("category_id") == category_id]

        if tag:
            items = [it for it in items if tag.lower() in [t.lower() for t in it.get("payload", {}).get("tags", [])]]

        now = datetime.now(timezone.utc)

        # Smart Views
        if smart_view == "expiring_30d":
            target = now + timedelta(days=30)
            res = []
            for it in items:
                exp = it.get("expires_at")
                if exp:
                    try:
                        exp_dt = datetime.fromisoformat(exp)
                        if now <= exp_dt <= target:
                            res.append(it)
                    except Exception:
                        pass
            items = res
        elif smart_view == "expired":
            res = []
            for it in items:
                exp = it.get("expires_at")
                if exp:
                    try:
                        exp_dt = datetime.fromisoformat(exp)
                        if exp_dt < now:
                            res.append(it)
                    except Exception:
                        pass
            items = res
        elif smart_view == "not_used_90d":
            cutoff = now - timedelta(days=90)
            res = []
            for it in items:
                lu = it.get("last_used_at")
                if not lu:
                    res.append(it)
                else:
                    try:
                        if datetime.fromisoformat(lu) < cutoff:
                            res.append(it)
                    except Exception:
                        res.append(it)
            items = res
        elif smart_view == "no_project":
            items = [it for it in items if not it.get("project_id")]
        elif smart_view == "no_2fa":
            res = []
            for it in items:
                fields = it.get("payload", {}).get("fields", [])
                has_pass = any(f.get("type") in ("secret", "password") for f in fields)
                has_totp = any(f.get("type") == "totp" for f in fields)
                if has_pass and not has_totp:
                    res.append(it)
            items = res
        elif smart_view == "reused_secrets":
            # Find values that appear in more than one item
            val_to_items: Dict[str, List[str]] = {}
            for it in items:
                for f in it.get("payload", {}).get("fields", []):
                    if f.get("is_secret"):
                        val = f.get("value")
                        if val and isinstance(val, str) and len(val) >= 4:
                            val_to_items.setdefault(val, []).append(it["id"])
                        vals = f.get("values")
                        if isinstance(vals, dict):
                            for v in vals.values():
                                if v and isinstance(v, str) and len(v) >= 4:
                                    val_to_items.setdefault(v, []).append(it["id"])
            reused_item_ids = set()
            for v, ids in val_to_items.items():
                if len(set(ids)) > 1:
                    reused_item_ids.update(ids)
            items = [it for it in items if it["id"] in reused_item_ids]

        # Search index
        if search:
            q = search.lower().strip()
            matched = []
            for it in items:
                p = it.get("payload", {})
                title = (p.get("title") or "").lower()
                desc = (p.get("description") or "").lower()
                tags = " ".join(p.get("tags") or []).lower()
                labels = " ".join(f.get("label", "") for f in p.get("fields", [])).lower()
                
                # Project and Category names
                proj = self.vault.projects_index.get(it.get("project_id") or "", {}).get("payload", {}).get("name", "").lower()
                cat = self.vault.categories_index.get(it.get("category_id") or "", {}).get("payload", {}).get("name", "").lower()

                if q in title or q in desc or q in tags or q in labels or q in proj or q in cat:
                    matched.append(it)
            items = matched

        # Sort
        if sort_by == "title":
            items.sort(key=lambda x: (x.get("payload", {}).get("title") or "").lower())
        elif sort_by == "last_used_at":
            items.sort(key=lambda x: x.get("last_used_at") or "", reverse=True)
        elif sort_by == "expires_at":
            items.sort(key=lambda x: x.get("expires_at") or "9999", reverse=False)
        else:  # updated_at default
            items.sort(key=lambda x: x.get("updated_at") or "", reverse=True)

        return items

    def get_item(self, item_id: str) -> Dict[str, Any]:
        self._ensure_unlocked()
        item = self.vault.items_index.get(item_id)
        if not item:
            raise KeyError("Item not found")

        # Resolve reference fields
        item_copy = json.loads(json.dumps(item))
        for f in item_copy.get("payload", {}).get("fields", []):
            if f.get("type") == "reference":
                ref_val = f.get("value") or ""
                target_id = ref_val.replace("item:", "")
                target = self.vault.items_index.get(target_id)
                if target:
                    f["reference_title"] = target.get("payload", {}).get("title", "Untitled")
                    f["reference_status"] = "valid"
                else:
                    f["reference_title"] = "(Missing reference)"
                    f["reference_status"] = "missing"
        return item_copy

    def create_item(self, req: ItemCreateRequest) -> Dict[str, Any]:
        self._ensure_unlocked()
        item_id = f"item_{uuid.uuid4().hex}"
        now_iso = datetime.now(timezone.utc).isoformat()
        key = self.vault.get_vault_key()

        # Compute rotation expiry if specified
        expires_at = req.expires_at
        if req.payload.rotation_days and req.payload.rotation_days > 0 and not expires_at:
            expires_at = (datetime.now(timezone.utc) + timedelta(days=req.payload.rotation_days)).isoformat()

        payload_dict = req.payload.model_dump()
        payload_bytes = json.dumps(payload_dict).encode("utf-8")
        aad = f"{item_id}|2".encode("utf-8")
        ciphertext = CryptoService.encrypt_payload(key, payload_bytes, aad)

        conn = self.vault.get_connection()
        with conn:
            conn.execute(
                """
                INSERT INTO items (
                    id, project_id, category_id, is_favorite, is_pinned, is_archived,
                    expires_at, created_at, updated_at, last_used_at, deleted_at,
                    payload_enc, schema_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 2)
                """,
                (
                    item_id,
                    req.project_id,
                    req.category_id,
                    1 if req.is_favorite else 0,
                    1 if req.is_pinned else 0,
                    1 if req.is_archived else 0,
                    expires_at,
                    now_iso,
                    now_iso,
                    ciphertext,
                ),
            )

        new_item = {
            "id": item_id,
            "project_id": req.project_id,
            "category_id": req.category_id,
            "is_favorite": req.is_favorite,
            "is_pinned": req.is_pinned,
            "is_archived": req.is_archived,
            "expires_at": expires_at,
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_used_at": None,
            "deleted_at": None,
            "payload": payload_dict,
        }
        self.vault.items_index[item_id] = new_item
        return new_item

    def update_item(self, item_id: str, req: ItemUpdateRequest) -> Dict[str, Any]:
        self._ensure_unlocked()
        current = self.vault.items_index.get(item_id)
        if not current:
            raise KeyError("Item not found")

        now_iso = datetime.now(timezone.utc).isoformat()
        key = self.vault.get_vault_key()

        # Update metadata flags
        project_id = req.project_id if req.project_id is not None else current["project_id"]
        category_id = req.category_id if req.category_id is not None else current["category_id"]
        is_favorite = req.is_favorite if req.is_favorite is not None else current["is_favorite"]
        is_pinned = req.is_pinned if req.is_pinned is not None else current["is_pinned"]
        is_archived = req.is_archived if req.is_archived is not None else current["is_archived"]
        expires_at = req.expires_at if req.expires_at is not None else current["expires_at"]

        payload_dict = current["payload"]
        if req.payload is not None:
            new_payload_dict = req.payload.model_dump()
            # Manage Field History for secret fields
            old_fields_map = {f["id"]: f for f in payload_dict.get("fields", [])}
            secret_value_changed = False

            for new_f in new_payload_dict.get("fields", []):
                fid = new_f.get("id")
                old_f = old_fields_map.get(fid)
                if old_f and new_f.get("is_secret"):
                    history = list(old_f.get("history") or [])
                    # Check single value change
                    if old_f.get("value") != new_f.get("value") and old_f.get("value") is not None:
                        history.append({"env": "default", "value": old_f.get("value"), "replaced_at": now_iso})
                        secret_value_changed = True
                    # Check per-env changes
                    old_vals = old_f.get("values") or {}
                    new_vals = new_f.get("values") or {}
                    for env_k, old_v in old_vals.items():
                        if old_v != new_vals.get(env_k) and old_v is not None:
                            history.append({"env": env_k, "value": old_v, "replaced_at": now_iso})
                            secret_value_changed = True
                    # Cap at 5
                    new_f["history"] = history[-5:]

            # Rotation days recompute
            rot_days = new_payload_dict.get("rotation_days")
            if rot_days and rot_days > 0 and secret_value_changed:
                expires_at = (datetime.now(timezone.utc) + timedelta(days=rot_days)).isoformat()

            payload_dict = new_payload_dict

        aad = f"{item_id}|2".encode("utf-8")
        payload_bytes = json.dumps(payload_dict).encode("utf-8")
        ciphertext = CryptoService.encrypt_payload(key, payload_bytes, aad)

        conn = self.vault.get_connection()
        with conn:
            conn.execute(
                """
                UPDATE items SET
                    project_id = ?, category_id = ?, is_favorite = ?, is_pinned = ?, is_archived = ?,
                    expires_at = ?, updated_at = ?, payload_enc = ?
                WHERE id = ?
                """,
                (
                    project_id,
                    category_id,
                    1 if is_favorite else 0,
                    1 if is_pinned else 0,
                    1 if is_archived else 0,
                    expires_at,
                    now_iso,
                    ciphertext,
                    item_id,
                ),
            )

        updated_item = {
            "id": item_id,
            "project_id": project_id,
            "category_id": category_id,
            "is_favorite": is_favorite,
            "is_pinned": is_pinned,
            "is_archived": is_archived,
            "expires_at": expires_at,
            "created_at": current["created_at"],
            "updated_at": now_iso,
            "last_used_at": current["last_used_at"],
            "deleted_at": current["deleted_at"],
            "payload": payload_dict,
        }
        self.vault.items_index[item_id] = updated_item
        return updated_item

    def delete_item(self, item_id: str, permanent: bool = False) -> None:
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        if permanent:
            with conn:
                conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
            if item_id in self.vault.items_index:
                del self.vault.items_index[item_id]
        else:
            now_iso = datetime.now(timezone.utc).isoformat()
            with conn:
                conn.execute("UPDATE items SET deleted_at = ? WHERE id = ?", (now_iso, item_id))
            if item_id in self.vault.items_index:
                self.vault.items_index[item_id]["deleted_at"] = now_iso

    def restore_item(self, item_id: str) -> None:
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        with conn:
            conn.execute("UPDATE items SET deleted_at = NULL WHERE id = ?", (item_id,))
        if item_id in self.vault.items_index:
            self.vault.items_index[item_id]["deleted_at"] = None

    def restore_field_history(self, item_id: str, field_id: str, history_idx: int) -> Dict[str, Any]:
        self._ensure_unlocked()
        item = self.vault.items_index.get(item_id)
        if not item:
            raise KeyError("Item not found")

        payload = item["payload"]
        for f in payload.get("fields", []):
            if f.get("id") == field_id:
                history = f.get("history", [])
                if history_idx < 0 or history_idx >= len(history):
                    raise IndexError("Invalid history index")
                entry = history.pop(history_idx)
                env = entry.get("env", "default")
                old_val = entry.get("value")
                if env == "default":
                    current_val = f.get("value")
                    f["value"] = old_val
                    if current_val is not None:
                        history.append({"env": "default", "value": current_val, "replaced_at": datetime.now(timezone.utc).isoformat()})
                else:
                    vals = f.setdefault("values", {})
                    current_val = vals.get(env)
                    vals[env] = old_val
                    if current_val is not None:
                        history.append({"env": env, "value": current_val, "replaced_at": datetime.now(timezone.utc).isoformat()})
                f["history"] = history[-5:]
                break

        # Save update
        req = ItemUpdateRequest(payload=ItemPayload(**payload))
        return self.update_item(item_id, req)

    def clear_field_history(self, item_id: str, field_id: str) -> Dict[str, Any]:
        self._ensure_unlocked()
        item = self.vault.items_index.get(item_id)
        if not item:
            raise KeyError("Item not found")

        payload = item["payload"]
        for f in payload.get("fields", []):
            if f.get("id") == field_id:
                f["history"] = []
                break

        req = ItemUpdateRequest(payload=ItemPayload(**payload))
        return self.update_item(item_id, req)

    def copy_field(
        self, item_id: str, field_id: Optional[str] = None, env: Optional[str] = None, ttl_seconds: int = 30
    ) -> Dict[str, Any]:
        self._ensure_unlocked()
        item = self.vault.items_index.get(item_id)
        if not item:
            raise KeyError("Item not found")

        fields = item.get("payload", {}).get("fields", [])
        target_field = None
        if field_id:
            for f in fields:
                if f.get("id") == field_id:
                    target_field = f
                    break
        else:
            # Primary secret or first field
            for f in fields:
                if f.get("is_secret") or f.get("type") in ("secret", "password"):
                    target_field = f
                    break
            if not target_field and fields:
                target_field = fields[0]

        if not target_field:
            raise ValueError("Field not found to copy")

        # Resolve reference
        if target_field.get("type") == "reference":
            ref_val = target_field.get("value") or ""
            ref_id = ref_val.replace("item:", "")
            ref_item = self.vault.items_index.get(ref_id)
            if not ref_item:
                raise ValueError("Referenced item does not exist")
            # Find primary secret in referenced item
            ref_fields = ref_item.get("payload", {}).get("fields", [])
            val_to_copy = None
            for rf in ref_fields:
                if rf.get("is_secret") or rf.get("type") in ("secret", "password"):
                    val_to_copy = rf.get("value")
                    break
            if val_to_copy is None and ref_fields:
                val_to_copy = ref_fields[0].get("value")
        else:
            if target_field.get("values"):
                vals = target_field["values"]
                val_to_copy = vals.get(env) if env else (vals.get("production") or vals.get("default") or next(iter(vals.values()), ""))
            else:
                val_to_copy = target_field.get("value") or ""

        # Copy to clipboard
        str_val = str(val_to_copy) if val_to_copy is not None else ""
        copy_to_clipboard(str_val, ttl_seconds=ttl_seconds)

        # Update last_used_at
        now_iso = datetime.now(timezone.utc).isoformat()
        conn = self.vault.get_connection()
        with conn:
            conn.execute("UPDATE items SET last_used_at = ? WHERE id = ?", (now_iso, item_id))
        item["last_used_at"] = now_iso

        return {
            "success": True,
            "message": f"Copied to clipboard (clears in {ttl_seconds}s)",
            "clears_in": ttl_seconds,
        }

    def bulk_action(self, req: BulkActionRequest) -> Dict[str, Any]:
        self._ensure_unlocked()
        affected = 0
        for item_id in req.item_ids:
            item = self.vault.items_index.get(item_id)
            if not item:
                continue

            if req.action == "move_project":
                self.update_item(item_id, ItemUpdateRequest(project_id=req.target_id))
                affected += 1
            elif req.action == "move_category":
                self.update_item(item_id, ItemUpdateRequest(category_id=req.target_id))
                affected += 1
            elif req.action == "archive":
                self.update_item(item_id, ItemUpdateRequest(is_archived=True))
                affected += 1
            elif req.action == "unarchive":
                self.update_item(item_id, ItemUpdateRequest(is_archived=False))
                affected += 1
            elif req.action == "delete":
                self.delete_item(item_id, permanent=False)
                affected += 1
            elif req.action == "add_tag" and req.tag_value:
                payload = dict(item["payload"])
                tags = list(payload.get("tags") or [])
                if req.tag_value not in tags:
                    tags.append(req.tag_value)
                    payload["tags"] = tags
                    self.update_item(item_id, ItemUpdateRequest(payload=ItemPayload(**payload)))
                affected += 1
            elif req.action == "remove_tag" and req.tag_value:
                payload = dict(item["payload"])
                tags = [t for t in (payload.get("tags") or []) if t != req.tag_value]
                payload["tags"] = tags
                self.update_item(item_id, ItemUpdateRequest(payload=ItemPayload(**payload)))
                affected += 1

        return {"success": True, "affected": affected}

    # --- V2: TOTP Code & QR Code Generation ---
    def get_totp_code(self, item_id: str, field_id: str) -> Dict[str, Any]:
        import pyotp
        import urllib.parse
        import time

        self._ensure_unlocked()
        item = self.vault.items_index.get(item_id)
        if not item:
            raise KeyError("Item not found")

        target_field = None
        for f in item.get("payload", {}).get("fields", []):
            if f.get("id") == field_id:
                target_field = f
                break

        if not target_field:
            raise KeyError("Field not found")

        secret_or_uri = str(target_field.get("value") or "").strip()
        if not secret_or_uri:
            raise ValueError("Field contains no secret")

        if secret_or_uri.startswith("otpauth://"):
            parsed = urllib.parse.urlparse(secret_or_uri)
            qs = urllib.parse.parse_qs(parsed.query)
            secret_or_uri = qs.get("secret", [""])[0]

        secret = secret_or_uri.replace(" ", "").upper()
        try:
            totp = pyotp.TOTP(secret)
            current_code = totp.now()
            seconds_remaining = 30 - (int(time.time()) % 30)
            return {"code": current_code, "seconds_remaining": seconds_remaining}
        except Exception as e:
            raise ValueError(f"Invalid TOTP key: {e}")

    def get_field_qr(self, item_id: str, field_id: str) -> bytes:
        import qrcode
        import io

        self._ensure_unlocked()
        item = self.vault.items_index.get(item_id)
        if not item:
            raise KeyError("Item not found")

        target_field = None
        for f in item.get("payload", {}).get("fields", []):
            if f.get("id") == field_id:
                target_field = f
                break

        if not target_field:
            raise KeyError("Field not found")

        val = str(target_field.get("value") or "")
        qr = qrcode.make(val)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        return buf.getvalue()

    # --- V2: Encrypted Attachments ---
    def add_attachment(self, item_id: str, filename: str, mime: str, data: bytes) -> Dict[str, Any]:
        self._ensure_unlocked()
        item = self.vault.items_index.get(item_id)
        if not item:
            raise KeyError("Item not found")

        aid = f"att_{uuid.uuid4().hex}"
        now_iso = datetime.now(timezone.utc).isoformat()
        key = self.vault.get_vault_key()
        aad = f"attachment:{aid}".encode("utf-8")
        ciphertext = CryptoService.encrypt_payload(key, data, aad)

        conn = self.vault.get_connection()
        with conn:
            conn.execute(
                """
                INSERT INTO attachments (id, item_id, filename, size, mime, created_at, data_enc)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (aid, item_id, filename, len(data), mime, now_iso, ciphertext),
            )

        return {
            "id": aid,
            "item_id": item_id,
            "filename": filename,
            "size": len(data),
            "mime": mime,
            "created_at": now_iso,
        }

    def list_attachments(self, item_id: str) -> List[Dict[str, Any]]:
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        rows = conn.execute(
            "SELECT id, item_id, filename, size, mime, created_at FROM attachments WHERE item_id = ?",
            (item_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_attachment(self, item_id: str, attachment_id: str) -> Tuple[str, str, bytes]:
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        row = conn.execute(
            "SELECT filename, mime, data_enc FROM attachments WHERE id = ? AND item_id = ?",
            (attachment_id, item_id),
        ).fetchone()
        if not row:
            raise KeyError("Attachment not found")

        key = self.vault.get_vault_key()
        aad = f"attachment:{attachment_id}".encode("utf-8")
        decrypted = CryptoService.decrypt_payload(key, row["data_enc"], aad)
        return row["filename"], row["mime"], decrypted

    def delete_attachment(self, item_id: str, attachment_id: str) -> None:
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        with conn:
            conn.execute("DELETE FROM attachments WHERE id = ? AND item_id = ?", (attachment_id, item_id))

    # --- V2: Local Migration Parsers (Bitwarden JSON & CSV) ---
    def import_bitwarden_json(self, data: Dict[str, Any], project_id: Optional[str] = None, category_id: Optional[str] = None) -> List[Dict[str, Any]]:
        self._ensure_unlocked()
        created = []
        bw_items = data.get("items", [])
        for bi in bw_items:
            title = bi.get("name") or "Imported Bitwarden Item"
            fields = []
            login = bi.get("login") or {}
            if login.get("username"):
                fields.append(ItemField(label="Username", type="text", is_secret=False, value=login.get("username")))
            if login.get("password"):
                fields.append(ItemField(label="Password", type="secret", is_secret=True, value=login.get("password")))
            if login.get("totp"):
                fields.append(ItemField(label="TOTP", type="totp", is_secret=True, value=login.get("totp")))
            if bi.get("notes"):
                fields.append(ItemField(label="Notes", type="multiline", is_secret=False, value=bi.get("notes")))
            for cf in bi.get("fields", []):
                ctype = "secret" if cf.get("type") == 1 else "text"
                fields.append(ItemField(label=cf.get("name") or "Field", type=ctype, is_secret=(ctype == "secret"), value=cf.get("value")))

            payload = ItemPayload(
                title=title,
                website_url=(login.get("uris") or [{}])[0].get("uri"),
                tags=["bitwarden_import"],
                fields=fields,
            )
            item = self.create_item(ItemCreateRequest(project_id=project_id, category_id=category_id, payload=payload))
            created.append(item)
        return created

    def import_csv(self, csv_content: str, project_id: Optional[str] = None, category_id: Optional[str] = None) -> List[Dict[str, Any]]:
        import csv
        import io

        self._ensure_unlocked()
        created = []
        reader = csv.DictReader(io.StringIO(csv_content))
        for row in reader:
            title = row.get("title") or row.get("name") or "Imported CSV Item"
            fields = []
            for k, v in row.items():
                if k.lower() in ("title", "name"):
                    continue
                is_sec = any(w in k.lower() for w in ("pass", "secret", "key", "token"))
                ftype = "secret" if is_sec else "text"
                fields.append(ItemField(label=k, type=ftype, is_secret=is_sec, value=v))

            payload = ItemPayload(
                title=title,
                tags=["csv_import"],
                fields=fields,
            )
            item = self.create_item(ItemCreateRequest(project_id=project_id, category_id=category_id, payload=payload))
            created.append(item)
        return created
