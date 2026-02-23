"""
Videos Router
Thin routing layer: parameter validation → service calls → responses.
Business logic lives in app/services/video_service.py.
"""
import os
import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
from starlette.concurrency import run_in_threadpool

from app.db import (
    get_transcription_by_source, mark_stream_expired,
    get_best_media_path_by_source, get_video_meta, upsert_video_meta,
    get_cache_entry,
)
from app.services.video_service import (
    delete_single_video, build_paginated_video_list, build_video_detail,
    refresh_metadata,
)
from app.core.logger import logger
from app.api.v1.endpoints.covers import download_and_cache_cover
from app.services.media_cache import MediaCacheService
from app.api.v1.endpoints.helpers import _format_cover_url
from app.utils.source_utils import normalize_source_id

router = APIRouter(tags=["Videos"])


# --- Video List & CRUD ---

@router.delete("/videos/{source_id}/cache")
async def delete_video_cache(source_id: str):
    """Manually delete media cache for a specific video."""
    deleted = await run_in_threadpool(MediaCacheService.delete_cache_for_video, source_id)
    from app.db.video_meta import clear_cache_policy
    clear_cache_policy(source_id)
    return {"status": "success", "deleted": deleted}


@router.get("/videos")
async def get_videos(
    page: int = 1,
    limit: int = 9,
    source_type: str = None,
    status: str = None,
    tag_id: int = None,
    exclude_tag_id: int = None,
    sort_by: str = 'time',
    has_segments: bool = None,
    has_ai: bool = None,
    has_cached: bool = None,
    is_subtitle: bool = None,
    include_archived: str = None,
    search: str = None,
):
    """Get aggregated video list (paginated), optionally filtered."""
    return await run_in_threadpool(
        build_paginated_video_list,
        format_cover=_format_cover_url,
        page=page,
        limit=limit,
        source_type=source_type,
        tag_id=tag_id,
        exclude_tag_id=exclude_tag_id,
        sort_by=sort_by,
        status=status,
        has_segments=has_segments,
        has_ai=has_ai,
        has_cached=has_cached,
        is_subtitle=is_subtitle,
        include_archived=include_archived,
        search=search,
    )


@router.post("/videos/{source_id}/refresh")
async def refresh_video_metadata(source_id: str):
    """Re-fetch video metadata and update DB."""
    try:
        return await refresh_metadata(source_id, _format_cover_url, download_and_cache_cover)
    except ValueError as e:
        status_code = 400
        msg = str(e)
        if "获取失败" in msg:
            status_code = 500
        raise HTTPException(status_code=status_code, detail=msg)


@router.post("/videos/{item_id}/expire")
async def expire_video_stream(item_id: int):
    """Mark a direct stream link as expired."""
    from app.db import get_transcription
    row = get_transcription(item_id)
    if row:
        mark_stream_expired(row['source'])
        logger.info(f"🚫 Stream marked as expired for Source: {row['source']} (via ID: {item_id})")
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Transcription not found")


@router.patch("/videos/{source_id}/cache-policy")
async def update_video_cache_policy(source_id: str, body: dict):
    """Update cache policy and expiration."""
    source_id = normalize_source_id(source_id)
    policy = body.get('cache_policy')
    expires = body.get('cache_expires_at')

    if policy not in ['keep_forever', 'custom', None]:
        raise HTTPException(status_code=400, detail="Invalid cache policy")

    if policy is None:
        upsert_video_meta(source_id, reset_policy=True)
        logger.info(f"💾 Reset cache policy for {source_id} to Global Default")
    else:
        upsert_video_meta(source_id, cache_policy=policy, cache_expires_at=expires)
        logger.info(f"💾 Updated cache policy for {source_id}: {policy} (Expires: {expires})")

    return {"status": "success"}


@router.patch("/videos/{source_id}/notes")
async def update_video_notes(source_id: str, body: dict):
    """Update video notes."""
    source_id = normalize_source_id(source_id)
    notes = body.get('notes', '')
    upsert_video_meta(source_id, notes=notes)
    logger.info(f"📝 Updated notes for {source_id}")
    return {"status": "success"}


@router.delete("/videos/{source_id}")
async def delete_video_history(source_id: str):
    """Delete all records for a specific video."""
    meta_deleted, count = delete_single_video(source_id)
    if count == 0 and not meta_deleted:
        raise HTTPException(status_code=404, detail="No records found for this video")
    return {"status": "success", "deleted_count": count}


class BatchDeleteRequest(BaseModel):
    source_ids: List[str]

@router.post("/videos/batch-delete")
async def batch_delete_videos(payload: BatchDeleteRequest):
    """Batch delete multiple videos."""
    deleted_count = 0
    failed_ids = []
    for source_id in payload.source_ids:
        try:
            meta_deleted, trans_count = delete_single_video(source_id)
            if trans_count > 0 or meta_deleted:
                deleted_count += 1
        except Exception as e:
            logger.error(f"Failed to delete {source_id}: {e}")
            failed_ids.append(source_id)
    return {"status": "success", "deleted_count": deleted_count, "failed_ids": failed_ids}


# --- Video Detail & Media (parameterized routes AFTER static routes) ---

@router.get("/videos/{source_id}/media")
async def get_video_media(source_id: str, quality: str = None):
    """Serve local cached media file. Supports specific quality version."""
    source_id = normalize_source_id(source_id)
    logger.info(f"🎥 Fetching media for source_id: {source_id} (quality={quality})")

    row_data = get_transcription_by_source(source_id)
    if not row_data:
        meta = get_video_meta(source_id)
        if not meta:
            raise HTTPException(status_code=404, detail="Video not found")

    media_path = None
    if quality:
        entry = get_cache_entry(source_id, quality)
        if entry:
            media_path = entry['media_path']
        else:
            raise HTTPException(status_code=404, detail=f"Quality '{quality}' is not cached")
    else:
        media_path = get_best_media_path_by_source(source_id)

    if not media_path:
        raise HTTPException(status_code=404, detail="No local media cached for this video")
    if not os.path.exists(media_path):
        raise HTTPException(status_code=404, detail="Media file missing from disk")

    mime_type, _ = mimetypes.guess_type(media_path)
    logger.info(f"✅ Serving media: {media_path} ({mime_type})")
    return FileResponse(
        media_path,
        media_type=mime_type or "application/octet-stream",
        filename=os.path.basename(media_path),
    )


@router.get("/videos/{source_id}")
async def get_video_details(source_id: str):
    """Get full details for a specific video by source_id."""
    detail = build_video_detail(source_id, _format_cover_url)
    if not detail:
        raise HTTPException(status_code=404, detail="Video not found")
    return detail
