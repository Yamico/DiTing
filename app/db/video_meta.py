"""
Video Metadata Database Operations
CRUD operations for the video_meta table.
"""
from datetime import datetime
from app.db.connection import get_connection, get_connection_with_row
from app.core.logger import logger

def get_video_meta(source_id: str):
    """
    Get video metadata by source_id.
    Returns: sqlite3.Row or None
    """
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM video_meta WHERE source_id = ?', (source_id,))
    row = cursor.fetchone()
    conn.close()
    return row

def get_all_video_meta():
    """
    Get all video metadata records.
    Returns: list of sqlite3.Row
    """
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM video_meta ORDER BY updated_at DESC')
    rows = cursor.fetchall()
    conn.close()
    return rows

def upsert_video_meta(source_id: str, cache_expires_at=None, cache_policy=None, notes=None,
                      video_title=None, video_cover=None, source_type=None, stream_url=None, stream_expired=None,
                      reset_policy=False, original_source=None, is_archived=None):
    """
    Insert or update video metadata.
    Args:
        source_id: The unique source identifier
        cache_expires_at: datetime object or ISO string, or None
        cache_policy: 'keep_forever', 'custom', or None
        notes: user notes (markdown text), or None
        video_title: Video title (or None to skip update)
        video_cover: Video cover URL (or None to skip update)
        source_type: Source type (bilibili, youtube, file, etc) (or None to skip update)
        stream_url: Stream URL (or None to skip update)
        stream_expired: Boolean flag (or None to skip update)
        reset_policy: If True, resets cache_policy and cache_expires_at to NULL (Global Default)
        original_source: The original full source string (optional)
        is_archived: Boolean flag (or None to skip update)
    """
    
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check if exists
    cursor.execute('SELECT 1 FROM video_meta WHERE source_id = ?', (source_id,))
    exists = cursor.fetchone()
    
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    if exists:
        # Dynamic update based on provided fields
        updates = []
        params = []
        
        if reset_policy:
            # Force reset to NULL (Global Default)
            updates.append("cache_policy = NULL")
            updates.append("cache_expires_at = NULL")
        else:
            # Only update if provided and NOT resetting
            if cache_expires_at is not None:
                updates.append("cache_expires_at = ?")
                params.append(cache_expires_at)
                
            if cache_policy is not None:
                updates.append("cache_policy = ?")
                params.append(cache_policy)

        if notes is not None:
            updates.append("notes = ?")
            params.append(notes)

        if video_title is not None:
            updates.append("video_title = ?")
            params.append(video_title)

        if video_cover is not None:
            updates.append("video_cover = ?")
            params.append(video_cover)
            
        if source_type is not None:
            updates.append("source_type = ?")
            params.append(source_type)

        if stream_url is not None:
            updates.append("stream_url = ?")
            params.append(stream_url)

        if stream_expired is not None:
            updates.append("stream_expired = ?")
            params.append(stream_expired)

        if original_source is not None:
            updates.append("original_source = ?")
            params.append(original_source)

        if is_archived is not None:
            updates.append("is_archived = ?")
            params.append(is_archived)
            
        if updates:
            updates.append("updated_at = ?")
            params.append(now)
            params.append(source_id)
            
            sql = f"UPDATE video_meta SET {', '.join(updates)} WHERE source_id = ?"
            cursor.execute(sql, tuple(params))
    else:
        # Insert new
        # Default stream_expired to False if not provided
        if stream_expired is None:
            stream_expired = False
            
        cursor.execute('''
            INSERT INTO video_meta (source_id, cache_expires_at, cache_policy, notes, 
                                    video_title, video_cover, source_type, stream_url, stream_expired,
                                    original_source, is_archived,
                                    created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (source_id, cache_expires_at, cache_policy, notes, 
              video_title, video_cover, source_type, stream_url, stream_expired, 
              original_source, is_archived if is_archived is not None else 0,
              now, now))
        
    conn.commit()
    conn.close()


def update_video_metadata(source_id: str, title: str, cover: str):
    """Directly update title and cover for a video."""
    upsert_video_meta(source_id, video_title=title, video_cover=cover)


def mark_stream_expired(source_id: str):
    """Mark a stream URL as expired."""
    upsert_video_meta(source_id, stream_expired=True)

def update_cache_policy(source_id: str, policy: str):
    """Shortcut to update cache policy only."""
    if policy not in ['keep_forever', 'custom', None]:
        raise ValueError("Invalid cache policy")
    upsert_video_meta(source_id, cache_policy=policy)

def clear_cache_policy(source_id: str):
    """Reset cache policy to global default (NULL)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE video_meta 
        SET cache_policy = NULL, cache_expires_at = NULL, updated_at = ?
        WHERE source_id = ?
    ''', (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), source_id))
    conn.commit()
    conn.close()


