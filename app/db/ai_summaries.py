"""
AI Summaries Database Operations
CRUD operations for the ai_summaries table.
"""
from app.db.connection import get_connection, get_connection_with_row


def add_ai_summary(transcription_id, prompt, summary, model, response_time=None, parent_id=None, input_text=None):
    """Add a new AI summary for a transcription."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO ai_summaries (transcription_id, prompt, summary, model, response_time, parent_id, input_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (transcription_id, prompt, summary, model, response_time, parent_id, input_text))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_ai_summaries(transcription_id):
    """Get all AI summaries for a transcription."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM ai_summaries WHERE transcription_id = ? ORDER BY timestamp DESC', (transcription_id,))
    rows = cursor.fetchall()
    conn.close()
    return rows


def clear_ai_summaries(transcription_id):
    """Delete all AI summaries for a transcription."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM ai_summaries WHERE transcription_id = ?', (transcription_id,))
    conn.commit()
    conn.close()


def delete_ai_summary(summary_id):
    """Delete a specific AI summary."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM ai_summaries WHERE id = ?', (summary_id,))
    conn.commit()
    conn.close()


def update_ai_summary(summary_id, summary):
    """Update a specific AI summary."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE ai_summaries SET summary = ? WHERE id = ?', (summary, summary_id))
    conn.commit()
    conn.close()


def count_ai_summaries(transcription_id):
    """Count AI summaries for a transcription."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM ai_summaries WHERE transcription_id = ?', (transcription_id,))
    count = cursor.fetchone()[0]
    conn.close()
    return count


def batch_count_ai_summaries(transcription_ids):
    """Count AI summaries for multiple transcription IDs in one query.
    Returns a dict mapping transcription_id -> count.
    """
    if not transcription_ids:
        return {}
    
    conn = get_connection()
    cursor = conn.cursor()
    placeholders = ','.join('?' * len(transcription_ids))
    cursor.execute(
        f'SELECT transcription_id, COUNT(*) as cnt FROM ai_summaries WHERE transcription_id IN ({placeholders}) GROUP BY transcription_id',
        list(transcription_ids)
    )
    result = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()
    return result


def get_ai_summaries_bulk(transcription_ids):
    """Get all AI summaries for multiple transcription IDs in one query.
    Returns a dict mapping transcription_id -> list of summary rows.
    """
    if not transcription_ids:
        return {}
    
    conn = get_connection_with_row()
    cursor = conn.cursor()
    placeholders = ','.join('?' * len(transcription_ids))
    cursor.execute(
        f'SELECT * FROM ai_summaries WHERE transcription_id IN ({placeholders}) ORDER BY timestamp DESC',
        transcription_ids
    )
    rows = cursor.fetchall()
    conn.close()
    
    result = {}
    for row in rows:
        tid = row['transcription_id']
        if tid not in result:
            result[tid] = []
        result[tid].append(row)
    return result
