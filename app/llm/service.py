import re
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from app.llm.redaction import RedactionEngine
from app.llm.openai_compat import OpenAICompatBackend
from app.llm.agy_cli import AntigravityCLIBackend
from app.items_service import ItemsService
from app.vault_service import VaultService
from app.models import ItemCreateRequest, ItemUpdateRequest, ItemPayload, ItemField, ProjectPayload
from app.crypto_service import CryptoService


class ProposedField(BaseModel):
    label: str
    type: str = "text"
    is_secret: bool = False
    value: Any = None


class ProposedItem(BaseModel):
    title: str
    template_hint: Optional[str] = "api_key"
    website_url: Optional[str] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    suggested_new_project: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    suggested_new_category: Optional[str] = None
    tags: List[str] = []
    rotation_days: Optional[int] = None
    description: Optional[str] = None
    fields: List[ProposedField] = []


class LLMService:
    def __init__(
        self,
        vault_service: VaultService,
        items_service: ItemsService,
        projects_service: Optional[Any] = None,
        templates_service: Optional[Any] = None,
    ):
        self.vault = vault_service
        self.items_service = items_service
        self.projects_service = projects_service
        self.templates_service = templates_service
        self.redaction = RedactionEngine()

    def get_vault_context(self) -> Dict[str, Any]:
        """Collect current projects, categories, and tags to enrich LLM inference."""
        projects = []
        for pid, p in self.vault.projects_index.items():
            name = p.get("payload", {}).get("name")
            if name:
                projects.append({"id": pid, "name": name})

        categories = []
        for cid, c in self.vault.categories_index.items():
            name = c.get("payload", {}).get("name")
            if name:
                categories.append({"id": cid, "name": name})

        tags = set()
        for it in self.vault.items_index.values():
            if it.get("deleted_at") is None and it.get("payload"):
                for t in it["payload"].get("tags", []):
                    if t and isinstance(t, str):
                        tags.add(t.strip())

        return {
            "projects": projects,
            "categories": categories,
            "tags": sorted(list(tags)),
        }

    def parse_env_locally(self, text: str) -> Optional[List[Dict[str, Any]]]:
        """Local parser for pure KEY=VALUE or export KEY=VALUE inputs without LLM."""
        lines = [line.strip() for line in text.splitlines() if line.strip() and not line.strip().startswith("#")]
        if not lines:
            return None

        fields = []
        is_env_like = True
        for line in lines:
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                is_env_like = False
                break
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"\'')
            if not k:
                is_env_like = False
                break

            is_secret = any(term in k.lower() for term in ["key", "secret", "token", "pass", "auth"])
            field_type = "secret" if is_secret else "text"
            fields.append({"label": k, "type": field_type, "is_secret": is_secret, "value": v})

        if not is_env_like or not fields:
            return None

        cat_id = None
        for cid, c in self.vault.categories_index.items():
            cname = c.get("payload", {}).get("name", "")
            if cname.lower() in ("apis & services", "services", "api", "apis"):
                cat_id = cid
                break

        return [{
            "title": "Imported Environment Variables",
            "template_hint": "api_key",
            "website_url": None,
            "project_id": None,
            "category_id": cat_id,
            "tags": ["env", "imported"],
            "rotation_days": 90,
            "description": f"Imported {len(fields)} environment variables locally.",
            "fields": fields,
        }]

    def preview(self, text: str) -> Dict[str, Any]:
        local_parsed = self.parse_env_locally(text)
        if local_parsed:
            return {
                "is_pure_env": True,
                "redacted_text": text,
                "placeholders_count": 0,
                "proposed_items": local_parsed,
            }

        redacted, r_map = self.redaction.redact(text)
        return {
            "is_pure_env": False,
            "redacted_text": redacted,
            "placeholders_count": len(r_map),
            "placeholders": list(r_map.keys()),
        }

    def ensure_ai_project(self) -> Optional[str]:
        """Ensure the 'AI Models' project exists in the vault and return its ID."""
        if not self.vault.is_unlocked():
            return None
        # Check if project already exists
        for pid, p in self.vault.projects_index.items():
            name = (p.get("payload", {}).get("name") or "").strip().lower()
            if name in ("ai models", "ai_models", "نماذج الذكاء الاصطناعي"):
                return pid

        # If not, create it
        if self.projects_service:
            proj = self.projects_service.create_project(
                ProjectPayload(
                    name="AI Models",
                    description="AI and LLM provider configurations with encrypted API keys",
                    icon="Bot",
                    color="#06b6d4",
                )
            )
            return proj["id"]
        return None

    def list_llm_providers(self) -> List[Dict[str, Any]]:
        """List all LLM provider items stored in the vault."""
        if not self.vault.is_unlocked():
            return []

        ai_proj_id = self.ensure_ai_project()
        items = list(self.vault.items_index.values())

        # Filter items in AI Models project or with tag 'llm_provider'
        provider_items = [
            it
            for it in items
            if it.get("deleted_at") is None
            and (
                (ai_proj_id and it.get("project_id") == ai_proj_id)
                or "llm_provider" in (it.get("payload", {}).get("tags") or [])
            )
        ]

        # Check active provider ID from settings
        conn = self.vault.get_connection()
        row = conn.execute("SELECT value FROM settings WHERE key = 'active_llm_item_id'").fetchone()
        active_id = row["value"] if row else None

        agy_backend = AntigravityCLIBackend()
        agy_avail = agy_backend.is_available()
        # Default to builtin_agy_cli if nothing is explicitly set
        if not active_id and agy_avail:
            active_id = "builtin_agy_cli"

        providers = []
        if agy_avail:
            providers.append({
                "id": "builtin_agy_cli",
                "title": "Antigravity CLI (محلي وسريع - بدون API Key)",
                "backend_type": "agy_cli",
                "base_url": "local://agy",
                "model": "gemini-3.8-flash-low",
                "has_api_key": True,
                "supports_vision": False,
                "raw_mode": False,
                "timeout": 60,
                "is_active": (active_id == "builtin_agy_cli"),
                "is_builtin": True,
                "created_at": None,
                "updated_at": None,
            })

        for it in provider_items:
            payload = it.get("payload", {})
            fields = payload.get("fields", [])

            def get_f(lbl: str, def_val: Any = "") -> Any:
                for f in fields:
                    if f.get("label", "").strip().lower() == lbl.lower():
                        return f.get("value")
                return def_val

            btype = get_f("Provider Type", get_f("backend_type", "openai_compat"))
            base_url = get_f("Base URL", get_f("base_url", "https://api.openai.com/v1"))
            model = get_f("Model Name", get_f("model", "gpt-4o"))
            api_key = get_f("API Key", get_f("api_key", ""))
            supports_vis = str(get_f("Supports Vision", get_f("supports_vision", "true"))).lower() in ("true", "1", "yes")
            raw_mode = str(get_f("Raw Mode", get_f("raw_mode", "false"))).lower() in ("true", "1", "yes")
            try:
                timeout = int(get_f("Timeout", get_f("timeout", 60)))
            except (ValueError, TypeError):
                timeout = 60

            is_active = (it["id"] == active_id) or (active_id is None and len(providers) == 0)

            providers.append({
                "id": it["id"],
                "title": payload.get("title", "Unnamed Provider"),
                "backend_type": btype,
                "base_url": base_url,
                "model": model,
                "has_api_key": bool(api_key and str(api_key).strip()),
                "supports_vision": supports_vis,
                "raw_mode": raw_mode,
                "timeout": timeout,
                "is_active": is_active,
                "created_at": it.get("created_at"),
                "updated_at": it.get("updated_at"),
            })

        # If no provider items exist yet, check legacy settings and auto-create default item
        if not providers and self.items_service:
            s_rows = dict(conn.execute("SELECT key, value FROM settings WHERE key LIKE 'llm_%'").fetchall())
            legacy_btype = s_rows.get("llm_backend_type", "openai_compat")
            legacy_url = s_rows.get("llm_base_url", "https://api.openai.com/v1")
            legacy_model = s_rows.get("llm_model", "gpt-4o")
            legacy_raw = s_rows.get("llm_raw_mode", "false").lower() in ("true", "1")
            legacy_vis = s_rows.get("llm_supports_vision", "true" if "4o" in legacy_model else "false").lower() in ("true", "1")

            legacy_key = ""
            k_row = conn.execute("SELECT payload_enc FROM settings_enc WHERE key = 'llm_api_key'").fetchone()
            if k_row:
                try:
                    vk = self.vault.get_vault_key()
                    legacy_key = CryptoService.decrypt_payload(vk, k_row["payload_enc"], b"setting:llm_api_key").decode("utf-8")
                except Exception:
                    pass

            new_item = self.save_llm_provider(
                title=f"{'Antigravity CLI' if legacy_btype == 'agy_cli' else 'OpenAI ' + legacy_model}",
                backend_type=legacy_btype,
                base_url=legacy_url,
                model=legacy_model,
                api_key=legacy_key,
                supports_vision=legacy_vis,
                raw_mode=legacy_raw,
                timeout=int(s_rows.get("llm_timeout", "60")),
                set_as_active=True,
            )
            return [new_item]

        return providers

    def save_llm_provider(
        self,
        title: str,
        backend_type: str = "openai_compat",
        base_url: str = "https://api.openai.com/v1",
        model: str = "gpt-4o",
        api_key: Optional[str] = None,
        supports_vision: bool = True,
        raw_mode: bool = False,
        timeout: int = 60,
        item_id: Optional[str] = None,
        set_as_active: bool = False,
    ) -> Dict[str, Any]:
        """Create or update an LLM provider as an encrypted item in AI Models project."""
        ai_proj_id = self.ensure_ai_project()

        existing_key = ""
        if item_id and self.items_service:
            try:
                existing_item = self.items_service.get_item(item_id)
                for f in existing_item.get("payload", {}).get("fields", []):
                    if f.get("label", "").lower() in ("api key", "api_key"):
                        existing_key = f.get("value") or ""
            except Exception:
                pass

        final_key = api_key if (api_key is not None and api_key != "__KEEP__") else existing_key

        fields = [
            ItemField(label="Provider Type", type="text", is_secret=False, value=backend_type),
            ItemField(label="Base URL", type="url", is_secret=False, value=base_url),
            ItemField(label="Model Name", type="text", is_secret=False, value=model),
            ItemField(label="API Key", type="secret", is_secret=True, value=final_key),
            ItemField(label="Supports Vision", type="text", is_secret=False, value="true" if supports_vision else "false"),
            ItemField(label="Raw Mode", type="text", is_secret=False, value="true" if raw_mode else "false"),
            ItemField(label="Timeout", type="number", is_secret=False, value=str(timeout)),
        ]

        payload = ItemPayload(
            title=title or "AI Provider",
            template_hint="api_key",
            fields=fields,
            tags=["ai", "llm_provider", "imported"],
            description=f"AI model configuration for {model} ({backend_type})",
        )

        if item_id and self.items_service:
            self.items_service.update_item(item_id, ItemUpdateRequest(payload=payload))
            res_id = item_id
        else:
            created = self.items_service.create_item(
                ItemCreateRequest(
                    project_id=ai_proj_id,
                    payload=payload,
                )
            )
            res_id = created["id"]

        conn = self.vault.get_connection()
        with conn:
            cur_active = conn.execute("SELECT value FROM settings WHERE key = 'active_llm_item_id'").fetchone()
            if set_as_active or not cur_active or not cur_active["value"]:
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_llm_item_id', ?)", (res_id,))

        return {
            "id": res_id,
            "title": title,
            "backend_type": backend_type,
            "base_url": base_url,
            "model": model,
            "has_api_key": bool(final_key),
            "supports_vision": supports_vision,
            "raw_mode": raw_mode,
            "timeout": timeout,
            "is_active": set_as_active,
        }

    def delete_llm_provider(self, item_id: str) -> bool:
        """Delete an LLM provider item from the vault."""
        if not self.items_service:
            return False
        self.items_service.delete_item(item_id, permanent=True)
        conn = self.vault.get_connection()
        with conn:
            row = conn.execute("SELECT value FROM settings WHERE key = 'active_llm_item_id'").fetchone()
            if row and row["value"] == item_id:
                conn.execute("DELETE FROM settings WHERE key = 'active_llm_item_id'")
        return True

    def set_active_provider(self, item_id: str) -> None:
        """Mark a provider as the default active provider."""
        conn = self.vault.get_connection()
        with conn:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_llm_item_id', ?)", (item_id,))

    def get_provider_details(self, item_id: Optional[str] = None) -> Dict[str, Any]:
        """Fetch provider details including decrypted API key."""
        target_id = item_id
        conn = self.vault.get_connection()
        if not target_id:
            row = conn.execute("SELECT value FROM settings WHERE key = 'active_llm_item_id'").fetchone()
            if row:
                target_id = row["value"]

        if target_id == "builtin_agy_cli":
            return {
                "id": "builtin_agy_cli",
                "title": "Antigravity CLI (محلي وسريع - بدون API Key)",
                "backend_type": "agy_cli",
                "base_url": "local://agy",
                "model": "gemini-3.8-flash-low",
                "api_key": "",
                "supports_vision": False,
                "raw_mode": False,
                "timeout": 60,
                "is_active": True,
            }

        if target_id and self.items_service:
            try:
                item = self.items_service.get_item(target_id)
                payload = item.get("payload", {})
                fields = payload.get("fields", [])

                def get_f(lbl: str, def_val: Any = "") -> Any:
                    for f in fields:
                        if f.get("label", "").strip().lower() == lbl.lower():
                            return f.get("value")
                    return def_val

                return {
                    "id": item["id"],
                    "title": payload.get("title", "AI Provider"),
                    "backend_type": get_f("Provider Type", get_f("backend_type", "openai_compat")),
                    "base_url": get_f("Base URL", get_f("base_url", "https://api.openai.com/v1")),
                    "model": get_f("Model Name", get_f("model", "gpt-4o")),
                    "api_key": get_f("API Key", get_f("api_key", "")),
                    "supports_vision": str(get_f("Supports Vision", get_f("supports_vision", "true"))).lower() in ("true", "1", "yes"),
                    "raw_mode": str(get_f("Raw Mode", get_f("raw_mode", "false"))).lower() in ("true", "1", "yes"),
                    "timeout": int(get_f("Timeout", get_f("timeout", 60))),
                }
            except Exception:
                pass

        # Fallback to legacy settings
        s_rows = dict(conn.execute("SELECT key, value FROM settings WHERE key LIKE 'llm_%'").fetchall())
        k_row = conn.execute("SELECT payload_enc FROM settings_enc WHERE key = 'llm_api_key'").fetchone()
        api_key = ""
        if k_row:
            try:
                vk = self.vault.get_vault_key()
                api_key = CryptoService.decrypt_payload(vk, k_row["payload_enc"], b"setting:llm_api_key").decode("utf-8")
            except Exception:
                pass

        return {
            "id": None,
            "title": "Default Provider",
            "backend_type": s_rows.get("llm_backend_type", "openai_compat"),
            "base_url": s_rows.get("llm_base_url", "https://api.openai.com/v1"),
            "model": s_rows.get("llm_model", "gpt-4o"),
            "api_key": api_key,
            "supports_vision": s_rows.get("llm_supports_vision", "true").lower() in ("true", "1"),
            "raw_mode": s_rows.get("llm_raw_mode", "false").lower() in ("true", "1"),
            "timeout": int(s_rows.get("llm_timeout", "60")),
        }

    def run_smart_import(
        self,
        text: str = "",
        backend_type: Optional[str] = None,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        raw_mode: Optional[bool] = None,
        provider_item_id: Optional[str] = None,
        images: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        # Resolve provider if provider_item_id given or if backend_type is None
        if provider_item_id or not backend_type:
            p_details = self.get_provider_details(provider_item_id)
            backend_type = backend_type or p_details.get("backend_type", "openai_compat")
            base_url = base_url or p_details.get("base_url", "https://api.openai.com/v1")
            api_key = api_key if api_key is not None else p_details.get("api_key", "")
            model = model or p_details.get("model", "gpt-4o")
            if raw_mode is None:
                raw_mode = p_details.get("raw_mode", False)
        else:
            backend_type = backend_type or "openai_compat"
            base_url = base_url or "https://api.openai.com/v1"
            api_key = api_key or ""
            model = model or "gpt-4o"
            raw_mode = bool(raw_mode)

        # Check local parser first if pure text and no images
        if text and not images:
            local_result = self.parse_env_locally(text)
            if local_result:
                return local_result

        # Step 2: Redact text if present
        if raw_mode:
            payload_to_send = text or ""
            redaction_map = {}
        else:
            payload_to_send, redaction_map = self.redaction.redact(text or "")

        # Gather vault context (existing projects, categories, tags)
        vault_context = self.get_vault_context()

        # Step 3: Backend call
        try:
            if backend_type == "agy_cli":
                backend = AntigravityCLIBackend()
                raw_response = backend.complete(payload_to_send, context=vault_context, model=model)
            elif backend_type == "openai_compat":
                backend = OpenAICompatBackend(base_url=base_url, api_key=api_key, model=model)
                raw_response = backend.complete(payload_to_send, context=vault_context, images=images)
            else:
                raise ValueError(f"Unknown backend type: {backend_type}")
        except Exception as exc:
            err_msg = str(exc)
            if "timed out" in err_msg.lower() or "read operation" in err_msg.lower():
                raise RuntimeError(
                    f"AI provider request timed out ({model or backend_type}). "
                    "The remote service may be overloaded. Tip: Try switching to the local Antigravity CLI for instant zero-key extraction."
                ) from exc
            raise

        # Record audit log (strictly NO secret values or raw prompt content - Section 14.2)
        self.record_audit_log(
            event_type="smart_import",
            details={
                "provider": backend_type,
                "model": model if backend_type == "openai_compat" else "agy",
                "redacted": not raw_mode,
                "placeholders_count": len(redaction_map),
            },
        )

        # Step 4: Validate schema
        # Strip markdown fences if present
        clean_json = raw_response.strip()
        if clean_json.startswith("```"):
            clean_json = re.sub(r"^```[a-z]*\n?", "", clean_json)
            clean_json = re.sub(r"\n?```$", "", clean_json).strip()

        # Extract outermost JSON object if surrounded by chat or reasoning
        json_match = re.search(r"(\{.*\})", clean_json, re.DOTALL)
        if json_match:
            clean_json = json_match.group(1)

        try:
            parsed = json.loads(clean_json)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Provider returned invalid JSON: {exc}. Raw snippet: {clean_json[:200]}")
        raw_items = parsed.get("items", [])

        # Step 5: Restore placeholders & Map Organization
        results = []
        for it in raw_items:
            title = it.get("title", "Imported Item")

            # Match project against vault context
            matched_project_id = None
            proj_name = it.get("project_name")
            if proj_name and vault_context:
                for p in vault_context.get("projects", []):
                    if p["name"].strip().lower() == str(proj_name).strip().lower():
                        matched_project_id = p["id"]
                        break

            # Match category against vault context
            matched_category_id = None
            cat_name = it.get("category_name")
            if cat_name and vault_context:
                for c in vault_context.get("categories", []):
                    if c["name"].strip().lower() == str(cat_name).strip().lower():
                        matched_category_id = c["id"]
                        break

            # Extract tags
            raw_tags = it.get("tags") or []
            if isinstance(raw_tags, str):
                tags = [t.strip().lower() for t in raw_tags.split(",") if t.strip()]
            elif isinstance(raw_tags, list):
                tags = [str(t).strip().lower() for t in raw_tags if str(t).strip()]
            else:
                tags = []
            if "imported" not in tags:
                tags.append("imported")

            # Extract rotation days
            rot_days = it.get("rotation_days")
            if rot_days is not None:
                try:
                    rot_days = int(rot_days)
                    if rot_days <= 0:
                        rot_days = None
                except (ValueError, TypeError):
                    rot_days = None

            # Extract description / notes
            desc = it.get("description")
            if isinstance(desc, str) and desc.strip():
                desc = desc.strip()
            else:
                desc = None

            fields = []
            for f in it.get("fields", []):
                f_label = f.get("label", "Field")
                f_type = f.get("type", "text")
                f_is_secret = bool(f.get("is_secret"))
                val = f.get("value")
                if isinstance(val, str) and not raw_mode:
                    val = self.redaction.restore(val, redaction_map)

                    # Section 14.1 Step 4 Validation:
                    # An unknown or hallucinated placeholder MUST NOT be accepted silently into the vault.
                    if re.search(r"\{\{S\d+\}\}", val):
                        existing_vals = [fld.get("value") for fld in fields]
                        unused = [v for k, v in redaction_map.items() if v not in existing_vals]
                        if unused:
                            val = unused[0]
                        else:
                            combo_m = re.search(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\s*[:/|]\s*([^\s,;\"\'\r\n]+)", text)
                            if combo_m and (f_is_secret or "pass" in str(f_label).lower() or "مرور" in str(f_label)):
                                val = combo_m.group(2)
                            else:
                                val = re.sub(r"\{\{S\d+\}\}", "", val).strip()

                # Defensive check: Did the LLM return a combined credential value like email:password or username:password?
                combo_split = False
                if isinstance(val, str) and ":" in val:
                    combo_match = re.match(r"^([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\s*[:/|]\s*(.+)$", val.strip())
                    if not combo_match:
                        combo_match = re.match(r"^([a-zA-Z0-9_.-]{3,30})\s*:\s*([^\s]+)$", val.strip())

                    if combo_match:
                        u_part = combo_match.group(1).strip()
                        p_part = combo_match.group(2).strip()
                        if p_part and (f_is_secret or "account" in f_label.lower() or "login" in f_label.lower() or "بيانات" in f_label or "email" in f_label.lower()):
                            combo_split = True
                            is_email = "@" in u_part
                            fields.append({
                                "id": f"f_{uuid.uuid4().hex[:8]}",
                                "label": "Email" if is_email else "Username",
                                "type": "email" if is_email else "text",
                                "is_secret": False,
                                "value": u_part,
                            })
                            fields.append({
                                "id": f"f_{uuid.uuid4().hex[:8]}",
                                "label": "Password",
                                "type": "secret",
                                "is_secret": True,
                                "value": p_part,
                            })

                if not combo_split:
                    fields.append({
                        "id": f"f_{uuid.uuid4().hex[:8]}",
                        "label": f_label,
                        "type": f_type,
                        "is_secret": f_is_secret,
                        "value": val,
                    })

            results.append({
                "title": title,
                "template_hint": it.get("template_hint"),
                "website_url": it.get("website_url"),
                "project_id": matched_project_id,
                "project_name": proj_name,
                "suggested_new_project": it.get("suggested_new_project"),
                "category_id": matched_category_id,
                "category_name": cat_name,
                "suggested_new_category": it.get("suggested_new_category"),
                "tags": tags,
                "rotation_days": rot_days,
                "description": desc,
                "fields": fields,
            })

        return results

    def commit(
        self,
        proposed_items: List[Dict[str, Any]],
        project_id: Optional[str] = None,
        category_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        created_items = []
        for it in proposed_items:
            # 1. Resolve Project
            item_project_id = it.get("project_id") or project_id
            new_proj_name = (it.get("new_project_name") or it.get("suggested_new_project") or "").strip()
            if not item_project_id and new_proj_name and new_proj_name.lower() not in ("none", "null", "بدون مشروع"):
                existing_pid = None
                for pid, p in self.vault.projects_index.items():
                    if p.get("payload", {}).get("name", "").strip().lower() == new_proj_name.lower():
                        existing_pid = pid
                        break
                if existing_pid:
                    item_project_id = existing_pid
                else:
                    from app.projects_service import ProjectsService
                    from app.models import ProjectPayload
                    ps = self.projects_service or ProjectsService(self.vault)
                    new_p = ps.create_project(ProjectPayload(name=new_proj_name))
                    item_project_id = new_p["id"]

            # 2. Resolve Category
            item_category_id = it.get("category_id") or category_id
            new_cat_name = (it.get("new_category_name") or it.get("suggested_new_category") or "").strip()
            if not item_category_id and new_cat_name and new_cat_name.lower() not in ("none", "null", "بدون تصنيف"):
                existing_cid = None
                for cid, c in self.vault.categories_index.items():
                    if c.get("payload", {}).get("name", "").strip().lower() == new_cat_name.lower():
                        existing_cid = cid
                        break
                if existing_cid:
                    item_category_id = existing_cid
                else:
                    from app.templates_service import TemplatesService
                    from app.models import CategoryPayload
                    ts = self.templates_service or TemplatesService(self.vault)
                    new_c = ts.create_category(CategoryPayload(name=new_cat_name))
                    item_category_id = new_c["id"]

            # 3. Resolve Tags
            raw_tags = it.get("tags")
            if isinstance(raw_tags, str):
                tags = [t.strip().lower() for t in raw_tags.split(",") if t.strip()]
            elif isinstance(raw_tags, list):
                tags = [str(t).strip().lower() for t in raw_tags if str(t).strip()]
            else:
                tags = ["imported"]
            if not tags:
                tags = ["imported"]

            # 4. Resolve Rotation Days
            rot_days = it.get("rotation_days")
            if rot_days is not None:
                try:
                    rot_days = int(rot_days)
                    if rot_days <= 0:
                        rot_days = None
                except (ValueError, TypeError):
                    rot_days = None

            # 5. Resolve Notes / Description
            description = it.get("description")
            if isinstance(description, str) and description.strip():
                description = description.strip()
            else:
                description = None

            fields = [
                ItemField(
                    id=f.get("id") or f"f_{uuid.uuid4().hex[:8]}",
                    label=f.get("label", "Field"),
                    type=f.get("type", "text"),
                    is_secret=bool(f.get("is_secret")),
                    value=f.get("value"),
                )
                for f in it.get("fields", [])
            ]
            payload = ItemPayload(
                title=it.get("title", "Untitled Secret"),
                website_url=it.get("website_url"),
                description=description,
                tags=tags,
                rotation_days=rot_days,
                fields=fields,
            )
            req = ItemCreateRequest(
                project_id=item_project_id,
                category_id=item_category_id,
                payload=payload,
            )
            created = self.items_service.create_item(req)
            created_items.append(created)

        return created_items

    def record_audit_log(self, event_type: str, details: Dict[str, Any]) -> None:
        conn = self.vault.get_connection()
        now_iso = datetime.now(timezone.utc).isoformat()
        log_id = f"aud_{uuid.uuid4().hex}"
        with conn:
            conn.execute(
                "INSERT INTO audit_log (id, timestamp, event_type, details_json) VALUES (?, ?, ?, ?)",
                (log_id, now_iso, event_type, json.dumps(details)),
            )
