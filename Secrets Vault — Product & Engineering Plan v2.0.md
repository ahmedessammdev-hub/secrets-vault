# Secrets Vault — Product & Engineering Plan v2.0

Oct 20, 2026 · @GRC Benchmatrix

## 1. Executive summary

Secrets Vault is a local-first, zero-knowledge manager for API keys, credentials and any other secret a solo developer accumulates. One encrypted SQLite file, a flexible Item + Field model with unlimited custom fields, an encrypted `.vault` backup, and, in V2, encrypted Google Drive backup plus an optional LLM assistant that never sees a secret value.

Guiding principle: the application, its database, its backups and any third-party service (Google, an LLM provider) only ever hold ciphertext. The only key is derived from a Master Password that is never stored and cannot be recovered.

What v2.0 changes versus v1.1:

- Plaintext metadata leak closed: tags and category names move inside the encrypted payload.
- Local API hardened against CSRF and DNS rebinding with a per-run session token and Origin checks; clipboard clearing moves to the backend.
- New MVP features: Projects with one-click `.env` export, a developer CLI (`vault get`, `vault run`), per-field value history, re-authentication for sensitive actions, integrity check on unlock, lock on OS sleep/lock, Command Palette.
- Google Drive scoped down to backup (connect, backup now, auto-backup, restore from snapshots); multi-device conflict resolution deferred to V3.
- LLM Smart Import redesigned around a placeholder-redaction pipeline so the model structures text without ever receiving a secret; backends are Custom OpenAI-compatible and Antigravity CLI.
- Added: provider templates, smart views, security dashboard, non-functional requirements, architecture decision records.

## 2. Problem and goals

Secrets today are scattered across `.env` files, notes and browsers, with no single encrypted copy and no model that fits the odd extra fields each service needs.

| Current problem | Impact | Addressed by |
| --- | --- | --- |
| API keys spread across `.env` files, projects and notes | Loss, duplication, accidental leaks (e.g. `.env` pushed to Git) | Single vault, Projects, `.env` export, CLI injection |
| Passwords kept in memory, one browser or a text file | Direct security risk, no access from another device | Encrypted vault, encrypted Drive backup |
| Every site needs different extra data (phone, 2FA, recovery codes) | Fixed templates lose data | Unlimited custom fields per item |
| No single encrypted backup | Lost device = everything lost | `.vault` export, Drive snapshots, backup health reminders |
| Rotating a leaked key | Old value gone before the new one is deployed everywhere | Per-field value history, rotation policy |

Goals, in priority order:

1. Nothing readable ever leaves the user's machine or rests on disk in clear text.
2. Any data shape can be stored without code changes.
3. Disaster recovery works from a single file plus the Master Password.
4. Daily use is faster than a `.env` file: copy, inject into a process, or search in under two seconds.

## 3. Users and scenarios

One user: a developer on a personal machine. No multi-user, sharing or hosted accounts in any planned version.

1. Save a new API key: Add Item → "API Key" template → name, key, Base URL, environment → save; the key is in the "Clinic Copilot" project.
2. Save a site with unusual fields: "Login" template plus three custom fields (phone, 2FA URL, customer number).
3. Quick access: Ctrl+K → type "groq" → Enter copies the key; clipboard clears after 30 s.
4. Run a project: `vault run --project clinic -- uvicorn app:main` injects all project secrets as environment variables; no `.env` on disk.
5. Disaster recovery: new machine → install → Import `.vault` (or Restore from Drive) → Master Password → everything is back.
6. Key rotation: edit the key value; the previous value stays in field history until the new key is live everywhere; `expires_at` recomputes from the rotation policy.
7. Smart import (V2): paste an onboarding email with host, user, password and port → review the proposed item and fields → add.

## 4. Scope

The MVP is done when every Must-Have below ships with green tests; V2 and V3 are ordered, not equal-weight wish lists.

### MVP — Must-Have

- [ ] First-run setup: Master Password, strength meter, no-recovery warning, optional hint
- [ ] Unlock / Lock, auto-lock on idle (configurable) and on OS lock or sleep
- [ ] Change Master Password (re-wrap, no data rewrite)
- [ ] Re-authentication (Master Password prompt) for export, change password, reveal-all, Drive restore
- [ ] Vault integrity check on unlock (verify every GCM tag, warn on damage)
- [ ] Items CRUD with unlimited custom fields of all 11 types (Section 7)
- [ ] Per-field value history (last 5 values of secret fields) with restore
- [ ] Templates: built-in, provider templates, user templates, Save-as-Template
- [ ] Projects, Environments, Categories, Tags, Favorites, Pinned, Archive
- [ ] Search, filters, Smart Views, sort; Command Palette (Ctrl+K); keyboard shortcuts
- [ ] Reveal / copy with backend-driven clipboard clearing
- [ ] Password and API-key generator
- [ ] Encrypted backup: Export / Import `.vault` with post-export verification and backup health reminder
- [ ] `.env` export per project (encrypted-at-rest view, explicit confirmation on write to disk)
- [ ] Developer CLI: `vault get`, `vault run`, `vault env` (Section 9.6)
- [ ] Trash with 30-day soft delete, purged on unlock
- [ ] Bulk actions (move, tag, archive, delete)
- [ ] Settings: auto-lock, clipboard TTL, reveal timeout, theme, confirm-before-reveal
- [ ] Onboarding checklist

### V2 — Should-Have (ordered)

1. Google Drive encrypted backup: connect, Backup Now, Auto-Backup, snapshots, Restore (Section 13)
2. LLM Smart Import with placeholder redaction, OpenAI-compatible and Antigravity CLI backends (Section 14)
3. TOTP generation from `otpauth://` fields (pyotp)
4. Security dashboard: zxcvbn strength, reuse, expiry, stale items; HIBP k-anonymity check (off by default)
5. Import from `.env` / CSV / Bitwarden JSON via local parser (no LLM)
6. Encrypted attachments (recovery-code images)
7. Audit log of events without values
8. Unencrypted JSON/CSV export with explicit warning (migration path)
9. QR code display for TOTP secrets and keys

