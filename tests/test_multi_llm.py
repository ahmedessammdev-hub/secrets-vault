import os
import tempfile
import json
from unittest.mock import MagicMock, patch
import pytest

from app.vault_service import VaultService
from app.items_service import ItemsService
from app.projects_service import ProjectsService
from app.llm.service import LLMService
from app.llm.openai_compat import OpenAICompatBackend


def test_ensure_ai_project_and_provider_storage():
    temp_dir = tempfile.mkdtemp()
    test_db_path = os.path.join(temp_dir, "test_multi_llm.db")
    vault = VaultService(test_db_path)
    master_pass = "TestMasterPassword123!"
    vault.setup(master_pass, password_hint="test")

    items_svc = ItemsService(vault)
    projs_svc = ProjectsService(vault)
    llm_svc = LLMService(vault, items_svc, projects_service=projs_svc)

    # 1. Ensure project gets created
    proj_id = llm_svc.ensure_ai_project()
    assert proj_id is not None
    assert any(p["payload"]["name"] == "AI Models" for p in projs_svc.list_projects())

    # 2. Save a provider item
    provider = llm_svc.save_llm_provider(
        title="OpenAI GPT-4o Vision",
        backend_type="openai_compat",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
        api_key="sk-test-secret-key-12345",
        supports_vision=True,
        raw_mode=False,
        timeout=45,
        set_as_active=True,
    )

    assert provider["id"] is not None
    assert provider["title"] == "OpenAI GPT-4o Vision"
    assert provider["has_api_key"] is True
    assert provider["supports_vision"] is True
    assert provider["is_active"] is True

    # Verify the item exists in the AI Models project in the vault
    item = items_svc.get_item(provider["id"])
    assert item["project_id"] == proj_id
    assert item["payload"]["title"] == "OpenAI GPT-4o Vision"
    # The API key is in the encrypted fields
    api_key_field = next(f for f in item["payload"]["fields"] if f["label"] == "API Key")
    assert api_key_field["value"] == "sk-test-secret-key-12345"
    assert api_key_field["is_secret"] is True

    # 3. Add second provider (Groq text-only)
    groq_provider = llm_svc.save_llm_provider(
        title="Groq LLaMA 3.3",
        backend_type="openai_compat",
        base_url="https://api.groq.com/openai/v1",
        model="llama-3.3-70b-versatile",
        api_key="gsk-test-key",
        supports_vision=False,
        set_as_active=False,
    )

    providers = llm_svc.list_llm_providers()
    vault_providers = [p for p in providers if not p.get("is_builtin")]
    assert len(vault_providers) == 2
    titles = [p["title"] for p in providers]
    assert "OpenAI GPT-4o Vision" in titles
    assert "Groq LLaMA 3.3" in titles

    # 4. Switch active provider
    llm_svc.set_active_provider(groq_provider["id"])
    active_details = llm_svc.get_provider_details()
    assert active_details["id"] == groq_provider["id"]
    assert active_details["model"] == "llama-3.3-70b-versatile"
    assert active_details["supports_vision"] is False

    # 5. Delete provider
    llm_svc.delete_llm_provider(groq_provider["id"])
    remaining = [p for p in llm_svc.list_llm_providers() if not p.get("is_builtin")]
    assert len(remaining) == 1
    assert remaining[0]["id"] == provider["id"]


def test_multimodal_vision_completion_payload():
    backend = OpenAICompatBackend(base_url="https://api.openai.com/v1", api_key="sk-test", model="gpt-4o")

    image_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

    captured_payload = None

    def mock_post(url, headers=None, json=None, **kwargs):
        nonlocal captured_payload
        captured_payload = json
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": '{"items": [{"title": "Invoice Account", "template_hint": "login", "fields": []}]}'
                    }
                }
            ]
        }
        return mock_resp

    with patch("httpx.Client.post", side_effect=mock_post):
        res = backend.complete(
            redacted_prompt="Please extract credentials from invoice",
            images=[image_b64],
        )

    assert captured_payload is not None
    user_msg = captured_payload["messages"][1]
    assert user_msg["role"] == "user"
    assert isinstance(user_msg["content"], list)

    # Content contains text instruction block and image_url block
    types = [block["type"] for block in user_msg["content"]]
    assert "text" in types
    assert "image_url" in types

    img_block = next(b for b in user_msg["content"] if b["type"] == "image_url")
    assert img_block["image_url"]["url"] == image_b64
    assert img_block["image_url"]["detail"] == "high"


def test_smart_import_with_provider_item_and_vision():
    temp_dir = tempfile.mkdtemp()
    test_db_path = os.path.join(temp_dir, "test_multi_llm_vision.db")
    vault = VaultService(test_db_path)
    master_pass = "TestMasterPassword123!"
    vault.setup(master_pass, password_hint="test")

    items_svc = ItemsService(vault)
    projs_svc = ProjectsService(vault)
    llm_svc = LLMService(vault, items_svc, projects_service=projs_svc)

    # Save a custom vision provider
    custom_prov = llm_svc.save_llm_provider(
        title="Custom Vision Model",
        backend_type="openai_compat",
        base_url="https://api.openai.com/v1",
        model="gpt-4o-mini",
        api_key="sk-test-custom",
        supports_vision=True,
    )

    image_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

    captured_call = {}

    def mock_post(url, headers=None, json=None, **kwargs):
        captured_call["url"] = url
        captured_call["headers"] = headers
        captured_call["payload"] = json
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": json_dumps_safe({
                            "items": [
                                {
                                    "title": "AWS Root Account",
                                    "template_hint": "login",
                                    "fields": [
                                        {"label": "Email", "type": "email", "is_secret": False, "value": "aws@company.com"},
                                        {"label": "Password", "type": "secret", "is_secret": True, "value": "{{S1}}"},
                                    ]
                                }
                            ]
                        })
                    }
                }
            ]
        }
        return mock_resp

    def json_dumps_safe(d):
        import json as j
        return j.dumps(d)

    with patch("httpx.Client.post", side_effect=mock_post):
        items = llm_svc.run_smart_import(
            text="AWS login credentials password: MySuperSecretPass999!",
            provider_item_id=custom_prov["id"],
            images=[image_b64],
        )

    # Verify custom provider model and headers were used
    assert captured_call["payload"]["model"] == "gpt-4o-mini"
    assert captured_call["headers"]["Authorization"] == "Bearer sk-test-custom"

    # Verify extracted item
    assert len(items) == 1
    assert items[0]["title"] == "AWS Root Account"
    # Password placeholder restored
    pass_field = next(f for f in items[0]["fields"] if f["label"] == "Password")
    assert pass_field["value"] == "MySuperSecretPass999!"
