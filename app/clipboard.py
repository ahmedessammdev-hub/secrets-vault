import threading
import time
import pyperclip
from typing import Optional

_clipboard_lock = threading.Lock()
_last_copied_value: Optional[str] = None


def copy_to_clipboard(text: str, ttl_seconds: int = 30) -> None:
    global _last_copied_value
    with _clipboard_lock:
        try:
            pyperclip.copy(text)
            _last_copied_value = text
        except Exception:
            # Fallback if headless or clipboard failure
            pass

    if ttl_seconds > 0:
        def _clear_worker():
            global _last_copied_value
            time.sleep(ttl_seconds)
            with _clipboard_lock:
                try:
                    current = pyperclip.paste()
                    if current == text:
                        pyperclip.copy("")
                    if _last_copied_value == text:
                        _last_copied_value = None
                except Exception:
                    pass

        t = threading.Thread(target=_clear_worker, daemon=True)
        t.start()


def clear_clipboard() -> None:
    global _last_copied_value
    with _clipboard_lock:
        try:
            pyperclip.copy("")
            _last_copied_value = None
        except Exception:
            pass
