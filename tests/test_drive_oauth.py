import pytest
import os
import shutil
import tempfile
from app.vault_service import VaultService
from app.backup_service import BackupService
from app.drive_service import DriveService


@pytest.fixture
def drive_env():
    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, "test_vault.db")
    vs = VaultService(db_path=db_path)
    vs.setup("MasterPassword123!", password_hint="hint")
    bs = BackupService(vs)
    ds = DriveService(vs, bs)
    ds.local_snapshots_dir = os.path.join(temp_dir, "drive_snapshots")
    os.makedirs(ds.local_snapshots_dir, exist_ok=True)
    yield vs, bs, ds
    vs.lock()
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass


def test_drive_credentials_config(drive_env):
    vs, bs, ds = drive_env

    # Initially not configured
    st0 = ds.get_oauth_credentials()
    assert st0["configured"] is False

    # Save credentials
    res = ds.save_oauth_credentials("test-client-id.apps.googleusercontent.com", "GOCSPX-secret123")
    assert res["success"] is True

    # Retrieve credentials (secret is masked)
    st1 = ds.get_oauth_credentials()
    assert st1["configured"] is True
    assert st1["client_id"] == "test-client-id.apps.googleusercontent.com"
    assert st1["has_secret"] is True


def test_get_auth_url(drive_env):
    vs, bs, ds = drive_env
    ds.save_oauth_credentials("my-client-id", "my-secret")

    url_res = ds.get_auth_url("http://127.0.0.1:8000/drive/oauth/callback")
    auth_url = url_res["auth_url"]
    assert "https://accounts.google.com/o/oauth2/v2/auth" in auth_url
    assert "client_id=my-client-id" in auth_url
    assert "redirect_uri=http%3A%2F%2F127.0.0.1%3A8000%2Fdrive%2Foauth%2Fcallback" in auth_url
    assert "drive.file" in auth_url


def test_drive_local_backup_snapshot(drive_env):
    vs, bs, ds = drive_env
    res = ds.backup_now()
    assert res["success"] is True
    assert res["filename"].startswith("vault-")

    snaps = ds.list_snapshots()
    assert len(snaps) == 1
    assert snaps[0]["filename"] == res["filename"]
