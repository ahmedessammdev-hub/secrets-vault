import os
import inspect
from desktop import is_port_open, find_available_port


def test_desktop_launcher_module():
    # 1. Port utilities
    assert isinstance(is_port_open("127.0.0.1", 99999) if False else is_port_open("127.0.0.1", 54321), bool)
    port = find_available_port("127.0.0.1", 18888)
    assert isinstance(port, int)
    assert 1024 < port < 65535

    # 2. Check icon file exists
    icon_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "icon.ico")
    assert os.path.exists(icon_path)
    assert os.path.getsize(icon_path) > 0

    # 3. Check launcher batch file exists
    bat_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "SecretsVault.bat")
    assert os.path.exists(bat_path)

    # 4. Check build script exists
    build_script = os.path.join(os.path.dirname(os.path.dirname(__file__)), "build_exe.py")
    assert os.path.exists(build_script)
