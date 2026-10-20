from fastapi import APIRouter, HTTPException, Depends, Header, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import Optional
import os
import shutil
import tempfile
from app.backup_service import BackupService
from app.vault_service import VaultService

router = APIRouter(prefix="/backup", tags=["Backup"])

backup_service: Optional[BackupService] = None
vault_service: Optional[VaultService] = None


def get_backup() -> BackupService:
    if backup_service is None:
        raise HTTPException(status_code=500, detail="Backup service uninitialized")
    return backup_service


def get_vault() -> VaultService:
    if vault_service is None:
        raise HTTPException(status_code=500, detail="Vault service uninitialized")
    return vault_service


@router.get("/health")
def backup_health(service: BackupService = Depends(get_backup)):
    return service.get_backup_health()


@router.get("/export")
def export_backup(
    vault: VaultService = Depends(get_vault),
    service: BackupService = Depends(get_backup),
    x_reauth_token: Optional[str] = Header(None),
):
    if not vault.verify_reauth_token(x_reauth_token):
        raise HTTPException(status_code=428, detail="Re-authentication required to export vault backup")

    try:
        res = service.export_vault()
        return FileResponse(
            path=res["filepath"],
            filename=res["filename"],
            media_type="application/octet-stream",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export-unencrypted")
def export_unencrypted(
    format_type: str = "json",
    confirm_unencrypted: bool = False,
    vault: VaultService = Depends(get_vault),
    service: BackupService = Depends(get_backup),
    x_reauth_token: Optional[str] = Header(None),
):
    if not vault.verify_reauth_token(x_reauth_token):
        raise HTTPException(status_code=428, detail="Re-authentication required for unencrypted export")
    if not confirm_unencrypted:
        raise HTTPException(status_code=400, detail="Explicit confirmation parameter 'confirm_unencrypted=true' required")

    from fastapi.responses import Response
    try:
        filename, mime, content_bytes = service.export_unencrypted(format_type=format_type)
        return Response(
            content=content_bytes,
            media_type=mime,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Security-Warning": "Plaintext Credentials Export",
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/verify")
async def verify_backup(
    file: UploadFile = File(...),
    service: BackupService = Depends(get_backup),
    vault: VaultService = Depends(get_vault),
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".vault") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        key = vault.get_vault_key() if vault.is_unlocked() else None
        res = service.verify_backup_file(tmp_path, vault_key=key)
        return res
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


@router.post("/import")
async def import_backup(
    file: UploadFile = File(...),
    master_password: str = Form(...),
    confirm_overwrite: bool = Form(False),
    service: BackupService = Depends(get_backup),
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".vault") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        res = service.import_vault(tmp_path, master_password=master_password, confirm_overwrite=confirm_overwrite)
        if res.get("status_code") == 409:
            raise HTTPException(status_code=409, detail=res.get("message"))
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass
