"""
Media Cache Entries Database Operations
CRUD operations for the media_cache_entries table.
Supports multiple cache versions (quality) per source_id.
"""
import os
from datetime import datetime
from app.db.connection import get_connection, get_connection_with_row
from app.core.logger import logger


def get_cache_entries(source_id: str):
    """
    Get all cache entries for a source_id.
    Returns: list of sqlite3.Row
    """
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT * FROM media_cache_entries WHERE source_id = ? ORDER BY cached_at DESC',
        (source_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return rows


def batch_get_cache_counts(source_ids: list):
    """
    Get cache entry counts for multiple source_ids in one query.
    Returns: dict mapping source_id -> count
    """
    if not source_ids:
        return {}
    
    conn = get_connection()
    cursor = conn.cursor()
    placeholders = ','.join('?' * len(source_ids))
    cursor.execute(
        f'SELECT source_id, COUNT(*) as cnt FROM media_cache_entries WHERE source_id IN ({placeholders}) GROUP BY source_id',
        list(source_ids)
    )
    result = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()
    return result


def get_cache_entry(source_id: str, quality: str):
    """
    Get a specific cache entry by source_id + quality.
    Returns: sqlite3.Row or None
    """
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute(
        'SELECT * FROM media_cache_entries WHERE source_id = ? AND quality = ?',
        (source_id, quality)
    )
    row = cursor.fetchone()
    conn.close()
    return row


def get_all_cache_entries():
    """
    Get all cache entries with video_meta title info.
    Returns: list of sqlite3.Row
    """
    conn = get_connection_with_row()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT e.*, m.video_title, m.video_cover, m.source_id as meta_source_id,
               m.cache_policy, m.cache_expires_at
        FROM media_cache_entries e
        LEFT JOIN video_meta m ON e.source_id = m.source_id
        ORDER BY e.cached_at DESC
    ''')
    rows = cursor.fetchall()
    conn.close()
    return rows


def upsert_cache_entry(source_id: str, quality: str, media_path: str, file_size: int = 0):
    """
    Insert or update a cache entry.
    Uses UNIQUE(source_id, quality) constraint for upsert.
    """
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute('''
        INSERT INTO media_cache_entries (source_id, quality, media_path, file_size, cached_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_id, quality) DO UPDATE SET
            media_path = excluded.media_path,
            file_size = excluded.file_size,
            cached_at = excluded.cached_at
    ''', (source_id, quality, media_path, file_size, now))
    
    conn.commit()
    conn.close()
    logger.debug(f"💾 Upserted cache entry: {source_id} [{quality}] -> {media_path}")


def delete_cache_entry(source_id: str, quality: str):
    """Delete a specific cache entry."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        'DELETE FROM media_cache_entries WHERE source_id = ? AND quality = ?',
        (source_id, quality)
    )
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def delete_all_cache_entries(source_id: str):
    """Delete all cache entries for a source_id."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        'DELETE FROM media_cache_entries WHERE source_id = ?',
        (source_id,)
    )
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count


def get_best_cache_path(source_id: str, priority_mode: str = 'playback'):
    """
    Get the best available cache path for a source_id.
    
    Args:
        source_id: The source ID to look for.
        priority_mode: 'playback' or 'transcription'.
                       'playback' prefers video (best > video > worst > audio_only).
                       'transcription' prefers audio (audio_only > best > video > worst) for speed.
                       
    Returns: (media_path, quality) tuple or (None, None)
    """
    conn = get_connection_with_row()
    cursor = conn.cursor()
    
    # Determine priority order
    if priority_mode == 'transcription':
        # Prefer audio_only for faster processing/less overhead, then fallback to others
        priorities = ['audio_only', 'worst', 'medium', 'best', 'video']
    else:
        # Default/Playback: prefer video
        priorities = ['best', 'medium', 'video', 'worst', 'audio_only']
    
    # Try in priority order
    for quality in priorities:
        cursor.execute(
            'SELECT media_path, quality FROM media_cache_entries WHERE source_id = ? AND quality = ?',
            (source_id, quality)
        )
        row = cursor.fetchone()
        if row and row['media_path']:
            full_path = os.path.join(os.getcwd(), row['media_path'])
            if os.path.exists(full_path):
                # logger.debug(f"Matches existing file: {full_path}")
                conn.close()
                return row['media_path'], quality
            else:
                logger.warning(f"⚠️ Cache entry found but file missing: {full_path}")
    
    # Fallback: if no priority match, get ANY available cache (latest)
    # This handles dynamic quality tags like "1080p", "720p" etc.
    cursor.execute(
        'SELECT media_path, quality FROM media_cache_entries WHERE source_id = ? ORDER BY cached_at DESC LIMIT 1',
        (source_id,)
    )
    row = cursor.fetchone()
    if row and row['media_path']:
        full_path = os.path.join(os.getcwd(), row['media_path'])
        if os.path.exists(full_path):
             conn.close()
             return row['media_path'], row['quality']
    
    conn.close()
    return None, None


def get_cache_stats():
    """
    Get aggregate cache statistics.
    Returns: dict with total_count, total_size, by_quality breakdown
    """
    conn = get_connection_with_row()
    cursor = conn.cursor()
    
    # Total stats
    cursor.execute('SELECT COUNT(*) as cnt, COALESCE(SUM(file_size), 0) as total FROM media_cache_entries')
    total = cursor.fetchone()
    
    # By quality
    cursor.execute('''
        SELECT quality, COUNT(*) as cnt, COALESCE(SUM(file_size), 0) as total
        FROM media_cache_entries
        GROUP BY quality
    ''')
    by_quality = cursor.fetchall()
    
    conn.close()
    
    return {
        'total_count': total['cnt'],
        'total_size': total['total'],
        'by_quality': [{'quality': r['quality'], 'count': r['cnt'], 'size': r['total']} for r in by_quality]
    }
