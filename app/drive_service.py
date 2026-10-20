import os
import json
import uuid
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import httpx
from app.vault_service import VaultService
from app.backup_service import BackupService
from app.crypto_service import CryptoService

DRIVE_AUTH_KEY = "google_drive_auth"
DRIVE_CREDENTIALS_KEY = "google_drive_credentials"
DRIVE_FOLDER_NAME = "Secrets Vault Backups"


class DriveService:
    def __init__(self, vault_service: VaultService, backup_service: BackupService):
        self.vault = vault_service
        self.backup = backup_service
        self.local_snapshots_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "drive_snapshots")
        os.makedirs(self.local_snapshots_dir, exist_ok=True)

    def _ensure_unlocked(self):
        if not self.vault.is_unlocked():
            raise ValueError("Vault is locked")

    def save_oauth_credentials(self, client_id: str, client_secret: str) -> Dict[str, Any]:
        """Save user's Google Cloud OAuth Client ID and Secret encrypted in vault."""
        self._ensure_unlocked()
        client_id = (client_id or "").strip()
        client_secret = (client_secret or "").strip()
        if not client_id or not client_secret:
            raise ValueError("Client ID and Client Secret cannot be empty")

        key = self.vault.get_vault_key()
        payload = json.dumps({"client_id": client_id, "client_secret": client_secret}).encode("utf-8")
        ct = CryptoService.encrypt_payload(key, payload, f"setting:{DRIVE_CREDENTIALS_KEY}".encode("utf-8"))

        conn = self.vault.get_connection()
        with conn:
            conn.execute("INSERT OR REPLACE INTO settings_enc (key, payload_enc) VALUES (?, ?)", (DRIVE_CREDENTIALS_KEY, ct))

        return {"success": True, "message": "Google Cloud credentials saved securely."}

    def get_oauth_credentials(self) -> Dict[str, Any]:
        """Retrieve stored Google Cloud credentials (secret is masked)."""
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        row = conn.execute("SELECT payload_enc FROM settings_enc WHERE key = ?", (DRIVE_CREDENTIALS_KEY,)).fetchone()
        if not row:
            return {"configured": False, "client_id": "", "has_secret": False}

        try:
            key = self.vault.get_vault_key()
            dec = CryptoService.decrypt_payload(key, row["payload_enc"], f"setting:{DRIVE_CREDENTIALS_KEY}".encode("utf-8"))
            data = json.loads(dec.decode("utf-8"))
            cid = data.get("client_id", "")
            return {
                "configured": bool(cid and data.get("client_secret")),
                "client_id": cid,
                "has_secret": bool(data.get("client_secret")),
            }
        except Exception:
            return {"configured": False, "client_id": "", "has_secret": False}

    def get_auth_url(self, redirect_uri: str) -> Dict[str, Any]:
        """Generate Google OAuth 2.0 authorization URL."""
        self._ensure_unlocked()
        creds = self._get_raw_credentials()
        if not creds:
            raise ValueError("Google OAuth credentials (Client ID & Client Secret) are not configured yet.")

        params = {
            "client_id": creds["client_id"],
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
        }
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
        return {"auth_url": url}

    def _get_raw_credentials(self) -> Optional[Dict[str, str]]:
        conn = self.vault.get_connection()
        row = conn.execute("SELECT payload_enc FROM settings_enc WHERE key = ?", (DRIVE_CREDENTIALS_KEY,)).fetchone()
        if not row:
            return None
        try:
            key = self.vault.get_vault_key()
            dec = CryptoService.decrypt_payload(key, row["payload_enc"], f"setting:{DRIVE_CREDENTIALS_KEY}".encode("utf-8"))
            return json.loads(dec.decode("utf-8"))
        except Exception:
            return None

    def handle_oauth_callback(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Exchange authorization code for access and refresh tokens and store encrypted."""
        self._ensure_unlocked()
        creds = self._get_raw_credentials()
        if not creds:
            raise ValueError("Google OAuth credentials missing.")

        token_url = "https://oauth2.googleapis.com/token"
        token_payload = {
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }

        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.post(token_url, data=token_payload)
                if res.status_code != 200:
                    err_detail = res.text
                    try:
                        err_detail = res.json().get("error_description", res.text)
                    except Exception:
                        pass
                    raise ValueError(f"Token exchange failed: {err_detail}")
                tokens = res.json()

                # Get user profile email
                email = "user@google.com"
                userinfo_res = client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {tokens['access_token']}"},
                )
                if userinfo_res.status_code == 200:
                    email = userinfo_res.json().get("email", email)

            # Store tokens encrypted
            expires_at = (datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat()
            auth_record = {
                "connected": True,
                "account_email": email,
                "access_token": tokens.get("access_token"),
                "refresh_token": tokens.get("refresh_token"),
                "expires_at": expires_at,
                "connected_at": datetime.now(timezone.utc).isoformat(),
            }

            key = self.vault.get_vault_key()
            ct = CryptoService.encrypt_payload(
                key,
                json.dumps(auth_record).encode("utf-8"),
                f"setting:{DRIVE_AUTH_KEY}".encode("utf-8"),
            )
            conn = self.vault.get_connection()
            with conn:
                conn.execute("INSERT OR REPLACE INTO settings_enc (key, payload_enc) VALUES (?, ?)", (DRIVE_AUTH_KEY, ct))

            return {"success": True, "account_email": email}
        except Exception as e:
            raise RuntimeError(f"Google Drive authorization failed: {str(e)}")

    def get_status(self) -> Dict[str, Any]:
        """Get Drive connection status and snapshot summary."""
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        row = conn.execute("SELECT payload_enc FROM settings_enc WHERE key = ?", (DRIVE_AUTH_KEY,)).fetchone()
        connected = False
        email = None
        if row:
            key = self.vault.get_vault_key()
            try:
                dec = CryptoService.decrypt_payload(key, row["payload_enc"], f"setting:{DRIVE_AUTH_KEY}".encode("utf-8"))
                data = json.loads(dec.decode("utf-8"))
                connected = data.get("connected", False)
                email = data.get("account_email")
            except Exception:
                connected = False

        creds_status = self.get_oauth_credentials()
        snapshots = self.list_snapshots()

        return {
            "connected": connected,
            "account_email": email,
            "configured": creds_status.get("configured", False),
            "client_id": creds_status.get("client_id", ""),
            "scope": "https://www.googleapis.com/auth/drive.file",
            "snapshots_count": len(snapshots),
            "snapshots": snapshots[:10],
        }

    def disconnect(self) -> Dict[str, Any]:
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        with conn:
            conn.execute("DELETE FROM settings_enc WHERE key = ?", (DRIVE_AUTH_KEY,))
        return {"success": True, "message": "Disconnected from Google Drive"}

    def connect(self, account_email: str = "developer@local") -> Dict[str, Any]:
        """Direct connect for local/dev testing backward compatibility."""
        self._ensure_unlocked()
        key = self.vault.get_vault_key()
        auth_record = {
            "connected": True,
            "account_email": account_email,
            "connected_at": datetime.now(timezone.utc).isoformat(),
            "scope": "https://www.googleapis.com/auth/drive.file",
        }
        ct = CryptoService.encrypt_payload(
            key,
            json.dumps(auth_record).encode("utf-8"),
            f"setting:{DRIVE_AUTH_KEY}".encode("utf-8"),
        )
        conn = self.vault.get_connection()
        with conn:
            conn.execute("INSERT OR REPLACE INTO settings_enc (key, payload_enc) VALUES (?, ?)", (DRIVE_AUTH_KEY, ct))

        return {"success": True, "message": f"Connected to Google Drive ({account_email})"}

    def _get_valid_access_token(self) -> Optional[str]:
        """Fetch active access token, automatically refreshing if expired."""
        conn = self.vault.get_connection()
        row = conn.execute("SELECT payload_enc FROM settings_enc WHERE key = ?", (DRIVE_AUTH_KEY,)).fetchone()
        if not row:
            return None

        key = self.vault.get_vault_key()
        dec = CryptoService.decrypt_payload(key, row["payload_enc"], f"setting:{DRIVE_AUTH_KEY}".encode("utf-8"))
        data = json.loads(dec.decode("utf-8"))

        access_token = data.get("access_token")
        refresh_token = data.get("refresh_token")
        expires_at_str = data.get("expires_at")

        # Check if expired
        is_expired = True
        if expires_at_str:
            try:
                exp = datetime.fromisoformat(expires_at_str)
                if exp > datetime.now(timezone.utc) + timedelta(minutes=2):
                    is_expired = False
            except Exception:
                is_expired = True

        if not is_expired and access_token:
            return access_token

        # Attempt refresh
        if not refresh_token:
            return access_token

        creds = self._get_raw_credentials()
        if not creds:
            return access_token

        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "client_id": creds["client_id"],
                        "client_secret": creds["client_secret"],
                        "refresh_token": refresh_token,
                        "grant_type": "refresh_token",
                    },
                )
                if res.status_code == 200:
                    token_data = res.json()
                    new_token = token_data.get("access_token")
                    new_exp = (datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))).isoformat()
                    data["access_token"] = new_token
                    data["expires_at"] = new_exp
                    ct = CryptoService.encrypt_payload(
                        key,
                        json.dumps(data).encode("utf-8"),
                        f"setting:{DRIVE_AUTH_KEY}".encode("utf-8"),
                    )
                    with conn:
                        conn.execute("INSERT OR REPLACE INTO settings_enc (key, payload_enc) VALUES (?, ?)", (DRIVE_AUTH_KEY, ct))
                    return new_token
        except Exception:
            pass

        return access_token

    def _get_or_create_drive_folder(self, token: str) -> Optional[str]:
        """Find or create dedicated 'Secrets Vault Backups' folder on Google Drive."""
        headers = {"Authorization": f"Bearer {token}"}
        try:
            with httpx.Client(timeout=10.0) as client:
                q = f"name = '{DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
                res = client.get("https://www.googleapis.com/drive/v3/files", headers=headers, params={"q": q, "fields": "files(id, name)"})
                if res.status_code == 200:
                    files = res.json().get("files", [])
                    if files:
                        return files[0]["id"]

                # Create folder
                create_res = client.post(
                    "https://www.googleapis.com/drive/v3/files",
                    headers=headers,
                    json={"name": DRIVE_FOLDER_NAME, "mimeType": "application/vnd.google-apps.folder"},
                )
                if create_res.status_code in (200, 201):
                    return create_res.json().get("id")
        except Exception:
            pass
        return None

    def backup_now(self) -> Dict[str, Any]:
        """Export local vault and upload encrypted backup to Google Drive."""
        self._ensure_unlocked()
        now_str = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"vault-{now_str}.vault"
        target_path = os.path.join(self.local_snapshots_dir, filename)

        res = self.backup.export_vault(target_path)
        with open(target_path, "rb") as f:
            file_bytes = f.read()

        cloud_uploaded = False
        drive_file_id = None
        token = self._get_valid_access_token()
        if token:
            try:
                folder_id = self._get_or_create_drive_folder(token)
                meta = {"name": filename}
                if folder_id:
                    meta["parents"] = [folder_id]

                # Multipart upload to Google Drive v3
                boundary = uuid.uuid4().hex
                body = (
                    f"--{boundary}\r\n"
                    "Content-Type: application/json; charset=UTF-8\r\n\r\n"
                    f"{json.dumps(meta)}\r\n"
                    f"--{boundary}\r\n"
                    "Content-Type: application/octet-stream\r\n\r\n"
                ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": f"multipart/related; boundary={boundary}",
                }
                with httpx.Client(timeout=30.0) as client:
                    up_res = client.post(
                        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                        headers=headers,
                        content=body,
                    )
                    if up_res.status_code in (200, 201):
                        cloud_uploaded = True
                        drive_file_id = up_res.json().get("id")

                # Enforce 10-snapshot retention in Google Drive folder
                if folder_id:
                    self._prune_drive_folder(token, folder_id)
            except Exception:
                cloud_uploaded = False

        # Prune local snapshots
        all_local = self._list_local_snapshots()
        if len(all_local) > 10:
            for old in all_local[10:]:
                try:
                    os.remove(os.path.join(self.local_snapshots_dir, old["filename"]))
                except Exception:
                    pass

        return {
            "success": True,
            "filename": filename,
            "size_bytes": res["size_bytes"],
            "items_count": res["items_count"],
            "cloud_uploaded": cloud_uploaded,
            "drive_file_id": drive_file_id,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }

    def _prune_drive_folder(self, token: str, folder_id: str, keep: int = 10):
        try:
            with httpx.Client(timeout=10.0) as client:
                headers = {"Authorization": f"Bearer {token}"}
                q = f"'{folder_id}' in parents and trashed = false"
                res = client.get(
                    "https://www.googleapis.com/drive/v3/files",
                    headers=headers,
                    params={"q": q, "orderBy": "createdTime desc", "fields": "files(id, name, createdTime)"},
                )
                if res.status_code == 200:
                    files = res.json().get("files", [])
                    if len(files) > keep:
                        for old in files[keep:]:
                            client.delete(f"https://www.googleapis.com/drive/v3/files/{old['id']}", headers=headers)
        except Exception:
            pass

    def _list_local_snapshots(self) -> List[Dict[str, Any]]:
        if not os.path.exists(self.local_snapshots_dir):
            return []
        snaps = []
        for fname in os.listdir(self.local_snapshots_dir):
            if fname.endswith(".vault"):
                fpath = os.path.join(self.local_snapshots_dir, fname)
                st = os.stat(fpath)
                snaps.append({
                    "id": fname,
                    "filename": fname,
                    "size_bytes": st.st_size,
                    "is_cloud": False,
                    "created_at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                })
        snaps.sort(key=lambda x: x["created_at"], reverse=True)
        return snaps

    def list_snapshots(self) -> List[Dict[str, Any]]:
        """List snapshots from Google Drive (if connected) and local fallback."""
        self._ensure_unlocked()
        token = self._get_valid_access_token()
        cloud_snaps = []
        if token:
            try:
                folder_id = self._get_or_create_drive_folder(token)
                if folder_id:
                    with httpx.Client(timeout=10.0) as client:
                        headers = {"Authorization": f"Bearer {token}"}
                        q = f"'{folder_id}' in parents and trashed = false"
                        res = client.get(
                            "https://www.googleapis.com/drive/v3/files",
                            headers=headers,
                            params={"q": q, "orderBy": "createdTime desc", "fields": "files(id, name, size, createdTime)"},
                        )
                        if res.status_code == 200:
                            for f in res.json().get("files", []):
                                cloud_snaps.append({
                                    "id": f["id"],
                                    "filename": f.get("name", "backup.vault"),
                                    "size_bytes": int(f.get("size", 0)),
                                    "is_cloud": True,
                                    "created_at": f.get("createdTime", ""),
                                })
            except Exception:
                pass

        if cloud_snaps:
            return cloud_snaps
        return self._list_local_snapshots()

    def download_snapshot_bytes(self, snapshot_id: str) -> bytes:
        """Download snapshot bytes from Google Drive or local filesystem."""
        self._ensure_unlocked()
        token = self._get_valid_access_token()
        if token:
            try:
                with httpx.Client(timeout=30.0) as client:
                    headers = {"Authorization": f"Bearer {token}"}
                    res = client.get(f"https://www.googleapis.com/drive/v3/files/{snapshot_id}?alt=media", headers=headers)
                    if res.status_code == 200:
                        return res.content
            except Exception:
                pass

        # Try local path
        local_path = os.path.join(self.local_snapshots_dir, snapshot_id)
        if os.path.exists(local_path):
            with open(local_path, "rb") as f:
                return f.read()

        raise FileNotFoundError(f"Snapshot {snapshot_id} not found in Google Drive or local storage.")
