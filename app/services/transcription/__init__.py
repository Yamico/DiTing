"""
Transcription Service Package
Exposes source-specific transcription functions that wrap the unified pipeline.
"""
from typing import Optional
from app.services.transcription.pipeline import run_transcription_pipeline
from app.services.transcription.downloaders import (
    make_bilibili_downloader,
    make_youtube_downloader,
    make_douyin_downloader,
    make_network_downloader
)
from app.utils.progress import ProgressHelper
from app.core.task_manager import task_manager
import os
from app.core.logger import logger

async def process_bilibili_transcription(
    transcription_id: int,
    url: str,
    range_start: float,
    range_end: float,
    task_type: str,
    use_uvr: bool = False,
    language: str = "zh",
    prompt: str = None,
    output_format: str = None,
    source_id: str = None,
    only_get_subtitles: bool = False,
    force_transcription: bool = False,
    auto_analyze_prompt: str = None,
    auto_analyze_prompt_id: int = None,
    auto_analyze_strip_subtitle: bool = True
):
    """Process a Bilibili video for transcription"""
    # Create progress helper for downloader
    # Pipeline handles 0-30% for download
    dl_progress = ProgressHelper(task_manager, transcription_id, 0, 30)
    
    downloader = make_bilibili_downloader(url, range_start, range_end, dl_progress)
    
    pre_asr_hook = None
    if not force_transcription:
        async def check_subs(tid):
            from app.downloaders.bilibili import download_bilibili_subtitles
            from app.db import get_system_config
            from starlette.concurrency import run_in_threadpool
            import re
            
            task_manager.update_progress(tid, 5, "Checking for subtitles...")
            
            # Get SESSDATA cookie for AI subtitle access
            sessdata = get_system_config('bilibili_sessdata')
            
            # Parse page index from source_id or URL
            page_index = 1
            
            # Try source_id first (e.g. BVxxx_p2)
            if source_id:
                 p_match = re.search(r"_p(\d+)", source_id)
                 if p_match:
                     page_index = int(p_match.group(1))
            
            # Fallback to URL (e.g. ?p=2)
            if page_index == 1 and url:
                 p_match = re.search(r"[?&]p=(\d+)", url)
                 if p_match:
                     page_index = int(p_match.group(1))
            
            # Extract BVID
            bvid = None
            if source_id and source_id.startswith("BV"):
                bvid = source_id.split("_p")[0]
            elif url:
                match = re.search(r"(BV[a-zA-Z0-9]{10})", url)
                if match:
                    bvid = match.group(1)
                    
            if not bvid:
                return None

            # Download
            _, sub_content = await run_in_threadpool(
                download_bilibili_subtitles,
                bvid,
                page_index,
                sessdata,
                language
            )
            return sub_content
        
        pre_asr_hook = check_subs
    
    cache_key = source_id or url

    await run_transcription_pipeline(
        transcription_id=transcription_id,
        downloader=downloader,
        source_key=cache_key,
        source_label="Bilibili",
        task_type=task_type,
        use_uvr=use_uvr,
        language=language,
        prompt=prompt,
        output_format=output_format,
        pre_asr_hook=pre_asr_hook,
        only_get_subtitles=only_get_subtitles,
        auto_analyze_prompt=auto_analyze_prompt,
        auto_analyze_prompt_id=auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=auto_analyze_strip_subtitle
    )

async def process_youtube_transcription(
    transcription_id: int,
    url: str,
    task_type: str,
    use_uvr: bool = False,
    language: str = "zh",
    prompt: str = None,
    output_format: str = None,
    source_id: str = None,
    only_get_subtitles: bool = False,
    force_transcription: bool = False,
    auto_analyze_prompt: str = None,
    auto_analyze_prompt_id: int = None,
    auto_analyze_strip_subtitle: bool = True
):
    """Process a YouTube video for transcription"""
    from app.core.config import settings
    from app.db import get_system_config
    
    proxy = get_system_config('proxy_url')
    dl_progress = ProgressHelper(task_manager, transcription_id, 0, 30)
    
    downloader = make_youtube_downloader(url, proxy, dl_progress)
    
    pre_asr_hook = None
    if not force_transcription:
        async def check_subs(tid):
            from app.downloaders.youtube import download_youtube_subtitles
            task_manager.update_progress(tid, 5, "Checking for subtitles...")
            # Check cache skip? Logic handled in pipeline (only calls hook if not cached)
            sub_path, sub_content = await run_in_threadpool(
                download_youtube_subtitles,
                url,
                settings.TEMP_UPLOADS_DIR,
                proxy,
                language
            )
            if sub_content:
                try: os.remove(sub_path)
                except OSError: pass
                return sub_content
            return None
        pre_asr_hook = check_subs

    from starlette.concurrency import run_in_threadpool
    import os

    # Use normalized source_id as cache key if available, otherwise fallback to URL
    cache_key = source_id or url

    await run_transcription_pipeline(
        transcription_id=transcription_id,
        downloader=downloader,
        source_key=cache_key,
        source_label="YouTube",
        task_type=task_type,
        use_uvr=use_uvr,
        language=language,
        prompt=prompt,
        output_format=output_format,
        pre_asr_hook=pre_asr_hook,
        only_get_subtitles=only_get_subtitles,
        auto_analyze_prompt=auto_analyze_prompt,
        auto_analyze_prompt_id=auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=auto_analyze_strip_subtitle
    )

