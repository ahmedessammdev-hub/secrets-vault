import json
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from app.crypto_service import CryptoService
from app.vault_service import VaultService
from app.models import TemplatePayload, TemplateField, CategoryPayload


class TemplatesService:
    def __init__(self, vault_service: VaultService):
        self.vault = vault_service

    def _ensure_unlocked(self):
        if not self.vault.is_unlocked():
            raise ValueError("Vault is locked")

    def list_templates(self) -> List[Dict[str, Any]]:
        self._ensure_unlocked()
        tpls = list(self.vault.templates_index.values())
        tpls.sort(key=lambda x: (not x.get("is_builtin", False), x.get("sort_order", 0)))
        return tpls

    def get_template(self, template_id: str) -> Dict[str, Any]:
        self._ensure_unlocked()
        tpl = self.vault.templates_index.get(template_id)
        if not tpl:
            raise KeyError("Template not found")
        return tpl

    def create_template(self, payload: TemplatePayload) -> Dict[str, Any]:
        self._ensure_unlocked()
        tpl_id = f"tpl_user_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        key = self.vault.get_vault_key()

        payload_dict = payload.model_dump()
        payload_bytes = json.dumps(payload_dict).encode("utf-8")
        aad = f"{tpl_id}|2".encode("utf-8")
        ciphertext = CryptoService.encrypt_payload(key, payload_bytes, aad)

        conn = self.vault.get_connection()
        sort_order = len(self.vault.templates_index)
        with conn:
            conn.execute(
                """
                INSERT INTO templates (id, is_builtin, sort_order, created_at, updated_at, payload_enc)
                VALUES (?, 0, ?, ?, ?, ?)
                """,
                (tpl_id, sort_order, now_iso, now_iso, ciphertext),
            )

        new_tpl = {
            "id": tpl_id,
            "is_builtin": False,
            "sort_order": sort_order,
            "created_at": now_iso,
            "updated_at": now_iso,
            "payload": payload_dict,
        }
        self.vault.templates_index[tpl_id] = new_tpl
        return new_tpl

    def update_template(self, template_id: str, payload: TemplatePayload) -> Dict[str, Any]:
        self._ensure_unlocked()
        current = self.vault.templates_index.get(template_id)
        if not current:
            raise KeyError("Template not found")
        if current.get("is_builtin"):
            raise ValueError("Built-in templates cannot be modified")

        now_iso = datetime.now(timezone.utc).isoformat()
        key = self.vault.get_vault_key()

        payload_dict = payload.model_dump()
        payload_bytes = json.dumps(payload_dict).encode("utf-8")
        aad = f"{template_id}|2".encode("utf-8")
        ciphertext = CryptoService.encrypt_payload(key, payload_bytes, aad)

        conn = self.vault.get_connection()
        with conn:
            conn.execute(
                "UPDATE templates SET updated_at = ?, payload_enc = ? WHERE id = ?",
                (now_iso, ciphertext, template_id),
            )

        current["updated_at"] = now_iso
        current["payload"] = payload_dict
        return current

    def delete_template(self, template_id: str) -> None:
        self._ensure_unlocked()
        current = self.vault.templates_index.get(template_id)
        if not current:
            raise KeyError("Template not found")
        if current.get("is_builtin"):
            raise ValueError("Built-in templates cannot be deleted")

        conn = self.vault.get_connection()
        with conn:
            conn.execute("DELETE FROM templates WHERE id = ?", (template_id,))

        if template_id in self.vault.templates_index:
            del self.vault.templates_index[template_id]

    def save_item_as_template(self, item_id: str, name: str, description: Optional[str] = None) -> Dict[str, Any]:
        self._ensure_unlocked()
        item = self.vault.items_index.get(item_id)
        if not item:
            raise KeyError("Item not found")

        fields = []
        for f in item.get("payload", {}).get("fields", []):
            fields.append(
                TemplateField(
                    label=f.get("label", "Field"),
                    type=f.get("type", "text"),
                    is_secret=bool(f.get("is_secret")),
                )
            )

        payload = TemplatePayload(
            name=name,
            icon=item.get("payload", {}).get("icon", "folder"),
            description=description or f"Template derived from {item.get('payload', {}).get('title')}",
            fields=fields,
        )
        return self.create_template(payload)

    # Categories
    def list_categories(self) -> List[Dict[str, Any]]:
        self._ensure_unlocked()
        cats = list(self.vault.categories_index.values())
        cats.sort(key=lambda x: x.get("sort_order", 0))
        return cats

    def create_category(self, payload: CategoryPayload) -> Dict[str, Any]:
        self._ensure_unlocked()
        cat_id = f"cat_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        key = self.vault.get_vault_key()

        payload_dict = payload.model_dump()
        payload_bytes = json.dumps(payload_dict).encode("utf-8")
        aad = f"{cat_id}|2".encode("utf-8")
        ciphertext = CryptoService.encrypt_payload(key, payload_bytes, aad)

        conn = self.vault.get_connection()
        sort_order = len(self.vault.categories_index)
        with conn:
            conn.execute(
                """
                INSERT INTO categories (id, sort_order, created_at, updated_at, payload_enc)
                VALUES (?, ?, ?, ?, ?)
                """,
                (cat_id, sort_order, now_iso, now_iso, ciphertext),
            )

        new_cat = {
            "id": cat_id,
            "sort_order": sort_order,
            "created_at": now_iso,
            "updated_at": now_iso,
            "payload": payload_dict,
        }
        self.vault.categories_index[cat_id] = new_cat
        return new_cat

    def delete_category(self, category_id: str) -> None:
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        with conn:
            conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
            conn.execute("UPDATE items SET category_id = NULL WHERE category_id = ?", (category_id,))

        if category_id in self.vault.categories_index:
            del self.vault.categories_index[category_id]

        for it in self.vault.items_index.values():
            if it.get("category_id") == category_id:
                it["category_id"] = None
