from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from app.models import SetupRequest, UnlockRequest, ChangePasswordRequest, ReauthRequest, VaultStatusResponse
from app.vault_service import VaultService

router = APIRouter(prefix="/auth", tags=["Auth"])

# Will be initialized in main.py
vault_service: Optional[VaultService] = None


def get_vault() -> VaultService:
    if vault_service is None:
        raise HTTPException(status_code=500, detail="Vault service uninitialized")
    return vault_service


@router.get("/status", response_model=VaultStatusResponse)
def get_status(vault: VaultService = Depends(get_vault)):
    init = vault.is_initialized()
    unlocked = vault.is_unlocked()
    items_count = len(vault.items_index) if unlocked else 0
    hint = vault.get_password_hint() if init else None

    # Calculate backup health
    days_since_backup = None
    backup_health = "danger"
    last_backup = None
    if init:
        row = vault.get_connection().execute("SELECT last_backup_at FROM vault_meta WHERE id = 1").fetchone()
        if row and row["last_backup_at"]:
            last_backup = row["last_backup_at"]
            from datetime import datetime, timezone
            dt = datetime.fromisoformat(last_backup)
            days = (datetime.now(timezone.utc) - dt).days
            days_since_backup = days
            if days >= 30:
                backup_health = "danger"
            elif days >= 7:
                backup_health = "warning"
            else:
                backup_health = "ok"

    return VaultStatusResponse(
        initialized=init,
        unlocked=unlocked,
        password_hint=hint,
        items_count=items_count,
        last_backup_at=last_backup,
        backup_health=backup_health,
        days_since_backup=days_since_backup,
        throttle_seconds_remaining=vault.get_throttle_remaining(),
    )


@router.post("/setup")
def setup_vault(req: SetupRequest, vault: VaultService = Depends(get_vault)):
    try:
        vault.setup(req.master_password, req.password_hint)
        return {"success": True, "message": "Vault successfully initialized"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/unlock")
def unlock_vault(req: UnlockRequest, vault: VaultService = Depends(get_vault)):
    try:
        vault.unlock(req.master_password)
        return {
            "success": True,
            "message": "Vault unlocked",
            "integrity_errors": vault.integrity_errors,
        }
    except ValueError as e:
        # Check throttling
        rem = vault.get_throttle_remaining()
        if rem > 0:
            raise HTTPException(status_code=429, detail=f"Rate limited. Please wait {rem} seconds.")
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/lock")
def lock_vault(vault: VaultService = Depends(get_vault)):
    vault.lock()
    return {"success": True, "message": "Vault locked"}


@router.post("/os-lock")
def os_lock(vault: VaultService = Depends(get_vault)):
    vault.lock()
    return {"success": True, "message": "Vault locked due to OS lock event"}


@router.post("/reauth")
def reauth(req: ReauthRequest, vault: VaultService = Depends(get_vault)):
    try:
        token = vault.create_reauth_token(req.master_password)
        return {"success": True, "reauth_token": token, "expires_in_seconds": 300}
    except Exception as e:
        raise HTTPException(status_code=401, detail="Re-authentication failed: incorrect password")


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    vault: VaultService = Depends(get_vault),
    x_reauth_token: Optional[str] = Header(None),
):
    if not vault.verify_reauth_token(x_reauth_token):
        raise HTTPException(status_code=428, detail="Re-authentication required for password change")

    try:
        vault.change_master_password(req.old_master_password, req.new_master_password, req.new_password_hint)
        return {"success": True, "message": "Master password changed successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