### V3 — Could-Have

- Multi-device Drive sync with conflict resolution (Keep Local / Remote / Both)
- Desktop shell (Tauri or pywebview) replacing the browser tab
- LLM natural-language search and category suggestions (metadata only)

### Out of scope, by design

- Multi-user, sharing, hosted accounts
- Any sync that transports plaintext; any cloud other than Google Drive
- Browser extension, autofill, mobile app
- Master Password recovery of any kind — no backdoor
- LLM-generated secrets (the local CSPRNG generator is the only source)

## 5. Domain model

One Items table plus Fields carries every data shape; Projects and Environments are first-class because the user is a developer.

| Concept | Definition |
| --- | --- |
| Vault | The single encrypted container (one SQLite file). |
| Item | One record: a login, an API key, a server, a note. Title, template reference, project, category, description, fields, tags. |
| Field | A labelled, typed value inside an item; may be secret (masked). Secret fields keep a value history. |
| Template | A starting set of fields. Copied into the item at creation; later template edits never touch existing items. |
| Project | A named group of items that belong to one codebase or client (e.g. "Clinic Copilot"). Supports `.env` export and CLI injection. An item belongs to at most one project. |
| Environment | A named axis (`dev`, `staging`, `production`) on secret fields: one field, one value per environment. |
| Category | One per item, user-managed (Work, Personal, APIs, ...). |
| Tag | Free text, many per item. |
| Reference field | A field whose value points at another item (shared email, shared SSH key). |
| Master Password | Never stored; derives the key-encryption key at unlock only. |

## 6. Data model and encryption at rest

Everything that could identify a service, account or secret lives inside one AES-256-GCM payload per item; the plaintext columns are limited to opaque ids, flags and timestamps.

### Plaintext columns (what an attacker with the file sees)

| Table | Plaintext columns | Encrypted blob |
| --- | --- | --- |
| `vault_meta` | id=1, format version, `kdf_salt` (16 B), `kdf_params` JSON, `wrapped_vault_key`, `verifier`, timestamps | — |
| `items` | `id` UUID, `project_id`, `category_id`, `is_favorite`, `is_pinned`, `is_archived`, `expires_at`, `created_at`, `updated_at`, `last_used_at`, `deleted_at` | `payload_enc` (title, url, description, fields, history, tags) |
| `projects` | `id`, `sort_order`, timestamps | `payload_enc` (name, icon, env names, notes) |
| `categories` | `id`, `sort_order` | `payload_enc` (name, icon, color) |
| `templates` | `id`, `is_builtin` | `payload_enc` (name, icon, fields) |
| `settings` | `key`, `value` for non-secret settings | `settings_enc` row for Drive tokens, LLM profiles |
| `attachments` (V2) | `id`, `item_id`, `size`, `mime` | `data_enc` |

Change from v1.1: `item_tags` and plaintext category names are removed. Tags are an array inside the item payload; the in-memory index serves tag filters after unlock. The cost is that `expires_at`, `project_id` and timestamps remain visible; this is accepted so Smart Views can run without decrypting and is recorded in ADR-2.

### Item payload (decrypted shape, schema version 2)

```json
{
  "schema": 2,
  "title": "Groq — Whisper STT",
  "website_url": "https://console.groq.com",
  "description": "Clinic Copilot project key, paid plan",
  "tags": ["production", "clinic"],
  "template_id": "tpl_api_key",
  "rotation_days": 90,
  "fields": [
    {"id": "f1", "label": "API Key", "type": "secret", "is_secret": true,
     "values": {"production": "gsk_...", "dev": "gsk_..."},
     "history": [{"env": "production", "value": "gsk_old", "replaced_at": "2026-09-01T10:00:00Z"}]},
    {"label": "Base URL", "type": "url", "is_secret": false, "value": "https://api.groq.com/openai/v1"},
    {"label": "Environment", "type": "text", "is_secret": false, "value": "production"},
    {"label": "Billing email", "type": "reference", "is_secret": false, "value": "item:4b1c..."}
  ]
}
```

Rules: a field without Environments uses `value`; with Environments it uses `values` keyed by environment name. `history` is capped at 5 entries per environment and is wiped on explicit "Clear history". `AAD = item_id || schema_version` so a payload cannot be moved between items or downgraded.

### Search

After unlock all payloads are decrypted into an in-memory index (titles, descriptions, tags, labels, project and category names). Search, filters and Smart Views run on that index; nothing is written back in plaintext. Target scale: 5,000 items, index built in under 1 s.

## 7. Custom fields specification

Eleven field types cover every case met so far; the user adds, reorders, retypes and deletes fields on any item from the UI, never from code.

| Type | Use | UI behaviour |
| --- | --- | --- |
| `text` | Username, customer number | Plain input, copy |
| `secret` | Password, API key, recovery code | Masked, reveal (auto-hide 15 s), copy, generate, history |
| `email` | Email address | Format validation, copy |
| `phone` | Phone number | Copy, optional `tel:` link |
| `url` | Site, docs, 2FA link | Copy, open in browser |
| `totp` | TOTP secret or `otpauth://` URI | MVP: masked secret. V2: live 6-digit code with 30 s countdown, QR display |
| `date` | Issued / expiry | Date picker |
| `number` | Port, quota | Numeric input |
| `boolean` | "2FA enabled?" | Toggle |
| `multiline` | Long notes, private keys | Textarea, optional masking |
| `reference` | Link to another item (shared email, shared key) | Shows the target title; click opens it; copy copies the target's primary secret |

### Rules

