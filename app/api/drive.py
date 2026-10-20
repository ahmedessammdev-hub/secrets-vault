from fastapi import APIRouter, HTTPException, Depends, Header, Query
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from typing import Optional
from app.drive_service import DriveService
from app.vault_service import VaultService

router = APIRouter(prefix="/drive", tags=["Drive"])

drive_service: Optional[DriveService] = None
vault_service: Optional[VaultService] = None


def get_drive() -> DriveService:
    if drive_service is None:
        raise HTTPException(status_code=500, detail="Drive service uninitialized")
    return drive_service


def get_vault() -> VaultService:
    if vault_service is None:
        raise HTTPException(status_code=500, detail="Vault service uninitialized")
    return vault_service


class OAuthConfigRequest(BaseModel):
    client_id: str
    client_secret: str


class RestoreRequest(BaseModel):
    filename: str
    master_password: str


class ConnectRequest(BaseModel):
    account_email: str = "developer@local"


@router.post("/connect")
def connect_drive(req: ConnectRequest, service: DriveService = Depends(get_drive)):
    return service.connect(req.account_email)


@router.get("/status")
def get_drive_status(service: DriveService = Depends(get_drive)):
    return service.get_status()


@router.post("/oauth/config")
def save_oauth_config(req: OAuthConfigRequest, service: DriveService = Depends(get_drive)):
    try:
        return service.save_oauth_credentials(req.client_id, req.client_secret)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/oauth/config")
def get_oauth_config(service: DriveService = Depends(get_drive)):
    return service.get_oauth_credentials()


@router.get("/oauth/url")
def get_oauth_url(
    redirect_uri: str = Query("http://127.0.0.1:8000/drive/oauth/callback"),
    service: DriveService = Depends(get_drive),
):
    try:
        return service.get_auth_url(redirect_uri)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/oauth/callback")
def handle_oauth_callback(
    code: Optional[str] = None,
    error: Optional[str] = None,
    service: DriveService = Depends(get_drive),
):
    if error:
        html = f"""
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>فشل الربط بجوجل درايف</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
                .card {{ background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #ef4444; max-width: 480px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }}
                h2 {{ color: #ef4444; margin-top: 0; }}
                p {{ color: #94a3b8; line-height: 1.6; }}
            </style>
        </head>
        <body>
            <div class="card">
                <h2>❌ فشل تسجيل الدخول</h2>
                <p>تم رفض أو إلغاء الاتصال من قبل Google:</p>
                <p><code>{error}</code></p>
                <p>يمكنك إغلاق هذه الصفحة والعودة للتطبيق للمحاولة مجدداً.</p>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=400)

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    try:
        # Standard callback url registered with Google
        redirect_uri = "http://127.0.0.1:8000/drive/oauth/callback"
        result = service.handle_oauth_callback(code, redirect_uri)
        account_email = result.get("account_email", "")

        html = f"""
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>تم الربط بنجاح | Secrets Vault</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
                .card {{ background: #131b2e; padding: 3rem 2.5rem; border-radius: 1.25rem; border: 1px solid #10b981; max-width: 500px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); }}
                .icon {{ font-size: 3.5rem; margin-bottom: 1rem; }}
                h2 {{ color: #10b981; margin: 0 0 0.5rem 0; font-size: 1.5rem; }}
                .email {{ background: #1e293b; padding: 0.5rem 1rem; border-radius: 0.5rem; color: #38bdf8; font-weight: 600; display: inline-block; margin: 1rem 0; font-size: 0.95rem; }}
                p {{ color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin: 0.5rem 0; }}
                .close-btn {{ margin-top: 1.5rem; background: #2563eb; color: white; border: none; padding: 0.75rem 2rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; }}
            </style>
            <script>
                try {{
                    if (window.opener) {{
                        window.opener.postMessage({{ type: "GOOGLE_DRIVE_CONNECTED", email: "{account_email}" }}, "*");
                    }}
                }} catch (e) {{}}
            </script>
        </head>
        <body>
            <div class="card">
                <div class="icon">🎉</div>
                <h2>تم ربط Google Drive بنجاح!</h2>
                <div class="email">{account_email}</div>
                <p>أصبح تطبيق Secrets Vault متصلاً بحساب Google Drive الخاص بك.</p>
                <p>سيتم مزامنة ورفع النسخ الاحتياطية المشفرة تلقائياً في مجلد <strong>Secrets Vault Backups</strong>.</p>
                <button class="close-btn" onclick="window.close()">إغلاق هذه النافذة</button>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=html)
    except Exception as e:
        html = f"""
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>خطأ في استبدال التوكن</title>
            <style>
                body {{ font-family: sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; }}
                .card {{ background: #1e293b; padding: 2rem; border-radius: 1rem; border: 1px solid #ef4444; max-width: 480px; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="card">
                <h2>❌ خطأ أثناء إتمام الربط</h2>
                <p>{str(e)}</p>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=500)


@router.post("/disconnect")
def disconnect_drive(service: DriveService = Depends(get_drive)):
    return service.disconnect()


@router.post("/backup-now")
def backup_now(service: DriveService = Depends(get_drive)):
    return service.backup_now()


@router.get("/snapshots")
def list_snapshots(service: DriveService = Depends(get_drive)):
    return service.list_snapshots()


@router.get("/download/{snapshot_id}")
def download_snapshot(snapshot_id: str, service: DriveService = Depends(get_drive)):
    try:
        content = service.download_snapshot_bytes(snapshot_id)
        return Response(
            content=content,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{snapshot_id}.vault"'},
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore")
def restore_snapshot(
    req: RestoreRequest,
    service: DriveService = Depends(get_drive),
    vault: VaultService = Depends(get_vault),
    x_reauth_token: Optional[str] = Header(None),
):
    if not vault.verify_reauth_token(x_reauth_token):
        raise HTTPException(status_code=428, detail="Re-authentication required to restore from Drive snapshot")

    try:
        # Check local snapshots
        target_path = os.path.join(service.local_snapshots_dir, req.filename)
        if not os.path.exists(target_path):
            # Try downloading bytes if it's a cloud ID
            bytes_data = service.download_snapshot_bytes(req.filename)
            with open(target_path, "wb") as f:
                f.write(bytes_data)

        return service.backup.import_vault(target_path, master_password=req.master_password, confirm_overwrite=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
