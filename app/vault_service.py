import json
import time
import uuid
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple
from app.crypto_service import CryptoService, CryptoError, IntegrityError, DEFAULT_KDF_PARAMS
from app.db import get_db_connection, init_db

THROTTLE_DELAYS = [0, 1, 2, 5, 15, 30]


class VaultService:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path
        self._conn = get_db_connection(db_path)
        init_db(self._conn)

        self._vault_key: Optional[bytearray] = None
        self._unlocked: bool = False
        self._failed_attempts: int = 0
        self._throttle_until: float = 0.0
        self._reauth_tokens: Dict[str, float] = {}  # token -> expires_at_timestamp
        self._last_activity: float = time.time()
        self._auto_lock_minutes: int = 5  # default 5 minutes
        self.integrity_errors: List[Dict[str, str]] = []

        # In-memory decrypted indices
        self.items_index: Dict[str, Dict[str, Any]] = {}
        self.projects_index: Dict[str, Dict[str, Any]] = {}
        self.categories_index: Dict[str, Dict[str, Any]] = {}
        self.templates_index: Dict[str, Dict[str, Any]] = {}

    def get_connection(self) -> sqlite3.Connection:
        return self._conn

    def is_initialized(self) -> bool:
        row = self._conn.execute("SELECT id FROM vault_meta WHERE id = 1").fetchone()
        return row is not None

    def get_password_hint(self) -> Optional[str]:
        row = self._conn.execute("SELECT password_hint FROM vault_meta WHERE id = 1").fetchone()
        return row["password_hint"] if row else None

    def is_unlocked(self) -> bool:
        if not self._unlocked or self._vault_key is None:
            return False
        # Check auto-lock timeout
        if self._auto_lock_minutes > 0:
            if time.time() - self._last_activity > (self._auto_lock_minutes * 60):
                self.lock()
                return False
        return True

    def touch_activity(self) -> None:
        self._last_activity = time.time()

    def get_throttle_remaining(self) -> int:
        remaining = int(self._throttle_until - time.time())
        return max(0, remaining)

    def get_vault_key(self) -> bytes:
        if not self.is_unlocked():
            raise CryptoError("Vault is locked")
        return bytes(self._vault_key)

    def set_auto_lock_minutes(self, minutes: int) -> None:
        self._auto_lock_minutes = minutes
        self._conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_lock_minutes', ?)",
            (str(minutes),),
        )
        self._conn.commit()

    def setup(self, master_password: str, password_hint: Optional[str] = None, kdf_params: Optional[Dict[str, Any]] = None) -> None:
        if self.is_initialized():
            raise ValueError("Vault is already initialized")
        if not master_password or len(master_password) < 8:
            raise ValueError("Master password must be at least 8 characters long")
        if password_hint and master_password in password_hint:
            raise ValueError("Password hint must not contain the master password")

        salt = CryptoService.generate_salt(16)
        params = kdf_params or DEFAULT_KDF_PARAMS
        kek = CryptoService.derive_kek(master_password, salt, params)
        raw_vault_key = CryptoService.generate_vault_key(32)

        wrapped_key = CryptoService.wrap_vault_key(kek, raw_vault_key)
        verifier = CryptoService.create_verifier(raw_vault_key)
        now_iso = datetime.now(timezone.utc).isoformat()

        with self._conn:
            self._conn.execute(
                """
                INSERT INTO vault_meta (
                    id, format_version, kdf_salt, kdf_params, wrapped_vault_key, verifier, password_hint, created_at, updated_at
                ) VALUES (1, 2, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    salt,
                    json.dumps(params),
                    wrapped_key,
                    verifier,
                    password_hint,
                    now_iso,
                    now_iso,
                ),
            )

        # Set memory key and state
        self._vault_key = bytearray(raw_vault_key)
        self._unlocked = True
        self._failed_attempts = 0
        self._throttle_until = 0.0
        self.touch_activity()

        # Seed built-in templates and default categories
        self._seed_builtins()
        self.rebuild_index()

    def unlock(self, master_password: str) -> bool:
        if not self.is_initialized():
            raise ValueError("Vault is not initialized")
        if self.get_throttle_remaining() > 0:
            raise ValueError(f"Too many failed attempts. Wait {self.get_throttle_remaining()} seconds.")

        row = self._conn.execute(
            "SELECT kdf_salt, kdf_params, wrapped_vault_key, verifier FROM vault_meta WHERE id = 1"
        ).fetchone()
        if not row:
            raise ValueError("Vault metadata missing")

        salt = row["kdf_salt"]
        params = json.loads(row["kdf_params"])
        wrapped_key = row["wrapped_vault_key"]
        verifier = row["verifier"]

        try:
            kek = CryptoService.derive_kek(master_password, salt, params)
            unwrapped_key = CryptoService.unwrap_vault_key(kek, wrapped_key)
            if not CryptoService.check_verifier(unwrapped_key, verifier):
                raise IntegrityError("Verifier mismatch")
        except Exception:
            self._failed_attempts += 1
            delay_idx = min(self._failed_attempts, len(THROTTLE_DELAYS) - 1)
            self._throttle_until = time.time() + THROTTLE_DELAYS[delay_idx]
            raise ValueError("Invalid master password or corrupted vault data")

        # Success: reset throttling
        self._failed_attempts = 0
        self._throttle_until = 0.0
        self._vault_key = bytearray(unwrapped_key)
        self._unlocked = True
        self.touch_activity()

        # Check integrity of all items and build index
        self.rebuild_index()
        self.purge_old_trash()
        return True

    def lock(self) -> None:
        if self._vault_key is not None:
            CryptoService.zero_buffer(self._vault_key)
            self._vault_key = None
        self._unlocked = False
        self.items_index.clear()
        self.projects_index.clear()
        self.categories_index.clear()
        self.templates_index.clear()
        self._reauth_tokens.clear()
        self.integrity_errors.clear()

    def create_reauth_token(self, master_password: str) -> str:
        if not self.is_unlocked():
            raise CryptoError("Vault is locked")
        row = self._conn.execute(
            "SELECT kdf_salt, kdf_params, wrapped_vault_key, verifier FROM vault_meta WHERE id = 1"
        ).fetchone()
        salt = row["kdf_salt"]
        params = json.loads(row["kdf_params"])
        kek = CryptoService.derive_kek(master_password, salt, params)
        try:
            unwrapped_key = CryptoService.unwrap_vault_key(kek, row["wrapped_vault_key"])
            if not CryptoService.check_verifier(unwrapped_key, row["verifier"]):
                raise IntegrityError("Verifier check failed")
        except Exception:
            raise ValueError("Invalid master password for re-authentication")

        token = uuid.uuid4().hex + uuid.uuid4().hex
        self._reauth_tokens[token] = time.time() + 300  # valid 5 mins
        return token

    def verify_reauth_token(self, token: Optional[str]) -> bool:
        if not token:
            return False
        expires = self._reauth_tokens.get(token)
        if expires is None or time.time() > expires:
            if token in self._reauth_tokens:
                del self._reauth_tokens[token]
            return False
        return True

    def change_master_password(self, old_master_password: str, new_master_password: str, new_hint: Optional[str] = None) -> None:
        if not self.is_unlocked():
            raise CryptoError("Vault is locked")
        if not new_master_password or len(new_master_password) < 8:
            raise ValueError("New master password must be at least 8 characters long")
        if new_hint and new_master_password in new_hint:
            raise ValueError("Password hint must not contain the master password")

        row = self._conn.execute(
            "SELECT kdf_salt, kdf_params, wrapped_vault_key, verifier FROM vault_meta WHERE id = 1"
        ).fetchone()
        salt = row["kdf_salt"]
        params = json.loads(row["kdf_params"])
        kek = CryptoService.derive_kek(old_master_password, salt, params)
        try:
            unwrapped_key = CryptoService.unwrap_vault_key(kek, row["wrapped_vault_key"])
            if not CryptoService.check_verifier(unwrapped_key, row["verifier"]):
                raise IntegrityError("Old password verifier failed")
        except Exception:
            raise ValueError("Current master password is incorrect")

        new_salt = CryptoService.generate_salt(16)
        new_kek = CryptoService.derive_kek(new_master_password, new_salt, params)
        new_wrapped_key = CryptoService.wrap_vault_key(new_kek, unwrapped_key)
        now_iso = datetime.now(timezone.utc).isoformat()

        with self._conn:
            self._conn.execute(
                """
                UPDATE vault_meta SET
                    kdf_salt = ?,
                    wrapped_vault_key = ?,
                    password_hint = ?,
                    updated_at = ?
                WHERE id = 1
                """,
                (new_salt, new_wrapped_key, new_hint, now_iso),
            )

    def rebuild_index(self) -> None:
        if not self.is_unlocked():
            return
        key = self.get_vault_key()
        self.items_index.clear()
        self.projects_index.clear()
        self.categories_index.clear()
        self.templates_index.clear()
        self.integrity_errors.clear()

        # Decrypt Projects
        rows = self._conn.execute("SELECT id, sort_order, created_at, updated_at, payload_enc FROM projects").fetchall()
        for r in rows:
            aad = f"{r['id']}|2".encode("utf-8")
            try:
                dec = CryptoService.decrypt_payload(key, r["payload_enc"], aad)
                self.projects_index[r["id"]] = {
                    "id": r["id"],
                    "sort_order": r["sort_order"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "payload": json.loads(dec.decode("utf-8")),
                }
            except Exception as e:
                self.integrity_errors.append({"entity": "project", "id": r["id"], "error": str(e)})

        # Decrypt Categories
        rows = self._conn.execute("SELECT id, sort_order, created_at, updated_at, payload_enc FROM categories").fetchall()
        for r in rows:
            aad = f"{r['id']}|2".encode("utf-8")
            try:
                dec = CryptoService.decrypt_payload(key, r["payload_enc"], aad)
                self.categories_index[r["id"]] = {
                    "id": r["id"],
                    "sort_order": r["sort_order"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "payload": json.loads(dec.decode("utf-8")),
                }
            except Exception as e:
                self.integrity_errors.append({"entity": "category", "id": r["id"], "error": str(e)})

        # Decrypt Templates
        rows = self._conn.execute("SELECT id, is_builtin, sort_order, created_at, updated_at, payload_enc FROM templates").fetchall()
        for r in rows:
            aad = f"{r['id']}|2".encode("utf-8")
            try:
                dec = CryptoService.decrypt_payload(key, r["payload_enc"], aad)
                self.templates_index[r["id"]] = {
                    "id": r["id"],
                    "is_builtin": bool(r["is_builtin"]),
                    "sort_order": r["sort_order"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "payload": json.loads(dec.decode("utf-8")),
                }
            except Exception as e:
                self.integrity_errors.append({"entity": "template", "id": r["id"], "error": str(e)})

        # Decrypt Items
        rows = self._conn.execute(
            """
            SELECT id, project_id, category_id, is_favorite, is_pinned, is_archived,
                   expires_at, created_at, updated_at, last_used_at, deleted_at,
                   payload_enc, schema_version
            FROM items
            """
        ).fetchall()
        for r in rows:
            aad = f"{r['id']}|{r['schema_version']}".encode("utf-8")
            try:
                dec = CryptoService.decrypt_payload(key, r["payload_enc"], aad)
                payload_data = json.loads(dec.decode("utf-8"))
                self.items_index[r["id"]] = {
                    "id": r["id"],
                    "project_id": r["project_id"],
                    "category_id": r["category_id"],
                    "is_favorite": bool(r["is_favorite"]),
                    "is_pinned": bool(r["is_pinned"]),
                    "is_archived": bool(r["is_archived"]),
                    "expires_at": r["expires_at"],
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                    "last_used_at": r["last_used_at"],
                    "deleted_at": r["deleted_at"],
                    "payload": payload_data,
                }
            except Exception as e:
                self.integrity_errors.append({"entity": "item", "id": r["id"], "error": str(e)})

    def purge_old_trash(self) -> None:
        # Purge items soft-deleted more than 30 days ago
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        with self._conn:
            self._conn.execute(
                "DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?",
                (cutoff,),
            )

    def _seed_builtins(self) -> None:
        key = self.get_vault_key()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Seed categories
        categories = [
            {"name": "Work", "icon": "briefcase", "color": "#3B82F6"},
            {"name": "Personal", "icon": "user", "color": "#10B981"},
            {"name": "APIs & Services", "icon": "key", "color": "#8B5CF6"},
        ]
        for idx, cat in enumerate(categories):
            cid = f"cat_{uuid.uuid4().hex[:8]}"
            aad = f"{cid}|2".encode("utf-8")
            ct = CryptoService.encrypt_payload(key, json.dumps(cat).encode("utf-8"), aad)
            self._conn.execute(
                "INSERT INTO categories (id, sort_order, created_at, updated_at, payload_enc) VALUES (?, ?, ?, ?, ?)",
                (cid, idx, now_iso, now_iso, ct),
            )

        # Seed built-in templates
        builtin_templates = [
            {
                "id": "tpl_login",
                "name": "Login",
                "icon": "lock",
                "description": "Website login credentials",
                "fields": [
                    {"id": "f_user", "label": "Email / Username", "type": "email", "is_secret": False},
                    {"id": "f_pass", "label": "Password", "type": "secret", "is_secret": True},
                    {"id": "f_totp", "label": "TOTP Secret", "type": "totp", "is_secret": True},
                ],
            },
            {
                "id": "tpl_api_key",
                "name": "API Key",
                "icon": "key",
                "description": "API credentials and tokens",
                "fields": [
                    {"id": "f_apikey", "label": "API Key", "type": "secret", "is_secret": True},
                    {"id": "f_apisecret", "label": "API Secret", "type": "secret", "is_secret": True},
                    {"id": "f_baseurl", "label": "Base URL", "type": "url", "is_secret": False},
                    {"id": "f_env", "label": "Environment", "type": "text", "is_secret": False},
                ],
            },
            {
                "id": "tpl_secure_note",
                "name": "Secure Note",
                "icon": "file-text",
                "description": "Encrypted notes and documentation",
                "fields": [
                    {"id": "f_note", "label": "Note", "type": "multiline", "is_secret": False},
                ],
            },
            {
                "id": "tpl_server_ssh",
                "name": "Server / SSH",
                "icon": "server",
                "description": "Server connection and SSH private keys",
                "fields": [
                    {"id": "f_host", "label": "Host", "type": "text", "is_secret": False},
                    {"id": "f_port", "label": "Port", "type": "number", "is_secret": False, "default_value": "22"},
                    {"id": "f_user", "label": "Username", "type": "text", "is_secret": False},
                    {"id": "f_pass", "label": "Password", "type": "secret", "is_secret": True},
                    {"id": "f_key", "label": "Private Key", "type": "multiline", "is_secret": True},
                ],
            },
            {
                "id": "tpl_database",
                "name": "Database",
                "icon": "database",
                "description": "Database connection parameters",
                "fields": [
                    {"id": "f_host", "label": "Host", "type": "text", "is_secret": False},
                    {"id": "f_port", "label": "Port", "type": "number", "is_secret": False},
                    {"id": "f_dbname", "label": "Database Name", "type": "text", "is_secret": False},
                    {"id": "f_user", "label": "Username", "type": "text", "is_secret": False},
                    {"id": "f_pass", "label": "Password", "type": "secret", "is_secret": True},
                    {"id": "f_uri", "label": "Connection String", "type": "secret", "is_secret": True},
                ],
            },
            {
                "id": "tpl_openai_compat",
                "name": "OpenAI-compatible provider",
                "icon": "cpu",
                "description": "LLM provider credentials (Groq, OpenAI, Ollama...)",
                "fields": [
                    {"id": "f_apikey", "label": "API Key", "type": "secret", "is_secret": True},
                    {"id": "f_baseurl", "label": "Base URL", "type": "url", "is_secret": False},
                    {"id": "f_model", "label": "Default Model", "type": "text", "is_secret": False},
                    {"id": "f_notes", "label": "Rate limit notes", "type": "multiline", "is_secret": False},
                ],
            },
            {
                "id": "tpl_aws",
                "name": "AWS",
                "icon": "cloud",
                "description": "Amazon Web Services credentials",
                "fields": [
                    {"id": "f_accesskey", "label": "Access Key ID", "type": "secret", "is_secret": True},
                    {"id": "f_secretkey", "label": "Secret Access Key", "type": "secret", "is_secret": True},
                    {"id": "f_region", "label": "Region", "type": "text", "is_secret": False},
                    {"id": "f_accountid", "label": "Account ID", "type": "text", "is_secret": False},
                ],
            },
            {
                "id": "tpl_stripe",
                "name": "Stripe",
                "icon": "credit-card",
                "description": "Stripe payment API keys",
                "fields": [
                    {"id": "f_pubkey", "label": "Publishable Key", "type": "text", "is_secret": False},
                    {"id": "f_seckey", "label": "Secret Key", "type": "secret", "is_secret": True},
                    {"id": "f_webhook", "label": "Webhook Secret", "type": "secret", "is_secret": True},
                    {"id": "f_mode", "label": "Mode", "type": "text", "is_secret": False, "default_value": "test"},
                ],
            },
            {
                "id": "tpl_oauth_app",
                "name": "OAuth App",
                "icon": "shield",
                "description": "OAuth Client credentials",
                "fields": [
                    {"id": "f_clientid", "label": "Client ID", "type": "text", "is_secret": False},
                    {"id": "f_clientsecret", "label": "Client Secret", "type": "secret", "is_secret": True},
                    {"id": "f_redirect", "label": "Redirect URI", "type": "url", "is_secret": False},
                    {"id": "f_scopes", "label": "Scopes", "type": "multiline", "is_secret": False},
                ],
            },
            {
                "id": "tpl_blank",
                "name": "Blank",
                "icon": "plus-square",
                "description": "Custom item with no default fields",
                "fields": [],
            },
        ]

        with self._conn:
            for idx, tpl in enumerate(builtin_templates):
                tid = tpl["id"]
                payload = {
                    "name": tpl["name"],
                    "icon": tpl["icon"],
                    "description": tpl["description"],
                    "fields": tpl["fields"],
                }
                aad = f"{tid}|2".encode("utf-8")
                ct = CryptoService.encrypt_payload(key, json.dumps(payload).encode("utf-8"), aad)
                self._conn.execute(
                    "INSERT INTO templates (id, is_builtin, sort_order, created_at, updated_at, payload_enc) VALUES (?, 1, ?, ?, ?, ?)",
                    (tid, idx, now_iso, now_iso, ct),
                )