- Add: "+ Add Field" → label, type, secret flag → appears immediately.
- Reorder by drag and drop; `sort_order` persists.
- Retype allowed with a warning when meaning may be lost (e.g. `date` → `text`).
- Duplicate labels allowed in one item (two API keys for one service).
- Delete requires confirmation; a deleted secret field's last value goes to history for 30 days.
- Environments: any secret field can be switched to "per environment"; the project defines the environment names; missing environment values fall back to `default`.
- History: every change to a secret value pushes the old value (with timestamp and environment) onto a 5-entry stack; "Restore" swaps it back; "Clear history" wipes it.
- Rotation policy: `rotation_days` on the item recomputes `expires_at` whenever a secret field changes.
- Save as Template turns an item's field set (labels, types, secret flags, no values) into a reusable template.

## 8. Built-in templates

Built-ins cannot be deleted; user templates are free to edit and delete; editing a template never changes existing items.

| Template | Default fields |
| --- | --- |
| Login | Email/Username (email), Password (secret), TOTP (totp, optional) |
| API Key | API Key (secret), API Secret (secret), Base URL (url), Environment (text) |
| Secure Note | One multiline field |
| Server / SSH | Host (text), Port (number), Username (text), Password (secret), Private Key (multiline, secret) |
| Database | Host, Port, Database Name, Username, Password (secret), Connection String (secret) |
| OpenAI-compatible provider | API Key (secret), Base URL (url), Default Model (text), Rate limit notes (multiline) |
| AWS | Access Key ID (secret), Secret Access Key (secret), Region (text), Account ID (text) |
| Stripe | Publishable Key (text), Secret Key (secret), Webhook Secret (secret), Mode (text) |
| OAuth App | Client ID (text), Client Secret (secret), Redirect URI (url), Scopes (multiline) |
| Blank | No fields |

## 9. Feature specification

### 9.1 Search, filters and Smart Views

- Instant search over title, description, tags, field labels, project and category names (in-memory index).
- Filters: project, environment, category, template, tag, favorites, archived.
- Sort: last modified (default), alphabetical, last used, expiry.
- Smart Views (fixed sidebar entries): Expiring in 30 days, Expired, Not used in 90 days, Logins without 2FA, Reused secrets, No project.
- Copying any secret value updates `last_used_at`.

### 9.2 Projects and environments

- A project holds items, an ordered list of environment names and notes.
- Project view: all items, grouped by template, with an environment switcher.
- `.env` export: pick environment → preview of `KEY=value` lines (keys derived from field labels, editable mapping saved on the item) → copy to clipboard or write to a path with an explicit warning that the file is plaintext. Writing adds the path to the project's "known plaintext files" list so the dashboard can remind the user to delete it.
- Moving an item between projects keeps its field values; environment names that do not exist in the target are mapped in a dialog.

### 9.3 Command Palette and keyboard

- Ctrl+K opens a palette combining search and commands: `copy <item> <field>`, `open <item>`, `new <template>`, `lock`, `export env <project>`.
- Enter on an item copies its primary secret; Ctrl+Enter opens the item; Esc locks the palette.
- Shortcuts: Ctrl+L lock, Ctrl+N new item, Ctrl+Shift+C copy password, Ctrl+G generator, Ctrl+, settings.

### 9.4 Generator

- Password: length 8–128 (default 20), upper, lower, digits, symbols, exclude look-alikes, passphrase mode (diceware word list, 4–8 words).
- API key: hex or base64url, 16–64 bytes, optional prefix.
- Entropy shown live; source is `secrets` only. Available inline from any secret field.

### 9.5 Backup

- Export: `.vault` file, same cipher and KDF as the database, header = magic, format version, KDF params, salt, wrapped key, verifier. File name `vault-YYYYMMDD-HHmm.vault`.
- Verify after export: the written file is re-opened, the verifier decrypted and every payload tag checked before "Export complete" is shown.
- Import: Master Password of the file → verifier check → full replace (409 confirmation when a vault exists; a local safety snapshot of the current vault is written first). Merge is V3.
- Backup health: status bar shows days since last verified export or Drive backup; amber after 7 days, red after 30; first-export nudge on the onboarding checklist.
- Mandatory warning on first export: without the Master Password the file is unrecoverable.

### 9.6 Developer CLI

A thin client over the local API, sharing the session token (Section 10.3); the vault must be unlocked in the app or the CLI prompts for the Master Password itself.

| Command | Behaviour |
| --- | --- |
| `vault get <item> [<field>] [--env prod]` | Prints the value to stdout (for piping); never echoes to the terminal history when `--copy` is used instead |
| `vault run --project <p> [--env prod] -- <cmd...>` | Injects the project's fields as environment variables into the child process only; nothing touches disk |
| `vault env --project <p> --env prod` | Prints `export KEY=value` lines for `eval`; requires `--i-know-this-is-plaintext` |
| `vault list [--project p]` | Titles and ids only |
| `vault lock` / `vault status` | Session control |

Safety: `vault run` scrubs the variables from its own environment after spawning; output of `get` is never logged; the CLI refuses to run when the API token file is world-readable.

### 9.7 Trash, Archive, bulk actions

- Trash: soft delete, 30-day retention, purge runs on every unlock; restore from Trash view.
- Archive: hidden from default lists and search unless the Archived filter is on; no expiry.
- Bulk: multi-select → move to project/category, add/remove tag, archive, delete, export `.env`.

### 9.8 Settings

- Auto-lock: 1 / 5 (default) / 15 / 30 min / never (warning); lock on OS lock/sleep: on by default.
- Clipboard TTL: 10 / 30 (default) / 60 s, cleared by the backend process.
- Reveal timeout 15 s; confirm before reveal on/off; re-authentication for sensitive actions on/off (default on).
- Theme light/dark; language Arabic RTL / English.
- Backup health thresholds; Drive (V2); LLM (V2, off by default).

### 9.9 Security dashboard (V2)

