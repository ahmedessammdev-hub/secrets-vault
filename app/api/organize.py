from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from app.models import CategoryPayload
from app.templates_service import TemplatesService
from app.vault_service import VaultService

router = APIRouter(tags=["Organize"])

templates_service: Optional[TemplatesService] = None
vault_service: Optional[VaultService] = None


def get_templates() -> TemplatesService:
    if templates_service is None:
        raise HTTPException(status_code=500, detail="Templates service uninitialized")
    return templates_service


def get_vault() -> VaultService:
    if vault_service is None:
        raise HTTPException(status_code=500, detail="Vault service uninitialized")
    return vault_service


@router.get("/categories")
def list_categories(service: TemplatesService = Depends(get_templates)):
    return service.list_categories()


@router.post("/categories")
def create_category(payload: CategoryPayload, service: TemplatesService = Depends(get_templates)):
    return service.create_category(payload)


@router.delete("/categories/{category_id}")
def delete_category(category_id: str, service: TemplatesService = Depends(get_templates)):
    service.delete_category(category_id)
    return {"success": True, "message": "Category deleted"}


@router.get("/tags")
def list_tags(vault: VaultService = Depends(get_vault)):
    if not vault.is_unlocked():
        raise HTTPException(status_code=423, detail="Vault is locked")

    tags_set = set()
    for item in vault.items_index.values():
        if item.get("deleted_at") is None:
            for t in item.get("payload", {}).get("tags", []):
                if t:
                    tags_set.add(t)
    return sorted(list(tags_set))
