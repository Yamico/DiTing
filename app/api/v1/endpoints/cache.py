
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import requests

from app.db import save_transcription, upsert_video_meta, get_transcription_by_source
from app.utils.source_utils import normalize_source_id, infer_source_type
from app.services.cache_task import process_cache_task
from app.core.logger import logger

router = APIRouter(tags=["Cache Management"])

class BatchCacheRequest(BaseModel):
    urls: List[str]
    quality: Optional[str] = "best" 

@router.post("/cache/batch")
async def batch_cache_videos(payload: BatchCacheRequest, background_tasks: BackgroundTasks):
    """
    Batch cache multiple videos from URLs.
    Creates transcription records with 'pending' status and queues background download tasks.
    """
    urls = payload.urls
    quality = payload.quality
    results = []
    
    for url in urls:
        url = url.strip()
        if not url:
            continue
            
        # Resolve short URL (bilibili)
        if "b23.tv" in url:
            try:
                resp = requests.head(url, allow_redirects=True, timeout=5)
                url = resp.url
            except Exception as e:
                logger.warning(f"⚠️ Failed to resolve b23.tv URL: {url} - {e}")

        # Detect Source Type
        # Normalize Source ID first
        try:
            normalized_source = normalize_source_id(url)
        except Exception as e:
            logger.warning(f"⚠️ Normalization failed for {url}: {e}")
            normalized_source = url # Fallback

        # Detect Source Type from normalized ID (or fallback)
        source_type = infer_source_type(normalized_source)

        # Save Metadata (placeholder)
        upsert_video_meta(
            source_id=normalized_source,
            source_type=source_type,
            original_source=url,
            # We don't reset policy, we keep existing or default. 
            # If we want to ensure it's kept, we could set cache_policy='keep_forever' here?
            # User implies they want to "Cache" it.
            # But "Cache Only" might just mean "Download it now". 
            # Let's stick to global policy unless user specifies.
            # But the feature IS "Cache", so maybe ensuring it's kept is good?
            # Let's leave it to global/default for now.
        )
        
        # Create or reuse Transcription Record
        # If source already has records, reuse the latest one to avoid creating orphan segments
        existing = get_transcription_by_source(normalized_source)
        if existing:
            tid = existing['id']
            logger.info(f"♻️ Reusing existing record ID {tid} for cache task on {normalized_source}")
        else:
            tid = save_transcription(
                 source=normalized_source,
                 raw_text="",
                 source_type=source_type,
                 asr_model="Cache-Only",
                 status="pending"
            )
        
        # Queue Task
        background_tasks.add_task(
             process_cache_task,
             tid, # transcription_id
             url, # Original URL
             normalized_source,
             source_type,
             quality
        )
        
        results.append({"url": url, "id": tid, "status": "queued", "source_id": normalized_source})
        logger.info(f"💾 Queued Cache Task for {url} (ID: {tid})")
        
    return {"results": results}
