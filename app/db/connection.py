"""
Database Connection Module
Provides DB path and connection helpers for all db modules.
"""
import sqlite3
from app.core.config import settings

def get_connection():
    """Get a new database connection."""
    # Ensure dir exists (already done in config.py but safe to keep)
    return sqlite3.connect(settings.DB_PATH)


def get_connection_with_row():
    """Get a connection with Row factory for dict-like access."""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    return conn
