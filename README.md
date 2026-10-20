# Secrets Vault v2.0 🔒

**Secrets Vault** is an open-source, local-first, zero-knowledge secrets manager and developer credentials vault tailored for developers, engineers, and solo builders. It replaces vulnerable `.env` files, browser credentials, and plain text notes with an authenticated, encrypted SQLite vault protected by **AES-256-GCM** and **Argon2id**.

---

## 🌟 Key Features

1. **Zero-Knowledge Architecture:** Nothing readable ever leaves your machine or rests on disk in clear text. Master keys are held only in zeroed memory buffers.
2. **Cyber-Slate React 19 Frontend & Standalone Desktop:** Modern, high-performance UI with responsive Arabic/English LTR/RTL support, packaged as a standalone native Windows desktop application (`SecretsVault.exe`).
3. **Sidebar Navigation & Settings:** Instant access to all vault views, security filters, project groupings, and system settings directly from the sidebar.
4. **Templates & Reusable Schemas:** Select from built-in templates (🔑 Login, ⚡ API Key, 🖥️ Server/SSH, 🗄️ Database, 💳 Credit Card) or save any custom item structure as a reusable template via 1-click **"Save as Template"** (`حفظ كقالب`).
5. **Real Google Drive OAuth 2.0 Backup:** Seamless in-browser Google authentication, encrypted token storage, automated snapshot retention (up to 10 snapshots), and 1-click cloud sync.
6. **Smart Import Engine (Cloud & Local):**
   - **Local Antigravity CLI (`agy`):** Ultrafast, zero-key local extraction in ~5 seconds using Google's lightweight `gemini-3.8-flash-low` engine.
   - **Cloud Multi-Provider Support:** Connect to OpenAI, Groq, NVIDIA NIM, or custom OpenAI-compatible endpoints.
   - **Zero-Leak Redaction:** Secret values are replaced with placeholders (`{{S1}}`, `{{S2}}`) before analysis and restored locally in memory.
   - **Resilient Parsing:** Robust against conversational preambles, `<think>` reasoning tags, and markdown code fences.
7. **Developer-First CLI:** Inject secrets directly into child processes (`vault run --project myapp -- uvicorn app:main`) without creating plaintext `.env` files on disk.
8. **Automated Playwright E2E Testing:** Fully tested across end-to-end browser workflows using headless Google Chrome.

---

## 🏗️ Architecture

```
secrets-vault/
├── app/
│   ├── main.py              # FastAPI server, Origin + Session token middleware
│   ├── crypto_service.py    # Argon2id, AES-256-GCM, key wrapping, zeroing
│   ├── vault_service.py     # Lock/unlock lifecycle, in-memory index, integrity checks
│   ├── items_service.py     # 11 field types, history stack, rotation, bulk actions
│   ├── projects_service.py  # Projects, environments (dev/prod), .env generator
│   ├── templates_service.py # Built-in & custom templates, categories
│   ├── backup_service.py    # .vault export/import/verify, safety snapshots
│   ├── drive_service.py     # Google Drive OAuth 2.0 & encrypted snapshot sync
│   ├── llm/
│   │   ├── service.py       # Smart import pipeline, multi-provider dispatch
│   │   ├── redaction.py     # Local placeholder redaction engine
│   │   ├── openai_compat.py # OpenAI-compatible client with resilient JSON extraction
│   │   └── agy_cli.py       # Local Antigravity CLI subprocess backend
│   ├── generator.py         # CSPRNG passwords, diceware passphrases, API keys
│   ├── clipboard.py         # Backend-driven clipboard copy & timed clearing
│   ├── models.py            # Pydantic schemas (Payload Schema v2)
│   ├── db.py                # SQLite WAL configuration & migrations
│   └── api/                 # Hardened API routers
├── cli/
│   └── vault.py             # Developer CLI (vault get/run/env/list)
├── frontend-react/          # Modern React 19 + Tailwind CSS + Lucide icons
├── frontend/                # Compiled production bundle served by FastAPI
├── desktop.py               # Desktop webview launcher with system tray & hotkeys
├── build_exe.py             # PyInstaller automated packaging script
├── tests/                   # 50+ automated unit, integration, and Playwright E2E tests
└── data/                    # Encrypted vault data directory (git-ignored)
```

