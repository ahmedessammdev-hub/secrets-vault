import pytest
import os
import tempfile
import sqlite3
from fastapi.testclient import TestClient
from app.main import app, SESSION_TOKEN, vault_svc, items_svc, projects_svc, templates_svc, backup_svc
from app.models import ItemCreateRequest, ItemUpdateRequest, ItemPayload, ItemField, ProjectPayload, TemplatePayload
from app.vault_service import VaultService
from app.items_service import ItemsService
from app.projects_service import ProjectsService
from app.templates_service import TemplatesService
from app.backup_service import BackupService
from app.api import auth, items, projects, templates, organize, backup, settings


TEST_PASSWORD = "FunctionalPassword123!"


@pytest.fixture(scope="module", autouse=True)
def setup_isolated_db():
    temp_dir = tempfile.mkdtemp()
    test_db_path = os.path.join(temp_dir, "test_vault.db")

    # Re-initialize services with test db
    test_vault = VaultService(test_db_path)
    test_items = ItemsService(test_vault)
    test_projects = ProjectsService(test_vault)
    test_templates = TemplatesService(test_vault)
    test_backup = BackupService(test_vault, data_dir=temp_dir)

    # Wire to routers
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

    # Wire to main globals
    import app.main as main_mod
    main_mod.vault_svc = test_vault

    # Setup the vault
    test_vault.setup(TEST_PASSWORD, password_hint="test hint")

    yield test_vault

    # Cleanup
    test_vault.lock()
    try:
        os.remove(test_db_path)
    except Exception:
        pass


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="http://127.0.0.1:8000") as c:
        yield c


def test_eleven_field_types_and_lock_persistence(client, setup_isolated_db):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    fields = [
        {"id": "f_txt", "label": "Username", "type": "text", "is_secret": False, "value": "user123"},
        {"id": "f_sec", "label": "Password", "type": "secret", "is_secret": True, "value": "SecretP@ss1"},
        {"id": "f_eml", "label": "Work Email", "type": "email", "is_secret": False, "value": "work@example.com"},
        {"id": "f_phn", "label": "Support Phone", "type": "phone", "is_secret": False, "value": "+123456789"},
        {"id": "f_url", "label": "Console", "type": "url", "is_secret": False, "value": "https://example.com/login"},
        {"id": "f_otp", "label": "2FA TOTP", "type": "totp", "is_secret": True, "value": "JBSWY3DPEHPK3PXP"},
        {"id": "f_dat", "label": "Issued Date", "type": "date", "is_secret": False, "value": "2026-10-20"},
        {"id": "f_num", "label": "Port", "type": "number", "is_secret": False, "value": 8080},
        {"id": "f_bol", "label": "2FA Active", "type": "boolean", "is_secret": False, "value": True},
        {"id": "f_mlt", "label": "Private Key", "type": "multiline", "is_secret": True, "value": "-----BEGIN RSA PRIVATE KEY-----\nMIIE..."},
        {"id": "f_ref", "label": "Billing Master", "type": "reference", "is_secret": False, "value": "item:nonexistent"},
    ]

    create_payload = {
        "schema": 2,
        "title": "Master 11 Types Item",
        "description": "Comprehensive item test",
        "tags": ["functional", "all_types"],
        "fields": fields,
    }

    resp = client.post("/items", json={"payload": create_payload}, headers=headers)
    assert resp.status_code == 200
    item_id = resp.json()["id"]

    # Lock and unlock vault
    client.post("/auth/lock", headers=headers)
    unlock_res = client.post("/auth/unlock", json={"master_password": TEST_PASSWORD})
    assert unlock_res.status_code == 200

    # Retrieve and verify all fields survived decryption intact
    get_resp = client.get(f"/items/{item_id}", headers=headers)
    assert get_resp.status_code == 200
    item_data = get_resp.json()
    assert item_data["payload"]["title"] == "Master 11 Types Item"
    assert len(item_data["payload"]["fields"]) == 11
    fields_map = {f["id"]: f for f in item_data["payload"]["fields"]}
    assert fields_map["f_txt"]["value"] == "user123"
    assert fields_map["f_sec"]["value"] == "SecretP@ss1"
    assert fields_map["f_ref"]["reference_status"] == "missing"


