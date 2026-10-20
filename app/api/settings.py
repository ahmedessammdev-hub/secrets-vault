from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import zxcvbn
import os
from app.vault_service import VaultService

router = APIRouter(tags=["Settings"])

vault_service: Optional[VaultService] = None


def get_vault() -> VaultService:
    if vault_service is None:
        raise HTTPException(status_code=500, detail="Vault service uninitialized")
    return vault_service


class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    language: Optional[str] = None
    auto_lock_minutes: Optional[int] = None
    clipboard_ttl: Optional[int] = None
    reveal_timeout: Optional[int] = None
    confirm_before_reveal: Optional[bool] = None


@router.get("/settings")
def get_settings(vault: VaultService = Depends(get_vault)):
    conn = vault.get_connection()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    res = {
        "theme": "dark",
        "language": "ar",
        "auto_lock_minutes": 5,
        "clipboard_ttl": 30,
        "reveal_timeout": 15,
        "confirm_before_reveal": False,
    }
    for r in rows:
        k, v = r["key"], r["value"]
        if k in ("auto_lock_minutes", "clipboard_ttl", "reveal_timeout"):
            try:
                res[k] = int(v)
            except Exception:
                pass
        elif k == "confirm_before_reveal":
            res[k] = v.lower() in ("true", "1")
        else:
            res[k] = v
    return res


@router.put("/settings")
def update_settings(update: SettingsUpdate, vault: VaultService = Depends(get_vault)):
    conn = vault.get_connection()
    with conn:
        if update.theme is not None:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)", (update.theme,))
        if update.language is not None:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('language', ?)", (update.language,))
        if update.auto_lock_minutes is not None:
            vault.set_auto_lock_minutes(update.auto_lock_minutes)
        if update.clipboard_ttl is not None:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('clipboard_ttl', ?)", (str(update.clipboard_ttl),))
        if update.reveal_timeout is not None:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('reveal_timeout', ?)", (str(update.reveal_timeout),))
        if update.confirm_before_reveal is not None:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('confirm_before_reveal', ?)", (str(update.confirm_before_reveal),))

    return {"success": True, "message": "Settings updated"}


