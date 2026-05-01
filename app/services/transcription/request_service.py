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
from app.downloaders.douyin import get_douyin_info, extract_aweme_id, pick_douyin_quality_url
from app.downloaders.xiaohongshu import get_xhs_info
from app.core.logger import logger
from app.core.config import settings
from app.services.storage import storage
from app.utils.media_utils import extract_video_frame, detect_media_type
from app.utils.source_utils import (
    normalize_source_id,
    resolve_bilibili_id,
    resolve_youtube_video_id,
    resolve_douyin_url,
    resolve_xhs_url,
)
from app.services.transcription.downloaders import download_network_file


async def prepare_file_transcription(
    file,
    source: str = "未知来源",
    task_type: str = "transcribe",
    language: str = "zh",
    prompt: str = None,
    auto_analyze_prompt: str = None,
    auto_analyze_prompt_id: int = None,
    auto_analyze_strip_subtitle: bool = True,
    auto_generate_note: bool = False,
    auto_note_style: str = None,
    auto_note_screenshot_density: str = None,
    auto_note_user_prompt: str = None,
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
        language=language,
        prompt=prompt,
        auto_analyze_prompt=auto_analyze_prompt,
        auto_analyze_prompt_id=auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=auto_analyze_strip_subtitle,
        auto_generate_note=auto_generate_note,
        auto_note_style=auto_note_style,
        auto_note_screenshot_density=auto_note_screenshot_density,
        auto_note_user_prompt=auto_note_user_prompt,
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

    source_id = resolve_bilibili_id(url_input) or resolve_bilibili_id(source_id_input)
    if not source_id:
        raise ValueError("Invalid Bilibili URL or BV ID")

    bvid = source_id.split('_p')[0]

    title = item.get("title")
    cover = item.get("cover")

    if not title or not cover:
        logger.info(f"🔍 Fetching missing metadata for BVID: {bvid}")
        info = get_video_info(bvid)
        if info:
            title = title or info['title']
            cover = cover or info['cover']
            if "_p" in source_id:
                p_val = source_id.split('_p')[1]
                title = f"{title} (P{p_val})"

    original_source = item.get("url")
    if not original_source or not original_source.startswith("http"):
        from app.utils.source_utils import reconstruct_url
        original_source = reconstruct_url(source_id)

    return dict(
        source_id=source_id,
        original_source=original_source,
        source_type="bilibili",
        title=title,
        cover=cover,
        task_type=item.get("task_type", "transcribe"),
        bookmark_only=item.get("bookmark_only", False),
        language=item.get("language", "zh"),
        prompt=item.get("prompt", None),
        auto_analyze_prompt=item.get("auto_analyze_prompt", None),
        auto_analyze_prompt_id=item.get("auto_analyze_prompt_id", None),
        auto_analyze_strip_subtitle=item.get("auto_analyze_strip_subtitle", True),
        auto_generate_note=item.get("auto_generate_note", False),
        auto_note_style=item.get("auto_note_style", None),
        auto_note_screenshot_density=item.get("auto_note_screenshot_density", None),
        auto_note_user_prompt=item.get("auto_note_user_prompt", None),
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

    # Priority: yt-dlp info > client-provided > hardcoded default
    title = f"YouTube {video_id}"
    cover = ""
    if info:
        title = info['title']
        cover = info['cover']
    else:
        # Fallback to client-provided metadata (from userscript DOM scraping)
        if item.get("title"):
            title = item["title"]
        if item.get("cover"):
            cover = item["cover"]

    return dict(
        source_id=video_id,
        original_source=url,
        source_type="youtube",
        title=title,
        cover=cover,
        task_type=item.get("task_type", "transcribe"),
        bookmark_only=item.get("bookmark_only", False),
        language=item.get("language", "zh"),
        prompt=item.get("prompt", None),
        auto_analyze_prompt=item.get("auto_analyze_prompt", None),
        auto_analyze_prompt_id=item.get("auto_analyze_prompt_id", None),
        auto_analyze_strip_subtitle=item.get("auto_analyze_strip_subtitle", True),
        auto_generate_note=item.get("auto_generate_note", False),
        auto_note_style=item.get("auto_note_style", None),
        auto_note_screenshot_density=item.get("auto_note_screenshot_density", None),
        auto_note_user_prompt=item.get("auto_note_user_prompt", None),
        output_format=item.get("output_format", None),
        quality=item.get("quality", "best"),
        only_get_subtitles=item.get("only_get_subtitles", False),
        force_transcription=item.get("force_transcription", False),
    )


async def prepare_douyin_transcription(request) -> dict:
    """
    Prepare dispatch params for a Douyin video.
    Resolves short links, attempts server-side extraction, checks local cache.
    Returns kwargs dict for create_and_dispatch.
    """
    url = request.url
    resolved_url = await run_in_threadpool(resolve_douyin_url, url)
    logger.info(f"🎵 [Douyin] URL: {url} → resolved: {resolved_url}")

    # Determine source_id and metadata
    title = request.title
    cover = request.cover or ""
    direct_url = request.direct_url

    if request.source_id:
        parsed_id = request.source_id.replace("dy_", "")
        normalized_id = f"dy_{parsed_id}"
        if "video/" not in resolved_url and "note/" not in resolved_url:
            resolved_url = f"https://www.douyin.com/video/{parsed_id}"
    else:
        normalized_id = normalize_source_id(resolved_url, "douyin")

    # Server-side extraction: fetch metadata + direct_url if not provided by client
    if not direct_url or not title:
        logger.info(f"🔍 [Douyin] Attempting server-side extraction for: {url}")
        info = await get_douyin_info(url)
        if info:
            if info.get("aweme_id"):
                normalized_id = f"dy_{info['aweme_id']}"
                if "video/" not in resolved_url and "note/" not in resolved_url:
                    resolved_url = f"https://www.douyin.com/video/{info['aweme_id']}"
            title = title or info.get("title")
            cover = cover or info.get("cover", "")
            if not direct_url and info.get("direct_urls"):
                direct_url = pick_douyin_quality_url(info["direct_urls"], request.quality or "best")
            elif not direct_url:
                direct_url = info.get("direct_url", "")

    title = title or f"Douyin {normalized_id.replace('dy_', '')}"

    if request.bookmark_only:
        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="douyin",
            title=title,
            cover=cover,
            task_type=request.task_type,
            bookmark_only=True,
            language=request.language,
            quality=request.quality,
            direct_url=direct_url,
            stream_url=request.stream_url,
            only_get_subtitles=request.only_get_subtitles,
            force_transcription=request.force_transcription,
        )

    if request.task_type == "cache_only":
        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="douyin",
            title=title,
            cover=cover,
            task_type=request.task_type,
            bookmark_only=False,
            quality=request.quality,
            direct_url=direct_url,
            stream_url=request.stream_url,
        )

    media_path = get_best_media_path_by_source(normalized_id)
    if media_path and os.path.exists(media_path):
        row = get_transcription_by_source(normalized_id)
        title = row['video_title'] if row else title
        cover = row['video_cover'] if row else cover

        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="douyin",
            title=title,
            cover=cover,
            task_type=request.task_type,
            bookmark_only=False,
            language=request.language,
            prompt=request.prompt,
            auto_analyze_prompt=request.auto_analyze_prompt,
            auto_analyze_prompt_id=request.auto_analyze_prompt_id,
            auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
            auto_generate_note=request.auto_generate_note,
            auto_note_style=request.auto_note_style,
            auto_note_screenshot_density=request.auto_note_screenshot_density,
            auto_note_user_prompt=request.auto_note_user_prompt,
            output_format=request.output_format,
            quality=request.quality,
            local_file_path=media_path,
            direct_url=direct_url,
            stream_url=request.stream_url,
            only_get_subtitles=request.only_get_subtitles,
            force_transcription=request.force_transcription,
        )

    # No cache — use direct_url (from client or server-side extraction)
    if direct_url:
        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="douyin",
            title=title,
            cover=cover,
            task_type=request.task_type,
            bookmark_only=False,
            language=request.language,
            prompt=request.prompt,
            auto_analyze_prompt=request.auto_analyze_prompt,
            auto_analyze_prompt_id=request.auto_analyze_prompt_id,
            auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
            auto_generate_note=request.auto_generate_note,
            auto_note_style=request.auto_note_style,
            auto_note_screenshot_density=request.auto_note_screenshot_density,
            auto_note_user_prompt=request.auto_note_user_prompt,
            output_format=request.output_format,
            quality=request.quality,
            direct_url=direct_url,
            stream_url=request.stream_url,
            only_get_subtitles=request.only_get_subtitles,
            force_transcription=request.force_transcription,
        )

    raise ValueError(
        "无法获取抖音视频直链。可能原因：视频已删除、网络无法访问抖音、或抖音反爬机制已更新。"
        "也可尝试使用浏览器插件（油猴脚本）获取直链。"
    )


