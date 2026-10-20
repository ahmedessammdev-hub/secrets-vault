from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.models import TemplatePayload
from app.templates_service import TemplatesService

router = APIRouter(prefix="/templates", tags=["Templates"])

templates_service: Optional[TemplatesService] = None


def get_templates() -> TemplatesService:
    if templates_service is None:
        raise HTTPException(status_code=500, detail="Templates service uninitialized")
    return templates_service


@router.get("")
def list_templates(service: TemplatesService = Depends(get_templates)):
    return service.list_templates()


@router.post("")
def create_template(payload: TemplatePayload, service: TemplatesService = Depends(get_templates)):
    return service.create_template(payload)


@router.get("/{template_id}")
def get_template(template_id: str, service: TemplatesService = Depends(get_templates)):
    try:
        return service.get_template(template_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Template not found")


@router.put("/{template_id}")
def update_template(template_id: str, payload: TemplatePayload, service: TemplatesService = Depends(get_templates)):
    try:
        return service.update_template(template_id, payload)
    except KeyError:
        raise HTTPException(status_code=404, detail="Template not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{template_id}")
def delete_template(template_id: str, service: TemplatesService = Depends(get_templates)):
    try:
        service.delete_template(template_id)
        return {"success": True, "message": "Template deleted"}
    except KeyError:
        raise HTTPException(status_code=404, detail="Template not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class SaveAsTemplateRequest(BaseModel):
    item_id: str
    name: str
    description: Optional[str] = None


@router.post("/save-as-template")
def save_as_template(
    req: Optional[SaveAsTemplateRequest] = None,
    item_id: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    service: TemplatesService = Depends(get_templates),
):
    target_id = req.item_id if req else item_id
    target_name = req.name if req else name
    target_desc = req.description if req else description

    if not target_id or not target_name:
        raise HTTPException(status_code=400, detail="item_id and name are required")

    try:
        return service.save_item_as_template(target_id, name=target_name, description=target_desc)
    except KeyError:
        raise HTTPException(status_code=404, detail="Item not found")
