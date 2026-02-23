"""
Video Service Layer
Business logic extracted from the videos endpoint for reuse and testability.
"""
import re
from datetime import datetime, timedelta

from app.db import (
    get_transcription_by_source,
    batch_count_ai_summaries, batch_get_cache_counts, batch_get_video_tags,
    delete_video_meta, delete_transcriptions_by_source,
)
from app.services.media_cache import MediaCacheService
from app.utils.source_utils import normalize_source_id


def resolve_effective_source(source_id: str) -> str:
    """
    Resolve the effective source identifier for a video.
    Handles normalized IDs, legacy un-normalized records, and transcription-only records.
    Returns the effective source_id string to use for DB operations.
    """
    from app.db.video_meta import get_video_meta as _get_video_meta

    normalized_id = normalize_source_id(source_id)
    meta_record = _get_video_meta(normalized_id)

    if meta_record:
        return normalized_id

    # Fallback: legacy un-normalized record
    meta_record = _get_video_meta(source_id)
    if meta_record:
        return source_id

    # Fallback: transcription-only record
    local_record = get_transcription_by_source(normalized_id)
    if local_record:
        return local_record['source']

    local_record_raw = get_transcription_by_source(source_id)
    if local_record_raw:
        return local_record_raw['source']

    return normalized_id


def delete_single_video(source_id: str) -> tuple[bool, int]:
    """
    Delete a single video's cache, meta, and transcriptions.
    Returns (meta_deleted: bool, transcription_count: int).
    """
    effective = resolve_effective_source(source_id)

    MediaCacheService.delete_cache_for_video(effective)
    meta_deleted = delete_video_meta(effective)
    count = delete_transcriptions_by_source(effective)

    return meta_deleted, count


def compute_embed_url(source_id: str, source_type: str) -> str | None:
    """Compute the embed URL for a video based on its source type."""
    if source_type == 'bilibili':
        bvid = source_id if source_id.startswith('BV') else None
        if not bvid:
            match = re.search(r"BV\w+", source_id)
            bvid = match.group(0) if match else None
        if bvid:
            return f"//player.bilibili.com/player.html?bvid={bvid}&autoplay=0"
    elif source_type == 'youtube':
        return f"https://www.youtube.com/embed/{source_id}"
    elif source_type == 'douyin':
        vid_match = re.search(r"(\d{15,})", source_id)
        if vid_match:
            return f"https://open.douyin.com/player/video?vid={vid_match.group(1)}&autoplay=0"
    return None


def compute_effective_expiry(meta_dict: dict, cache_versions: list[dict]) -> str | None:
    """
    Compute the effective cache expiration date based on policy hierarchy:
    per-video policy > global policy.
    """
    policy = meta_dict.get('cache_policy')

    if policy == 'keep_forever':
        return '9999-12-31T23:59:59'
    if policy == 'custom':
        return meta_dict.get('cache_expires_at')

    # Global policy
    global_policy, days = MediaCacheService.get_retention_policy()

    # Find latest cached_at across all versions
    latest_cached_at = None
    if cache_versions:
        cached_at_values = [v.get('cached_at', '') for v in cache_versions if v.get('cached_at')]
        if cached_at_values:
            latest_cached_at = max(cached_at_values)

    if global_policy == 'keep_days' and days > 0 and latest_cached_at:
        try:
            cached_dt = (
                datetime.fromisoformat(latest_cached_at)
                if isinstance(latest_cached_at, str)
                else latest_cached_at
            )
            if cached_dt:
                return (cached_dt + timedelta(days=days)).isoformat()
        except Exception:
            pass
    elif global_policy == 'always_keep':
        return '9999-12-31T23:59:59'
    elif global_policy == 'delete_after_asr':
        return datetime.now().isoformat()

    return None