@router.get("/security/dashboard")
def get_security_dashboard(vault: VaultService = Depends(get_vault)):
    if not vault.is_unlocked():
        raise HTTPException(status_code=423, detail="Vault is locked")

    items = list(vault.items_index.values())
    active_items = [it for it in items if it.get("deleted_at") is None]

    now = datetime.now(timezone.utc)
    weak_items = []
    reused_val_map = {}
    expired_items = []
    expiring_soon_items = []
    stale_items = []
    no_2fa_items = []

    for it in active_items:
        it_id = it["id"]
        title = it.get("payload", {}).get("title", "Untitled")
        fields = it.get("payload", {}).get("fields", [])

        # 2FA check
        has_pass = any(f.get("type") in ("secret", "password") for f in fields)
        has_totp = any(f.get("type") == "totp" for f in fields)
        if has_pass and not has_totp:
            no_2fa_items.append({"id": it_id, "title": title})

        # Secret values analysis
        for f in fields:
            if f.get("is_secret"):
                val = f.get("value")
                if val and isinstance(val, str) and len(val) > 0:
                    # zxcvbn strength
                    score = zxcvbn.zxcvbn(val).get("score", 0)
                    if score < 3:
                        weak_items.append({"id": it_id, "title": title, "field": f.get("label"), "score": score})

                    # Reuse check
                    if len(val) >= 4:
                        reused_val_map.setdefault(val, []).append({"id": it_id, "title": title})

                # Per-env values
                vals = f.get("values") or {}
                for env_k, env_v in vals.items():
                    if env_v and isinstance(env_v, str) and len(env_v) > 0:
                        score = zxcvbn.zxcvbn(env_v).get("score", 0)
                        if score < 3:
                            weak_items.append({"id": it_id, "title": title, "field": f"{f.get('label')} ({env_k})", "score": score})
                        if len(env_v) >= 4:
                            reused_val_map.setdefault(env_v, []).append({"id": it_id, "title": title})

        # Expiry check
        exp = it.get("expires_at")
        if exp:
            try:
                exp_dt = datetime.fromisoformat(exp)
                if exp_dt < now:
                    expired_items.append({"id": it_id, "title": title, "expires_at": exp})
                elif now <= exp_dt <= (now + timedelta(days=30)):
                    expiring_soon_items.append({"id": it_id, "title": title, "expires_at": exp})
            except Exception:
                pass

        # Stale check
        lu = it.get("last_used_at")
        if not lu:
            stale_items.append({"id": it_id, "title": title, "last_used_at": None})
        else:
            try:
                if datetime.fromisoformat(lu) < (now - timedelta(days=90)):
                    stale_items.append({"id": it_id, "title": title, "last_used_at": lu})
            except Exception:
                stale_items.append({"id": it_id, "title": title, "last_used_at": lu})

    # Filter reused
    reused_groups = [
        {"value_masked": "••••••••", "occurrences": ids}
        for val, ids in reused_val_map.items()
        if len(ids) > 1
    ]

    # Known plaintext env files
    known_plaintext_files = []
    for proj in vault.projects_index.values():
        for path in proj.get("payload", {}).get("known_env_files", []):
            known_plaintext_files.append({
                "project": proj.get("payload", {}).get("name"),
                "path": path,
                "exists_on_disk": os.path.exists(path),
            })

    # Backup health
    row = vault.get_connection().execute("SELECT last_backup_at FROM vault_meta WHERE id = 1").fetchone()
    days_since_backup = None
    backup_status = "danger"
    if row and row["last_backup_at"]:
        last_b = datetime.fromisoformat(row["last_backup_at"])
        days_since_backup = (now - last_b).days
        if days_since_backup < 7:
            backup_status = "ok"
        elif days_since_backup < 30:
            backup_status = "warning"
        else:
            backup_status = "danger"

    # Compute overall vault health score (0-100)
    score = 100
    score -= min(30, len(weak_items) * 10)
    score -= min(25, len(reused_groups) * 10)
    score -= min(20, len(expired_items) * 10)
    if backup_status == "danger":
        score -= 20
    elif backup_status == "warning":
        score -= 10
    score = max(0, score)

    return {
        "overall_health_score": score,
        "total_active_items": len(active_items),
        "weak_secrets_count": len(weak_items),
        "weak_secrets": weak_items,
        "reused_secrets_count": len(reused_groups),
        "reused_secrets": reused_groups,
        "expired_count": len(expired_items),
        "expired_items": expired_items,
        "expiring_soon_count": len(expiring_soon_items),
        "expiring_soon_items": expiring_soon_items,
        "stale_count": len(stale_items),
        "stale_items": stale_items,
        "no_2fa_count": len(no_2fa_items),
        "no_2fa_items": no_2fa_items,
        "known_plaintext_files": known_plaintext_files,
        "backup_health": backup_status,
        "days_since_backup": days_since_backup,
    }


# --- V2: HIBP k-Anonymity Range Check ---
@router.post("/security/hibp-check")
def check_hibp(password_hash_prefix: str):
    """
    K-Anonymity check via HaveIBeenPwned API:
    Only sends the first 5 characters of SHA-1 hash prefix.
    Zero cleartext passwords or full hashes ever leave the local machine.
    """
    prefix = password_hash_prefix.strip().upper()
    if len(prefix) != 5:
        raise HTTPException(status_code=400, detail="Prefix must be exactly 5 hex characters")

    import httpx
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"https://api.pwnedpasswords.com/range/{prefix}", headers={"Add-Padding": "true"})
            if resp.status_code == 200:
                lines = resp.text.splitlines()
                matches = {}
                for line in lines:
                    if ":" in line:
                        sfx, cnt = line.split(":", 1)
                        matches[sfx.strip()] = int(cnt.strip())
                return {"prefix": prefix, "matches": matches}
            return {"prefix": prefix, "matches": {}}
    except Exception as e:
        return {"prefix": prefix, "matches": {}, "error": str(e)}