async def prepare_xiaohongshu_transcription(request) -> dict:
    """
    Prepare dispatch params for a Xiaohongshu video.
    Resolves xhslink.com short links, fetches metadata + CDN URL, checks local cache.
    """
    raw_url = request.url
    resolved_url = await run_in_threadpool(resolve_xhs_url, raw_url)
    logger.info(f"🔴 [XHS] URL: {raw_url[:60]} → resolved: {resolved_url}")

    title = request.title
    cover = request.cover or ""
    direct_url = request.direct_url

    if request.source_id:
        parsed_id = request.source_id.replace("xhs_", "")
        normalized_id = f"xhs_{parsed_id}"
    else:
        normalized_id = normalize_source_id(resolved_url, "xiaohongshu")

    # Server-side extraction if metadata or direct_url missing
    if not direct_url or not title:
        logger.info(f"🔍 [XHS] Attempting server-side extraction for: {raw_url[:60]}")
        info = await get_xhs_info(raw_url)
        if info:
            if info.get("note_id"):
                normalized_id = f"xhs_{info['note_id']}"
            title = title or info.get("title")
            cover = cover or info.get("cover", "")
            direct_url = direct_url or info.get("direct_url", "")

    title = title or f"XHS {normalized_id.replace('xhs_', '')}"

    if request.bookmark_only:
        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="xiaohongshu",
            title=title,
            cover=cover,
            task_type=request.task_type,
            bookmark_only=True,
            language=request.language,
            quality=request.quality,
            direct_url=direct_url,
            stream_url=request.stream_url,
            only_get_subtitles=request.only_get_subtitles,
            force_transcription=request.force_transcription,
        )

    if request.task_type == "cache_only":
        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="xiaohongshu",
            title=title,
            cover=cover,
            task_type=request.task_type,
            bookmark_only=False,
            quality=request.quality,
            direct_url=direct_url,
            stream_url=request.stream_url,
        )

    media_path = get_best_media_path_by_source(normalized_id)
    if media_path and os.path.exists(media_path):
        row = get_transcription_by_source(normalized_id)
        title = row['video_title'] if row else title
        cover = row['video_cover'] if row else cover

        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="xiaohongshu",
            title=title,
            cover=cover,
            task_type=request.task_type,
            bookmark_only=False,
            language=request.language,
            prompt=request.prompt,
            auto_analyze_prompt=request.auto_analyze_prompt,
            auto_analyze_prompt_id=request.auto_analyze_prompt_id,
            auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
            auto_generate_note=request.auto_generate_note,
            auto_note_style=request.auto_note_style,
            auto_note_screenshot_density=request.auto_note_screenshot_density,
            auto_note_user_prompt=request.auto_note_user_prompt,
            output_format=request.output_format,
            quality=request.quality,
            local_file_path=media_path,
            direct_url=direct_url,
            stream_url=request.stream_url,
            only_get_subtitles=request.only_get_subtitles,
            force_transcription=request.force_transcription,
        )

    if direct_url:
        return dict(
            source_id=normalized_id,
            original_source=resolved_url,
            source_type="xiaohongshu",
            title=title,
            cover=cover,
            task_type=request.task_type,
            bookmark_only=False,
            language=request.language,
            prompt=request.prompt,
            auto_analyze_prompt=request.auto_analyze_prompt,
            auto_analyze_prompt_id=request.auto_analyze_prompt_id,
            auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
            auto_generate_note=request.auto_generate_note,
            auto_note_style=request.auto_note_style,
            auto_note_screenshot_density=request.auto_note_screenshot_density,
            auto_note_user_prompt=request.auto_note_user_prompt,
            output_format=request.output_format,
            quality=request.quality,
            direct_url=direct_url,
            stream_url=request.stream_url,
            only_get_subtitles=request.only_get_subtitles,
            force_transcription=request.force_transcription,
        )

    raise ValueError(
        "无法获取小红书视频直链。可能原因：笔记为图文、已删除、或小红书页面结构已更新。"
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
        language=request.language,
        prompt=request.prompt,
        auto_analyze_prompt=request.auto_analyze_prompt,
        auto_analyze_prompt_id=request.auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
        auto_generate_note=request.auto_generate_note,
        auto_note_style=request.auto_note_style,
        auto_note_screenshot_density=request.auto_note_screenshot_density,
        auto_note_user_prompt=request.auto_note_user_prompt,
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
        language=request.language,
        prompt=request.prompt,
        auto_analyze_prompt=request.auto_analyze_prompt,
        auto_analyze_prompt_id=request.auto_analyze_prompt_id,
        auto_analyze_strip_subtitle=request.auto_analyze_strip_subtitle,
        auto_generate_note=request.auto_generate_note,
        auto_note_style=request.auto_note_style,
        auto_note_screenshot_density=request.auto_note_screenshot_density,
        auto_note_user_prompt=request.auto_note_user_prompt,
        output_format=request.output_format,
        only_get_subtitles=request.only_get_subtitles,
        force_transcription=request.force_transcription,
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
        if has_cache:
            kwargs['local_file_path'] = media_path
        else:
            # Attempt server-side extraction for direct_url
            info = await get_douyin_info(original_source)
            if info and info.get("direct_urls"):
                kwargs['direct_url'] = pick_douyin_quality_url(info["direct_urls"])
                logger.info(f"[Douyin] Server-side extraction got direct_url for retranscription")
            elif info and info.get("direct_url"):
                kwargs['direct_url'] = info['direct_url']
                logger.info(f"[Douyin] Server-side extraction got direct_url for retranscription")
            else:
                raise ValueError(
                    "抖音视频无本地缓存，且无法通过服务端获取直链。"
                    "可能原因：视频已删除、网络无法访问抖音、或抖音反爬机制已更新。"
                )

    elif source_type == 'xiaohongshu':
        if has_cache:
            kwargs['local_file_path'] = media_path
        else:
            info = await get_xhs_info(original_source)
            if info and info.get("direct_url"):
                kwargs['direct_url'] = info['direct_url']
                logger.info(f"[XHS] Server-side extraction got direct_url for retranscription")
            else:
                raise ValueError(
                    "小红书视频无本地缓存，且无法通过服务端获取直链。"
                    "可能原因：笔记为图文、已删除、或小红书页面结构已更新。"
                )

    elif source_type in ('video', 'audio', 'file'):
        if not has_cache:
            raise ValueError("本地文件无缓存，无法重新转录。")
        kwargs['file_path'] = media_path

    else:
        raise ValueError(f"不支持的来源类型: {source_type}")

    return kwargs