One screen scoring the vault: weak (zxcvbn < 3), reused, expired, expiring, stale, logins without TOTP, known plaintext `.env` files on disk, days since last backup. Each row links to the filtered list. Optional HIBP range check sends only the first 5 characters of the SHA-1 hash.

## 10. Security architecture

The vault key never exists outside process memory, every byte on disk is authenticated ciphertext, and the local API trusts nothing but a per-run token.

### 10.1 Threat model

| Protected against | Mitigation |
| --- | --- |
| Theft of `vault.db`, a `.vault` file or a Drive snapshot | Argon2id + AES-256-GCM; offline guessing bounded only by KDF cost |
| Unattended unlocked machine | Auto-lock on idle, OS lock and sleep; 15 s reveal timeout; clipboard TTL |
| Another local web page or process calling the API | Session token, Origin check, loopback only, 423 when locked |
| Silent tampering with ciphertext | GCM tags + AAD; integrity check on unlock; refuse-and-alert, never partial data |
| Secrets in logs, errors, analytics | Hard rule + canary test in CI |
| Leaking metadata to Google or an LLM provider | Only ciphertext reaches Drive; LLM receives placeholder-redacted text (Section 14) |

Not protected against: malware or a keylogger on the machine while the vault is open; a user who forgets the Master Password. Both are stated in the setup screen.

### 10.2 Cryptographic protocol

1. Setup: `salt = secrets.token_bytes(16)`; `KEK = Argon2id(master_password, salt, m=64 MiB, t=3, p=4, len=32)`. Parameters are stored in `kdf_params` so they can be raised later.
2. `vault_key = secrets.token_bytes(32)`; `wrapped_vault_key = AES-256-GCM(KEK).encrypt(nonce, vault_key, aad="vault_key|v2")`.
3. `verifier = AES-256-GCM(vault_key).encrypt(nonce, b"secrets-vault-verifier", aad="verifier")`.
4. Each payload: fresh 12-byte random nonce, `aad = item_id || schema_version`; stored as `nonce || ciphertext || tag`.
5. Unlock: derive KEK, unwrap, decrypt verifier; any failure returns one generic message. Then integrity check: decrypt every payload tag; failures are listed, never silently skipped.
6. Change Master Password: new salt, new KEK, re-wrap the same vault key; also used to upgrade `kdf_params`. Requires re-authentication.
7. Lock: vault key and decrypted index held in `bytearray` objects and zero-filled; the in-memory index is dropped. Python cannot guarantee zeroing of copies; this is documented as best effort (ADR-4).
8. Nonce reuse is impossible by construction (random per write); tests sample 1,000,000 nonces for collisions.

### 10.3 Local API hardening

- Bind to `127.0.0.1` only; port chosen at startup.
- A 32-byte session token is generated per run and written to `data/session.token` with mode 0600; the frontend reads it from the page bootstrap, the CLI from the file. Every request carries `Authorization: Bearer <token>`.
- `Origin` and `Host` headers must match the server's own origin; otherwise 403. This closes CSRF and DNS rebinding.
- Before unlock only `status`, `setup`, `unlock` exist; after lock every other route returns `423 Locked`.
- Unlock throttling: 1, 2, 5, 15, 30 s delays after failures, reset on success. This slows online guessing only; offline strength comes from Argon2.
- Sensitive routes (`backup/export`, `auth/change-password`, `items/reveal-all`, `drive/restore`, `project/env-write`) require a fresh re-authentication token obtained within the last 5 minutes.
- Clipboard: the backend writes and clears the clipboard (`pyperclip` or platform command); the browser never holds the value longer than the copy call.

### 10.4 Non-negotiable rules

- No secret value, Master Password or key in logs, exceptions, analytics or crash reports; a canary secret is grepped out of all logs in CI.
- No secret in browser storage of any kind.
- No custom cryptography: `cryptography` (AES-GCM), `argon2-cffi`, `secrets` only.
- Any GCM failure stops the operation and alerts the user.
- No Master Password recovery path; the optional hint is stored in plaintext and validated to not contain the password.
- Dependencies pinned with hashes; `pip-audit` in CI.

## 11. Technical architecture

The stack stays Python + FastAPI + SQLite with a plain RTL web frontend, but every client, including the new CLI, talks through one hardened local API, and the services never see a plaintext file.

&#91;embedded content: system architecture · 2 clients, 4 services, 2 external channels\]

Both clients call the same API with the per-run token; Drive and the LLM backends sit outside the trust boundary and receive only what the two labelled edges allow.

### Stack

- Backend: Python 3.12, FastAPI, uvicorn; layers `CryptoService` → `VaultService` → domain services → thin routers.
- Database: SQLite in WAL mode, one file, migrations by format version.
- Frontend: HTML/CSS/JS, Arabic RTL first, English toggle, no heavy framework; served by the backend at `http://127.0.0.1:<port>`.
- CLI: Python entry point `vault`, shares `app/` services through the API.
- Desktop shell (V3): Tauri or pywebview wrapping the same frontend.

### Project structure

```
secrets-vault/
├── app/
│   ├── main.py              # FastAPI entrypoint, token + Origin middleware
│   ├── crypto_service.py    # Argon2id, AES-GCM, wrapping, zeroing
│   ├── vault_service.py     # setup/unlock/lock, integrity check, in-memory index
│   ├── items_service.py     # items, fields, history, references, bulk
│   ├── projects_service.py  # projects, environments, .env export
│   ├── templates_service.py
│   ├── backup_service.py    # .vault export/import/verify
│   ├── drive_service.py     # V2: OAuth PKCE, appDataFolder, snapshots
│   ├── llm/
│   │   ├── service.py       # LLMBackend interface, redaction, review payloads
│   │   ├── redaction.py     # placeholder engine
│   │   ├── openai_compat.py # httpx client, profiles
│   │   └── agy_cli.py       # Antigravity CLI subprocess backend
│   ├── generator.py
│   ├── clipboard.py         # backend copy + timed clear
│   ├── models.py            # Pydantic schemas (payload schema v2)
│   ├── db.py
│   └── api/                 # routers
├── cli/vault.py
├── frontend/
├── data/                    # vault.db, session.token (git-ignored)
├── tests/
└── README.md
```

