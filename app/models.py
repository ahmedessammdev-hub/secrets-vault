from typing import List, Dict, Optional, Any, Union
from pydantic import BaseModel, Field as PydanticField
from datetime import datetime, timezone
import uuid

# --- Field Models ---
VALID_FIELD_TYPES = {
    "text",
    "secret",
    "email",
    "phone",
    "url",
    "totp",
    "date",
    "number",
    "boolean",
    "multiline",
    "reference",
}


class FieldHistoryEntry(BaseModel):
    env: str = "default"
    value: Any
    replaced_at: str


class ItemField(BaseModel):
    id: str = PydanticField(default_factory=lambda: f"f_{uuid.uuid4().hex[:8]}")
    label: str
    type: str = "text"
    is_secret: bool = False
    value: Optional[Any] = None
    values: Optional[Dict[str, Any]] = None  # keyed by environment name
    history: List[FieldHistoryEntry] = []


class TemplateField(BaseModel):
    id: str = PydanticField(default_factory=lambda: f"tf_{uuid.uuid4().hex[:8]}")
    label: str
    type: str = "text"
    is_secret: bool = False
    default_value: Optional[Any] = None


# --- Decrypted Payloads (Schema v2) ---
class ItemPayload(BaseModel):
    model_config = {"populate_by_name": True}
    schema_v: int = PydanticField(default=2, alias="schema")
    title: str
    website_url: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = []
    template_id: Optional[str] = None
    rotation_days: Optional[int] = None
    fields: List[ItemField] = []


class ProjectPayload(BaseModel):
    name: str
    icon: Optional[str] = None
    environments: List[str] = ["dev", "staging", "production"]
    notes: Optional[str] = None
    known_env_files: List[str] = []


class CategoryPayload(BaseModel):
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None


class TemplatePayload(BaseModel):
    name: str
    icon: Optional[str] = None
    description: Optional[str] = None
    fields: List[TemplateField] = []


# --- Full Entity Models (for responses) ---
class ItemModel(BaseModel):
    id: str
    project_id: Optional[str] = None
    category_id: Optional[str] = None
    is_favorite: bool = False
    is_pinned: bool = False
    is_archived: bool = False
    expires_at: Optional[str] = None
    created_at: str
    updated_at: str
    last_used_at: Optional[str] = None
    deleted_at: Optional[str] = None
    payload: Optional[ItemPayload] = None


class ProjectModel(BaseModel):
    id: str
    sort_order: int = 0
    created_at: str
    updated_at: str
    payload: ProjectPayload


class CategoryModel(BaseModel):
    id: str
    sort_order: int = 0
    created_at: str
    updated_at: str
    payload: CategoryPayload


class TemplateModel(BaseModel):
    id: str
    is_builtin: bool = False
    sort_order: int = 0
    created_at: str
    updated_at: str
    payload: TemplatePayload


# --- Request DTOs ---
class SetupRequest(BaseModel):
    master_password: str
    password_hint: Optional[str] = None


class UnlockRequest(BaseModel):
    master_password: str


class ChangePasswordRequest(BaseModel):
    old_master_password: str
    new_master_password: str
    new_password_hint: Optional[str] = None


class ReauthRequest(BaseModel):
    master_password: str


class VaultStatusResponse(BaseModel):
    initialized: bool
    unlocked: bool
    password_hint: Optional[str] = None
    items_count: int = 0
    last_backup_at: Optional[str] = None
    backup_health: str = "ok"  # "ok", "warning" (>7d), "danger" (>30d)
    days_since_backup: Optional[int] = None
    throttle_seconds_remaining: int = 0


class ItemCreateRequest(BaseModel):
    project_id: Optional[str] = None
    category_id: Optional[str] = None
    is_favorite: bool = False
    is_pinned: bool = False
    is_archived: bool = False
    expires_at: Optional[str] = None
    payload: ItemPayload


class ItemUpdateRequest(BaseModel):
    project_id: Optional[str] = None
    category_id: Optional[str] = None
    is_favorite: Optional[bool] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None
    expires_at: Optional[str] = None
    payload: Optional[ItemPayload] = None


class BulkActionRequest(BaseModel):
    action: str  # "move_project", "move_category", "add_tag", "remove_tag", "archive", "unarchive", "delete"
    item_ids: List[str]
    target_id: Optional[str] = None
    tag_value: Optional[str] = None


class PasswordGenRequest(BaseModel):
    length: int = 20
    uppercase: bool = True
    lowercase: bool = True
    digits: bool = True
    symbols: bool = True
    exclude_lookalikes: bool = False


class PassphraseGenRequest(BaseModel):
    words_count: int = 5
    separator: str = "-"


class ApiKeyGenRequest(BaseModel):
    format: str = "base64url"  # "hex" or "base64url"
    bytes_length: int = 32
    prefix: Optional[str] = None


class EnvExportRequest(BaseModel):
    environment: str = "production"
    write_to_path: Optional[str] = None