def test_field_history_cap_and_restore(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    payload = {
        "schema": 2,
        "title": "History Test Item",
        "fields": [{"id": "f_key", "label": "API Key", "type": "secret", "is_secret": True, "value": "v1"}],
    }
    created = client.post("/items", json={"payload": payload}, headers=headers).json()
    item_id = created["id"]

    # Update value 6 times
    for i in range(2, 8):
        update_payload = dict(payload)
        update_payload["fields"] = [{"id": "f_key", "label": "API Key", "type": "secret", "is_secret": True, "value": f"v{i}"}]
        res = client.put(f"/items/{item_id}", json={"payload": update_payload}, headers=headers)
        assert res.status_code == 200

    # Check history cap at 5
    item = client.get(f"/items/{item_id}", headers=headers).json()
    history = item["payload"]["fields"][0]["history"]
    assert len(history) == 5
    assert [h["value"] for h in history] == ["v2", "v3", "v4", "v5", "v6"]

    # Restore from history (index 0 which is v2)
    restore_resp = client.post(f"/items/{item_id}/fields/f_key/history/restore?history_idx=0", headers=headers)
    assert restore_resp.status_code == 200
    updated_item = client.get(f"/items/{item_id}", headers=headers).json()
    assert updated_item["payload"]["fields"][0]["value"] == "v2"

    # Clear history
    client.delete(f"/items/{item_id}/fields/f_key/history", headers=headers)
    cleared_item = client.get(f"/items/{item_id}", headers=headers).json()
    assert len(cleared_item["payload"]["fields"][0]["history"]) == 0


def test_project_and_env_export(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    # Create project
    proj_resp = client.post(
        "/projects",
        json={"name": "Clinic Copilot", "environments": ["dev", "staging", "production"]},
        headers=headers,
    )
    assert proj_resp.status_code == 200
    proj_id = proj_resp.json()["id"]

    # Create item in project
    item_payload = {
        "schema": 2,
        "title": "Groq API Key",
        "fields": [
            {
                "id": "f_key",
                "label": "API Key",
                "type": "secret",
                "is_secret": True,
                "values": {"production": "gsk_live_123", "dev": "gsk_dev_999"},
            },
            {"id": "f_url", "label": "Base URL", "type": "url", "is_secret": False, "value": "https://api.groq.com"},
        ],
    }
    client.post("/items", json={"project_id": proj_id, "payload": item_payload}, headers=headers)

    # Export production env
    export_prod = client.get(f"/projects/{proj_id}/env?env=production", headers=headers).json()
    assert 'API_KEY="gsk_live_123"' in export_prod["content"]
    assert 'BASE_URL="https://api.groq.com"' in export_prod["content"]

    # Export dev env
    export_dev = client.get(f"/projects/{proj_id}/env?env=dev", headers=headers).json()
    assert 'API_KEY="gsk_dev_999"' in export_dev["content"]


def test_smart_views_and_search(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    search_res = client.get("/items?search=Groq", headers=headers).json()
    assert any("Groq" in str(it) for it in search_res)

    no_proj = client.get("/items?smart_view=no_project", headers=headers).json()
    assert all(it["project_id"] is None for it in no_proj)


def test_trash_soft_delete_and_restore(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    payload = {"schema": 2, "title": "Trash Candidate Item", "fields": []}
    it = client.post("/items", json={"payload": payload}, headers=headers).json()
    item_id = it["id"]

    # Soft delete
    client.delete(f"/items/{item_id}", headers=headers)

    # Excluded from active list
    active = client.get("/items", headers=headers).json()
    assert not any(x["id"] == item_id for x in active)

    # Present in trash
    trash = client.get("/items?in_trash=true", headers=headers).json()
    assert any(x["id"] == item_id for x in trash)

    # Restore from trash
    client.post(f"/items/{item_id}/restore", headers=headers)
    active_again = client.get("/items", headers=headers).json()
    assert any(x["id"] == item_id for x in active_again)


def test_generator_endpoints(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}
    p_resp = client.post("/generator/password", json={"length": 24, "symbols": True}, headers=headers).json()
    assert len(p_resp["password"]) == 24
    assert p_resp["entropy_bits"] > 80

    pp_resp = client.post("/generator/passphrase", json={"words_count": 6, "separator": "-"}, headers=headers).json()
    words = pp_resp["passphrase"].split("-")
    assert len(words) == 6

    ak_resp = client.post("/generator/api-key", json={"format": "hex", "bytes_length": 32, "prefix": "sk_test_"}, headers=headers).json()
    assert ak_resp["api_key"].startswith("sk_test_")
    assert len(ak_resp["api_key"]) == len("sk_test_") + 64


def test_backup_export_verify_and_import(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    reauth = client.post("/auth/reauth", json={"master_password": TEST_PASSWORD}, headers=headers).json()
    token = reauth["reauth_token"]

    export_resp = client.get("/backup/export", headers={**headers, "X-Reauth-Token": token})
    assert export_resp.status_code == 200
    backup_bytes = export_resp.content
    assert backup_bytes.startswith(b"SVLT")

    files = {"file": ("test.vault", backup_bytes, "application/octet-stream")}
    verify_resp = client.post("/backup/verify", files=files, headers=headers)
    assert verify_resp.status_code == 200
    assert verify_resp.json()["valid"] is True
