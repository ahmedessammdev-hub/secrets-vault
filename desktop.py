"""Secrets Vault — Native Desktop Application Launcher.

Runs the FastAPI backend embedded in an in-process daemon thread and spawns
a native Windows WebView2 desktop window with zero browser chrome or address bar.
"""

import os
import sys
import time
import socket
import urllib.request
import threading
from typing import Optional

import webview


def is_port_open(host: str, port: int) -> bool:
    """Check if the given localhost port is accepting TCP connections."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def find_available_port(host: str = "127.0.0.1", start_port: int = 8000) -> int:
    """Find an available port starting from start_port, or reuse 8000 if already Secrets Vault."""
    if is_port_open(host, start_port):
        # Check if it's already a running Secrets Vault server
        try:
            req = urllib.request.Request(
                f"http://{host}:{start_port}/api/session-token",
                headers={"Origin": f"http://{host}:{start_port}"},
            )
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    return start_port
        except Exception:
            pass

    # Find free port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def start_embedded_server(host: str, port: int):
    """Start uvicorn server in a background thread."""
    import uvicorn
    from app.main import app

    config = uvicorn.Config(
        app=app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    server_thread = threading.Thread(target=server.run, daemon=True, name="SecretsVaultServer")
    server_thread.start()
    return server


def wait_for_server(url: str, timeout: float = 6.0) -> bool:
    """Wait until the local server answers HTTP requests."""
    start_time = time.time()
    token_url = f"{url.rstrip('/')}/api/session-token"
    headers = {"Origin": url.rstrip("/")}

    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(token_url, headers=headers)
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.15)
    return False


def main():
    host = "127.0.0.1"
    port = 8000

    # If port 8000 is open and not Secrets Vault, pick an ephemeral free port
    if is_port_open(host, port):
        # Check if it's ours
        try:
            req = urllib.request.Request(
                f"http://{host}:{port}/api/session-token",
                headers={"Origin": f"http://{host}:{port}"},
            )
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                already_running = resp.status == 200
        except Exception:
            already_running = False
    else:
        already_running = False

    server = None
    if not already_running:
        server = start_embedded_server(host, port)
        app_url = f"http://{host}:{port}"
        ready = wait_for_server(app_url)
        if not ready:
            print(f"Warning: Local server on {app_url} did not respond within timeout, attempting window launch anyway.")
    else:
        app_url = f"http://{host}:{port}"

    # Path to custom app icon
    base_dir = os.path.dirname(os.path.abspath(__file__))
    icon_path = os.path.join(base_dir, "assets", "icon.ico")
    if not os.path.exists(icon_path):
        icon_path = None

    # Create the native desktop window
    window = webview.create_window(
        title="الخزنة — Secrets Vault",
        url=app_url,
        width=1240,
        height=820,
        min_size=(960, 640),
        resizable=True,
        text_select=True,
        zoomable=True,
        background_color="#020617",  # Slate-950 dark theme
    )

    # Window lifecycle handlers
    def on_closing():
        """Safely lock vault and clean in-memory secrets on window close."""
        try:
            from app.main import vault_svc
            if vault_svc.is_unlocked():
                vault_svc.lock()
        except Exception:
            pass

        if server:
            server.should_exit = True

    window.events.closing += on_closing

    # Start PyWebView native loop using Edge Chromium (WebView2)
    webview.start(
        icon=icon_path,
        gui="edgechromium",
        debug=False,
    )


if __name__ == "__main__":
    main()
