"""
CRUD operations for the tags and video_tags tables.
"""
import sqlite3
from typing import List, Dict, Optional
from app.db.connection import get_connection
from app.core.logger import logger

def get_all_tags() -> List[Dict]:
    """Get all tags ordered by sort_order."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, color, sort_order FROM tags ORDER BY sort_order ASC, id ASC")
        rows = cursor.fetchall()
        return [
            {"id": r[0], "name": r[1], "color": r[2], "sort_order": r[3]}
            for r in rows
        ]
    finally:
        conn.close()

def create_tag(name: str, color: str = '#6366f1') -> int:
    """Create a new tag. Returns the new tag ID."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO tags (name, color) VALUES (?, ?)",
            (name, color)
        )
        tag_id = cursor.lastrowid
        conn.commit()
        return tag_id
    except sqlite3.IntegrityError:
        # Tag name already exists
        conn.rollback()
        raise ValueError(f"Tag with name '{name}' already exists")
    finally:
        conn.close()

def update_tag(tag_id: int, name: Optional[str] = None, color: Optional[str] = None):
    """Update a tag's name or color."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        updates = []
        params = []
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        if color is not None:
            updates.append("color = ?")
            params.append(color)
        
        if not updates:
            return

        params.append(tag_id)
        cursor.execute(f"UPDATE tags SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ValueError(f"Tag with name '{name}' already exists")
    finally:
        conn.close()

def delete_tag(tag_id: int):
    """Delete a tag. Cascade deletes associations in video_tags."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # PRAGMA foreign_keys is usually on, but explicit delete is safer if not
        cursor.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
        conn.commit()
    finally:
        conn.close()

def get_tags_for_video(source_id: str) -> List[Dict]:
    """Get all tags for a specific video."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT t.id, t.name, t.color
            FROM tags t
            JOIN video_tags vt ON t.id = vt.tag_id
            WHERE vt.source_id = ?
            ORDER BY t.sort_order ASC
        """, (source_id,))
        rows = cursor.fetchall()
        return [
            {"id": r[0], "name": r[1], "color": r[2]}
            for r in rows
        ]
    finally:
        conn.close()

def set_video_tags(source_id: str, tag_ids: List[int]):
    """Set the list of tags for a video (replace existing)."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # 1. Delete existing
        cursor.execute("DELETE FROM video_tags WHERE source_id = ?", (source_id,))
        
        # 2. Insert new
        if tag_ids:
            cursor.executemany(
                "INSERT INTO video_tags (source_id, tag_id) VALUES (?, ?)",
                [(source_id, tid) for tid in tag_ids]
            )
        conn.commit()
    finally:
        conn.close()

def add_tag_to_video(source_id: str, tag_id: int):
    """Add a single tag to a video (idempotent)."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT OR IGNORE INTO video_tags (source_id, tag_id) VALUES (?, ?)",
            (source_id, tag_id)
        )
        conn.commit()
    finally:
        conn.close()

def remove_tag_from_video(source_id: str, tag_id: int):
    """Remove a single tag from a video."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM video_tags WHERE source_id = ? AND tag_id = ?",
            (source_id, tag_id)
        )
        conn.commit()
    finally:
        conn.close()

def batch_get_video_tags(source_ids: List[str]) -> Dict[str, List[Dict]]:
    """
    Get tags for multiple videos in one query.
    Returns: { source_id: [{id, name, color}, ...] }
    """
    if not source_ids:
        return {}
        
    conn = get_connection()
    cursor = conn.cursor()
    try:
        placeholders = ','.join(['?'] * len(source_ids))
        cursor.execute(f"""
            SELECT vt.source_id, t.id, t.name, t.color
            FROM video_tags vt
            JOIN tags t ON vt.tag_id = t.id
            WHERE vt.source_id IN ({placeholders})
            ORDER BY t.sort_order ASC
        """, source_ids)
        
        results = {}
        for row in cursor.fetchall():
            sid, tid, tname, tcolor = row
            if sid not in results:
                results[sid] = []
            results[sid].append({"id": tid, "name": tname, "color": tcolor})
            
        return results
    finally:
        conn.close()
