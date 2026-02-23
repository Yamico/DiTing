from fastapi import APIRouter, HTTPException, Body
from typing import List, Optional
from pydantic import BaseModel
from app.db import (
    get_all_tags, create_tag, update_tag, delete_tag,
    set_video_tags, set_archived, batch_set_archived
)
from app.utils.source_utils import normalize_source_id

router = APIRouter(tags=["Tags"])

class TagCreate(BaseModel):
    name: str
    color: str = '#6366f1'

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

class VideoTagsUpdate(BaseModel):
    tag_ids: List[int]

@router.get("/tags")
async def list_tags():
    """Get all available tags."""
    return get_all_tags()

@router.post("/tags")
async def create_new_tag(tag: TagCreate):
    """Create a new tag."""
    try:
        tag_id = create_tag(tag.name, tag.color)
        return {"id": tag_id, "name": tag.name, "color": tag.color}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/tags/{tag_id}")
async def update_existing_tag(tag_id: int, tag: TagUpdate):
    """Update a tag's name or color."""
    try:
        update_tag(tag_id, name=tag.name, color=tag.color)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/tags/{tag_id}")
async def remove_tag(tag_id: int):
    """Delete a tag."""
    delete_tag(tag_id)
    return {"status": "success"}

@router.put("/videos/{source_id}/tags")
async def update_video_tags(source_id: str, payload: VideoTagsUpdate):
    """Set the list of tags for a video."""
    normalized_id = normalize_source_id(source_id)
    
    from app.db.video_meta import get_video_meta
    meta_record = get_video_meta(normalized_id)
    effective_source = normalized_id
    if not meta_record:
        meta_record = get_video_meta(source_id)
        if meta_record:
            effective_source = source_id

    set_video_tags(effective_source, payload.tag_ids)
    return {"status": "success"}


class BatchVideoTagsUpdate(BaseModel):
    source_ids: List[str]
    tag_ids: List[int]

@router.post("/videos/batch-tags")
async def batch_update_video_tags(payload: BatchVideoTagsUpdate):
    """Set the list of tags for multiple videos."""
    from app.db.video_meta import get_video_meta
    
    for source_id in payload.source_ids:
        try:
            normalized_id = normalize_source_id(source_id)
            meta_record = get_video_meta(normalized_id)
            effective_source = normalized_id
            if not meta_record:
                meta_record = get_video_meta(source_id)
                if meta_record:
                    effective_source = source_id
                    
            set_video_tags(effective_source, payload.tag_ids)
        except Exception as e:
            print(f"Failed to set tags for {source_id}: {e}")
            pass
            
    return {"status": "success"}

class ArchiveUpdate(BaseModel):
    is_archived: bool

@router.patch("/videos/{source_id}/archive")
async def update_video_archive(source_id: str, payload: ArchiveUpdate):
    """Set the archived status for a video."""
    normalized_id = normalize_source_id(source_id)
    
    from app.db.video_meta import get_video_meta
    meta_record = get_video_meta(normalized_id)
    effective_source = normalized_id
    if not meta_record:
        meta_record = get_video_meta(source_id)
        if meta_record:
            effective_source = source_id

    set_archived(effective_source, payload.is_archived)
    return {"status": "success"}

class BatchArchiveUpdate(BaseModel):
    source_ids: List[str]
    is_archived: bool

@router.post("/videos/batch-archive")
async def batch_update_video_archive(payload: BatchArchiveUpdate):
    """Set the archived status for multiple videos."""
    from app.db.video_meta import get_video_meta
    effective_ids = []
    
    for source_id in payload.source_ids:
        normalized_id = normalize_source_id(source_id)
        meta_record = get_video_meta(normalized_id)
        if meta_record:
            effective_ids.append(normalized_id)
        else:
            meta_record = get_video_meta(source_id)
            if meta_record:
                effective_ids.append(source_id)
            else:
                effective_ids.append(normalized_id) # fallback

    updated_count = batch_set_archived(effective_ids, payload.is_archived)
    return {"status": "success", "updated_count": updated_count}
