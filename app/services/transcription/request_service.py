"""
Transcription Request Service
Prepares parameters for create_and_dispatch based on source type.
Centralizes all pre-transcription business logic (metadata fetching,
cache lookup, file handling) away from the endpoint layer.
"""
import os
import uuid
import hashlib
from typing import Optional

from starlette.concurrency import run_in_threadpool

from app.db import get_system_config, get_best_media_path_by_source, get_transcription_by_source
from app.db.video_meta import get_video_meta
from app.downloaders.bilibili import get_video_info
from app.downloaders.youtube import get_youtube_info
from app.core.logger import logger
from app.core.config import settings
from app.services.storage import storage
from app.utils.media_utils import extract_video_frame, detect_media_type
from app.utils.source_utils import (
    normalize_source_id,
    resolve_bilibili_bvid,
    resolve_youtube_video_id,
    resolve_douyin_url,
)
from app.services.transcription.downloaders import download_network_file


async def prepare_file_transcription(
    file,
    source: str = "未知来源",
    task_type: str = "transcribe",
    use_uvr: bool = False,
    language: str = "zh",
    prompt: str = None,
    auto_analyze_prompt: str = None,
    auto_analyze_prompt_id: int = None,
    auto_analyze_strip_subtitle: bool = True,
    output_format: str = None,
) -> dict:
    """
    Prepare dispatch params for an uploaded file.
    Saves the upload, detects type, extracts cover if video.
    Returns kwargs dict for create_and_dispatch.
    Raises Exception on failure (caller should handle cleanup).
    """
    filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = await run_in_threadpool(storage.save_upload_file, file, filename)

    source_type = detect_media_type(file.filename, file.content_type)
    logger.info(f"🎬 Detected Type: {source_type} for {file.filename}")

    cover = ""
    if source_type == "video":
        cover_name = f"{uuid.uuid4()}.jpg"
        cover_path = os.path.join(settings.COVERS_DIR, cover_name)
        if await run_in_threadpool(extract_video_frame, file_path, cover_path):
            cover = f"/api/covers/{cover_name}"

    original_source = source if source != "未知来源" else file.filename

    return dict(
        source_id=file.filename,
        original_source=original_source,
        source_type=source_type,
        title=file.filename,
        cover=cover,
        task_type=task_type,
        use_uvr=use_uvr,
        language=language,
        prompt=prompt,
        auto_analyze_prompt=auto_analyze_prompt,
        auto_analyze_prompt_id=auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=auto_analyze_strip_subtitle,
        output_format=output_format,
        file_path=file_path,
        file_filename=file.filename,
        covers_dir=settings.COVERS_DIR,
    )


def prepare_bilibili_transcription(request) -> dict:
    """
    Prepare dispatch params for a Bilibili video.
    Resolves BV ID, fetches metadata if missing.
    Returns kwargs dict for create_and_dispatch.
    Raises ValueError on invalid input.
    """
    item = request.model_dump(exclude_none=True)

    url_input = item.get("url")
    source_id_input = item.get("source_id")

    bvid = resolve_bilibili_bvid(url_input) or resolve_bilibili_bvid(source_id_input)
    if not bvid:
        raise ValueError("Invalid Bilibili URL or BV ID")

    title = item.get("title")
    cover = item.get("cover")

    if not title or not cover:
        logger.info(f"🔍 Fetching missing metadata for BVID: {bvid}")
        info = get_video_info(bvid)
        if info:
            title = title or info['title']
            cover = cover or info['cover']

    original_source = f"https://www.bilibili.com/video/{bvid}"
    if url_input and bvid in url_input and url_input.startswith("http"):
        original_source = url_input

    return dict(
        source_id=bvid,
        original_source=original_source,
        source_type="bilibili",
        title=title,
        cover=cover,
        task_type=item.get("task_type", "transcribe"),
        bookmark_only=item.get("bookmark_only", False),
        use_uvr=item.get("use_uvr", False),
        language=item.get("language", "zh"),
        prompt=item.get("prompt", None),
        auto_analyze_prompt=item.get("auto_analyze_prompt", None),
        auto_analyze_prompt_id=item.get("auto_analyze_prompt_id", None),
        auto_analyze_strip_subtitle=item.get("auto_analyze_strip_subtitle", True),
        output_format=item.get("output_format", None),
        segment_start=item.get("range_start", 0),
        segment_end=item.get("range_end", None),
        quality=item.get("quality", "best"),
        only_get_subtitles=item.get("only_get_subtitles", False),
        force_transcription=item.get("force_transcription", False),
    )


