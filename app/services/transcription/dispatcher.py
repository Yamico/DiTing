"""
Transcription Dispatcher
Handles the orchestration of transcription requests:
1. Resolves ASR engine
2. Normalizes source ID
3. Saves video metadata
4. Creates transcription record
5. Dispatches background task
"""
from fastapi import BackgroundTasks
from starlette.concurrency import run_in_threadpool
from app.db import (
    save_transcription,
    upsert_video_meta,
    get_system_config
)
from app.asr.client import asr_client
from app.utils.source_utils import normalize_source_id
from app.core.logger import logger
from app.services.transcription import (
    process_bilibili_transcription,
    process_youtube_transcription,
    process_douyin_transcription,
    process_network_transcription,
    process_file_transcription
)
from app.api.v1.endpoints.covers import download_and_cache_cover

def get_current_asr_info():
    """Resolve ASR engine info from settings and client availability"""
    try:
        engine_key = asr_client.select_worker()
        display_name = f"{engine_key.capitalize()}"
        if engine_key in ["bailian", "paraformer"]:
            if engine_key == "bailian":
                try:
                    from app.db.asr_config import get_active_model_for_engine
                    import json
                    db_config = get_active_model_for_engine("bailian")
                    if db_config:
                        cfg = json.loads(db_config["config"])
                        model_name = cfg.get("model_name", "paraformer-realtime-v2")
                        if model_name:
                            display_name = f"Bailian ({model_name})"
                        else:
                            display_name += " (Cloud)"
                    else:
                        display_name += " (Cloud)"
                except Exception as e:
                    logger.warning(f"Error getting Bailian model name: {e}")
                    display_name += " (Cloud)"
            else:
                display_name += " (Cloud)"
        return engine_key, display_name
    except Exception:
        return "none", "No Engine Available"

