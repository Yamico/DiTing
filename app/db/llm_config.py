"""
LLM Configuration Database Operations
CRUD operations for llm_configs, llm_providers, and llm_models tables.
"""
from app.db.connection import get_connection, get_connection_with_row


# --- Legacy LLM Config Operations ---
# Removed


def get_all_providers(include_models=False):
    """Get all LLM providers, optionally with their models."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM llm_providers')
    providers = [dict(row) for row in cursor.fetchall()]
    
    if include_models:
        for p in providers:
            cursor.execute('SELECT * FROM llm_models WHERE provider_id = ?', (p['id'],))
            p['models'] = [dict(m) for m in cursor.fetchall()]
            
    conn.close()
    return providers


def add_provider(name, base_url, api_key, api_type='chat_completions'):
    """Add a new LLM provider."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO llm_providers (name, base_url, api_key, api_type) VALUES (?, ?, ?, ?)", (name, base_url, api_key, api_type))
    pid = cursor.lastrowid
    conn.commit()
    conn.close()
    return pid


def update_provider(pid, name, base_url, api_key, api_type='chat_completions'):
    """Update an LLM provider."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE llm_providers SET name=?, base_url=?, api_key=?, api_type=? WHERE id=?", (name, base_url, api_key, api_type, pid))
    conn.commit()
    conn.close()


def delete_provider(pid):
    """Delete an LLM provider."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM llm_providers WHERE id=?", (pid,))
    conn.commit()
    conn.close()


def add_model(provider_id, model_name):
    """Add a model to a provider."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO llm_models (provider_id, model_name) VALUES (?, ?)", (provider_id, model_name))
    mid = cursor.lastrowid
    conn.commit()
    conn.close()
    return mid


def update_model(mid, model_name):
    """Update a model's name."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE llm_models SET model_name=? WHERE id=?", (model_name, mid))
    conn.commit()
    conn.close()


def delete_model(mid):
    """Delete a model."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM llm_models WHERE id=?", (mid,))
    conn.commit()
    conn.close()


def set_active_model(model_id):
    """Set the active LLM model."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE llm_models SET is_active = 0")
    cursor.execute("UPDATE llm_models SET is_active = 1 WHERE id=?", (model_id,))
    conn.commit()
    conn.close()


def get_active_model_full():
    """Get full info for the active model including provider details."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT m.model_name, p.base_url, p.api_key, p.name as provider_name, p.api_type 
        FROM llm_models m 
        JOIN llm_providers p ON m.provider_id = p.id 
        WHERE m.is_active = 1 LIMIT 1
    """)
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_llm_model_full_by_id(model_id):
    """Get full info for a specific model by ID."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT m.model_name, p.base_url, p.api_key, p.name as provider_name, p.api_type 
        FROM llm_models m 
        JOIN llm_providers p ON m.provider_id = p.id 
        WHERE m.id = ?
    """, (model_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None
