"""
Segments Router
Handles: Segment CRUD, pin/unpin
"""
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import (
    delete_transcription,
    get_ai_summaries, get_ai_summaries_bulk,
    update_transcription_text, get_all_transcriptions_by_source,
    update_transcription_is_pinned
)
from app.core.logger import logger
from app.schemas import SegmentUpdate
from app.utils.source_utils import normalize_source_id

router = APIRouter(tags=["Segments"])


# --- Segments (RESTful) ---
# IMPORTANT: Static routes like /videos/segments MUST be defined BEFORE
# parameterized routes like /videos/{source_id}, otherwise FastAPI will
# match "segments" as a source_id parameter.

@router.get("/videos/segments")
async def get_video_segments(source_id: str):
    """Get all segments for a specific video"""
    source_id = normalize_source_id(source_id)
    logger.info(f"🔍 Fetching segments for source_id: {source_id}")
    rows = get_all_transcriptions_by_source(source_id)
    logger.info(f"🔍 Found {len(rows)} segments for {source_id}")
    
    # Batch fetch all AI summaries in one query (avoids N+1)
    row_ids = [row['id'] for row in rows]
    all_summaries = get_ai_summaries_bulk(row_ids)
    
    segments = []
    
    for row in rows:
        # Filter out empty segments (safety net for legacy data or incomplete tasks)
        # if not row['raw_text'] and row['status'] in ['bookmarked', 'cached', 'downloading', 'pending']:
        #     continue
            
        ai_stat = row['ai_status'] if 'ai_status' in row.keys() else None
        summaries = all_summaries.get(row['id'], [])
        
        segments.append({
            "id": row['id'],
            # Prefer original source for display if available
            "source": row['original_source'] or row['source'],
            "raw_text": row['raw_text'],
            "text": re.sub(r'<\|.*?\|>', '', row['raw_text']),
            "timestamp": row['timestamp'],
            "segment_start": row['segment_start'],
            "segment_end": row['segment_end'],
            "has_ai": bool(row['ai_summary']),
            "ai_status": ai_stat,
            "asr_model": row['asr_model'] if 'asr_model' in row.keys() else None,
            "is_subtitle": row['is_subtitle'] if 'is_subtitle' in row.keys() else 0,
            "is_pinned": row['is_pinned'] if 'is_pinned' in row.keys() else 0,
            "status": row['status'] if 'status' in row.keys() else 'completed',
            "summaries": [dict(s) for s in summaries]
        })
    
    return segments







@router.get("/segments/{segment_id}")
async def get_segment(segment_id: int):
    """Get a specific segment details"""
    from app.db import get_transcription
    row = get_transcription(segment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    # We need summaries too
    summaries = get_ai_summaries(segment_id)
    
    return {
        "id": row['id'],
        "source": row['source'],
        "raw_text": row['raw_text'],
        "text": re.sub(r'<\|.*?\|>', '', row['raw_text']),
        "timestamp": row['timestamp'],
        "segment_start": row['segment_start'],
        "segment_end": row['segment_end'],
        "has_ai": bool(row['ai_summary']),
        "ai_summary": row['ai_summary'],
        "ai_status": row['ai_status'],
        "status": row['status'],
        "is_pinned": row['is_pinned'],
        "summaries": [dict(s) for s in summaries]
    }


@router.patch("/segments/{segment_id}")
async def update_segment(segment_id: int, payload: SegmentUpdate):
    """Update segment text"""
    new_text = payload.content
    if not new_text:
        raise HTTPException(status_code=400, detail="Missing raw_text or text field")
    
    update_transcription_text(segment_id, new_text)
    return {"status": "success"}


@router.delete("/segments/{segment_id}")
async def delete_segment(segment_id: int):
    """Delete a specific segment"""
    deleted = delete_transcription(segment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Segment not found")
    return {"status": "success"}


class PinSegmentRequest(BaseModel):
    is_pinned: bool = True

@router.patch("/segments/{segment_id}/pin")
async def toggle_segment_pin(segment_id: int, payload: PinSegmentRequest):
    """Pin or unpin a specific segment"""
    from app.db import get_transcription
    row = get_transcription(segment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Segment not found")
        
    update_transcription_is_pinned(segment_id, row['source'], payload.is_pinned)
    return {"status": "success", "is_pinned": payload.is_pinned}