def build_video_list_row(r, format_cover) -> dict:
    """Convert a raw DB row tuple from the video list query into a dict."""
    cid = r[0]
    original_source = r[1]
    row_type = r[2] or 'bilibili'
    title = r[3] or cid
    cover = r[4]
    created_at = r[5]
    updated_at = r[6]
    is_archived = r[7] or 0

    count = r[8]
    row_ids_str = r[9]
    latest_status = r[10] if r[10] else 'completed'
    latest_timestamp = r[11]
    latest_asr_model = r[12]
    subtitle_flag = r[13]
    is_analyzing = bool(r[14])

    r_ids = [int(x) for x in row_ids_str.split(',')] if row_ids_str else []

    return {
        "bvid": cid,
        "source_id": cid,
        "source": original_source or cid,
        "source_type": row_type,
        "title": title,
        "cover": format_cover(cover),
        "last_updated": latest_timestamp or updated_at or created_at,
        "last_updated_ts": latest_timestamp or updated_at or created_at,
        "latest_status": latest_status,
        "asr_model": latest_asr_model,
        "is_subtitle": subtitle_flag,
        "count": count,
        "ai_count": 0,
        "is_analyzing_ai": is_analyzing,
        "id": r_ids[0] if r_ids else None,
        "_row_ids": r_ids,
        "is_archived": is_archived,
        "media_available": False,
        "cache_count": 0,
    }


def enrich_video_list(videos: list[dict], all_source_ids: list[str], all_row_ids: list[int]):
    """Batch-enrich video list with AI counts, cache counts, and tags (in-place)."""
    # AI summary counts
    ai_counts = batch_count_ai_summaries(all_row_ids) if all_row_ids else {}
    for v in videos:
        v['ai_count'] = sum(ai_counts.get(rid, 0) for rid in v['_row_ids'])
        v.pop('_row_ids', None)

    # Cache entry counts
    cache_counts = batch_get_cache_counts(all_source_ids) if all_source_ids else {}
    for v in videos:
        ca_count = cache_counts.get(v['source_id'], 0)
        v['media_available'] = ca_count > 0
        v['cache_count'] = ca_count

    # Tags
    video_tags_map = batch_get_video_tags(all_source_ids)
    for v in videos:
        v['tags'] = video_tags_map.get(v['source_id'], [])


def apply_filters(
    video_list: list[dict],
    *,
    status: str = None,
    has_segments: bool = None,
    has_ai: bool = None,
    has_cached: bool = None,
    is_subtitle: bool = None,
    include_archived: str = None,
    search: str = None,
) -> list[dict]:
    """Apply all filter criteria to the video list."""
    result = video_list

    if status:
        if status == 'empty':
            result = [v for v in result if v['count'] == 0]
        elif status == 'no_content':
            result = [v for v in result if v['count'] == 0 and v['cache_count'] == 0]
        elif status == 'cached_only':
            result = [v for v in result if v['count'] == 0 and v['cache_count'] > 0]
        elif status == 'completed':
            result = [v for v in result if v.get('latest_status') == 'completed']
        else:
            result = [v for v in result if v.get('latest_status') == status]

    if has_segments is not None:
        result = [v for v in result if (v['count'] > 0) == has_segments]
    if has_ai is not None:
        result = [v for v in result if (v['ai_count'] > 0) == has_ai]
    if has_cached is not None:
        result = [v for v in result if bool(v['media_available']) == has_cached]
    if is_subtitle is not None:
        result = [v for v in result if bool(v.get('is_subtitle')) == is_subtitle]

    # Archive filter
    if include_archived == '1':
        result = [v for v in result if v.get('is_archived') == 1]
    elif include_archived == 'all':
        pass
    else:
        result = [v for v in result if not v.get('is_archived')]

    # Title search
    if search and search.strip():
        q = search.strip().lower()
        result = [v for v in result if q in (v.get('title') or '').lower()]

    return result


