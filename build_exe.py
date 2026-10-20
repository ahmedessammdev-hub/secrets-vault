"""Automated PyInstaller build script for Secrets Vault Desktop Application.

Usage:
    python build_exe.py
"""

import os
import sys
import subprocess
import shutil


def check_and_install_pyinstaller():
    try:
        import PyInstaller
        print(f"[OK] PyInstaller is already installed: {PyInstaller.__version__}")
        return True
    except ImportError:
        print("[*] PyInstaller not found. Installing via pip...")
        res = subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=False)
        return res.returncode == 0


def build_executable():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    icon_path = os.path.join(root_dir, "assets", "icon.ico")
    desktop_script = os.path.join(root_dir, "desktop.py")

    if not os.path.exists(frontend_dir):
        print("[ERROR] Built frontend directory 'frontend' not found! Please run 'npm run build' inside frontend-react first.")
        return False

    print("[*] Starting PyInstaller build for Secrets Vault...")

    sep = ";" if os.name == "nt" else ":"
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--windowed",
        "--name=SecretsVault",
        f"--add-data={frontend_dir}{sep}frontend",
        f"--add-data={os.path.join(root_dir, 'assets')}{sep}assets",
        f"--icon={icon_path}",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        desktop_script,
    ]

    print("[*] Executing:", " ".join(cmd))
    res = subprocess.run(cmd, cwd=root_dir)
    if res.returncode == 0:
        dist_exe = os.path.join(root_dir, "dist", "SecretsVault", "SecretsVault.exe")
        print("\n" + "=" * 60)
        print("[SUCCESS] Build complete! Executable is ready at:")
        print(dist_exe)
        print("=" * 60)
        return True
    else:
        print("\n[ERROR] PyInstaller build failed with exit code:", res.returncode)
        return False


if __name__ == "__main__":
    if check_and_install_pyinstaller():
        build_executable()
    else:
        print("[ERROR] Failed to prepare PyInstaller. Please run: pip install pyinstaller")
