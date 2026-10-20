import pytest
from app.llm.agy_cli import AntigravityCLIBackend


def test_agy_cli_info_and_availability():
    backend = AntigravityCLIBackend()
    avail = backend.is_available()
    assert avail is True
    info = backend.get_info()
    assert info["available"] is True
    assert "agy" in info["path"].lower()


def test_agy_cli_ping():
    backend = AntigravityCLIBackend()
    res = backend.test_ping()
    assert res["success"] is True
    assert res["elapsed_ms"] > 0
    assert "status" in res["output"].lower() or "ok" in res["output"].lower()


def test_agy_cli_complete_extraction():
    backend = AntigravityCLIBackend()
    sample_text = "Service: CloudFlare Enterprise, account: security@mycompany.org:SuperToken991!"
    out = backend.complete(sample_text)
    assert "items" in out
    assert "CloudFlare" in out or "security@mycompany.org" in out