def apply_sorting(video_list: list[dict], sort_by: str = 'time'):
    """Sort the video list in-place."""
    if sort_by == 'title':
        video_list.sort(key=lambda x: (x.get('title') or x.get('source_id') or '').lower())
    elif sort_by == 'segments':
        video_list.sort(key=lambda x: x['count'], reverse=True)
    else:  # 'time' (default)
        video_list.sort(key=lambda x: x.get('last_updated') or '', reverse=True)


def build_paginated_video_list(
    *,
    format_cover,
    page: int = 1,
    limit: int = 9,
    source_type: str = None,
    tag_id: int = None,
    exclude_tag_id: int = None,
    sort_by: str = 'time',
    status: str = None,
    has_segments: bool = None,
    has_ai: bool = None,
    has_cached: bool = None,
    is_subtitle: bool = None,
    include_archived: str = None,
    search: str = None,
) -> dict:
    """
    Build a paginated, filtered, sorted video list.
    Orchestrates: DAO query → row building → enrichment → filtering → sorting → pagination.
    """
    from app.db.video_meta import query_video_list_with_stats

    rows = query_video_list_with_stats(
        source_type=source_type, tag_id=tag_id, exclude_tag_id=exclude_tag_id
    )

    all_source_ids = []
    all_row_ids = []
    videos = []

    for r in rows:
        v_dict = build_video_list_row(r, format_cover)
        all_row_ids.extend(v_dict['_row_ids'])
        all_source_ids.append(v_dict['source_id'])
        videos.append(v_dict)

    enrich_video_list(videos, all_source_ids, all_row_ids)

    video_list = apply_filters(
        videos,
        status=status,
        has_segments=has_segments,
        has_ai=has_ai,
        has_cached=has_cached,
        is_subtitle=is_subtitle,
        include_archived=include_archived,
        search=search,
    )

    apply_sorting(video_list, sort_by)

    total = len(video_list)
    start = (page - 1) * limit
    end = start + limit

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": video_list[start:end],
    }


def build_video_detail(source_id: str, format_cover) -> dict | None:
    """
    Build full detail dict for a specific video.
    Handles transcription fallback, AI summaries, cache, embed URL, tags, etc.
    Returns None if video not found.
    """
    import os
    from app.db import (
        get_ai_summaries, get_best_media_path_by_source,
        get_cache_entries, get_cache_entry,
        get_video_meta, get_tags_for_video,
    )

    source_id = normalize_source_id(source_id)
    row_data = get_transcription_by_source(source_id)

    row = {}
    if row_data:
        row = dict(row_data)
    else:
        from app.utils.source_utils import infer_source_type
        meta = get_video_meta(source_id)
        if not meta:
            return None

        sid = meta['source_id']
        s_type = infer_source_type(sid)

        row = {
            'id': None,
            'source': sid,
            'original_source': meta['original_source'] or sid,
            'source_type': s_type,
            'video_title': meta['video_title'],
            'video_cover': meta['video_cover'],
            'raw_text': '',
            'ai_summary': None,
            'ai_status': None,
            'asr_model': None,
            'is_subtitle': 0,
            'is_pinned': 0,
            'user_prompt': None,
            'segment_start': 0.0,
            'segment_end': None,
            'timestamp': meta['updated_at'] or meta['created_at'],
            'stream_url': meta['stream_url'],
            'stream_expired': meta['stream_expired'],
            'is_archived': dict(meta).get('is_archived', 0),
        }

    summaries = get_ai_summaries(row['id'])

    media_path = get_best_media_path_by_source(row['source'])
    media_available = bool(media_path and os.path.exists(media_path))

    cache_entries = get_cache_entries(row['source'])
    cache_versions = [dict(e) for e in cache_entries]

    meta = get_video_meta(source_id)
    meta_dict = dict(meta) if meta else {}

    embed_url = compute_embed_url(
        source_id, row.get('source_type', 'bilibili')
    )
    effective_expires_at = compute_effective_expiry(meta_dict, cache_versions)

    return {
        "id": row['id'],
        "source": row.get('original_source') or row['source'],
        "source_id": row['source'],
        "source_type": row.get('source_type', 'bilibili'),
        "title": row.get('video_title'),
        "cover": format_cover(row.get('video_cover')),
        "raw_text": row['raw_text'],
        "text": re.sub(r'<\|.*?\|>', '', row['raw_text']),
        "ai_summary": row['ai_summary'],
        "ai_status": row.get('ai_status'),
        "latest_status": row.get('status', 'completed'),
        "asr_model": row.get('asr_model'),
        "is_subtitle": row.get('is_subtitle', 0),
        "is_pinned": row.get('is_pinned', 0),
        "user_prompt": row.get('user_prompt'),
        "summaries": [dict(s) for s in summaries],
        "segment_start": row['segment_start'],
        "segment_end": row['segment_end'],
        "timestamp": row['timestamp'],
        "stream_url": row.get('stream_url'),
        "stream_expired": bool(row.get('stream_expired', False)),
        "is_archived": meta_dict.get('is_archived', 0),
        "media_path": media_path,
        "media_available": media_available,
        "cache_versions": cache_versions,
        "cache_expires_at": meta_dict.get('cache_expires_at'),
        "cache_policy": meta_dict.get('cache_policy'),
        "effective_expires_at": effective_expires_at,
        "notes": meta_dict.get('notes'),
        "embed_url": embed_url,
        "tags": get_tags_for_video(row['source']),
    }


