"""
Database Migrations Module
Manages schema versioning using semantic version strings.

Flow:
  1. Fresh install       → create_all() + seed_all() → stamp CURRENT_VERSION
  2. Old integer version → schema already correct → re-stamp to CURRENT_VERSION
  3. Current version     → no-op
"""
from app.db.connection import get_connection
from app.db import schema as db_schema
from app.db import seed as db_seed
from app.core.logger import logger
from app.core.config import APP_VERSION

# --- Migration Configuration ---
CURRENT_VERSION = APP_VERSION


def init_db():
    """Initialize database schema and run any pending migrations."""
    conn = get_connection()
    cursor = conn.cursor()

    try:
        state = _detect_state(cursor)

        if state == "fresh":
            logger.info("🆕 Fresh install detected — creating all tables...")
            db_schema.create_all(cursor)
            db_seed.seed_all(cursor)
            _set_version(cursor, CURRENT_VERSION)
            logger.info(f"✅ Database initialized at v{CURRENT_VERSION}.")

        elif state == "legacy_integer":
            # Existing database with old integer version (≤18).
            # Run create_all (IF NOT EXISTS) to pick up any new tables, then re-stamp version.
            old_ver = _get_legacy_int_version(cursor)
            logger.info(f"⬆️ Database at v{old_ver} (legacy integer), upgrading to v{CURRENT_VERSION}...")
            _upgrade_version_column(cursor)
            db_schema.create_all(cursor)
            _set_version(cursor, CURRENT_VERSION)
            logger.info(f"✅ Upgraded to v{CURRENT_VERSION}.")

        else:  # versioned (semver string)
            current = _get_version(cursor)
            if current != CURRENT_VERSION:
                logger.info(f"⬆️ Database at v{current}, upgrading to v{CURRENT_VERSION}...")
                
                # Migrations from v0.12.0 -> 0.12.1
                if current == "0.12.0":
                    logger.info("  -> Adding use_count column to prompts table")
                    cursor.execute("ALTER TABLE prompts ADD COLUMN use_count INTEGER DEFAULT 0")
                    current = "0.12.1"

                # Migrations from v0.12.1 -> 0.12.2
                if current == "0.12.1":
                    logger.info("  -> Adding api_type column to llm_providers table")
                    cursor.execute("ALTER TABLE llm_providers ADD COLUMN api_type TEXT DEFAULT 'chat_completions'")
                    current = "0.12.2"

                # Migrations from v0.12.2 -> 0.12.3
                if current == "0.12.2":
                    logger.info("  -> Dropping legacy columns from transcriptions table (ai_summary, user_prompt, llm_model)")
                    for col in ("ai_summary", "user_prompt", "llm_model"):
                        try:
                            cursor.execute(f"ALTER TABLE transcriptions DROP COLUMN {col}")
                        except Exception as e:
                            logger.warning(f"  -> Column {col} may not exist, skipping: {e}")
                    current = "0.12.3"

                # Migrations from v0.12.3 -> 0.12.4
                if current == "0.12.3":
                    logger.info("  -> Creating video_notes table for AI-generated whole-video notes")
                    cursor.execute('''
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
                    ''')
                    current = "0.12.4"

                # Always ensure gen_params column exists (added post-0.12.4)
                try:
                    cursor.execute("ALTER TABLE video_notes ADD COLUMN gen_params TEXT")
                    logger.info("  -> Added gen_params column to video_notes")
                except Exception:
                    pass  # Column already exists

                # Ensure QA tables exist (v0.13.1+)
                db_schema.create_all(cursor)

                _set_version(cursor, CURRENT_VERSION)
                logger.info(f"✅ Upgraded to v{CURRENT_VERSION}.")
            else:
                logger.info(f"✅ Database schema is up-to-date (v{current}).")

        # Always ensure built-in prompt categories exist (idempotent, runs on every startup)
        db_seed.ensure_builtin_categories(cursor)

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# State detection helpers
# ---------------------------------------------------------------------------

def _detect_state(cursor) -> str:
    """
    Detect database state.
    Returns:
      'fresh'           — no tables at all (brand-new database)
      'legacy_integer'  — schema_version exists with INTEGER version column
      'versioned'       — schema_version exists with TEXT/semver version
    """
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    if cursor.fetchone():
        # Check if version is integer or text
        cursor.execute("SELECT version FROM schema_version WHERE key = 'version'")
        row = cursor.fetchone()
        if row:
            try:
                int(row[0])
                return "legacy_integer"
            except (ValueError, TypeError):
                return "versioned"
        # Table exists but no row — treat as legacy
        return "legacy_integer"

    # Check if any application table exists (pre-version-tracking era)
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
        (version,)
    )


def _upgrade_version_column(cursor):
    """
    Upgrade schema_version table from INTEGER version to TEXT version.
    SQLite stores values dynamically, so we just need to ensure the table
    schema uses TEXT. We rebuild the table to be clean.
    """
    cursor.execute("DROP TABLE IF EXISTS schema_version")
    cursor.execute('''
        CREATE TABLE schema_version (
            key TEXT PRIMARY KEY DEFAULT 'version',
            version TEXT NOT NULL
        )
    ''')
