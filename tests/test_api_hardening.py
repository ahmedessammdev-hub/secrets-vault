import pytest
import os
import tempfile
from fastapi.testclient import TestClient
from app.main import app, SESSION_TOKEN
from app.vault_service import VaultService
from app.items_service import ItemsService
from app.projects_service import ProjectsService
from app.templates_service import TemplatesService
from app.backup_service import BackupService
from app.api import auth, items, projects, templates, organize, backup, settings

TEST_PASSWORD = "TestPassword123!"


@pytest.fixture(scope="module", autouse=True)
def setup_isolated_db():
    temp_dir = tempfile.mkdtemp()
    test_db_path = os.path.join(temp_dir, "test_hardening_vault.db")

    test_vault = VaultService(test_db_path)
    test_items = ItemsService(test_vault)
    test_projects = ProjectsService(test_vault)
    test_templates = TemplatesService(test_vault)
    test_backup = BackupService(test_vault, data_dir=temp_dir)

    auth.vault_service = test_vault
    items.items_service = test_items
    items.vault_service = test_vault
    projects.projects_service = test_projects
    projects.vault_service = test_vault
    templates.templates_service = test_templates
    organize.templates_service = test_templates
    organize.vault_service = test_vault
    backup.backup_service = test_backup
    backup.vault_service = test_vault
    settings.vault_service = test_vault

    import app.main as main_mod
    main_mod.vault_svc = test_vault

    yield test_vault
    test_vault.lock()


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="http://127.0.0.1:8000") as c:
        yield c


def test_session_token_and_origin_hardening(client):
    # 1. No token -> 403 Forbidden
    resp = client.get("/items")
    assert resp.status_code == 403

    # 2. Invalid Origin -> 403 Forbidden
    headers = {
        "Authorization": f"Bearer {SESSION_TOKEN}",
        "Origin": "http://evil-attacker.com",
    }
    resp = client.get("/items", headers=headers)
    assert resp.status_code == 403

    # 3. Invalid Host header -> 403 Forbidden
    headers = {
        "Authorization": f"Bearer {SESSION_TOKEN}",
        "Host": "evil.com",
    }
    resp = client.get("/items", headers=headers)
    assert resp.status_code == 403


def test_lock_enforcement_423(client, setup_isolated_db):
    headers = {
        "Authorization": f"Bearer {SESSION_TOKEN}",
        "Origin": "http://127.0.0.1:8000",
    }

    # Ensure vault is locked
    setup_isolated_db.lock()
    assert setup_isolated_db.is_unlocked() is False

    # Calling /items when locked must return 423
    resp = client.get("/items", headers=headers)
    assert resp.status_code == 423
    assert "Locked" in resp.json()["detail"]


def test_setup_unlock_and_reauth_tokens(client, setup_isolated_db):
    headers = {
        "Authorization": f"Bearer {SESSION_TOKEN}",
        "Origin": "http://127.0.0.1:8000",
    }

    status_resp = client.get("/auth/status").json()
    if not status_resp["initialized"]:
        setup_resp = client.post(
            "/auth/setup",
            json={"master_password": TEST_PASSWORD, "password_hint": "for testing"},
        )
        assert setup_resp.status_code == 200

    # Lock vault
    client.post("/auth/lock", headers=headers)
    assert client.get("/auth/status").json()["unlocked"] is False

    # Bad password -> 401
    bad_resp = client.post("/auth/unlock", json={"master_password": "WrongPassword"})
    assert bad_resp.status_code == 401

    # Throttling remaining >= 0
    stat = client.get("/auth/status").json()
    assert stat["throttle_seconds_remaining"] >= 0

    # Unlock with correct password
    unlock_resp = client.post("/auth/unlock", json={"master_password": TEST_PASSWORD})
    assert unlock_resp.status_code == 200

    # Sensitive route without reauth -> 428
    export_resp = client.get("/backup/export", headers=headers)
    assert export_resp.status_code == 428

    # Obtain reauth token
    reauth_resp = client.post("/auth/reauth", json={"master_password": TEST_PASSWORD}, headers=headers)
    assert reauth_resp.status_code == 200
    token = reauth_resp.json()["reauth_token"]

    # Sensitive route with reauth token -> 200
    headers_with_reauth = {**headers, "X-Reauth-Token": token}
    export_valid = client.get("/backup/export", headers=headers_with_reauth)
    assert export_valid.status_code == 200


def test_canary_leak_check(client, setup_isolated_db):
    headers = {
        "Authorization": f"Bearer {SESSION_TOKEN}",
        "Origin": "http://127.0.0.1:8000",
    }
    canary = "CANARY_SECRET_SUPER_VAL_7788"

    payload = {
        "schema": 2,
        "title": "Canary Item",
        "fields": [{"label": "Canary Key", "type": "secret", "is_secret": True, "value": canary}],
    }
    resp = client.post("/items", json={"payload": payload}, headers=headers)
    assert resp.status_code == 200

    conn = setup_isolated_db.get_connection()
    audit_rows = conn.execute("SELECT details_json FROM audit_log").fetchall()
    for row in audit_rows:
        assert canary not in row["details_json"]
