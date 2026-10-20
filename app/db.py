import sqlite3
import os
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "vault.db")


def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    target_path = db_path or DB_PATH
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    conn = sqlite3.connect(target_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = FULL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    with conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS vault_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            format_version INTEGER NOT NULL DEFAULT 2,
            kdf_salt BLOB NOT NULL,
            kdf_params TEXT NOT NULL,
            wrapped_vault_key BLOB NOT NULL,
            verifier BLOB NOT NULL,
            password_hint TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_backup_at TEXT
        );

        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            category_id TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            is_archived INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_used_at TEXT,
            deleted_at TEXT,
            payload_enc BLOB NOT NULL,
            schema_version INTEGER NOT NULL DEFAULT 2
        );

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            payload_enc BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            payload_enc BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            payload_enc BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS settings_enc (
            key TEXT PRIMARY KEY,
            payload_enc BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            filename TEXT,
            size INTEGER NOT NULL,
            mime TEXT NOT NULL,
            created_at TEXT NOT NULL,
            data_enc BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            event_type TEXT NOT NULL,
            details_json TEXT NOT NULL
        );
        """)