def prepare_youtube_transcription(request) -> dict:
    """
    Prepare dispatch params for a YouTube video.
    Resolves video ID, fetches metadata.
    Returns kwargs dict for create_and_dispatch.
    Raises ValueError on invalid input.
    """
    item = request.model_dump(exclude_none=True)
    url = item.get("url")

    video_id = resolve_youtube_video_id(url)
    if not video_id:
        raise ValueError("Invalid YouTube URL")

    proxy = get_system_config('proxy_url')
    info = get_youtube_info(url, proxy=proxy)

    title = f"YouTube {video_id}"
    cover = ""
    if info:
        title = info['title']
        cover = info['cover']

    return dict(
        source_id=video_id,
        original_source=url,
        source_type="youtube",
        title=title,
        cover=cover,
        task_type=item.get("task_type", "transcribe"),
        bookmark_only=item.get("bookmark_only", False),
        use_uvr=item.get("use_uvr", False),
        language=item.get("language", "zh"),
        prompt=item.get("prompt", None),
        auto_analyze_prompt=item.get("auto_analyze_prompt", None),
        auto_analyze_prompt_id=item.get("auto_analyze_prompt_id", None),
        auto_analyze_strip_subtitle=item.get("auto_analyze_strip_subtitle", True),
        output_format=item.get("output_format", None),
        quality=item.get("quality", "best"),
        only_get_subtitles=item.get("only_get_subtitles", False),
        force_transcription=item.get("force_transcription", False),
    )


async def prepare_douyin_transcription(request) -> dict:
    """
    Prepare dispatch params for a Douyin video.
    Resolves short links, checks local cache.
    Returns kwargs dict for create_and_dispatch.
    Raises ValueError if no cache and not bookmark.
    """
    url = request.url
    resolved_url = await run_in_threadpool(resolve_douyin_url, url)
    logger.info(f"🎵 [Douyin] URL: {url} → resolved: {resolved_url}")

    if request.source_id:
        parsed_id = request.source_id.replace("dy_", "")
        normalized_id = f"dy_{parsed_id}"
        # Force the original_source to the actual video URL if the ID was provided by userscript
        if "video/" not in resolved_url and "note/" not in resolved_url:
            resolved_url = f"https://www.douyin.com/video/{parsed_id}"
    else:
        normalized_id = normalize_source_id(resolved_url, "douyin")

    if request.bookmark_only:
        title = request.title or f"Douyin {normalized_id.replace('dy_', '')}"
        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="douyin",
            title=title,
            cover=request.cover or "",
            task_type=request.task_type,
            bookmark_only=True,
            use_uvr=request.use_uvr,
            language=request.language,
            quality=request.quality,
            direct_url=request.direct_url,
            stream_url=request.stream_url,
            only_get_subtitles=request.only_get_subtitles,
            force_transcription=request.force_transcription,
        )

    # If it's a cache_only task, we MUST return direct_url so `process_cache_task` can download it
    if request.task_type == "cache_only":
        title = request.title or f"Douyin {normalized_id.replace('dy_', '')}"
        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="douyin",
            title=title,
            cover=request.cover or "",
            task_type=request.task_type,
            bookmark_only=False,
            quality=request.quality,
            direct_url=request.direct_url,
            stream_url=request.stream_url,
        )

    media_path = get_best_media_path_by_source(normalized_id)
    if media_path and os.path.exists(media_path):
        row = get_transcription_by_source(normalized_id)
        title = row['video_title'] if row else (request.title or f"Douyin {url}")
        cover = row['video_cover'] if row else (request.cover or "")

        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="douyin",
            title=title,
            cover=cover,
            task_type=request.task_type,
            bookmark_only=False,
            use_uvr=request.use_uvr,
            language=request.language,
            prompt=request.prompt,
            auto_analyze_prompt=request.auto_analyze_prompt,
            auto_analyze_prompt_id=request.auto_analyze_prompt_id,
            auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
            output_format=request.output_format,
            quality=request.quality,
            local_file_path=media_path,
            direct_url=request.direct_url,
            stream_url=request.stream_url,
            only_get_subtitles=request.only_get_subtitles,
            force_transcription=request.force_transcription,
        )

    # fallback to direct_url passed by frontend if nothing is cached
    if request.direct_url:
        title = request.title or f"Douyin {normalized_id.replace('dy_', '')}"
        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="douyin",
            title=title,
            cover=request.cover or "",
            task_type=request.task_type,
            bookmark_only=False,
            use_uvr=request.use_uvr,
            language=request.language,
            prompt=request.prompt,
            auto_analyze_prompt=request.auto_analyze_prompt,
            auto_analyze_prompt_id=request.auto_analyze_prompt_id,
            auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
            output_format=request.output_format,
            quality=request.quality,
            direct_url=request.direct_url,
            stream_url=request.stream_url,
            only_get_subtitles=request.only_get_subtitles,
            force_transcription=request.force_transcription,
        )

    raise ValueError(
        "抖音链接需要通过浏览器插件（油猴脚本）获取直链。"
        "当前未找到本地缓存，无法重新转录。请先使用「收藏」模式保存链接。"
    )


