import pytest
import os
import json
from unittest.mock import patch
from typer.testing import CliRunner
from cli.vault import app as cli_app

runner = CliRunner()


def test_cli_status_and_list_mocked():
    mock_status = {
        "initialized": True,
        "unlocked": True,
        "items_count": 5,
        "backup_health": "ok",
        "last_backup_at": "2026-10-20T10:00:00Z",
    }
    with patch("cli.vault.api_request", return_value=mock_status):
        result = runner.invoke(cli_app, ["status"])
        assert result.exit_code == 0
        assert "Initialized: True" in result.output
        assert "Unlocked:    True" in result.output

    mock_items = [
        {"id": "item-1234-uuid", "payload": {"title": "Production DB"}},
        {"id": "item-5678-uuid", "payload": {"title": "Stripe Live Key"}},
    ]
    with patch("cli.vault.api_request", return_value=mock_items):
        result = runner.invoke(cli_app, ["list"])
        assert result.exit_code == 0
        assert "Production DB" in result.output
        assert "Stripe Live Key" in result.output


def test_cli_get_command():
    mock_items = [
        {
            "id": "item-1234-uuid",
            "payload": {
                "title": "Groq Key",
                "fields": [
                    {"id": "f1", "label": "API Key", "is_secret": True, "value": "gsk_prod_secret_value_123"},
                ],
            },
        }
    ]
    with patch("cli.vault.api_request", return_value=mock_items):
        result = runner.invoke(cli_app, ["get", "Groq Key"])
        assert result.exit_code == 0
        assert result.output == "gsk_prod_secret_value_123"


def test_cli_env_export_requires_confirmation():
    result = runner.invoke(cli_app, ["env", "--project", "clinic"])
    assert result.exit_code != 0
    assert "Refused" in result.output or "i-know-this-is-plaintext" in result.output


def test_cli_run_scrubs_environment(capfd):
    mock_projects = [{"id": "p1", "payload": {"name": "clinic"}}]
    mock_env_data = {"content": 'CLINIC_DB_HOST="db.internal.net"\nCLINIC_SECRET="shhh"'}

    def mock_api(method, endpoint, **kwargs):
        if "/projects/p1/env" in endpoint:
            return mock_env_data
        if "/projects" in endpoint:
            return mock_projects
        return {}

    with patch("cli.vault.api_request", side_effect=mock_api):
        cmd = ["python", "-c", "import os; print('HOST=' + os.environ.get('CLINIC_DB_HOST', 'NONE'))"]
        result = runner.invoke(cli_app, ["run", "--project", "clinic", "--", *cmd])
        assert result.exit_code == 0

    # Capfd captures process-level stdout
    captured = capfd.readouterr()
    assert "HOST=db.internal.net" in captured.out

    # Verify parent process environment does not leak injected vars
    assert "CLINIC_DB_HOST" not in os.environ
