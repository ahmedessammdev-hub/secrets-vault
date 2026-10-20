import pytest
import os
import tempfile
import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app, SESSION_TOKEN
from app.llm.redaction import RedactionEngine
from app.vault_service import VaultService
from app.items_service import ItemsService
from app.projects_service import ProjectsService
from app.templates_service import TemplatesService
from app.backup_service import BackupService
from app.drive_service import DriveService
from app.llm.service import LLMService
from app.api import auth, items, projects, templates, organize, backup, settings, drive, llm

TEST_PASSWORD = "V2TestPassword123!"


@pytest.fixture(scope="module", autouse=True)
def setup_isolated_db():
    temp_dir = tempfile.mkdtemp()
    test_db_path = os.path.join(temp_dir, "test_v2_vault.db")

    test_vault = VaultService(test_db_path)
    test_items = ItemsService(test_vault)
    test_projects = ProjectsService(test_vault)
    test_templates = TemplatesService(test_vault)
    test_backup = BackupService(test_vault, data_dir=temp_dir)
    test_drive = DriveService(test_vault, test_backup)
    test_llm = LLMService(test_vault, test_items)

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
    drive.drive_service = test_drive
    drive.vault_service = test_vault
    llm.llm_service = test_llm

    import app.main as main_mod
    main_mod.vault_svc = test_vault

    test_vault.setup(TEST_PASSWORD, password_hint="v2 hint")
    yield test_vault
    test_vault.lock()


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="http://127.0.0.1:8000") as c:
        yield c


def test_drive_backup_and_snapshot_retention(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    # Connect Drive
    conn_resp = client.post("/drive/connect", json={"account_email": "engineer@acme.corp"}, headers=headers)
    assert conn_resp.status_code == 200

    # Status
    status_resp = client.get("/drive/status", headers=headers).json()
    assert status_resp["connected"] is True
    assert status_resp["account_email"] == "engineer@acme.corp"

    # Backup now (create 12 snapshots to verify 10-snapshot retention cap)
    for _ in range(12):
        client.post("/drive/backup-now", headers=headers)

    snapshots = client.get("/drive/snapshots", headers=headers).json()
    assert len(snapshots) <= 10

    # Disconnect
    disc_resp = client.post("/drive/disconnect", headers=headers)
    assert disc_resp.status_code == 200
    assert client.get("/drive/status", headers=headers).json()["connected"] is False


def test_llm_redaction_engine():
    engine = RedactionEngine()
    sample_text = (
        "Here are my credentials:\n"
        "password: SuperSecretPass123!\n"
        "api_key=gsk_9999abcdef01234567890123456789\n"
        "AWS key: AKIAIOSFODNN7EXAMPLE\n"
        "Google key: AIzaSyD-1234567890123456789012345678901\n"
        "TOTP: otpauth://totp/Acme:alice@google.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme\n"
    )

    redacted, r_map = engine.redact(sample_text)

    # Assert no secret values remain in the redacted text
    assert "SuperSecretPass123!" not in redacted
    assert "gsk_9999abcdef01234567890123456789" not in redacted
    assert "AKIAIOSFODNN7EXAMPLE" not in redacted
    assert "AIzaSyD-1234567890123456789012345678901" not in redacted
    assert "JBSWY3DPEHPK3PXP" not in redacted

    # Placeholders are present
    assert "{{S1}}" in redacted

    # Restore returns exact original
    restored = engine.restore(redacted, r_map)
    assert "SuperSecretPass123!" in restored
    assert "gsk_9999abcdef01234567890123456789" in restored
    assert "AKIAIOSFODNN7EXAMPLE" in restored


def test_smart_import_arabic_and_combo_redaction():
    engine = RedactionEngine()
    user_order = (
        "تم إنشاء طلبك بنجاح.\n"
        "رقم الطلب: #22256\n"
        "الخدمة: اشتراك iLovePDF Premium [365 يوم][1M♻️]\n"
        "السعر: 27.28 جنيه مصري\n"
        "الحالة: مكتمل\n\n"
        "البيانات المسلمة:\n"
        "account: brit17morramb74@cambrigeuni.edu.pl:iros46m2K6VAMXOA!1\n"
        "ملاحظة إضافية: كلمة المرور الاحتياطية: BackupSecPass!9"
    )

    redacted, r_map = engine.redact(user_order)

    # Passwords MUST NOT appear in redacted text
    assert "iros46m2K6VAMXOA!1" not in redacted
    assert "BackupSecPass!9" not in redacted

    # Username and service details remain visible
    assert "brit17morramb74@cambrigeuni.edu.pl" in redacted
    assert "iLovePDF Premium" in redacted

    # Placeholders are mapped
    assert "{{S1}}" in redacted
    assert "{{S2}}" in redacted
    assert r_map["{{S1}}"] == "iros46m2K6VAMXOA!1"
    assert r_map["{{S2}}"] == "BackupSecPass!9"

    # Lossless local restoration
    restored = engine.restore(redacted, r_map)
    assert "iros46m2K6VAMXOA!1" in restored
    assert "BackupSecPass!9" in restored



def test_llm_leak_test_gate_3(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}
    canary = "CANARY_SECRET_LEAK_CHECK_4242"
    input_text = f"Please import this service: database host is db.example.com and password: {canary}"

    # Mock OpenAI backend to intercept the outgoing request body
    captured_payloads = []

    json_payload_response = json.dumps({
        "items": [
            {
                "title": "Database Service",
                "template_hint": "database",
                "fields": [
                    {"label": "Host", "type": "text", "is_secret": False, "value": "db.example.com"},
                    {"label": "Password", "type": "secret", "is_secret": True, "value": "{{S1}}"},
                ],
            }
        ]
    })

    def mock_post(url, json=None, headers=None):
        captured_payloads.append(json)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": json_payload_response
                    }
                }
            ]
        }
        return mock_resp

    with patch("httpx.Client.post", side_effect=mock_post):
        run_resp = client.post(
            "/llm/smart-import/run",
            json={
                "text": input_text,
                "backend_type": "openai_compat",
                "raw_mode": False,
            },
            headers=headers,
        )
        assert run_resp.status_code == 200
        items = run_resp.json()["items"]
        assert len(items) == 1
        # In the response to the user, placeholder was restored locally to canary
        assert items[0]["fields"][1]["value"] == canary

    # CRITICAL LEAK ASSERTION: The canary value MUST NOT have been sent to the backend!
    assert len(captured_payloads) > 0
    for payload in captured_payloads:
        payload_str = json.dumps(payload)
        assert canary not in payload_str, "CRITICAL SECURITY LEAK: Canary secret leaked to LLM provider!"