def delete_video_meta(source_id: str):
    """Delete metadata for a specific video."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM video_meta WHERE source_id = ?', (source_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted

def set_archived(source_id: str, archived: bool):
    """Set the archived status for a specific video."""
    upsert_video_meta(source_id, is_archived=1 if archived else 0)

def batch_set_archived(source_ids: list[str], archived: bool):
    """Set the archived status for multiple videos."""
    if not source_ids:
        return 0
        
    conn = get_connection()
    cursor = conn.cursor()
    
    placeholders = ','.join(['?'] * len(source_ids))
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    params = [1 if archived else 0, now] + source_ids
    
    cursor.execute(f'''
        UPDATE video_meta 
        SET is_archived = ?, updated_at = ?
        WHERE source_id IN ({placeholders})
    ''', params)
    
    conn.commit()
    updated_count = cursor.rowcount
    conn.close()
    return updated_count


def query_video_list_with_stats(*, source_type: str = None, tag_id: int = None, exclude_tag_id: int = None):
    """
    Query video_meta joined with transcription stats.
    Returns raw rows as tuples for build_video_list_row().
    Pre-filters by source_type, tag_id, exclude_tag_id at the SQL/Python level.
    
    Each row: (source_id, original_source, source_type, video_title, video_cover,
               created_at, updated_at, is_archived, count, row_ids, latest_status,
               latest_timestamp, latest_asr_model, is_subtitle, is_analyzing_ai)
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Pre-fetch tag-based source_id sets
    valid_source_ids = None
    excluded_source_ids = None

    if tag_id:
        cursor.execute("SELECT source_id FROM video_tags WHERE tag_id = ?", (tag_id,))
        valid_source_ids = set(row[0] for row in cursor.fetchall())
    if exclude_tag_id:
        cursor.execute("SELECT source_id FROM video_tags WHERE tag_id = ?", (exclude_tag_id,))
        excluded_source_ids = set(row[0] for row in cursor.fetchall())

    query = '''
        WITH ranked_transcriptions AS (
            SELECT 
                source, id, status, asr_model, is_subtitle, ai_status, timestamp,
                ROW_NUMBER() OVER(PARTITION BY source ORDER BY id DESC) as rn
            FROM transcriptions
        ),
        latest_transcriptions AS (
            SELECT * FROM ranked_transcriptions WHERE rn = 1
        ),
        transcription_stats AS (
            SELECT 
                source,
                COUNT(*) as seg_count,
                GROUP_CONCAT(id) as row_ids,
                MAX(CASE WHEN ai_status IN ('queued', 'processing') THEN 1 ELSE 0 END) as has_ai_processing
            FROM transcriptions
            GROUP BY source
        )
        SELECT 
            vm.source_id, vm.original_source, vm.source_type,
            vm.video_title, vm.video_cover, vm.created_at, vm.updated_at, vm.is_archived,
            COALESCE(ts.seg_count, 0) as count, ts.row_ids,
            lt.status as latest_status, lt.timestamp as latest_timestamp,
            lt.asr_model as latest_asr_model,
            COALESCE(lt.is_subtitle, 0) as is_subtitle,
            COALESCE(ts.has_ai_processing, 0) as is_analyzing_ai
        FROM video_meta vm
        LEFT JOIN transcription_stats ts ON vm.source_id = ts.source
        LEFT JOIN latest_transcriptions lt ON vm.source_id = lt.source
    '''

    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    # Post-filter by source_type and tags (lightweight Python filtering)
    result = []
    for r in rows:
        cid = r[0]
        row_type = r[2] or 'bilibili'

        if source_type:
            if source_type == 'file':
                if row_type not in ['file', 'video', 'audio']:
                    continue
            elif row_type != source_type:
                continue

        if valid_source_ids is not None and cid not in valid_source_ids:
            continue
        if excluded_source_ids is not None and cid in excluded_source_ids:
            continue

        result.append(r)

    return result

