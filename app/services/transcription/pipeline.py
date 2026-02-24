"""
Transcription Service Pipeline
Unified workflow for Check Cache -> Download -> UVR -> ASR -> Cleanup.
"""
import os
import asyncio
from typing import Callable, Awaitable, Optional
from starlette.concurrency import run_in_threadpool

from app.asr.client import asr_client
from app.db import update_transcription_text, update_task_status, update_transcription_asr_model, update_transcription_is_subtitle
from app.core.task_manager import task_manager, TaskCancelledException
from app.utils.process_utils import run_cancellable_process
from app.utils.preprocessing import separate_vocals
from app.core.logger import logger
from app.services.media_cache import MediaCacheService
from app.utils.progress import ProgressHelper
import re
import time

async def run_transcription_pipeline(
    transcription_id: int,
    downloader: Callable[[int], Awaitable[str]],
    source_key: str,
    source_label: str,
    task_type: str = "transcribe",
    use_uvr: bool = False,
    language: str = "zh",
    prompt: str = None,
    output_format: str = None,
    pre_asr_hook: Optional[Callable[[int], Awaitable[Optional[str]]]] = None,
    only_get_subtitles: bool = False,
    auto_analyze_prompt: str = None,
    auto_analyze_prompt_id: int = None,
    auto_analyze_strip_subtitle: bool = True,
):
    """
    Unified transcription pipeline.
    
    Args:
        transcription_id: ID of the task
        downloader: Async function that returns the path to the media file
        source_key: Key for cache lookup (URL or source_id)
        source_label: Label for logging (e.g., "Bilibili", "YouTube")
        task_type: "transcribe" or "subtitle"
        use_uvr: Whether to use Vocal Remover
        language: Language code
        prompt: ASR prompt
        output_format: "text", "srt", etc.
        pre_asr_hook: Optional hook to check for existing subtitles/results before ASR
    """
    
    audio_path = None
    using_cache = False
    is_temp_derived = False
    
    try:
        # 0. Start Task
        # Note: metadata is usually set by caller before calling pipeline, but we can update status
        logger.info(f"👷 Starting {source_label} pipeline for ID: {transcription_id}")
        update_task_status(transcription_id, "processing")
        task_manager.start_task(transcription_id, meta={"title": f"[{source_label}] Transcription", "source": source_key})
        
        # 1. Check Cache
        # MediaCacheService uses relative paths
        cached_rel_path, cached_quality = MediaCacheService.find_existing_cache(source_key, mode='transcription', return_quality=True)
        if cached_rel_path:
            full_path = os.path.join(os.getcwd(), cached_rel_path)
            if os.path.exists(full_path):
                logger.info(f"♻️ Found existing cached media for {source_key}: {cached_rel_path} (quality: {cached_quality})")
                audio_path = full_path
                using_cache = True
                MediaCacheService.assign_cache(transcription_id, cached_rel_path, cached_quality)
                task_manager.update_progress(transcription_id, 30, f"Using cached media ({cached_quality})...")

        # 1.5 Pre-ASR Hook (e.g. YouTube Subtitles)
        if not using_cache and pre_asr_hook:
            # Only run hook if we don't have cache (implying we might download)
            # OR if hook is cheap. YouTube hook downloads subs.
            # If we utilize cache, we skip download, so we skip hook?
            # Yes, if we have cache, we perform ASR on it. 
            # If we have subs, we prefer subs over ASR?
            # existing logic: if NOT using_cache, check subs.
            try:
                skipped_result = await pre_asr_hook(transcription_id)
                if skipped_result:
                    logger.info("✨ Pre-ASR hook returned result. Skipping pipeline.")
                    update_transcription_text(transcription_id, skipped_result)
                    
                    # Update model to "Subtitle" so frontend badge shows correctly
                    update_transcription_asr_model(transcription_id, "Subtitle")
                    update_transcription_is_subtitle(transcription_id, True)
                    
                    update_task_status(transcription_id, "completed")
                    task_manager.finish_task(transcription_id)
                    # Also trigger AI analysis if requested
                    if auto_analyze_prompt:
                        await _trigger_auto_analysis(
                            transcription_id, skipped_result, auto_analyze_prompt,
                            auto_analyze_prompt_id, auto_analyze_strip_subtitle, source_label
                        )
                    
                    return
            except Exception as e:
                logger.warning(f"⚠️ Pre-ASR hook failed: {e}")

        # 1.6 Check if only get subtitles
        if only_get_subtitles:
            raise Exception("只获取字幕模式下未能找到或不支持提取原生字幕")

        # 2. Download (if not cached)
        if not using_cache:
            task_manager.update_progress(transcription_id, 0, f"Downloading ({source_label})...")
            # Downloader should handle progress updates internally via the helper passed to it
            audio_path = await downloader(transcription_id)
            
        task_manager.check_cancel(transcription_id)

        # 3. UVR
        if use_uvr:
            logger.info(f"🎤 UVR5 Enabled for {source_label}: Separating Vocals...")
            task_manager.update_progress(transcription_id, 30, "Separating Vocals (UVR5)...")
            
            if task_manager.is_cancelled(transcription_id):
                raise TaskCancelledException()
            
            vocal_path = await run_cancellable_process(transcription_id, separate_vocals, audio_path)
            
            if vocal_path and os.path.exists(vocal_path):
                logger.info(f"🎤 Vocals separated: {vocal_path}")
                
                # Careful not to delete shared cache
                if not using_cache:
                    try:
                        # If we downloaded a temp file, we delete it now that we have vocals
                        # BUT `cleanup_or_delete` below expects `audio_path` to be the "original" to cache?
                        # If we delete `audio_path` now, we can't cache it.
                        # Logic from transcription.py:
                        # "if not using_cache: remove(audio_path)"
                        if audio_path and os.path.exists(audio_path):
                            os.remove(audio_path)
                    except OSError:
                        pass
                
                audio_path = vocal_path
                is_temp_derived = True 
                # We are now working with a temp derived file, so we are NOT "using cache" for the purpose of cleanup
                using_cache = False 
            else:
                logger.warning("⚠️ UVR5 failed to produce output.")

        task_manager.check_cancel(transcription_id)
        val = 50 if use_uvr else 30
        
        # 4. ASR — Check worker queue status for better progress message
        asr_msg = "Transcribing..."
        try:
            engine_key = asr_client.select_worker()
            queue_info = asr_client.shared_paths  # We have health data cached
            # Check concurrency info from last health check
            health_data = getattr(asr_client, '_last_health', {}).get(engine_key, {})
            queue_depth = health_data.get('concurrency', {}).get('queue', 0)
            if queue_depth > 0:
                asr_msg = f"Queued ({queue_depth} ahead)..."
                logger.info(f"⏳ ASR worker [{engine_key}] has {queue_depth} queued tasks")
            else:
                asr_msg = f"Transcribing ({engine_key})..."
        except Exception:
            pass
        task_manager.update_progress(transcription_id, val, asr_msg)
        
        final_format = output_format
        if not final_format:
            final_format = "srt" if task_type == "subtitle" else "text"
            
        raw_text = await _run_asr_with_cancel(
            transcription_id,
            audio_path,
            language,
            prompt,
            final_format
        )
        
        # 5. Finalize
        task_manager.update_progress(transcription_id, 95, "Finalizing...")
        update_transcription_text(transcription_id, raw_text)
        update_task_status(transcription_id, "completed")
        logger.info(f"✅ {source_label} task completed for ID: {transcription_id}")
        
        # 5.5 Auto-Analyze Trigger
        if auto_analyze_prompt:
            await _trigger_auto_analysis(
                transcription_id, raw_text, auto_analyze_prompt,
                auto_analyze_prompt_id, auto_analyze_strip_subtitle, source_label
            )

        task_manager.finish_task(transcription_id)

    except TaskCancelledException as e:
        logger.warning(f"🛑 {source_label} Task {transcription_id} Cancelled")
        update_task_status(transcription_id, "cancelled")
        update_transcription_text(transcription_id, "Task Cancelled")
        task_manager.finish_task(transcription_id)
        
    except Exception as e:
        logger.error(f"❌ {source_label} background task failed for ID {transcription_id}: {e}")
        update_task_status(transcription_id, "failed")
        update_transcription_text(transcription_id, f"Error: {str(e)}")
        task_manager.finish_task(transcription_id)
        
    finally:
        # 6. Cleanup
        if is_temp_derived:
            # Always delete derived temp files (UVR output)
            if audio_path and os.path.exists(audio_path):
                try:
                    os.remove(audio_path)
                    logger.debug(f"🗑️ Deleted temp UVR file: {audio_path}")
                except Exception as e:
                    pass
        elif not using_cache:
            # If we downloaded a fresh file, cache it or delete it based on policy
            MediaCacheService.cleanup_or_delete(audio_path, transcription_id, source=source_key, quality='audio_only')


