from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os
from app.db.transcriptions import get_transcription
from app.db.media_cache_entries import get_best_cache_path
from app.core.config import settings

router = APIRouter()

@router.get("/{transcription_id}")
async def get_media_file(transcription_id: int):
    """
    Stream the cached media file for a transcription.
    v9: Uses media_cache_entries table.
    """
    row = get_transcription(transcription_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transcription not found")
    
    # v9: Look up cache by source_id in media_cache_entries
    source = row['source']
    media_path, quality = get_best_cache_path(source)
    
    if not media_path:
        raise HTTPException(status_code=404, detail="No cached media for this item")
    
    # Construct full path
    full_path = os.path.abspath(media_path)
    
    # Security check: ensure it's inside MEDIA_CACHE_DIR
    cache_dir_abs = os.path.abspath(settings.MEDIA_CACHE_DIR)
    if not full_path.startswith(cache_dir_abs):
        if not os.path.exists(full_path):
            raise HTTPException(status_code=404, detail="Media file missing from disk")

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Media file missing from disk")
        
    return FileResponse(
        full_path, 
        media_type="video/mp4",
        filename=os.path.basename(full_path),
        headers={"Accept-Ranges": "bytes"}
    )
