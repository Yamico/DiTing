
import asyncio
import os
from starlette.concurrency import run_in_threadpool
from app.db import save_transcription, update_task_status, update_transcription_text, delete_transcription
from app.db.video_meta import upsert_video_meta
from app.services.media_cache import MediaCacheService
from app.core.task_manager import task_manager, TaskCancelledException
from app.core.logger import logger
from app.utils.progress import ProgressHelper
from app.core.config import settings

# Clients
from app.downloaders.bilibili import download_bilibili_video, download_audio, get_video_info
from app.downloaders.youtube import download_youtube_media, download_youtube_video, get_youtube_info
from app.downloaders.douyin import download_douyin_video
from app.api.v1.endpoints.covers import download_and_cache_cover

async def process_cache_task(
    transcription_id: int,
    url: str,
    source_id: str,
    source_type: str,
    quality: str = 'best'
):
    """
    Process a Cache-Only task (download without transcription).
    
    Args:
        transcription_id: ID of the transcription record (status='processing')
        url: Original URL
        source_id: Normalized Source ID
        source_type: 'bilibili', 'youtube', 'douyin', 'network'
        quality: 'video' (best video+audio), 'audio' (audio only), 'best' (default, usually video)
    """
    
    download_path = None
    media_quality_tag = quality
    
    try:
        task_manager.start_task(transcription_id, meta={
            "type": source_type,
            "url": url,
            "task_type": "cache_only",
            "quality": quality
        })
        logger.info(f"💾 Starting Cache-Only task for {source_id} (ID: {transcription_id}) - Quality: {quality}")
        # update_task_status(transcription_id, "processing") # Removed for ephemeral ID
        task_manager.update_progress(transcription_id, 0, "Initializing Cache Task...")
        
        check_cancel_wrapper = lambda tid=None: task_manager.check_cancel(transcription_id)
        
        # 2. Download based on type and quality
        task_manager.update_progress(transcription_id, 10, f"Downloading ({source_type})...")
        download_progress = ProgressHelper(task_manager, transcription_id, 10, 90) # Map 0-100 download to 10-90 task
        
        if source_type == 'bilibili':
            # Fetch metadata if needed (title/cover)
            info = get_video_info(source_id if source_id.startswith("BV") else url)
            if info:
                cover = info.get('cover')
                if cover and (cover.startswith('http') or cover.startswith('//')):
                    cover = await run_in_threadpool(download_and_cache_cover, cover)
                upsert_video_meta(source_id, video_title=info.get('title'), video_cover=cover)
            
            if quality == 'audio' or quality == 'audio_only':
                # bili_client.download_audio(url, start_time, end_time, task_id, check_cancel_func, progress_callback)
                download_path = await run_in_threadpool(
                    download_audio, 
                    url, 
                    None, # start_time
                    None, # end_time
                    transcription_id, 
                    check_cancel_wrapper,
                    download_progress.get_callback()
                )
                media_quality_tag = 'audio_only'
            else:
                # Video (best)
                download_path = await run_in_threadpool(
                    download_bilibili_video, 
                    url,
                    quality, # Pass user quality (best/medium/worst)
                    transcription_id, 
                    check_cancel_wrapper,
                    download_progress.get_callback()
                )
                media_quality_tag = quality # Preserve tag (best/medium/worst)

        elif source_type == 'youtube':
            # Fetch metadata
            info = get_youtube_info(url)
            if info:
                cover = info.get('cover')
                if cover and (cover.startswith('http') or cover.startswith('//')):
                    cover = await run_in_threadpool(download_and_cache_cover, cover)
                upsert_video_meta(source_id, video_title=info.get('title'), video_cover=cover)

            proxy = settings.PROXY_URL if hasattr(settings, 'PROXY_URL') else None
            # Or get_system_config('proxy_url')? 
            # Usually settings.PROXY_URL isn't dynamic. 
            # Let's use get_system_config('proxy_url') compatible way if available.
            # But let's assume valid proxy arg for now or None.
            # Wait, app/services/transcription.py uses get_system_config('proxy_url').
            from app.db import get_system_config
            proxy = get_system_config('proxy_url')

            if quality == 'audio' or quality == 'audio_only':
                # download_youtube_video(url, output_dir, proxy, task_id, check_cancel_func, progress_callback)
                download_path = await run_in_threadpool(
                    download_youtube_video,
                    url,
                    settings.TEMP_UPLOADS_DIR,
                    proxy,
                    transcription_id,
                    check_cancel_wrapper,
                    download_progress.get_callback()
                )
                media_quality_tag = 'audio_only'
            else:
                # Video
                download_path = await run_in_threadpool(
                    download_youtube_media,
                    url,
                    quality, # Pass user quality
                    settings.TEMP_UPLOADS_DIR,
                    proxy,
                    transcription_id,
                    check_cancel_wrapper,
                    download_progress.get_callback()
                )
                media_quality_tag = quality # Preserve tag
                
        elif source_type == 'douyin':
            # Douyin is always video
            # For cache tasks, 'url' is the direct_url (stream_url)
            upsert_video_meta(source_id, stream_url=url)
            
            download_path = await run_in_threadpool(
                download_douyin_video,
                url,
                "https://www.douyin.com/", # Referer
                transcription_id,
                check_cancel_wrapper,
                download_progress.get_callback()
            )
            # Douyin is just direct CDN, no quality selection via yt-dlp
            # We use the quality tag passed from frontend (e.g. '1080p', '720p')
            media_quality_tag = quality
            
        else:
             # Network / Generic
             # TODO: Implement generic download
             pass

        if not download_path or not os.path.exists(download_path):
             raise Exception("Download failed or produced no file")
             
        task_manager.update_progress(transcription_id, 90, "Finalizing Cache...")
        
        # 3. Cache the file
        final_cache_path = MediaCacheService.cache_file(
            temp_path=download_path,
            transcription_id=transcription_id,
            source=source_id,
            quality=media_quality_tag
        )
        
        # 4. Update Status
        upsert_video_meta(source_id)
        logger.info(f"✅ Cache Task Finished. File: {final_cache_path}. Ephemeral task {transcription_id} clearing.")
        
        # Finish in-memory task
        task_manager.finish_task(transcription_id)
        
    except TaskCancelledException as e:
        logger.warning(f"🛑 Cache Task {transcription_id} Cancelled")
        upsert_video_meta(source_id)
        # In-memory cancel
        task_manager.finish_task(transcription_id)
        if download_path and os.path.exists(download_path):
            try: os.remove(download_path)
            except OSError: pass
            
    except Exception as e:
        logger.error(f"❌ Cache Task Failed ID {transcription_id}: {e}")
        upsert_video_meta(source_id)
        # No DB record to update text for error
        task_manager.finish_task(transcription_id)
        if download_path and os.path.exists(download_path):
            try: os.remove(download_path)
            except OSError: pass