async def _run_asr_with_cancel(transcription_id, audio_path, language, prompt, output_format):
    """Helper to run ASR with explicit cancellation monitoring"""
    
    asr_coro = asr_client.transcribe(
        audio_path=audio_path,
        language=language,
        prompt=prompt,
        output_format=output_format
    )

    transcribe_task = asyncio.create_task(asr_coro)
    monitor_task = asyncio.create_task(task_manager.wait_for_cancel(transcription_id))
    
    done, pending = await asyncio.wait([transcribe_task, monitor_task], return_when=asyncio.FIRST_COMPLETED)
    
    if monitor_task in done:
        # Check if actually cancelled
        if task_manager.is_cancelled(transcription_id):
            transcribe_task.cancel()
            try:
                await transcribe_task
            except asyncio.CancelledError:
                pass
            raise TaskCancelledException("Task cancelled by user during transcription")
    
    # Check monitor task just in case it finished but wasn't cancelled (unlikely)
    monitor_task.cancel()
    
    if transcribe_task.cancelled():
        raise TaskCancelledException("Task cancelled")
        
    try:
        return transcribe_task.result()
    except asyncio.CancelledError:
        raise TaskCancelledException("Task cancelled")
    except Exception as e:
        raise e


async def _trigger_auto_analysis(
    transcription_id: int,
    raw_text: str,
    auto_analyze_prompt: str,
    auto_analyze_prompt_id: int,
    strip_subtitle: bool,
    source_label: str,
):
    """Shared helper to trigger AI analysis after transcription completion."""
    from app.api.v1.endpoints.ai import process_ai_analysis
    from app.db.prompts import increment_prompt_use_count
    from app.db import update_ai_status, get_video_meta

    # Generate task ID (same convention as normal /api/analyze endpoint)
    task_id = -int(time.time() * 1000) % 1000000000

    logger.info(f"🤖 Triggering auto-analysis for ID: {transcription_id} (prompt_id={auto_analyze_prompt_id})")

    # Increment prompt use count if we have an ID
    if auto_analyze_prompt_id:
        increment_prompt_use_count(auto_analyze_prompt_id)

    # Preprocess text: strip subtitle metadata if requested
    text_to_analyze = raw_text
    if strip_subtitle:
        from app.utils.preprocessing import strip_subtitle_metadata
        text_to_analyze = strip_subtitle_metadata(raw_text)
    else:
        text_to_analyze = re.sub(r'<\|.*?\|>', '', raw_text)

    # Retrieve title for task center display
    from app.db.transcriptions import get_transcription
    record = get_transcription(transcription_id)
    title = source_label
    if record:
        meta = get_video_meta(record['source'])
        if meta:
            title = dict(meta).get('video_title', source_label)

    # Register task in task center
    task_manager.start_task(task_id, meta={
        "type": "ai",
        "filename": f"AI: {title}"
    })

    # Queue status
    update_ai_status(transcription_id, "queued")

    # Tag prompt if preprocessing was applied
    stored_prompt = f"[Preprocessed] {auto_analyze_prompt}" if strip_subtitle else auto_analyze_prompt

    # Launch async analysis
    asyncio.create_task(
        process_ai_analysis(
            item_id=transcription_id,
            task_id=task_id,
            text_to_analyze=text_to_analyze,
            prompt=stored_prompt,
            llm_model_id=None,
            parent_id=None,
            input_text=None,
            overwrite=False,
            overwrite_id=None,
        )
    )
