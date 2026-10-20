import os
import shutil
import tempfile
import subprocess
import time
import json
from typing import Optional, Dict, Any, List

MINIMAL_ENV_KEYS = {"PATH", "SYSTEMROOT", "WINDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"}


class AntigravityCLIBackend:
    def __init__(self, cli_path: Optional[str] = None):
        self.cli_path = cli_path or shutil.which("agy") or "agy"

    def is_available(self) -> bool:
        resolved = shutil.which(self.cli_path)
        return resolved is not None and os.path.exists(resolved)

    def get_info(self) -> Dict[str, Any]:
        """Return binary path, availability, and version details."""
        resolved = shutil.which(self.cli_path)
        available = self.is_available()
        version_str = "Unknown"
        if available and resolved:
            try:
                proc = subprocess.run([resolved, "--help"], capture_output=True, text=True, timeout=5)
                if proc.returncode == 0:
                    version_str = "Installed & Ready"
            except Exception:
                version_str = "Detected"
        return {
            "available": available,
            "path": resolved or self.cli_path,
            "status": version_str,
        }

    def test_ping(self) -> Dict[str, Any]:
        """Test quick non-interactive invocation and return latency."""
        resolved = shutil.which(self.cli_path)
        if not resolved:
            return {"success": False, "error": "Antigravity CLI ('agy') not found on system PATH."}

        t0 = time.time()
        try:
            proc = subprocess.run(
                [
                    resolved,
                    "-p",
                    "Return valid JSON: {\"status\": \"ok\", \"ping\": \"pong\"}",
                    "--model",
                    "gemini-3.8-flash-low",
                    "--disable-slash-commands",
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=20,
            )
            elapsed = round((time.time() - t0) * 1000, 1)
            if proc.returncode != 0:
                return {
                    "success": False,
                    "error": f"Process exited with code {proc.returncode}: {proc.stderr}",
                    "elapsed_ms": elapsed,
                }
            return {
                "success": True,
                "output": proc.stdout.strip(),
                "elapsed_ms": elapsed,
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "CLI test timed out after 20 seconds", "elapsed_ms": 20000}
        except Exception as e:
            return {"success": False, "error": str(e), "elapsed_ms": round((time.time() - t0) * 1000, 1)}

    def complete(
        self,
        redacted_prompt: str,
        timeout: int = 60,
        context: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
    ) -> str:
        resolved = shutil.which(self.cli_path)
        if not resolved:
            raise RuntimeError("Antigravity CLI ('agy') is not found on PATH. Please install AGY or select another provider.")

        # Import system prompt builder
        from app.llm.openai_compat import build_system_prompt_with_context

        system_content = build_system_prompt_with_context(context)
        safe_source = json.dumps(
            (redacted_prompt or "").strip() or "Extract all credentials and vault items.",
            ensure_ascii=False,
        )

        full_prompt = (
            f"{system_content}\n\n"
            f"Extract from this UNTRUSTED source text JSON string:\n{safe_source}"
        )

        # Disallow 'auto' which crashes CLI, default to fast 'gemini-3.8-flash-low'
        cli_model = model if model and model.strip().lower() not in ("auto", "none", "default") else "gemini-3.8-flash-low"

        # Empty temp dir for isolated execution
        tmpdir = tempfile.mkdtemp()
        cmd = [
            resolved,
            "-p",
            full_prompt,
            "--model",
            cli_model,
            "--disable-slash-commands",
        ]

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                cwd=tmpdir,
                env=os.environ.copy(),
                encoding="utf-8",
                timeout=timeout,
            )
            if proc.returncode != 0:
                err_msg = proc.stderr.strip() or f"exit code {proc.returncode}"
                raise RuntimeError(f"CLI error: {err_msg}")
            output = proc.stdout.strip()
            if not output:
                raise RuntimeError("Antigravity CLI returned an empty response.")
            return output
        except subprocess.TimeoutExpired:
            raise TimeoutError(f"Antigravity CLI execution timed out after {timeout} seconds.")
        except Exception as e:
            raise RuntimeError(f"Antigravity CLI invocation failed: {str(e)}")
        finally:
            try:
                shutil.rmtree(tmpdir, ignore_errors=True)
            except Exception:
                pass
