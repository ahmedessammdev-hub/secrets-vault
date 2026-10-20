from fastapi import APIRouter, HTTPException, Depends, Query, Header, UploadFile, File, Form
from typing import Optional, List, Dict, Any
from app.models import ItemCreateRequest, ItemUpdateRequest, BulkActionRequest
from app.items_service import ItemsService
from app.vault_service import VaultService

router = APIRouter(prefix="/items", tags=["Items"])

items_service: Optional[ItemsService] = None
vault_service: Optional[VaultService] = None


def get_items() -> ItemsService:
    if items_service is None:
        raise HTTPException(status_code=500, detail="Items service uninitialized")
    return items_service


def get_vault() -> VaultService:
    if vault_service is None:
        raise HTTPException(status_code=500, detail="Vault service uninitialized")
    return vault_service


@router.get("")
def list_items(
    search: Optional[str] = None,
    project_id: Optional[str] = None,
    category_id: Optional[str] = None,
    tag: Optional[str] = None,
    favorite: Optional[bool] = None,
    archived: Optional[bool] = False,
    in_trash: bool = False,
    smart_view: Optional[str] = None,
    sort_by: str = "updated_at",
    service: ItemsService = Depends(get_items),
):
    try:
        return service.list_items(
            search=search,
            project_id=project_id,
            category_id=category_id,
            tag=tag,
            is_favorite=favorite,
            is_archived=archived,
            in_trash=in_trash,
            smart_view=smart_view,
            sort_by=sort_by,
        )
    except ValueError as e:
        raise HTTPException(status_code=423, detail=str(e))


@router.post("")
def create_item(req: ItemCreateRequest, service: ItemsService = Depends(get_items)):
    try:
        return service.create_item(req)
    except ValueError as e:
        raise HTTPException(status_code=423, detail=str(e))


@router.get("/{item_id}")
def get_item(item_id: str, service: ItemsService = Depends(get_items)):
    try:
        return service.get_item(item_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Item not found")
    except ValueError as e:
        raise HTTPException(status_code=423, detail=str(e))


@router.put("/{item_id}")
def update_item(item_id: str, req: ItemUpdateRequest, service: ItemsService = Depends(get_items)):
    try:
        return service.update_item(item_id, req)
    except KeyError:
        raise HTTPException(status_code=404, detail="Item not found")
    except ValueError as e:
        raise HTTPException(status_code=423, detail=str(e))


@router.delete("/{item_id}")
def delete_item(item_id: str, permanent: bool = False, service: ItemsService = Depends(get_items)):
    try:
        service.delete_item(item_id, permanent=permanent)
        return {"success": True, "message": "Item deleted"}
    except ValueError as e:
        raise HTTPException(status_code=423, detail=str(e))


@router.post("/{item_id}/restore")
def restore_item(item_id: str, service: ItemsService = Depends(get_items)):
    try:
        service.restore_item(item_id)
        return {"success": True, "message": "Item restored from Trash"}
    except ValueError as e:
        raise HTTPException(status_code=423, detail=str(e))


@router.post("/{item_id}/copy-field")
def copy_field(
    item_id: str,
    field_id: Optional[str] = None,
    env: Optional[str] = None,
    ttl_seconds: int = 30,
    service: ItemsService = Depends(get_items),
):
    try:
        return service.copy_field(item_id, field_id=field_id, env=env, ttl_seconds=ttl_seconds)
    except KeyError:
        raise HTTPException(status_code=404, detail="Item not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{item_id}/fields/{field_id}/history/restore")
def restore_history(
    item_id: str,
    field_id: str,
    history_idx: int = Query(0),
    service: ItemsService = Depends(get_items),
):
    try:
        return service.restore_field_history(item_id, field_id, history_idx)
    except (KeyError, IndexError) as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{item_id}/fields/{field_id}/history")
def clear_history(item_id: str, field_id: str, service: ItemsService = Depends(get_items)):
    try:
        return service.clear_field_history(item_id, field_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Item not found")


@router.post("/bulk")
def bulk_action(req: BulkActionRequest, service: ItemsService = Depends(get_items)):
    try:
        return service.bulk_action(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reveal-all")
def reveal_all(vault: VaultService = Depends(get_vault), x_reauth_token: Optional[str] = Header(None)):
    if not vault.verify_reauth_token(x_reauth_token):
        raise HTTPException(status_code=428, detail="Re-authentication required to reveal all secrets")
    return {"allowed": True}


# --- V2: TOTP Code & QR Code Display ---
@router.get("/{item_id}/fields/{field_id}/totp")
def get_totp(item_id: str, field_id: str, service: ItemsService = Depends(get_items)):
    try:
        return service.get_totp_code(item_id, field_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Item or field not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{item_id}/fields/{field_id}/qr")
def get_field_qr(item_id: str, field_id: str, service: ItemsService = Depends(get_items)):
    from fastapi.responses import Response
    try:
        png_bytes = service.get_field_qr(item_id, field_id)
        return Response(content=png_bytes, media_type="image/png")
    except KeyError:
        raise HTTPException(status_code=404, detail="Item or field not found")


# --- V2: Encrypted Attachments ---
@router.post("/{item_id}/attachments")
async def upload_attachment(
    item_id: str,
    file: UploadFile = File(...),
    service: ItemsService = Depends(get_items),
):
    try:
        content = await file.read()
        return service.add_attachment(
            item_id=item_id,
            filename=file.filename or "attachment",
            mime=file.content_type or "application/octet-stream",
            data=content,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Item not found")


@router.get("/{item_id}/attachments")
def list_attachments(item_id: str, service: ItemsService = Depends(get_items)):
    return service.list_attachments(item_id)


@router.get("/{item_id}/attachments/{attachment_id}")
def download_attachment(
    item_id: str,
    attachment_id: str,
    service: ItemsService = Depends(get_items),
):
    from fastapi.responses import Response
    try:
        filename, mime, decrypted_data = service.get_attachment(item_id, attachment_id)
        return Response(
            content=decrypted_data,
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Attachment not found")


@router.delete("/{item_id}/attachments/{attachment_id}")
def delete_attachment(
    item_id: str,
    attachment_id: str,
    service: ItemsService = Depends(get_items),
):
    service.delete_attachment(item_id, attachment_id)
    return {"success": True, "message": "Attachment deleted"}


# --- V2: Local Migration Import (Bitwarden JSON & CSV) ---
@router.post("/import/local")
async def import_local_file(
    format_type: str = Form(...),  # "bitwarden_json", "csv", "env"
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    category_id: Optional[str] = Form(None),
    service: ItemsService = Depends(get_items),
):
    content_bytes = await file.read()
    content_str = content_bytes.decode("utf-8", errors="replace")

    if format_type == "bitwarden_json":
        import json
        try:
            data = json.loads(content_str)
            created = service.import_bitwarden_json(data, project_id=project_id, category_id=category_id)
            return {"success": True, "imported_count": len(created), "items": created}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid Bitwarden JSON: {e}")
    elif format_type == "csv":
        try:
            created = service.import_csv(content_str, project_id=project_id, category_id=category_id)
            return {"success": True, "imported_count": len(created), "items": created}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid CSV: {e}")
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format_type}")

