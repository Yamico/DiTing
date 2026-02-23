"""
System Configuration Database Operations
Key-value store for system settings.
"""
from app.db.connection import get_connection


def get_system_config(key, default=None):
    """Get a system configuration value."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM system_configs WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else default


def set_system_config(key, value):
    """Set a system configuration value."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO system_configs (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()