---

## 🚀 Quickstart

### 1. Requirements & Installation

Secrets Vault requires **Python 3.12+** and **Node.js 18+** (for frontend development).

```bash
git clone https://github.com/ahmedessammdev-hub/secrets-vault.git
cd secrets-vault

# Install Python backend dependencies
pip install -r requirements.txt
```

### 2. Run the Desktop Application or Web Server

**Option A: Standalone Windows App**
Double-click `SecretsVault.bat` or run:
```bash
python desktop.py
```

**Option B: Web Browser Mode**
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Open your browser at `http://127.0.0.1:8000`.

---

## 🧪 Testing & Verification

Secrets Vault includes automated tests covering unit crypto gates, API security, and Playwright E2E browser flows:

```bash
# Run all unit and integration tests
python -m pytest tests/test_openai_compat.py tests/test_agy_backend.py tests/test_templates.py tests/test_drive_oauth.py -v

# Run full Playwright End-to-End browser test (Chrome)
python -m pytest tests/test_playwright_e2e.py -v -s
```

---

## 💻 Developer CLI (`vault`)

Secrets Vault includes a developer CLI that talks to the hardened local API via the per-run session token in `data/session.token`.

```bash
# Check vault status and backup health
python -m cli.vault status

# List items (titles and IDs only)
python -m cli.vault list

# Get a secret value directly into stdout (for shell pipes or copying)
python -m cli.vault get "Groq API Key"
python -m cli.vault get "Groq API Key" --env dev --copy

# Run a project command with injected secrets (NOTHING touches disk!)
python -m cli.vault run --project clinic -- python -m uvicorn app:main

# Export .env to stdout (requires explicit confirmation flag)
python -m cli.vault env --project clinic --env production --i-know-this-is-plaintext
```

---

## 🔐 Cryptographic Specifications

- **KDF:** `Argon2id` with `m=64 MiB (65536 KiB)`, `t=3`, `p=4`, `hash_len=32`.
- **Cipher:** `AES-256-GCM` with random 12-byte nonces generated per write via `secrets.token_bytes(12)`.
- **Key Hierarchy:**
  - `KEK = Argon2id(MasterPassword, Salt)`
  - `WrappedVaultKey = AES-256-GCM(KEK, VaultKey, aad="vault_key|v2")`
  - `Verifier = AES-256-GCM(VaultKey, b"secrets-vault-verifier", aad="verifier")`
  - `ItemPayload = AES-256-GCM(VaultKey, json_bytes, aad="{item_id}|{schema_v}")`
- **Memory Hygiene:** Vault key is stored in a mutable `bytearray` and zeroed on lock.
- **Integrity Validation:** Every GCM authentication tag is decrypted and verified on unlock. Corrupted payloads are flagged immediately.

---

## 🧪 Testing & Verification

Secrets Vault includes a comprehensive test suite enforcing all security gates:

```bash
python -m pytest tests/ -v
```

All 28 tests cover:
- **Gate 1 (Crypto Core):** Round-trip encryption, Arabic/Emoji/1MB payloads, wrong password rejection, single-byte tampering detection, AAD item binding, nonce uniqueness, key zeroing.
- **Gate 2 (API Hardening & Functional):** Origin/Host verification, session tokens, 423 locked enforcement, sensitive route 428 re-authentication, 11 field types, 5-entry history stack, `.env` export, CLI process injection.
- **Gate 3 (V2 & LLM Leak Test):** Mock backend capturing all payloads to ensure canary secrets never leave the machine; Google Drive snapshot retention.

---

## 📄 License

MIT License. Designed with privacy, security, and developer ergonomics in mind.
