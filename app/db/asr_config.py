"""
ASR Model Configuration Database Operations
CRUD operations for the asr_models table.
"""
from app.db.connection import get_connection, get_connection_with_row


def add_asr_model(name, engine, config_json, is_active=0):
    """Add a new ASR model configuration."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO asr_models (name, engine, config, is_active) VALUES (?, ?, ?, ?)", 
                   (name, engine, config_json, is_active))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id


def get_asr_models():
    """Get all ASR model configurations."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM asr_models")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def delete_asr_model(model_id):
    """Delete an ASR model configuration."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM asr_models WHERE id = ?", (model_id,))
    conn.commit()
    conn.close()


def set_active_asr_model(model_id):
    """Set the active ASR model for its engine type."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Get engine of model to be activated
    cursor.execute("SELECT engine FROM asr_models WHERE id = ?", (model_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return
        
    engine_type = row[0]
    
    # Deactivate only models of this engine
    cursor.execute("UPDATE asr_models SET is_active = 0 WHERE engine = ?", (engine_type,))
    cursor.execute("UPDATE asr_models SET is_active = 1 WHERE id = ?", (model_id,))
    conn.commit()
    conn.close()


def get_active_asr_model():
    """Get any active ASR model (legacy)."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM asr_models WHERE is_active = 1 LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_active_model_for_engine(engine_type):
    """Get the active ASR model for a specific engine."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM asr_models WHERE is_active = 1 AND engine = ? LIMIT 1", (engine_type,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_asr_model(model_id, name, engine, config_json):
    """Update an ASR model configuration."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE asr_models SET name = ?, engine = ?, config = ? WHERE id = ?", 
                   (name, engine, config_json, model_id))
    conn.commit()
    conn.close()


def get_first_asr_model_by_engine(engine_type):
    """Get the first ASR model for a specific engine (fallback)."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM asr_models WHERE engine = ? LIMIT 1", (engine_type,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None
