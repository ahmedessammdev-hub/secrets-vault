from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.clipboard import copy_to_clipboard, clear_clipboard

router = APIRouter(prefix="/clipboard", tags=["Clipboard"])


class CopyRequest(BaseModel):
    text: str
    ttl_seconds: int = 30


@router.post("/copy")
def copy(req: CopyRequest):
    copy_to_clipboard(req.text, ttl_seconds=req.ttl_seconds)
    return {"success": True, "message": f"Copied to clipboard (clears in {req.ttl_seconds}s)"}


@router.post("/clear")
def clear():
    clear_clipboard()
    return {"success": True, "message": "Clipboard cleared"}
