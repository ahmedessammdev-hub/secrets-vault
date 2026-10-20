import pytest
import os
import shutil
import tempfile
from app.vault_service import VaultService
from app.items_service import ItemsService
from app.templates_service import TemplatesService
from app.models import TemplatePayload, TemplateField, ItemCreateRequest, ItemPayload


@pytest.fixture
def vault_env():
    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, "test_vault.db")
    vs = VaultService(db_path=db_path)
    vs.setup("MasterPassword123!", password_hint="hint")
    items_svc = ItemsService(vs)
    templates_svc = TemplatesService(vs)
    yield vs, items_svc, templates_svc
    vs.lock()
    try:
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass


def test_list_builtin_templates(vault_env):
    vs, items_svc, templates_svc = vault_env
    tpls = templates_svc.list_templates()
    assert len(tpls) >= 5
    ids = [t["id"] for t in tpls]
    assert "tpl_login" in ids
    assert "tpl_api_key" in ids
    assert "tpl_database" in ids


def test_create_and_delete_custom_template(vault_env):
    vs, items_svc, templates_svc = vault_env
    payload = TemplatePayload(
        name="Custom Stripe Webhook",
        icon="code",
        description="Stripe webhook signing secrets",
        fields=[
            TemplateField(label="Signing Secret", type="secret", is_secret=True),
            TemplateField(label="Endpoint URL", type="url", is_secret=False),
        ],
    )
    created = templates_svc.create_template(payload)
    assert created["id"].startswith("tpl_user_")
    assert created["payload"]["name"] == "Custom Stripe Webhook"

    # Verify listed
    tpls = templates_svc.list_templates()
    assert any(t["id"] == created["id"] for t in tpls)

    # Delete template
    templates_svc.delete_template(created["id"])
    tpls_after = templates_svc.list_templates()
    assert not any(t["id"] == created["id"] for t in tpls_after)


def test_save_item_as_template(vault_env):
    vs, items_svc, templates_svc = vault_env
    # Create an item with multiple fields
    item = items_svc.create_item(
        ItemCreateRequest(
            payload=ItemPayload(
                title="Postgres Production Cluster",
                fields=[
                    {"label": "Host", "type": "text", "is_secret": False, "value": "pg.example.internal"},
                    {"label": "Port", "type": "number", "is_secret": False, "value": "5432"},
                    {"label": "Master Password", "type": "secret", "is_secret": True, "value": "SuperSecretPass!"},
                ],
            )
        )
    )

    # Save item as template
    tpl = templates_svc.save_item_as_template(
        item_id=item["id"],
        name="Postgres Production Template",
        description="Template for spinning up DB credentials",
    )

    assert tpl["id"].startswith("tpl_user_")
    assert tpl["payload"]["name"] == "Postgres Production Template"
    fields = tpl["payload"]["fields"]
    assert len(fields) == 3

    # Zero-knowledge check: the secret value must NOT be in the template fields
    for f in fields:
        assert "value" not in f or f.get("value") is None
    assert any(f["label"] == "Master Password" and f["is_secret"] is True for f in fields)
