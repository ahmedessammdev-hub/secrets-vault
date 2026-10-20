from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.llm.service import LLMService
from app.items_service import ItemsService
from app.vault_service import VaultService
from app.crypto_service import CryptoService

router = APIRouter(prefix="/llm", tags=["LLM Assistant"])

llm_service: Optional[LLMService] = None


def get_llm() -> LLMService:
    if llm_service is None:
        raise HTTPException(status_code=500, detail="LLM service uninitialized")
    return llm_service


class PreviewRequest(BaseModel):
    text: str


class LLMConfig(BaseModel):
    backend_type: str = "openai_compat"
    base_url: str = "https://api.openai.com/v1"
    api_key: Optional[str] = None
    model: str = "gpt-4o"
    supports_vision: bool = True
    raw_mode: bool = False
    timeout: int = 60


class LLMProviderRequest(BaseModel):
    id: Optional[str] = None
    title: str
    backend_type: str = "openai_compat"
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o"
    api_key: Optional[str] = None
    supports_vision: bool = True
    raw_mode: bool = False
    timeout: int = 60
    set_as_active: bool = False


class TestProviderRequest(BaseModel):
    item_id: Optional[str] = None
    backend_type: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None


class RunImportRequest(BaseModel):
    text: Optional[str] = ""
    images: Optional[List[str]] = None
    provider_item_id: Optional[str] = None
    backend_type: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    raw_mode: Optional[bool] = None


class CommitImportRequest(BaseModel):
    items: List[Dict[str, Any]]
    project_id: Optional[str] = None
    category_id: Optional[str] = None


def _get_saved_api_key(service: LLMService) -> str:
    """Retrieve and decrypt the LLM API key from settings_enc if present."""
    if not service.vault.is_unlocked():
        return ""
    conn = service.vault.get_connection()
    row = conn.execute("SELECT payload_enc FROM settings_enc WHERE key = 'llm_api_key'").fetchone()
    if not row:
        return ""
    try:
        key = service.vault.get_vault_key()
        dec = CryptoService.decrypt_payload(key, row["payload_enc"], b"setting:llm_api_key")
        return dec.decode("utf-8")
    except Exception:
        return ""


@router.get("/status")
def llm_status(service: LLMService = Depends(get_llm)):
    from app.llm.agy_cli import AntigravityCLIBackend
    agy = AntigravityCLIBackend()

    active_p = service.get_provider_details()
    backend_type = active_p.get("backend_type", "agy_cli" if agy.is_available() else "openai_compat")
    model = active_p.get("model", "gpt-4o")
    has_key = bool(active_p.get("api_key"))
    supports_vision = active_p.get("supports_vision", True)

    return {
        "enabled": True,
        "antigravity_cli_available": agy.is_available(),
        "supported_backends": ["openai_compat", "agy_cli"],
        "active_backend": backend_type,
        "active_model": model,
        "active_provider_id": active_p.get("id"),
        "supports_vision": supports_vision,
        "has_api_key": has_key,
    }


@router.get("/config")
def get_llm_config(service: LLMService = Depends(get_llm)):
    from app.llm.agy_cli import AntigravityCLIBackend
    agy = AntigravityCLIBackend()

    active_p = service.get_provider_details()

    return {
        "backend_type": active_p.get("backend_type", "agy_cli" if agy.is_available() else "openai_compat"),
        "base_url": active_p.get("base_url", "https://api.openai.com/v1"),
        "model": active_p.get("model", "gpt-4o"),
        "supports_vision": active_p.get("supports_vision", True),
        "raw_mode": active_p.get("raw_mode", False),
        "timeout": active_p.get("timeout", 60),
        "has_api_key": bool(active_p.get("api_key")),
        "antigravity_cli_available": agy.is_available(),
    }


@router.post("/config")
def save_llm_config(cfg: LLMConfig, service: LLMService = Depends(get_llm)):
    conn = service.vault.get_connection()
    with conn:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_backend_type', ?)", (cfg.backend_type,))
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_base_url', ?)", (cfg.base_url,))
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_model', ?)", (cfg.model,))
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_supports_vision', ?)", ("true" if cfg.supports_vision else "false",))
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_raw_mode', ?)", ("true" if cfg.raw_mode else "false",))
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('llm_timeout', ?)", (str(cfg.timeout),))

        # Encrypt and store API key if provided
        if cfg.api_key is not None:
            if cfg.api_key == "__DELETE__" or not cfg.api_key.strip():
                conn.execute("DELETE FROM settings_enc WHERE key = 'llm_api_key'")
            else:
                key = service.vault.get_vault_key()
                ct = CryptoService.encrypt_payload(key, cfg.api_key.strip().encode("utf-8"), b"setting:llm_api_key")
                conn.execute("INSERT OR REPLACE INTO settings_enc (key, payload_enc) VALUES ('llm_api_key', ?)", (ct,))

    # Also update/save active provider in AI Models project
    active_row = conn.execute("SELECT value FROM settings WHERE key = 'active_llm_item_id'").fetchone()
    active_id = active_row["value"] if active_row else None

    service.save_llm_provider(
        title=f"OpenAI {cfg.model}" if cfg.backend_type == "openai_compat" else "Antigravity CLI",
        backend_type=cfg.backend_type,
        base_url=cfg.base_url,
        model=cfg.model,
        api_key=cfg.api_key,
        supports_vision=cfg.supports_vision,
        raw_mode=cfg.raw_mode,
        timeout=cfg.timeout,
        item_id=active_id,
        set_as_active=True,
    )

    return {"success": True, "message": "LLM configuration saved securely"}


