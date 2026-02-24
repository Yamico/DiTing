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
            # Schema is already correct from previous migrations.
            # Just upgrade the version column to TEXT and stamp new version.
            old_ver = _get_legacy_int_version(cursor)
            logger.info(f"⬆️ Database at v{old_ver} (legacy integer), upgrading to v{CURRENT_VERSION}...")
            _upgrade_version_column(cursor)
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
                    
                _set_version(cursor, CURRENT_VERSION)
                logger.info(f"✅ Upgraded to v{CURRENT_VERSION}.")
            else:
                logger.info(f"✅ Database schema is up-to-date (v{current}).")

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