async def create_and_dispatch(
    background_tasks: BackgroundTasks,
    *,
    source_id: str,
    original_source: str,
    source_type: str,
    title: str,
    cover: str,
    task_type: str = "transcribe",
    bookmark_only: bool = False,
    # ASR params
    use_uvr: bool = False,
    language: str = "zh",
    prompt: str = None,
    output_format: str = None,
    # Source-specific
    stream_url: str = None,
    segment_start: float = None,
    segment_end: float = None,
    # For local files / network / douyin
    file_path: str = None,
    direct_url: str = None,
    # For UploadFile
    covers_dir: str = None,
    quality: str = "best",
    local_file_path: str = None,
    only_get_subtitles: bool = False,
    force_transcription: bool = False
) -> dict:
    """
    Unified entry point for creating and dispatching transcription tasks.
    """
    
    # 1. Resolve Engine
    engine_type, model_name = get_current_asr_info()
    
    # 2. Normalize Source ID
    normalized_source = normalize_source_id(source_id, source_type=source_type)
    
    # 3. Process Cover (Download & Cache if external)
    if cover and (cover.startswith("http") or cover.startswith("//")):
        try:
            # Run in threadpool to avoid blocking event loop
            local_cover = await run_in_threadpool(download_and_cache_cover, cover)
            if local_cover:
                cover = local_cover
        except Exception as e:
            logger.warning(f"Failed to pre-cache cover {cover}: {e}")

    # 3.5 Prevent overwriting rich metadata with generic fallbacks
    from app.db import get_video_meta
    existing_meta = get_video_meta(normalized_source)
    if existing_meta:
        old_title = existing_meta['video_title']
        old_cover = existing_meta['video_cover']
        
        # Identify if the incoming title is a generic fallback or empty
        is_generic = (not title) or \
                     title.startswith("Douyin ") or \
                     title.startswith("YouTube ") or \
                     title.startswith("网络媒体 ") or \
                     title == "未知来源"
                     
        # If new is generic but old is rich, preserve old!
        if is_generic and old_title and not (old_title.startswith("Douyin ") or old_title.startswith("YouTube ") or old_title == "未知来源"):
            logger.info(f"🛡️ Preserving rich video_title against generic overwrite for {normalized_source}")
            title = old_title
            
        # Preserve cover if incoming is empty/missing but old exists
        if not cover and old_cover:
            logger.info(f"🛡️ Preserving existing video_cover for {normalized_source}")
            cover = old_cover

    # 4. Save Metadata
    # For file uploads, source_id might be hash, original_source is filename
    upsert_video_meta(
        source_id=normalized_source,
        video_title=title,
        video_cover=cover,
        source_type=source_type,
        stream_url=stream_url,
        reset_policy=True,
        original_source=original_source
    )

    # 5. Handle Bookmark Only - NO Transcription Record
    if bookmark_only:
        logger.info(f"🔖 {source_type.capitalize()} Task Bookmarked: {normalized_source}")
        return {
            "id": None, # No transcription ID
            "status": "bookmarked",
            "message": f"{source_type.capitalize()} bookmarked",
            "source_id": normalized_source
        }

    # Handle Cache-Only Task
    if task_type == "cache_only":
        from app.services.cache_task import process_cache_task
        
        # Update status to downloading/pending
        upsert_video_meta(source_id=normalized_source)
        
        # Generate Ephemeral ID (negative timestamp) to avoid DB collision
        # Used ONLY for TaskManager progress tracking in memory.
        import time
        transcription_id = -int(time.time() * 1000)
        
        background_tasks.add_task(
            process_cache_task,
            transcription_id,
            original_source if source_type != 'douyin' else (direct_url or stream_url),
            normalized_source,
            source_type,
            quality
        )
        
        logger.info(f"💾 Cache-Only Task Dispatched: {transcription_id} ({source_type}, {quality}) [Ephemeral ID]")
        return {
            "id": transcription_id,
            "status": "pending",
            "message": "Cache task queued"
        }
    
    # 6. Save Transcription Record (Normal Transcription)
    transcription_id = save_transcription(
        source=normalized_source,
        raw_text="",
        asr_model=model_name,
        is_subtitle=(task_type == "subtitle"),
        status="pending",
        segment_start=segment_start if segment_start is not None else 0.0,
        segment_end=segment_end
    )
        
    # Dispatch based on type
    if source_type == 'bilibili':
        background_tasks.add_task(
            process_bilibili_transcription,
            transcription_id,
            original_source, # url
            segment_start or 0.0,
            segment_end, # range_end
            task_type,
            use_uvr,
            language,
            prompt,
            output_format,
            source_id=normalized_source,
            only_get_subtitles=only_get_subtitles,
            force_transcription=force_transcription
        )
    elif source_type == 'youtube':
        background_tasks.add_task(
            process_youtube_transcription,
            transcription_id,
            original_source, # url
            task_type,
            use_uvr,
            language,
            prompt,
            output_format,
            source_id=normalized_source,
            only_get_subtitles=only_get_subtitles,
            force_transcription=force_transcription
        )
    elif source_type == 'douyin':
        # Douyin requires direct_url
        background_tasks.add_task(
            process_douyin_transcription,
            transcription_id,
            direct_url,
            task_type,
            use_uvr,
            output_format,
            source_id=normalized_source,
            local_file_path=local_file_path,
            only_get_subtitles=only_get_subtitles,
            force_transcription=force_transcription
        )
    elif source_type == 'network':
        # Network requires file_path (downloaded by caller/helper)
        background_tasks.add_task(
            process_network_transcription,
            transcription_id,
            original_source, # url
            file_path,
            task_type,
            use_uvr,
            language,
            prompt,
            output_format,
            source_id=normalized_source,
            only_get_subtitles=only_get_subtitles,
            force_transcription=force_transcription
        )
    elif source_type == 'file' or source_type == 'video' or source_type == 'audio':
         background_tasks.add_task(
            process_file_transcription,
            transcription_id,
            file_path,
            task_type,
            file_filename,
            source_type,
            cover,
            covers_dir,
            use_uvr,
            language,
            prompt,
            output_format,
            source_id=normalized_source,
            only_get_subtitles=only_get_subtitles,
            force_transcription=force_transcription
        )

    return {
        "id": transcription_id,
        "status": "pending",
        "message": "Task queued"
    }
