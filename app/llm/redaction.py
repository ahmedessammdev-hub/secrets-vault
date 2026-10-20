import re
import math
from typing import Tuple, Dict

KNOWN_PREFIXES = [
    r"sk-[A-Za-z0-9_\-]{20,}",
    r"gsk_[A-Za-z0-9_\-]{20,}",
    r"AKIA[0-9A-Z]{16}",
    r"ghp_[A-Za-z0-9]{36}",
    r"xoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24}",
    r"AIza[0-9A-Za-z-_]{35}",
]

PEM_REGEX = r"-----BEGIN [A-Z0-9 ]+-----[A-Za-z0-9+/=\s\r\n]+?-----END [A-Z0-9 ]+-----"
OTPAUTH_REGEX = r"otpauth://[^\s]+"

EMAIL_PASS_REGEX = re.compile(
    r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\s*[:/|]\s*([^\s,;\"\'\r\n]+)"
)

USER_PASS_REGEX = re.compile(
    r"(?i)(?:user|username|login|account|المستخدم|الحساب)\s*[:=]\s*([a-zA-Z0-9_\-\.]+)\s*[:/|]\s*([^\s,;\"\'\r\n]+)"
)

LABEL_VALUE_REGEX = re.compile(
    r"(?i)(password|secret|token|api_key|apikey|private_key|auth_token|pass|pwd|pin|[\w\s]*(?:مرور|سر|باسورد|رمز|مفتاح)[\w\s]*)\s*[:=]\s*([^\s,;\"\'\r\n]+)"
)


def calculate_entropy(text: str) -> float:
    if not text:
        return 0.0
    prob = [float(text.count(c)) / len(text) for c in dict.fromkeys(list(text))]
    return -sum(p * math.log2(p) for p in prob)


class RedactionEngine:
    def redact(self, text: str) -> Tuple[str, Dict[str, str]]:
        redaction_map: Dict[str, str] = {}
        placeholder_counter = 1

        def add_replacement(secret_val: str) -> str:
            nonlocal placeholder_counter
            secret_val_clean = secret_val.strip()
            if not secret_val_clean or (secret_val_clean.startswith("{{S") and secret_val_clean.endswith("}}")):
                return secret_val
            for ph, val in redaction_map.items():
                if val == secret_val_clean:
                    return ph

            ph = f"{{{{S{placeholder_counter}}}}}"
            placeholder_counter += 1
            redaction_map[ph] = secret_val_clean
            return ph

        redacted = text

        # 1. PEM blocks
        for match in re.finditer(PEM_REGEX, redacted):
            full_match = match.group(0)
            ph = add_replacement(full_match)
            redacted = redacted.replace(full_match, ph)

        # 2. OTPAUTH URIs
        for match in re.finditer(OTPAUTH_REGEX, redacted):
            full_match = match.group(0)
            ph = add_replacement(full_match)
            redacted = redacted.replace(full_match, ph)

        # 3. Known key prefixes
        for pattern in KNOWN_PREFIXES:
            for match in re.finditer(pattern, redacted):
                full_match = match.group(0)
                if not (full_match.startswith("{{S") and full_match.endswith("}}")):
                    ph = add_replacement(full_match)
                    redacted = redacted.replace(full_match, ph)

        # 4. Email:password combos (e.g. account: user@domain.com:password or user@domain:pass)
        def replace_email_pass(m):
            email = m.group(1)
            pwd = m.group(2)
            if pwd.startswith("{{S") and pwd.endswith("}}"):
                return m.group(0)
            ph = add_replacement(pwd)
            sep = m.group(0)[len(email):-len(pwd)]
            return f"{email}{sep}{ph}"

        redacted = EMAIL_PASS_REGEX.sub(replace_email_pass, redacted)

        # 5. User:password combos (e.g. user: admin:pass or login: root:pass)
        def replace_user_pass(m):
            user = m.group(1)
            pwd = m.group(2)
            if pwd.startswith("{{S") and pwd.endswith("}}"):
                return m.group(0)
            ph = add_replacement(pwd)
            full = m.group(0)
            user_idx = full.find(user)
            prefix = full[:user_idx + len(user)]
            sep = full[user_idx + len(user):-len(pwd)]
            return f"{prefix}{sep}{ph}"

        redacted = USER_PASS_REGEX.sub(replace_user_pass, redacted)

        # 6. Label-value pairs (password: xyz, secret=xyz, كلمة المرور: xyz)
        def replace_label(m):
            lbl = m.group(1)
            val = m.group(2)
            if val.startswith("{{S") and val.endswith("}}"):
                return m.group(0)
            ph = add_replacement(val)
            delim = ":" if ":" in m.group(0) else "="
            return f"{lbl}{delim} {ph}"

        redacted = LABEL_VALUE_REGEX.sub(replace_label, redacted)

        # 7. Long high-entropy tokens
        words = re.findall(r"\b[A-Za-z0-9_\-]{14,}\b", redacted)
        for w in words:
            if not (w.startswith("{{S") or w.endswith("}}")) and calculate_entropy(w) >= 3.2:
                ph = add_replacement(w)
                redacted = redacted.replace(w, ph)

        return redacted, redaction_map

    def restore(self, text: str, redaction_map: Dict[str, str]) -> str:
        restored = text
        for ph, val in sorted(redaction_map.items(), key=lambda x: len(x[0]), reverse=True):
            restored = restored.replace(ph, val)
        return restored
