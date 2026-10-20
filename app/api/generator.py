from fastapi import APIRouter
from app.models import PasswordGenRequest, ApiKeyGenRequest, PassphraseGenRequest
from app.generator import generate_password, generate_passphrase, generate_api_key

router = APIRouter(prefix="/generator", tags=["Generator"])


@router.post("/password")
def gen_password(req: PasswordGenRequest):
    return generate_password(
        length=req.length,
        uppercase=req.uppercase,
        lowercase=req.lowercase,
        digits=req.digits,
        symbols=req.symbols,
        exclude_lookalikes=req.exclude_lookalikes,
    )


@router.post("/passphrase")
def gen_passphrase(req: PassphraseGenRequest):
    return generate_passphrase(
        words_count=req.words_count,
        separator=req.separator,
    )


@router.post("/api-key")
def gen_api_key(req: ApiKeyGenRequest):
    return generate_api_key(
        format=req.format,
        bytes_length=req.bytes_length,
        prefix=req.prefix,
    )