### API surface

| Group | Endpoints |
| --- | --- |
| Auth | `GET /auth/status` · `POST /auth/setup` · `POST /auth/unlock` · `POST /auth/lock` · `POST /auth/reauth` · `POST /auth/change-password` |
| Items | `GET/POST /items` · `GET/PUT/DELETE /items/{id}` · `POST /items/{id}/restore` · `POST /items/{id}/copy-field` · `POST /items/{id}/fields/{fid}/history/restore` · `POST /items/bulk` |
| Projects | `GET/POST /projects` · `PUT/DELETE /projects/{id}` · `GET /projects/{id}/env?env=` · `POST /projects/{id}/env-write` (reauth) |
| Templates | `GET/POST /templates` · `PUT/DELETE /templates/{id}` · `POST /items/{id}/save-as-template` |
| Organize | `GET/POST /categories` · `GET /tags` · `GET /views/{smart_view}` · `GET /items?search=&project=&env=&category=&tag=&favorite=&archived=` |
| Generator | `POST /generator/password` · `POST /generator/api-key` · `POST /generator/passphrase` |
| Backup | `GET /backup/export` (reauth) · `POST /backup/verify` · `POST /backup/import` · `GET /backup/health` |
| Clipboard | `POST /clipboard/copy` · `POST /clipboard/clear` |
| Drive (V2) | `GET /drive/status` · `POST /drive/connect` · `POST /drive/disconnect` · `POST /drive/backup-now` · `GET /drive/snapshots` · `POST /drive/restore` (reauth) |
| LLM (V2) | `GET /llm/status` · `GET/PUT /llm/profiles` · `POST /llm/test` · `POST /llm/smart-import/preview` · `POST /llm/smart-import/run` · `POST /llm/smart-import/commit` |
| Settings | `GET/PUT /settings` · `GET /security/dashboard` (V2) |

Status codes: `401` wrong password, `403` missing token or bad Origin, `423` vault locked, `409` import over an existing vault needs confirmation, `428` re-authentication required.

## 12. UX and screens

Ten screens, built in two passes: the first four give a usable vault; the rest layer on top.

| # | Screen | Content | Pass |
| --- | --- | --- | --- |
| 1 | Setup | Master Password + confirm, strength meter, no-recovery warning, optional hint, onboarding checklist start | 1 |
| 2 | Unlock | One field, hint, generic error, visible throttle countdown | 1 |
| 3 | Main | Sidebar: search, Smart Views, projects, categories, tags. List: items. Detail: title, url, description, fields with per-type actions, history drawer, tags | 1 |
| 4 | Add / Edit item | Template picker, fields, "+ Add Field", drag reorder, environment toggle per secret field, generator inline | 1 |
| 5 | Command Palette | Ctrl+K overlay: search + commands | 2 |
| 6 | Project view | Items by template, environment switcher, `.env` preview/export, known plaintext files | 2 |
| 7 | Templates & Categories | Simple CRUD lists | 2 |
| 8 | Generator | Modal, callable from any secret field | 2 |
| 9 | Settings & Backup | Auto-lock, clipboard, reveal, theme, language, Export/Import/Verify, change password, Trash, backup health | 2 |
| 10 | Drive & LLM (V2) | Connect/disconnect, snapshots, restore; LLM backend, profiles, test connection, privacy mode; Smart Import review screen | V2 |

Security UX rules: secrets masked by default; reveal hides itself after 15 s; copy shows "clears in 30 s"; sensitive actions open a re-authentication prompt; any integrity failure shows a blocking banner naming the affected items.

Onboarding checklist (dismissible): create Master Password → add first item → run first verified export → connect Drive (V2) → try `vault run`.

## 13. Google Drive encrypted backup (V2)

Drive is a transport for the encrypted `.vault` file and nothing else; the local database stays the source of truth and sync between devices is deferred to V3.

### 13.1 Connection

- OAuth 2.0 Authorization Code + PKCE from the browser; the app never sees the Google password.
- Scope `https://www.googleapis.com/auth/drive.appdata` only: the app can read and write its hidden appDataFolder and nothing else on the user's Drive. The connect screen says so.
- Tokens are stored in `settings_enc`, encrypted with the vault key, so Drive operations run only while the vault is unlocked. No background sync while locked (ADR-6).
- Disconnect deletes local tokens and revokes them at Google.
- Setup prerequisite (README): a Google Cloud project with an OAuth client. Leave the consent screen in "Testing" and refresh tokens expire after 7 days; publish the app for personal use so they persist. Verify current Google policy at implementation time.
- Warning shown once: Google deletes appDataFolder contents if the user removes the app from their Google account settings.

### 13.2 Operations

| Operation | Behaviour |
| --- | --- |
| Backup Now | Build a fresh `.vault`, verify it locally, upload as `vault-YYYYMMDD-HHmm.vault`, update `latest.vault` |
| Auto-Backup | On by default after connect; 60 s debounce after the last change while unlocked |
| Snapshots | Keep the newest 10 dated files, delete older ones; list shows date, size, item count (from the local index at upload time, stored in the file header as a count only) |
| Restore | Pick a snapshot → download → decrypt with the Master Password → verifier + full GCM check → write a local safety snapshot of the current vault → replace (re-authentication required) |
| Status | Last successful backup time, size, local vs remote state (newer / same / older) in the status bar and backup health |

### 13.3 Failure handling

