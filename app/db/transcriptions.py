"""
Transcriptions Database Operations
CRUD operations for the transcriptions table.
"""
from datetime import datetime
from app.db.connection import get_connection, get_connection_with_row


def save_transcription(source, raw_text, segment_start=0, segment_end=None, 
                       asr_model=None, is_subtitle=False, status='completed'):
    """Save a new transcription record."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO transcriptions (source, raw_text, timestamp, segment_start, segment_end, 
                                    asr_model, is_subtitle, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (source, raw_text, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), segment_start, segment_end, 
          asr_model, is_subtitle, status))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def get_history():
    """Get all transcriptions ordered by timestamp descending."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT t.*, 
               vm.video_title, vm.video_cover, vm.stream_url, vm.stream_expired,
               vm.cache_expires_at, vm.cache_policy, vm.notes,
               vm.original_source
        FROM transcriptions t
        LEFT JOIN video_meta vm ON t.source = vm.source_id
        ORDER BY t.timestamp DESC
    ''')
    rows = cursor.fetchall()
    conn.close()
    return rows


def delete_transcription(item_id):
    """Delete a transcription by ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM transcriptions WHERE id = ?', (item_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def delete_transcriptions_by_source(source_id):
    """Delete all transcriptions where source matches the ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM transcriptions WHERE source = ?', (source_id,))
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count


def update_transcription_text(item_id, new_text):
    """Update the raw_text of a transcription."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE transcriptions SET raw_text = ? WHERE id = ?", (new_text, item_id))
    conn.commit()
    conn.close()


def update_transcription_timestamp(item_id):
    """Refresh timestamp to bring transcription to top of history."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE transcriptions SET timestamp = ? WHERE id = ?", 
                   (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), item_id))
    conn.commit()
    conn.close()


def get_transcription_by_source(source_id):
    """Find the most recent transcription matching a source ID."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT t.*, 
               vm.video_title, vm.video_cover, vm.stream_url, vm.stream_expired,
               vm.cache_expires_at, vm.cache_policy, vm.notes,
               vm.original_source
        FROM transcriptions t
        LEFT JOIN video_meta vm ON t.source = vm.source_id
        WHERE t.source = ? 
        ORDER BY t.timestamp DESC 
        LIMIT 1
    ''', (source_id,))
    row = cursor.fetchone()
    conn.close()
    return row


def update_analysis(item_id, prompt, summary, llm_model=None):
    """Update AI analysis fields (legacy)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE transcriptions 
        SET user_prompt = ?, ai_summary = ?, llm_model = ?
        WHERE id = ?
    ''', (prompt, summary, llm_model, item_id))
    conn.commit()
    conn.close()





def update_task_status(item_id, status):
    """Update the status of a transcription task."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE transcriptions SET status = ? WHERE id = ?", (status, item_id))
    conn.commit()
    conn.close()


def update_ai_status(item_id, status):
    """Update the AI analysis status of a transcription."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE transcriptions SET ai_status = ? WHERE id = ?", (status, item_id))
    conn.commit()
    conn.close()





def get_transcription(item_id):
    """Get a transcription by ID."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT t.*, 
               vm.video_title, vm.video_cover, vm.stream_url, vm.stream_expired,
               vm.cache_expires_at, vm.cache_policy, vm.notes,
               vm.original_source
        FROM transcriptions t
        LEFT JOIN video_meta vm ON t.source = vm.source_id
        WHERE t.id = ?
    ''', (item_id,))
    row = cursor.fetchone()
    conn.close()
    return row


def update_transcription_asr_model(item_id, model_name):
    """Update the ASR model used for a transcription."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE transcriptions SET asr_model = ? WHERE id = ?", (model_name, item_id))
    conn.commit()
    conn.close()


def update_transcription_is_subtitle(item_id, is_subtitle=True):
    """Update the is_subtitle flag of a transcription."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE transcriptions SET is_subtitle = ? WHERE id = ?", (1 if is_subtitle else 0, item_id))
    conn.commit()
    conn.close()


def get_all_transcriptions_by_source(source_id):
    """Find all transcriptions matching a source ID."""
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT t.*, 
               vm.video_title, vm.video_cover, vm.stream_url, vm.stream_expired,
               vm.cache_expires_at, vm.cache_policy, vm.notes,
               vm.original_source
        FROM transcriptions t
        LEFT JOIN video_meta vm ON t.source = vm.source_id
        WHERE t.source = ? 
        ORDER BY t.is_pinned DESC, t.timestamp DESC
    ''', (source_id,))
    rows = cursor.fetchall()
    conn.close()
    return rows


def get_best_media_path_by_source(source: str):
    """
    Find the most relevant media_path for a source.
    v9: Uses media_cache_entries table with quality priority.
    Returns the media_path string if found, else None.
    """
    from app.db.media_cache_entries import get_best_cache_path
    path, _ = get_best_cache_path(source)
    return path


def update_transcription_is_pinned(item_id, source_id, is_pinned=True):
    """Update the is_pinned flag of a transcription. Guarantees only one pinned item per source."""
    conn = get_connection()
    cursor = conn.cursor()
    
    if is_pinned:
        # Unpin all others for this source
        cursor.execute("UPDATE transcriptions SET is_pinned = 0 WHERE source = ?", (source_id,))
        
    cursor.execute("UPDATE transcriptions SET is_pinned = ? WHERE id = ?", (1 if is_pinned else 0, item_id))
    conn.commit()
    conn.close()
