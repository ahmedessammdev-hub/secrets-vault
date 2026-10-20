import os
import secrets
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from app.vault_service import VaultService
from app.items_service import ItemsService
from app.projects_service import ProjectsService
from app.templates_service import TemplatesService
from app.backup_service import BackupService
from app.drive_service import DriveService
from app.llm.service import LLMService

from app.api import auth, items, projects, templates, organize, generator, backup, clipboard, settings, drive, llm

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)
TOKEN_PATH = os.path.join(DATA_DIR, "session.token")

# Generate per-run session token (Section 10.3)
SESSION_TOKEN = secrets.token_hex(32)
with open(TOKEN_PATH, "w", encoding="utf-8") as f:
    f.write(SESSION_TOKEN)
try:
    if os.name != "nt":
        os.chmod(TOKEN_PATH, 0o600)
except Exception:
    pass

# Services instantiation
vault_svc = VaultService()
items_svc = ItemsService(vault_svc)
projects_svc = ProjectsService(vault_svc)
templates_svc = TemplatesService(vault_svc)
backup_svc = BackupService(vault_svc)
drive_svc = DriveService(vault_svc, backup_svc)
llm_svc = LLMService(vault_svc, items_svc, projects_service=projects_svc, templates_service=templates_svc)

# Wire dependencies into routers
auth.vault_service = vault_svc
items.items_service = items_svc
items.vault_service = vault_svc
projects.projects_service = projects_svc
projects.vault_service = vault_svc
templates.templates_service = templates_svc
organize.templates_service = templates_svc
organize.vault_service = vault_svc
backup.backup_service = backup_svc
backup.vault_service = vault_svc
settings.vault_service = vault_svc
drive.drive_service = drive_svc
drive.vault_service = vault_svc
llm.llm_service = llm_svc

app = FastAPI(title="Secrets Vault", version="2.0.0")

# Security Middleware: Origin / Host validation + Session Token + Locked status (Section 10.3)
ALLOWED_HOSTS = {"127.0.0.1", "localhost", "testserver"}


@app.middleware("http")
async def security_and_lock_middleware(request: Request, call_next):
    path = request.url.path

    # Host check (prevent DNS rebinding)
    host = request.headers.get("host", "").split(":")[0]
    if host and host not in ALLOWED_HOSTS:
        return JSONResponse(status_code=403, content={"detail": "Forbidden: Invalid Host header"})

    # Origin check for browser cross-origin requests
    origin = request.headers.get("origin")
    if origin:
        origin_host = origin.split("://")[-1].split(":")[0]
        if origin_host not in ALLOWED_HOSTS:
            return JSONResponse(status_code=403, content={"detail": "Forbidden: Invalid Origin header"})

    # Allow bootstrap & static assets without token
    public_paths = {
        "/",
        "/index.html",
        "/style.css",
        "/app.js",
        "/favicon.ico",
        "/api/session-token",
        "/auth/status",
        "/auth/setup",
        "/auth/unlock",
        "/auth/os-lock",
        "/docs",
        "/openapi.json",
        "/drive/oauth/callback",
        "/api/drive/oauth/callback",
    }

    # Token check
    if path not in public_paths and not path.startswith("/static") and not path.startswith("/assets"):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "").strip()
        if token != SESSION_TOKEN:
            return JSONResponse(status_code=403, content={"detail": "Forbidden: Invalid or missing session token"})

    # Vault lock check (Section 10.3 & 16.2)
    # If vault is locked, only status, setup, unlock, os-lock, and static assets are permitted
    unlocked_routes = {
        "/",
        "/index.html",
        "/style.css",
        "/app.js",
        "/favicon.ico",
        "/api/session-token",
        "/auth/status",
        "/auth/setup",
        "/auth/unlock",
        "/auth/os-lock",
        "/docs",
        "/openapi.json",
        "/drive/oauth/callback",
        "/api/drive/oauth/callback",
    }
    if not vault_svc.is_unlocked() and path not in unlocked_routes and not path.startswith("/static") and not path.startswith("/assets"):
        return JSONResponse(status_code=423, content={"detail": "Locked: Vault is currently locked"})

    # Touch activity timestamp on valid authenticated request to maintain session
    if vault_svc.is_unlocked():
        vault_svc.touch_activity()

    response = await call_next(request)
    return response


@app.get("/api/session-token")
def get_session_token():
    """Bootstrap endpoint for local web client to obtain the per-run token."""
    return {"token": SESSION_TOKEN}


# Register routers
app.include_router(auth.router)
app.include_router(items.router)
app.include_router(projects.router)
app.include_router(templates.router)
app.include_router(organize.router)
app.include_router(generator.router)
app.include_router(backup.router)
app.include_router(clipboard.router)
app.include_router(settings.router)
app.include_router(drive.router)
app.include_router(llm.router)

# Mount frontend
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")
    assets_dir = os.path.join(frontend_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/")
def serve_index():
    index_file = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Secrets Vault API is running"}


@app.get("/style.css")
def serve_css():
    css_file = os.path.join(frontend_dir, "style.css")
    if os.path.exists(css_file):
        return FileResponse(css_file, media_type="text/css")
    return Response(status_code=404)


@app.get("/app.js")
def serve_js():
    js_file = os.path.join(frontend_dir, "app.js")
    if os.path.exists(js_file):
        return FileResponse(js_file, media_type="application/javascript")
    return Response(status_code=404)
