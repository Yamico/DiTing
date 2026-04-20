"""
Database migrations and initialization helpers.
"""
from app.core.config import APP_VERSION
from app.core.logger import logger
from app.db import schema as db_schema
from app.db import seed as db_seed
from app.db.connection import get_connection

CURRENT_VERSION = APP_VERSION


def init_db():
    """Initialize database schema and run any pending migrations."""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        state = _detect_state(cursor)

        if state == "fresh":
            logger.info(f"Fresh install detected, creating schema at v{CURRENT_VERSION}")
            db_schema.create_all(cursor)
            db_seed.seed_all(cursor)
            _set_version(cursor, CURRENT_VERSION)

        elif state == "legacy_integer":
            old_ver = _get_legacy_int_version(cursor)
            logger.info(f"Upgrading legacy integer schema v{old_ver} -> v{CURRENT_VERSION}")
            _upgrade_version_column(cursor)
            db_schema.create_all(cursor)
            _set_version(cursor, CURRENT_VERSION)

        else:
            current = _get_version(cursor)
            if current != CURRENT_VERSION:
                logger.info(f"Upgrading schema v{current} -> v{CURRENT_VERSION}")

                if current == "0.12.0":
                    cursor.execute("ALTER TABLE prompts ADD COLUMN use_count INTEGER DEFAULT 0")
                    current = "0.12.1"

                if current == "0.12.1":
                    cursor.execute("ALTER TABLE llm_providers ADD COLUMN api_type TEXT DEFAULT 'chat_completions'")
                    current = "0.12.2"

                if current == "0.12.2":
                    for col in ("ai_summary", "user_prompt", "llm_model"):
                        try:
                            cursor.execute(f"ALTER TABLE transcriptions DROP COLUMN {col}")
                        except Exception as exc:
                            logger.warning(f"Skipping missing transcriptions.{col}: {exc}")
                    current = "0.12.3"

                if current == "0.12.3":
                    cursor.execute(
                        """
                        CREATE TABLE IF NOT EXISTS video_notes (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            source_id TEXT NOT NULL,
                            content TEXT NOT NULL,
                            original_content TEXT,
                            prompt TEXT,
                            model TEXT,
                            provider_id INTEGER,
                            style TEXT,
                            response_time REAL,
                            is_edited BOOLEAN DEFAULT 0,
                            is_active BOOLEAN DEFAULT 1,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (source_id) REFERENCES video_meta (source_id) ON DELETE CASCADE
                        )
                        """
                    )
                    current = "0.12.4"

                try:
                    cursor.execute("ALTER TABLE video_notes ADD COLUMN gen_params TEXT")
                except Exception:
                    pass

                db_schema.create_all(cursor)
                _set_version(cursor, CURRENT_VERSION)
            else:
                # Even on current versions, create_all keeps brand-new optional tables in sync.
                db_schema.create_all(cursor)

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _detect_state(cursor) -> str:
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    if cursor.fetchone():
        cursor.execute("SELECT version FROM schema_version WHERE key = 'version'")
        row = cursor.fetchone()
        if row:
            try:
                int(row[0])
                return "legacy_integer"
            except (ValueError, TypeError):
                return "versioned"
        return "legacy_integer"

    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='transcriptions'"
    )
    if cursor.fetchone():
        return "legacy_integer"

    return "fresh"


def _get_version(cursor) -> str:
    cursor.execute("SELECT version FROM schema_version WHERE key = 'version'")
    row = cursor.fetchone()
    return str(row[0]) if row else "0.0.0"


def _get_legacy_int_version(cursor) -> int:
    try:
        cursor.execute("SELECT version FROM schema_version WHERE key = 'version'")
        row = cursor.fetchone()
        return int(row[0]) if row else 0
    except Exception:
        return 0


def _set_version(cursor, version: str):
    cursor.execute(
        "INSERT OR REPLACE INTO schema_version (key, version) VALUES ('version', ?)",
        (version,),
    )


def _upgrade_version_column(cursor):
    cursor.execute("DROP TABLE IF EXISTS schema_version")
    cursor.execute(
        """
        CREATE TABLE schema_version (
            key TEXT PRIMARY KEY DEFAULT 'version',
            version TEXT NOT NULL
        )
        """
    )