async def process_douyin_transcription(
    transcription_id: int,
    direct_url: str,
    task_type: str,
    use_uvr: bool = False,
    output_format: str = None,
    source_id: str = None,
    local_file_path: str = None,
    only_get_subtitles: bool = False,
    force_transcription: bool = False,
    auto_analyze_prompt: str = None,
    auto_analyze_prompt_id: int = None,
    auto_analyze_strip_subtitle: bool = True
):
    """Process a Douyin video for transcription"""
    dl_progress = ProgressHelper(task_manager, transcription_id, 0, 30)
    
    # Prefer source_id for cache key
    cache_key = source_id or direct_url
    
    if local_file_path and os.path.exists(local_file_path):
        logger.info(f"📂 Using local cache for Douyin re-transcription: {local_file_path}")
        # Use network downloader to "download" (copy/verify) local file
        downloader = make_network_downloader(local_file_path)
    else:
        downloader = make_douyin_downloader(direct_url, source_id, dl_progress)
    
    await run_transcription_pipeline(
        transcription_id=transcription_id,
        downloader=downloader,
        source_key=cache_key,
        source_label="Douyin",
        task_type=task_type,
        use_uvr=use_uvr,
        output_format=output_format,
        only_get_subtitles=only_get_subtitles,
        auto_analyze_prompt=auto_analyze_prompt,
        auto_analyze_prompt_id=auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=auto_analyze_strip_subtitle
    )

async def process_network_transcription(
    transcription_id: int,
    url: str,
    file_path: str,
    task_type: str,
    use_uvr: bool = False,
    language: str = "zh",
    prompt: str = None,
    output_format: str = None,
    source_id: str = None,
    only_get_subtitles: bool = False,
    force_transcription: bool = False,
    auto_analyze_prompt: str = None,
    auto_analyze_prompt_id: int = None,
    auto_analyze_strip_subtitle: bool = True
):
    """Process a direct network URL for transcription"""
    dl_progress = ProgressHelper(task_manager, transcription_id, 0, 30)
    downloader = make_network_downloader(file_path)
    
    # Use normalized source_id as cache key if available
    cache_key = source_id or url

    await run_transcription_pipeline(
        transcription_id=transcription_id,
        downloader=downloader,
        source_key=cache_key,
        source_label="Network URL",
        task_type=task_type,
        use_uvr=use_uvr,
        language=language,
        prompt=prompt,
        output_format=output_format,
        only_get_subtitles=only_get_subtitles,
        auto_analyze_prompt=auto_analyze_prompt,
        auto_analyze_prompt_id=auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=auto_analyze_strip_subtitle
    )

async def process_file_transcription(
    transcription_id: int,
    file_path: str,
    task_type: str,
    file_filename: str,
    source_type: str,
    cover: str,
    covers_dir: str,
    use_uvr: bool = False,
    language: str = "zh",
    prompt: str = None,
    output_format: str = None,
    source_id: str = None,
    only_get_subtitles: bool = False,
    force_transcription: bool = False,
    auto_analyze_prompt: str = None,
    auto_analyze_prompt_id: int = None,
    auto_analyze_strip_subtitle: bool = True
):
    """Process a local file upload for transcription"""
    # File is already on disk.
    async def downloader(tid):
        return file_path

    # Local files don't use shared cache usually (source_key is filename?)
    # Original logic used cleanup_or_delete(file_path, tid) without source arg?
    # Actually original logic: cleanup_or_delete(file_path, transcription_id) -> source=None
    # So we pass source_key=None to pipeline??
    # If source_key is None, `find_existing_cache` returns None.
    # So we skip cache check. Correct.
    
    # UPDATE: Pass source_id (hash) to allow caching/retention polcies to work for files too
    cache_key = source_id # Can be None
    
    await run_transcription_pipeline(
        transcription_id=transcription_id,
        downloader=downloader,
        source_key=cache_key, # Link to hash-based ID
        source_label=f"File ({file_filename})",
        task_type=task_type,
        use_uvr=use_uvr,
        language=language,
        prompt=prompt,
        output_format=output_format,
        only_get_subtitles=only_get_subtitles,
        auto_analyze_prompt=auto_analyze_prompt,
        auto_analyze_prompt_id=auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=auto_analyze_strip_subtitle
    )