- Any downloaded file that fails the verifier or a GCM tag is rejected whole; the local vault is untouched.
- Upload failures retry 3 times with backoff, then a non-blocking status-bar warning; the app keeps working offline.
- A stolen OAuth token alone yields only ciphertext; Disconnect is immediate.
- If local and remote both changed since the last backup (possible only when a second machine is used before V3), Backup Now stops and offers Keep Local / Keep Remote / Keep Both; nothing is overwritten silently.

## 14. LLM assistant and Smart Import (V2)

The assistant turns unstructured text into proposed items and fields; a local placeholder layer guarantees that secret values never reach any model, cloud or local, unless the user explicitly opts in per request.

### 14.1 Smart Import pipeline

&#91;embedded content: Smart Import pipeline · 7 steps, 1 leaves the machine\]

Steps 1, 2, 4, 5, 6 and 7 run inside the process; only step 3 sends anything out, and what it sends contains `{{S1}}`-style placeholders where the redaction layer found a secret.

1. Paste: the user pastes `.env` content, an onboarding email, chat notes. A local pre-parser first handles pure `KEY=VALUE` input without any model (import V2 item 5); the LLM is used only for text the parser cannot structure.
2. Redact: `redaction.py` replaces every value matching secret patterns with a numbered placeholder and keeps the map in memory only. Patterns: values after `password`, `secret`, `token`, `key` labels; strings matching known key prefixes (`sk-`, `gsk_`, `AKIA`, `ghp_`, `xoxb-`, `AIza`); any token of 20+ characters with high entropy; `otpauth://` URIs; PEM blocks. The user sees the exact redacted text before sending.
3. Backend call: system prompt asks for JSON only, matching the import schema; the backend declares whether it supports JSON mode; otherwise the response is parsed with fences stripped.
4. Validate: Pydantic schema `{items: [{title, template_hint, website_url?, fields: [{label, type, is_secret, value}]}]}`; unknown keys, missing titles, or a placeholder the map does not know are rejected with a readable error.
5. Restore: placeholders are swapped for the real values locally; the map is wiped.
6. Review: every proposed item and field is editable; template, project and category can be changed; duplicates against existing titles are flagged.
7. Commit: one "Add N items" button; the application writes through `items_service`; the model never calls a write.

Opt-in raw mode: a per-request checkbox "send without redaction" shows the full text in a preview with the sentence "this will be sent to \<provider>"; recommended only with a local backend.

### 14.2 Red lines

1. Secret field values are never sent to any backend except through the explicit raw mode above.
2. Default payload is placeholder-redacted text only; vault metadata (titles, tags) is sent only for the duplicate check and only when "share titles for duplicate detection" is on.
3. Every outbound payload passes `redaction.py`; a leak test in CI mocks the backend and asserts no canary value appears in any request body or CLI argument.
4. Audit records provider, model, task, timestamp and token counts; never prompt or response text.
5. Model output is a proposal; writes happen only after the user confirms; deletes are never proposed by the model.
6. The feature is off by default and the application is complete without it.
7. The model never generates passwords or keys; the local generator is the only source.

### 14.3 Backends (`LLMBackend` interface)

| Backend | What it is | Settings | Notes |
| --- | --- | --- | --- |
| Custom OpenAI-compatible | Any `/v1/chat/completions` endpoint: OpenAI, Groq, NVIDIA, Together, or local Ollama / LM Studio | Profiles: name, `base_url`, API key (stored as a vault item, decrypted at call time), `model`, `timeout`, `json_mode` | `httpx` client, 60 s timeout, 1 retry on network error, no retry with different content |
| Antigravity CLI (`agy`) | Google's Antigravity agentic CLI invoked as a subprocess; uses the CLI's own login, so no API key is stored | Binary path (auto-detected on PATH, editable), optional model name, `timeout`, working directory (an empty temp dir) | See 14.4 |
| None | Feature off (default) | — | — |

Fallback: optional secondary profile used when the primary fails; the switch is written to the audit log; the payload is identical.

### 14.4 Antigravity CLI backend

- Invocation: `subprocess.run([agy_path, <non-interactive prompt flag>, ...], input=redacted_text, capture_output=True, timeout=timeout, cwd=tempdir, env=minimal_env)`. Arguments are a list, never a shell string; the user's text goes through stdin, never argv.
- Minimal environment: `PATH`, `HOME` and the CLI's own config variables only; the vault session token and any project secrets are stripped so the CLI cannot read them.
- Working directory is an empty temporary directory so an agentic CLI has no files to act on; file-writing or tool-use modes are disabled by flag where the CLI offers them.
- Timeout kills the process group; stderr is captured for the error dialog only and is not written to the audit log.
- The exact flags for non-interactive, JSON-only output are verified against the installed CLI version at implementation time and stored in `agy_cli.py` with a version check; the backend self-tests with a `ping` prompt from the settings screen.
- Privacy notice in settings: the CLI sends prompts through its own account; the redaction layer still applies to everything that reaches it.

### 14.5 Later tasks (V3)

Natural-language search ("the Groq key for the clinic project") and category or tag suggestions, both on metadata only; a local fuzzy search covers most of this without a model, so they stay optional.

## 15. Implementation phases

Ten phases, three hard gates: nothing with a UI starts before the crypto tests are green, nothing in V2 starts before the MVP Definition of Done, and the LLM feature ships only after the leak test passes.

&#91;embedded content: implementation roadmap · 10 phases, 3 gates\]

Phases run in order; P4 and P6 split the UI so a usable vault exists early and real daily use shapes the second pass.