def test_smart_import_local_env_preparser(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}
    env_text = (
        "export STRIPE_API_KEY=sk_test_12345678901234567890\n"
        "DATABASE_URL=postgres://user:pass@localhost:5432/db\n"
        "PORT=8080\n"
    )

    preview_resp = client.post("/llm/smart-import/preview", json={"text": env_text}, headers=headers).json()
    assert preview_resp["is_pure_env"] is True
    assert len(preview_resp["proposed_items"]) == 1

    # Commit imported items
    commit_resp = client.post(
        "/llm/smart-import/commit",
        json={"items": preview_resp["proposed_items"]},
        headers=headers,
    )
    assert commit_resp.status_code == 200
    assert commit_resp.json()["created_count"] == 1


def test_smart_import_organization_and_context_enrichment(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    # Commit an item with dynamic project creation, category creation, tags, rotation days, and notes
    proposed_item = {
        "title": "iLovePDF Premium Subscription",
        "new_project_name": "Productivity Tools",
        "new_category_name": "SaaS Subscriptions",
        "tags": ["pdf", "subscription", "personal", "imported"],
        "rotation_days": 365,
        "description": "رقم الطلب: #22256\nالسعر: 27.28 جنيه مصري\nالحالة: مكتمل",
        "fields": [
            {"label": "Account", "type": "email", "is_secret": False, "value": "user@example.com"},
            {"label": "Password", "type": "secret", "is_secret": True, "value": "SecretPass123!"},
        ],
    }

    commit_resp = client.post(
        "/llm/smart-import/commit",
        json={"items": [proposed_item]},
        headers=headers,
    )
    assert commit_resp.status_code == 200
    res_data = commit_resp.json()
    assert res_data["created_count"] == 1
    created_item = res_data["items"][0]

    # Verify project was dynamically created and assigned
    assert created_item["project_id"] is not None
    projects = client.get("/projects", headers=headers).json()
    matching_proj = next((p for p in projects if p["id"] == created_item["project_id"]), None)
    assert matching_proj is not None
    assert matching_proj["payload"]["name"] == "Productivity Tools"

    # Verify category was dynamically created and assigned
    assert created_item["category_id"] is not None
    categories = client.get("/categories", headers=headers).json()
    matching_cat = next((c for c in categories if c["id"] == created_item["category_id"]), None)
    assert matching_cat is not None
    assert matching_cat["payload"]["name"] == "SaaS Subscriptions"

    # Verify rotation_days, tags, and notes (description)
    item_details = client.get(f"/items/{created_item['id']}", headers=headers).json()
    payload = item_details["payload"]
    assert payload["rotation_days"] == 365
    assert set(payload["tags"]) == {"pdf", "subscription", "personal", "imported"}
    assert "رقم الطلب: #22256" in payload["description"]
    assert "27.28 جنيه مصري" in payload["description"]



def test_v2_totp_and_qr_generation(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    # Create an item with a TOTP secret
    payload = {
        "schema": 2,
        "title": "GitHub 2FA",
        "fields": [{"id": "f_totp_1", "label": "2FA Secret", "type": "totp", "is_secret": True, "value": "JBSWY3DPEHPK3PXP"}],
    }
    item = client.post("/items", json={"payload": payload}, headers=headers).json()
    item_id = item["id"]

    # Request live TOTP code
    totp_resp = client.get(f"/items/{item_id}/fields/f_totp_1/totp", headers=headers)
    assert totp_resp.status_code == 200
    data = totp_resp.json()
    assert len(data["code"]) == 6
    assert 0 <= data["seconds_remaining"] <= 30

    # Request QR Code
    qr_resp = client.get(f"/items/{item_id}/fields/f_totp_1/qr", headers=headers)
    assert qr_resp.status_code == 200
    assert qr_resp.headers["content-type"] == "image/png"
    assert len(qr_resp.content) > 100


def test_v2_encrypted_attachments(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    # Create item
    payload = {"schema": 2, "title": "Server with SSH Cert", "fields": []}
    item = client.post("/items", json={"payload": payload}, headers=headers).json()
    item_id = item["id"]

    # Upload attachment
    raw_content = b"CRITICAL_PRIVATE_KEY_DATA_CERTIFICATE_9988"
    files = {"file": ("id_rsa.pub", raw_content, "text/plain")}
    up_resp = client.post(f"/items/{item_id}/attachments", files=files, headers=headers)
    assert up_resp.status_code == 200
    att_id = up_resp.json()["id"]

    # List attachments
    list_resp = client.get(f"/items/{item_id}/attachments", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # Download decrypted attachment
    down_resp = client.get(f"/items/{item_id}/attachments/{att_id}", headers=headers)
    assert down_resp.status_code == 200
    assert down_resp.content == raw_content

    # Delete attachment
    del_resp = client.delete(f"/items/{item_id}/attachments/{att_id}", headers=headers)
    assert del_resp.status_code == 200
    assert len(client.get(f"/items/{item_id}/attachments", headers=headers).json()) == 0


def test_v2_local_migration_import(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    # Bitwarden JSON test
    bw_json = json.dumps({
        "items": [
            {
                "name": "Bitwarden Item 1",
                "login": {"username": "alice", "password": "SuperPassword123!", "totp": "JBSWY3DPEHPK3PXP"},
            }
        ]
    })
    files = {"file": ("bitwarden.json", bw_json.encode("utf-8"), "application/json")}
    resp = client.post("/items/import/local", data={"format_type": "bitwarden_json"}, files=files, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["imported_count"] == 1

    # CSV test
    csv_text = "title,username,password\nLocal AWS,admin,secret_aws_key_1\n"
    csv_files = {"file": ("credentials.csv", csv_text.encode("utf-8"), "text/csv")}
    csv_resp = client.post("/items/import/local", data={"format_type": "csv"}, files=csv_files, headers=headers)
    assert csv_resp.status_code == 200
    assert csv_resp.json()["imported_count"] == 1


def test_v2_unencrypted_export(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    # Reauth token
    reauth = client.post("/auth/reauth", json={"master_password": TEST_PASSWORD}, headers=headers).json()
    token = reauth["reauth_token"]

    # Without confirmation -> 400
    refused = client.get("/backup/export-unencrypted", headers={**headers, "X-Reauth-Token": token})
    assert refused.status_code == 400

    # With confirmation -> 200 JSON
    ok_resp = client.get("/backup/export-unencrypted?confirm_unencrypted=true&format_type=json", headers={**headers, "X-Reauth-Token": token})
    assert ok_resp.status_code == 200
    assert ok_resp.headers["content-type"] == "application/json"
    data = ok_resp.json()
    assert "PLAINTEXT EXPORT" in data["warning"]
    assert len(data["items"]) > 0

    # With confirmation -> 200 CSV
    ok_csv = client.get("/backup/export-unencrypted?confirm_unencrypted=true&format_type=csv", headers={**headers, "X-Reauth-Token": token})
    assert ok_csv.status_code == 200
    assert "field_label,field_type" in ok_csv.text


def test_llm_config_and_status(client):
    headers = {"Authorization": f"Bearer {SESSION_TOKEN}", "Origin": "http://127.0.0.1:8000"}

    # Status check
    st = client.get("/llm/status", headers=headers).json()
    assert st["enabled"] is True
    assert "supported_backends" in st

    # Save LLM config with encrypted API key
    save_resp = client.post(
        "/llm/config",
        json={
            "backend_type": "openai_compat",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o",
            "api_key": "sk-secret-test-llm-key",
            "raw_mode": False,
            "timeout": 45,
        },
        headers=headers,
    )
    assert save_resp.status_code == 200

    # Get config (API key itself should NOT be returned in plaintext, only has_api_key)
    cfg = client.get("/llm/config", headers=headers).json()
    assert cfg["backend_type"] == "openai_compat"
    assert cfg["model"] == "gpt-4o"
    assert cfg["has_api_key"] is True
    assert cfg["timeout"] == 45
    assert "api_key" not in cfg


