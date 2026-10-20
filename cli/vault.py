import os
import sys
import subprocess
import requests
import typer
from typing import Optional, List

app = typer.Typer(help="Secrets Vault — Developer CLI")

DEFAULT_API_URL = "http://127.0.0.1:8000"
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
TOKEN_FILE = os.path.join(DATA_DIR, "session.token")


def get_session_token() -> str:
    if not os.path.exists(TOKEN_FILE):
        typer.secho("Error: session.token not found. Is Secrets Vault running?", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1)

    # Permission check on non-windows platforms (Section 9.6)
    if os.name != "nt":
        st = os.stat(TOKEN_FILE)
        if st.st_mode & 0o077 != 0:
            typer.secho("Security Error: session.token file is readable by other users! Aborting.", fg=typer.colors.RED, err=True)
            raise typer.Exit(code=1)

    with open(TOKEN_FILE, "r", encoding="utf-8") as f:
        token = f.read().strip()
    return token


def api_request(method: str, endpoint: str, json_data: dict = None, params: dict = None) -> dict:
    token = get_session_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Origin": DEFAULT_API_URL,
    }
    url = f"{DEFAULT_API_URL}{endpoint}"
    try:
        resp = requests.request(method, url, json=json_data, params=params, headers=headers, timeout=10)
        if resp.status_code == 423:
            typer.secho("Error: Vault is locked. Unlock it in the app or run 'vault unlock'.", fg=typer.colors.RED, err=True)
            raise typer.Exit(code=1)
        if resp.status_code == 403:
            typer.secho("Error: 403 Forbidden. Invalid token or Origin header.", fg=typer.colors.RED, err=True)
            raise typer.Exit(code=1)
        if not resp.ok:
            try:
                detail = resp.json().get("detail", resp.text)
            except Exception:
                detail = resp.text
            typer.secho(f"API Error ({resp.status_code}): {detail}", fg=typer.colors.RED, err=True)
            raise typer.Exit(code=1)
        return resp.json()
    except requests.RequestException as e:
        typer.secho(f"Connection Error: Could not reach Secrets Vault at {DEFAULT_API_URL}: {e}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1)


@app.command()
def status():
    """Check vault status."""
    res = api_request("GET", "/auth/status")
    typer.echo(f"Initialized: {res.get('initialized')}")
    typer.echo(f"Unlocked:    {res.get('unlocked')}")
    typer.echo(f"Items Count: {res.get('items_count')}")
    typer.echo(f"Backup:      {res.get('backup_health')} (last: {res.get('last_backup_at') or 'never'})")


@app.command()
def lock():
    """Lock the vault immediately."""
    api_request("POST", "/auth/lock")
    typer.secho("Vault locked successfully.", fg=typer.colors.GREEN)


@app.command()
def list(project: Optional[str] = typer.Option(None, "--project", "-p", help="Filter by project ID or name")):
    """List items (titles and IDs only)."""
    params = {}
    if project:
        # Check if project is name or ID
        projects = api_request("GET", "/projects")
        proj_id = project
        for p in projects:
            if p["id"] == project or p["payload"]["name"].lower() == project.lower():
                proj_id = p["id"]
                break
        params["project_id"] = proj_id

    items = api_request("GET", "/items", params=params)
    if not items:
        typer.echo("No items found.")
        return

    typer.echo(f"{'ID':<36} | {'TITLE'}")
    typer.echo("-" * 60)
    for it in items:
        title = it.get("payload", {}).get("title", "Untitled")
        typer.echo(f"{it['id']:<36} | {title}")


@app.command()
def get(
    item: str = typer.Argument(..., help="Item ID or title"),
    field: Optional[str] = typer.Argument(None, help="Field label or ID (optional)"),
    env: Optional[str] = typer.Option(None, "--env", "-e", help="Environment (e.g. prod, dev)"),
    copy: bool = typer.Option(False, "--copy", "-c", help="Copy to clipboard instead of printing"),
):
    """Retrieve secret value for piping or copy to clipboard."""
    # Find item
    items = api_request("GET", "/items")
    target = None
    for it in items:
        if it["id"] == item or it.get("payload", {}).get("title", "").lower() == item.lower():
            target = it
            break

    if not target:
        typer.secho(f"Item '{item}' not found.", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1)

    if copy:
        # Request backend clipboard copy
        resp = api_request("POST", f"/items/{target['id']}/copy-field", params={"field_id": field, "env": env})
        typer.secho(resp.get("message", "Copied to clipboard."), fg=typer.colors.GREEN)
        return

    # Extract field value
    fields = target.get("payload", {}).get("fields", [])
    target_f = None
    if field:
        for f in fields:
            if f.get("id") == field or f.get("label", "").lower() == field.lower():
                target_f = f
                break
    else:
        # Pick primary secret
        for f in fields:
            if f.get("is_secret") or f.get("type") in ("secret", "password"):
                target_f = f
                break
        if not target_f and fields:
            target_f = fields[0]

    if not target_f:
        typer.secho("Field not found.", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1)

    val = None
    if target_f.get("values"):
        vals = target_f["values"]
        val = vals.get(env) if env else (vals.get("production") or vals.get("default") or next(iter(vals.values()), ""))
    else:
        val = target_f.get("value")

    # Output value directly with no newline for piping or with clean output
    sys.stdout.write(str(val if val is not None else ""))
    sys.stdout.flush()


@app.command()
def env(
    project: str = typer.Option(..., "--project", "-p", help="Project name or ID"),
    env: str = typer.Option("production", "--env", "-e", help="Environment name"),
    i_know_this_is_plaintext: bool = typer.Option(
        False,
        "--i-know-this-is-plaintext",
        help="Mandatory confirmation flag to print plaintext secrets to stdout",
    ),
):
    """Export KEY=value lines for shell eval."""
    if not i_know_this_is_plaintext:
        typer.secho("Refused: 'vault env' outputs plaintext secrets. Pass --i-know-this-is-plaintext to confirm.", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1)

    projects = api_request("GET", "/projects")
    proj_id = project
    for p in projects:
        if p["id"] == project or p["payload"]["name"].lower() == project.lower():
            proj_id = p["id"]
            break

    data = api_request("GET", f"/projects/{proj_id}/env", params={"env": env})
    content = data.get("content", "")
    for line in content.splitlines():
        if line and not line.startswith("#"):
            typer.echo(f"export {line}")


@app.command(context_settings={"allow_extra_args": True, "ignore_unknown_options": True})
def run(
    ctx: typer.Context,
    project: str = typer.Option(..., "--project", "-p", help="Project name or ID"),
    env: str = typer.Option("production", "--env", "-e", help="Environment name"),
):
    """Run a command with project secrets injected as environment variables (nothing touches disk)."""
    cmd = ctx.args
    if not cmd:
        typer.secho("Usage: vault run --project <proj> [--env <env>] -- <command...>", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1)

    projects = api_request("GET", "/projects")
    proj_id = project
    for p in projects:
        if p["id"] == project or p["payload"]["name"].lower() == project.lower():
            proj_id = p["id"]
            break

    data = api_request("GET", f"/projects/{proj_id}/env", params={"env": env})
    content = data.get("content", "")

    # Inject variables into a clean copy of child environment
    child_env = os.environ.copy()
    injected_keys = []
    for line in content.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            v = v.strip('"\'')
            child_env[k] = v
            injected_keys.append(k)

    # Spawn process
    try:
        proc = subprocess.run(cmd, env=child_env)
        # Scrub from memory (Section 9.6 & 16.3)
        for k in injected_keys:
            child_env.pop(k, None)
        sys.exit(proc.returncode)
    except Exception as e:
        typer.secho(f"Failed to execute command: {e}", fg=typer.colors.RED, err=True)
        raise typer.Exit(code=1)


if __name__ == "__main__":
    app()