| Phase | Content | Verifiable output |
| --- | --- | --- |
| P0 Foundation | Repo, `app/` layout, SQLite schema v2, migrations, CI with pytest, pip-audit, canary log grep | Empty app runs; CI green on an empty test |
| P1 Crypto core | `CryptoService`: Argon2id, key wrapping, payload encrypt/decrypt with AAD, verifier, bytearray zeroing | All Section 16.1 crypto tests green before any UI |
| P2 Session | Setup / unlock / lock / auto-lock / OS-lock hook, change password, re-auth tokens, throttling, session token + Origin middleware, integrity check | Full lock/unlock flow through the API; 403/423/428 behave |
| P3 Domain | Items, fields, history, references, environments, projects, templates, categories, tags, in-memory index, Smart Views, bulk, clipboard service | API fully covered by tests |
| P4 UI pass 1 | Setup, Unlock, Main, Add/Edit (RTL) | Daily use possible from the browser |
| P5 Backup, CLI | `.vault` export/verify/import, safety snapshot, backup health, `.env` export, `vault get/run/env/list` | Disaster drill: export → wipe → import → identical; `vault run` injects variables |
| P6 UI pass 2 | Command Palette, project view, templates/categories, generator modal, settings, Trash, onboarding, polish, README | MVP Definition of Done (Section 16.5) |
| P7 Drive (V2) | OAuth PKCE, appDataFolder, Backup Now, Auto-Backup, snapshots, restore, disconnect | Drive drill on a test account: backup → wipe → restore |
| P8 LLM (V2) | `LLMBackend`, redaction engine, OpenAI-compatible profiles, Antigravity CLI backend, Smart Import review, audit | Leak test green; sample `.env` and email import produce correct items after review |
| P9 V2 extras | TOTP, security dashboard, zxcvbn, HIBP, `.env`/CSV/Bitwarden import, attachments, audit log, plaintext export, QR | Each feature's acceptance tests green |

## 16. Testing and acceptance

A failing crypto, API-hardening or leak test blocks the release regardless of what else is done.

### 16.1 Cryptography (blocking)

- [ ] Round trip of a payload with Arabic text, emoji and 1 MB multiline returns identical bytes
- [ ] Wrong Master Password: generic error, no partial data, constant-time verifier compare
- [ ] One flipped byte in any payload, `wrapped_vault_key` or `verifier` fails the GCM tag and raises an integrity alert
- [ ] Payload moved to another item id fails (AAD)
- [ ] Payload with a downgraded schema version in AAD fails
- [ ] 1,000,000 generated nonces contain no duplicate
- [ ] Change password: old password rejected, new one opens identical data, `kdf_params` upgrade re-wraps correctly
- [ ] Lock zero-fills the key bytearray and drops the index (inspect object state)

### 16.2 Local API hardening (blocking)

- [ ] Request without the session token → 403; wrong `Origin` or `Host` → 403
- [ ] Only `status`, `setup`, `unlock` exist before unlock; everything else 423 after lock
- [ ] Sensitive routes return 428 without a fresh re-auth token
- [ ] Throttling delays escalate and reset on success
- [ ] Clipboard is cleared by the backend after the configured TTL (automated on Linux, documented manual check on others)
- [ ] Canary test: a known secret written through every feature never appears in logs, stderr, exception text or the audit log

### 16.3 Functional

- [ ] All 11 field types: add, edit, reorder, retype, duplicate labels, delete; survive lock/unlock
- [ ] Field history: push on change, cap at 5, restore, clear
- [ ] Environments: per-env values, fallback to default, `.env` export per environment
- [ ] Reference fields resolve and survive deletion of the target (shows "missing")
- [ ] Templates: instantiate, edit copy without touching template, Save-as-Template
- [ ] Projects: move item, environment mapping dialog, bulk actions
- [ ] Search, filters, Smart Views, sort; index rebuilt after every write
- [ ] Trash: delete → restore → purge on unlock after 30 days; Archive hidden by default
- [ ] Generator: distribution checks, exclusions honoured, passphrase word count
- [ ] Backup: export → verify → import on empty vault yields identical decrypted set; import with wrong password leaves the current vault untouched; 409 confirmation path
- [ ] CLI: `get` prints only the value, `run` injects and scrubs, `env` refuses without the plaintext flag, token file permission check
- [ ] Auto-lock on idle and on a simulated OS lock event

### 16.4 V2

- [ ] Drive: token scopes contain only `drive.appdata`; uploaded file is unreadable without the Master Password; tampered snapshot rejected; 10-snapshot retention; disconnect revokes
- [ ] LLM leak test: mocked backend captures every request body and every subprocess argument and stdin; no canary value or key pattern appears, in default and in raw mode without consent
- [ ] Redaction: each listed pattern is replaced; placeholders restore to the exact original
- [ ] Smart Import: malformed, extra-key or unknown-placeholder model output is rejected; nothing is written before commit
- [ ] Antigravity CLI: timeout kills the process group; shell metacharacters in input execute nothing; environment contains no vault token or project secret
- [ ] Audit log contains provider, model, task, timestamp, token counts only

### 16.5 Definition of Done (MVP)

All Must-Have items in Section 4 implemented; 16.1, 16.2 and 16.3 green in CI; disaster drill and `vault run` drill recorded in the README; security warnings present in setup and first export; no open blocking issue in Section 19.

## 17. Non-functional requirements

| Requirement | Target |
| --- | --- |
| Capacity | 5,000 items, 50 fields each, index built in < 1 s on a 2020 laptop |
| Unlock time | Argon2id at 64 MiB / t=3 / p=4: about 1 s; shown as a progress state, never a frozen screen |
| Memory | < 150 MB resident with 5,000 items decrypted |
| Startup | App ready in < 2 s; CLI `vault get` in < 300 ms when the vault is already unlocked |
| Portability | Windows 10+, macOS 13+, Ubuntu 22.04+; Python 3.12 |
| Offline | Every MVP feature works with no network; Drive and LLM degrade to a status message |
| Data durability | SQLite WAL with `synchronous=FULL`; backup verified after every export |
| Accessibility | Keyboard-only operation for all flows; RTL and LTR layouts; contrast AA |
| Dependencies | Pinned with hashes; `pip-audit` in CI; no crypto implemented in-repo |

## 18. Architecture decision records

