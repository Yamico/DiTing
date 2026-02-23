"""
Search Database Operations
Basic LIKE-based search for transcripts.
"""
from app.db.connection import get_connection_with_row


def search_transcriptions(query: str, limit: int = 50):
    """
    Search across transcripts using LIKE operator.
    
    Args:
        query: Search query
        limit: Maximum results to return
        
    Returns:
        List of matching transcriptions with snippets
    """
    if not query or not query.strip():
        return []
    
    conn = get_connection_with_row()
    cursor = conn.cursor()
    
    # Clean query
    safe_query = query.strip()
    
    try:
        cursor.execute('''
            SELECT 
                t.id,
                t.source,
                vm.video_title,
                vm.video_cover,
                vm.source_type,
                t.timestamp,
                t.raw_text
            FROM transcriptions t
            LEFT JOIN video_meta vm ON t.source = vm.source_id
            WHERE t.raw_text LIKE ?
            ORDER BY t.timestamp DESC
            LIMIT ?
        ''', (f'%{safe_query}%', limit))
        
        results = []
        for row in cursor.fetchall():
            # Generate a manual snippet
            text = row['raw_text']
            snippet_text = text
            if safe_query.lower() in text.lower():
                idx = text.lower().find(safe_query.lower())
                start = max(0, idx - 15)
                end = min(len(text), idx + len(safe_query) + 15)
                prefix = "..." if start > 0 else ""
                suffix = "..." if end < len(text) else ""
                
                # Simple highlighting
                match_text = text[idx:idx+len(safe_query)]
                snippet_text = f"{prefix}{text[start:idx]}<mark>{match_text}</mark>{text[idx+len(safe_query):end]}{suffix}"
            elif len(text) > 32:
                snippet_text = text[:32] + "..."
                
            results.append({
                'id': row['id'],
                'source': row['source'],
                'title': row['video_title'] or 'Untitled',
                'cover': row['video_cover'],
                'source_type': row['source_type'],
                'timestamp': row['timestamp'],
                'snippet': snippet_text,
                'score': 1.0
            })
        
        return results
    except Exception as e:
        # If search query fails, return empty (don't crash)
        print(f"Search error: {e}")
        return []
    finally:
        conn.close()