async def prepare_network_transcription(request) -> dict:
    """
    Prepare dispatch params for a network URL.
    Downloads file, extracts cover if video.
    Returns kwargs dict for create_and_dispatch.
    Raises ValueError on download failure.
    """
    url = request.url.strip()
    logger.info(f"📥 Received Network URL Request: {url}")

    try:
        file_path, display_type = await run_in_threadpool(
            download_network_file, url, settings.TEMP_UPLOADS_DIR
        )
    except Exception as e:
        raise ValueError(f"无法下载链接: {str(e)}")

    cover = ""
    if display_type == "video":
        cover_name = f"{uuid.uuid4()}.jpg"
        cover_path = os.path.join(settings.COVERS_DIR, cover_name)
        if await run_in_threadpool(extract_video_frame, file_path, cover_path):
            cover = f"/api/covers/{cover_name}"

    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
    title = request.title or f"网络媒体 {url_hash}"

    return dict(
        source_id=url,
        original_source=url,
        source_type="network",
        title=title,
        cover=cover,
        task_type=request.task_type,
        bookmark_only=request.bookmark_only,
        use_uvr=request.use_uvr,
        language=request.language,
        prompt=request.prompt,
        auto_analyze_prompt=request.auto_analyze_prompt,
        auto_analyze_prompt_id=request.auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
        output_format=request.output_format,
        file_path=file_path,
        quality=request.quality,
        only_get_subtitles=request.only_get_subtitles,
        force_transcription=request.force_transcription,
    )


async def prepare_retranscription(request) -> dict:
    """
    Prepare dispatch params for a re-transcription.
    Looks up video_meta and local cache, branches by source_type.
    Returns kwargs dict for create_and_dispatch.
    Raises ValueError on missing metadata or cache.
    """
    source_id = request.source_id

    vm_row = get_video_meta(source_id)
    if not vm_row:
        raise ValueError("视频元数据未找到")

    vm = dict(vm_row)
    source_type = vm.get('source_type') or 'file'
    original_source = vm.get('original_source') or source_id
    title = vm.get('video_title') or source_id
    cover = vm.get('video_cover') or ''

    media_path = get_best_media_path_by_source(source_id)
    has_cache = media_path and os.path.exists(media_path)

    logger.info(f"🔄 Retranscribe: {source_id} ({source_type}) cache={'✅' if has_cache else '❌'}")

    kwargs = dict(
        source_id=source_id,
        original_source=original_source,
        source_type=source_type,
        title=title,
        cover=cover,
        task_type="transcribe",
        use_uvr=request.use_uvr,
        language=request.language,
        prompt=request.prompt,
        auto_analyze_prompt=request.auto_analyze_prompt,
        auto_analyze_prompt_id=request.auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
        output_format=request.output_format,
    )

    if source_type in ('bilibili', 'youtube'):
        pass  # Can always re-download from original URL

    elif source_type == 'network':
        if has_cache:
            kwargs['file_path'] = media_path
        else:
            try:
                file_path, _ = await run_in_threadpool(
                    download_network_file, original_source, settings.TEMP_UPLOADS_DIR
                )
                kwargs['file_path'] = file_path
            except Exception as e:
                raise ValueError(f"无法重新下载: {str(e)}")

    elif source_type == 'douyin':
        if not has_cache:
            raise ValueError("抖音视频无本地缓存，无法重新转录。请先缓存视频。")
        kwargs['local_file_path'] = media_path

    elif source_type in ('video', 'audio', 'file'):
        if not has_cache:
            raise ValueError("本地文件无缓存，无法重新转录。")
        kwargs['file_path'] = media_path

    else:
        raise ValueError(f"不支持的来源类型: {source_type}")

    return kwargs
