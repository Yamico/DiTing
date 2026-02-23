"""
Search Router
Handles: Full-text search across transcriptions
"""
from fastapi import APIRouter, Query

from app.db import search_transcriptions

router = APIRouter(prefix="/search", tags=["Search"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(50, ge=1, le=200, description="Max results")
):
    """
    Full-text search across all transcriptions.
    
    Supports FTS5 query syntax:
    - Simple words: `python tutorial`
    - Phrase: `"machine learning"`
    - Boolean: `python AND tutorial`
    - Prefix: `prog*`
    """
    results = search_transcriptions(q, limit)
    return {
        "query": q,
        "count": len(results),
        "results": results
    }