| ADR | Decision | Alternatives considered | Why |
| --- | --- | --- | --- |
| ADR-1 | One encrypted JSON payload per item, not per-column encryption | Column-level encryption; SQLCipher | One nonce and tag per item; AAD binds payload to item; simpler key handling; SQLCipher would still leak schema and needs a native build |
| ADR-2 | Tags and category/project names inside ciphertext; `expires_at`, `project_id`, flags and timestamps in plaintext | Encrypt everything incl. timestamps | Smart Views and Trash purge need those columns without a full decrypt; they reveal counts and dates, not identities |
| ADR-3 | In-memory search after unlock | Encrypted search index; FTS on plaintext | Personal scale (thousands) fits memory; no plaintext ever touches disk |
| ADR-4 | Best-effort key zeroing with `bytearray` | Native module for secure memory | Python cannot guarantee no copies; documented honestly; auto-lock is the real mitigation |
| ADR-5 | Browser UI on localhost with session token + Origin check for MVP; desktop shell in V3 | Tauri/pywebview from day one | Fastest path to a usable vault; token and Origin checks close the known web risks; services are UI-agnostic |
| ADR-6 | Drive = encrypted backup only, tokens encrypted with the vault key, no background sync | Plaintext-free sync with merge; background sync while locked | File-level backup needs no conflict rules on one device; a locked vault cannot leak a token |
| ADR-7 | LLM receives placeholder-redacted text; writes only after user commit | Send raw text to a local model; let the model call tools | Works with cloud and local backends alike; the leak test is checkable; the model cannot act on the vault |
| ADR-8 | Antigravity CLI as a subprocess with argv list, stdin input, minimal env, temp cwd | Shelling out with a command string | Removes shell injection and stops the agent from reading project files or the session token |
| ADR-9 | CLI reuses the API and session token instead of opening the database directly | Direct SQLite access from the CLI | One code path for crypto and locking; the CLI cannot bypass auto-lock or re-auth |
| ADR-10 | No Master Password recovery | Recovery key, security questions | Any recovery path is a second key; the plan trades convenience for zero-knowledge and mitigates with backup nudges and a hint |

## 19. Risks and open decisions

| # | Risk or question | Status / mitigation |
| --- | --- | --- |
| 1 | Forgotten Master Password = total loss | Accepted by design; setup warning, hint, backup health reminders |
| 2 | Machine compromised while unlocked | Outside the threat model; short auto-lock, OS-lock hook, 15 s reveal |
| 3 | Browser UI attack surface | Token + Origin checks in MVP (ADR-5); desktop shell in V3 |
| 4 | Clipboard clearing differs per OS | Backend-driven; Linux automated test, macOS/Windows manual checklist |
| 5 | Plaintext `.env` files written by export | Explicit warning, tracked in project, dashboard reminder to delete |
| 6 | Google OAuth setup friction (Cloud project, consent screen, 7-day test tokens) | README walkthrough; verify Google policy at build time |
| 7 | Antigravity CLI flags and behaviour change between versions | Version check in `agy_cli.py`; self-test from settings; OpenAI-compatible backend as fallback |
| 8 | Redaction misses an unusual secret format | Entropy rule catches long tokens; user previews redacted text; raw mode is opt-in only; leak test extended whenever a new pattern is found |
| 9 | Search scale beyond thousands of items | Re-evaluate ADR-3 if the index exceeds 1 s |
| 10 | Open: ship the CLI as part of P5 or defer `vault run` to P6? | Decide at P3 end based on time; `vault get` is the minimum |
| 11 | Open: Arabic or English as the default UI language | Default Arabic RTL; English toggle in settings; confirm before P4 |
| 12 | Open: desktop shell choice (Tauri vs pywebview) | Decide after MVP; both keep the FastAPI backend |

## 20. Appendix

### Approved libraries

| Library | Use | Version |
| --- | --- | --- |
| `fastapi`, `uvicorn` | Backend | MVP |
| `cryptography` | AES-256-GCM | MVP |
| `argon2-cffi` | Argon2id | MVP |
| `pydantic` | Schemas, payload validation | MVP |
| `pyperclip` or platform clipboard commands | Backend clipboard copy/clear | MVP |
| `typer` | CLI | MVP |
| `pytest`, `pytest-asyncio`, `pip-audit` | Tests, dependency audit | MVP |
| `pyotp` | TOTP codes | V2 |
| `zxcvbn` | Password strength | V2 |
| `google-auth`, `google-auth-oauthlib`, `google-api-python-client` | Drive appDataFolder | V2 |
| `httpx` | OpenAI-compatible client | V2 |
| `qrcode` | QR display | V2 |
| standard `subprocess` | Antigravity CLI backend | V2 |

### Changelog from v1.1

| Area | v1.1 | v2.0 |
| --- | --- | --- |
| Metadata at rest | Tags and category names in plaintext tables | Inside encrypted payloads |
| Local API | Loopback only | Loopback + per-run session token + Origin/Host check + re-auth for sensitive routes |
| Clipboard | Cleared from the browser | Cleared by the backend |
| Field model | 10 types, no history | 11 types (adds `reference`), per-env values, 5-entry history, rotation policy |
| Organisation | Categories, tags | Projects, environments, archive, Smart Views, bulk actions, Command Palette |
| Backup | Export/Import | + verify after export, safety snapshot before import, backup health |
| Developer workflow | None | `.env` export per project, `vault get/run/env` CLI |
| Drive | Full sync with conflict rules | Backup only; conflicts deferred to V3 |
| LLM | Metadata-only prompts, natural-language search | Placeholder redaction pipeline, Smart Import review, Antigravity CLI backend hardened; search deferred |
| Templates | 6 | 10 (adds OpenAI-compatible, AWS, Stripe, OAuth App) |
| Plan structure | Single list | Added NFRs, ADRs, three gates, split UI passes |