@router.get("/providers")
def list_providers(service: LLMService = Depends(get_llm)):
    providers = service.list_llm_providers()
    conn = service.vault.get_connection()
    row = conn.execute("SELECT value FROM settings WHERE key = 'active_llm_item_id'").fetchone()
    active_id = row["value"] if row else (providers[0]["id"] if providers else None)
    return {"providers": providers, "active_id": active_id}


@router.post("/providers")
def save_provider(req: LLMProviderRequest, service: LLMService = Depends(get_llm)):
    try:
        res = service.save_llm_provider(
            title=req.title,
            backend_type=req.backend_type,
            base_url=req.base_url,
            model=req.model,
            api_key=req.api_key,
            supports_vision=req.supports_vision,
            raw_mode=req.raw_mode,
            timeout=req.timeout,
            item_id=req.id,
            set_as_active=req.set_as_active,
        )
        return {"success": True, "provider": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/providers/{item_id}")
def delete_provider(item_id: str, service: LLMService = Depends(get_llm)):
    try:
        ok = service.delete_llm_provider(item_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Provider not found")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/providers/{item_id}/set-active")
def set_active_provider(item_id: str, service: LLMService = Depends(get_llm)):
    try:
        service.set_active_provider(item_id)
        return {"success": True, "active_id": item_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/providers/test")
def test_provider(req: TestProviderRequest, service: LLMService = Depends(get_llm)):
    if req.item_id:
        p = service.get_provider_details(req.item_id)
        btype = p["backend_type"]
        base_url = p["base_url"]
        model = p["model"]
        api_key = p["api_key"]
    else:
        btype = req.backend_type or "openai_compat"
        base_url = req.base_url or "https://api.openai.com/v1"
        model = req.model or "gpt-4o"
        api_key = req.api_key or ""

    if btype == "agy_cli":
        from app.llm.agy_cli import AntigravityCLIBackend
        agy = AntigravityCLIBackend()
        if not agy.is_available():
            raise HTTPException(status_code=400, detail="Google Antigravity CLI ('agy') not found on system PATH")
        return {"success": True, "backend": "agy_cli", "message": "Antigravity CLI is available and operational"}

    from app.llm.openai_compat import OpenAICompatBackend
    backend = OpenAICompatBackend(base_url=base_url, api_key=api_key, model=model)
    try:
        backend.complete("Ping. Return empty JSON schema: {\"items\": []}")
        return {"success": True, "backend": "openai_compat", "message": f"Successfully connected to {base_url} ({model})"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LLM connection error: {str(e)}")


@router.post("/test-connection")
def test_connection(cfg: Optional[LLMConfig] = None, service: LLMService = Depends(get_llm)):
    req = TestProviderRequest(
        backend_type=cfg.backend_type if cfg else None,
        base_url=cfg.base_url if cfg else None,
        model=cfg.model if cfg else None,
        api_key=cfg.api_key if cfg else None,
    )
    return test_provider(req, service)


@router.post("/smart-import/preview")
def preview_smart_import(req: PreviewRequest, service: LLMService = Depends(get_llm)):
    return service.preview(req.text)


@router.post("/smart-import/run")
def run_smart_import(req: RunImportRequest, service: LLMService = Depends(get_llm)):
    try:
        items = service.run_smart_import(
            text=req.text or "",
            backend_type=req.backend_type,
            base_url=req.base_url,
            api_key=req.api_key,
            model=req.model,
            raw_mode=req.raw_mode,
            provider_item_id=req.provider_item_id,
            images=req.images,
        )
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/smart-import/commit")
def commit_smart_import(req: CommitImportRequest, service: LLMService = Depends(get_llm)):
    try:
        created = service.commit(
            proposed_items=req.items,
            project_id=req.project_id,
            category_id=req.category_id,
        )
        return {"success": True, "created_count": len(created), "items": created}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/agy/status")
def get_agy_status():
    from app.llm.agy_cli import AntigravityCLIBackend
    cli = AntigravityCLIBackend()
    return cli.get_info()


@router.post("/agy/test")
def test_agy():
    from app.llm.agy_cli import AntigravityCLIBackend
    cli = AntigravityCLIBackend()
    res = cli.test_ping()
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "CLI test failed"))
    return res
