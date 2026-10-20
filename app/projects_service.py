import re
import json
import uuid
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from app.crypto_service import CryptoService
from app.vault_service import VaultService
from app.models import ProjectPayload


def sanitize_env_key(label: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "_", label.strip().upper())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned or cleaned[0].isdigit():
        cleaned = f"VAR_{cleaned}"
    return cleaned


class ProjectsService:
    def __init__(self, vault_service: VaultService):
        self.vault = vault_service

    def _ensure_unlocked(self):
        if not self.vault.is_unlocked():
            raise ValueError("Vault is locked")

    def list_projects(self) -> List[Dict[str, Any]]:
        self._ensure_unlocked()
        projs = list(self.vault.projects_index.values())
        projs.sort(key=lambda x: x.get("sort_order", 0))
        return projs

    def get_project(self, project_id: str) -> Dict[str, Any]:
        self._ensure_unlocked()
        proj = self.vault.projects_index.get(project_id)
        if not proj:
            raise KeyError("Project not found")
        return proj

    def create_project(self, payload: ProjectPayload) -> Dict[str, Any]:
        self._ensure_unlocked()
        project_id = f"proj_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        key = self.vault.get_vault_key()

        payload_dict = payload.model_dump()
        payload_bytes = json.dumps(payload_dict).encode("utf-8")
        aad = f"{project_id}|2".encode("utf-8")
        ciphertext = CryptoService.encrypt_payload(key, payload_bytes, aad)

        conn = self.vault.get_connection()
        sort_order = len(self.vault.projects_index)
        with conn:
            conn.execute(
                """
                INSERT INTO projects (id, sort_order, created_at, updated_at, payload_enc)
                VALUES (?, ?, ?, ?, ?)
                """,
                (project_id, sort_order, now_iso, now_iso, ciphertext),
            )

        new_proj = {
            "id": project_id,
            "sort_order": sort_order,
            "created_at": now_iso,
            "updated_at": now_iso,
            "payload": payload_dict,
        }
        self.vault.projects_index[project_id] = new_proj
        return new_proj

    def update_project(self, project_id: str, payload: ProjectPayload) -> Dict[str, Any]:
        self._ensure_unlocked()
        current = self.vault.projects_index.get(project_id)
        if not current:
            raise KeyError("Project not found")

        now_iso = datetime.now(timezone.utc).isoformat()
        key = self.vault.get_vault_key()

        payload_dict = payload.model_dump()
        payload_bytes = json.dumps(payload_dict).encode("utf-8")
        aad = f"{project_id}|2".encode("utf-8")
        ciphertext = CryptoService.encrypt_payload(key, payload_bytes, aad)

        conn = self.vault.get_connection()
        with conn:
            conn.execute(
                """
                UPDATE projects SET updated_at = ?, payload_enc = ? WHERE id = ?
                """,
                (now_iso, ciphertext, project_id),
            )

        current["updated_at"] = now_iso
        current["payload"] = payload_dict
        return current

    def delete_project(self, project_id: str) -> None:
        self._ensure_unlocked()
        conn = self.vault.get_connection()
        with conn:
            conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            # Unassign project from items
            conn.execute("UPDATE items SET project_id = NULL WHERE project_id = ?", (project_id,))

        if project_id in self.vault.projects_index:
            del self.vault.projects_index[project_id]

        for it in self.vault.items_index.values():
            if it.get("project_id") == project_id:
                it["project_id"] = None

    def export_env(
        self,
        project_id: str,
        env_name: str = "production",
        write_to_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        self._ensure_unlocked()
        project = self.get_project(project_id)

        # Gather items belonging to this project
        project_items = [
            it for it in self.vault.items_index.values()
            if it.get("project_id") == project_id and it.get("deleted_at") is None
        ]

        lines = []
        env_vars = {}

        for item in project_items:
            payload = item.get("payload", {})
            title = payload.get("title", "")
            lines.append(f"# --- {title} ---")
            for f in payload.get("fields", []):
                val = None
                if f.get("values"):
                    val = f["values"].get(env_name) or f["values"].get("default")
                else:
                    val = f.get("value")

                if val is not None:
                    # Sanitize key name
                    var_name = sanitize_env_key(f.get("label", "VAR"))
                    # If duplicate in project, prefix with item prefix
                    if var_name in env_vars:
                        prefix = sanitize_env_key(title)
                        var_name = f"{prefix}_{var_name}"

                    env_vars[var_name] = str(val)
                    lines.append(f'{var_name}="{val}"')

        content = "\n".join(lines) + "\n"

        # If writing to disk
        written = False
        warning = "Warning: This file will contain plaintext secrets on disk."
        if write_to_path:
            abs_path = os.path.abspath(write_to_path)
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(content)
            written = True

            # Record in known_env_files
            known = list(project.get("payload", {}).get("known_env_files", []))
            if abs_path not in known:
                known.append(abs_path)
                p_payload = ProjectPayload(**project["payload"])
                p_payload.known_env_files = known
                self.update_project(project_id, p_payload)

        return {
            "environment": env_name,
            "variables_count": len(env_vars),
            "content": content,
            "written_to_path": os.path.abspath(write_to_path) if write_to_path else None,
            "warning": warning,
        }