async def refresh_metadata(source_id: str, format_cover, download_cover_fn) -> dict:
    """
    Re-fetch video metadata from the source platform and update DB.
    Returns dict with status, title, cover, source_type.
    Raises ValueError on unsupported platforms or failure.
    """
    from starlette.concurrency import run_in_threadpool
    from app.db import update_video_metadata, get_system_config
    from app.db.video_meta import get_video_meta as _get_video_meta
    from app.downloaders.bilibili import get_video_info
    from app.downloaders.youtube import get_youtube_info
    from app.utils.source_utils import infer_source_type

    source_id = normalize_source_id(source_id)

    local_record = get_transcription_by_source(source_id)
    source_type = 'bilibili'
    actual_source = source_id

    if local_record:
        rec_dict = dict(local_record)
        source_type = rec_dict.get('source_type') or 'bilibili'
        actual_source = rec_dict.get('original_source') or rec_dict.get('source') or source_id
    else:
        meta = _get_video_meta(source_id)
        if meta:
            meta_dict = dict(meta)
            actual_source = meta_dict.get('original_source') or source_id
            source_type = infer_source_type(source_id)

    if source_type == 'douyin':
        raise ValueError("抖音不支持服务器端同步 (请使用浏览器插件)")

    if source_type == 'youtube':
        proxy = get_system_config('proxy_url')
        info = get_youtube_info(f"https://www.youtube.com/watch?v={source_id}", proxy=proxy)
        if not info:
            raise ValueError("无法获取 YouTube 元数据")

        cover = info['cover']
        if cover and (cover.startswith('http') or cover.startswith('//')):
            cover = await run_in_threadpool(download_cover_fn, cover)
        update_video_metadata(source_id, info['title'], cover)
        return {
            "status": "success",
            "updated_count": 1,
            "title": info['title'],
            "cover": format_cover(cover),
            "source_type": "youtube",
        }

    # Default: Bilibili
    info = get_video_info(source_id)
    if not info:
        if source_id.startswith('BV'):
            raise ValueError("Bilibili 元数据获取失败")
        else:
            raise ValueError("此来源不支持服务器端同步")

    cover = info['cover']
    if cover and (cover.startswith('http') or cover.startswith('//')):
        cover = await run_in_threadpool(download_cover_fn, cover)
    update_video_metadata(source_id, info['title'], cover)
    return {
        "status": "success",
        "updated_count": 1,
        "title": info['title'],
        "cover": format_cover(cover),
        "source_type": "bilibili",
    }

