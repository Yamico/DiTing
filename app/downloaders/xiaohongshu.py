"""
Xiaohongshu (XHS / 小红书) downloader.

Pipeline:
  1. Extract URL (incl. xsec_token) from share text, resolve xhslink.com short links.
  2. GET the note page with desktop UA.
  3. Parse `window.__INITIAL_STATE__` JSON blob from HTML.
  4. Pick the best video stream (h264 > h265 > av1) from note.video.media.stream.
  5. Stream-download to temp dir.
"""
import json
import os
import re
import uuid
from urllib.parse import urlparse, parse_qs

import httpx
import requests

from app.core.logger import logger
from app.services.storage import storage
from app.downloaders._utils import (
    check_and_reraise_cancel,
    safe_cleanup,
    retry_on_network_error,
)

_DESKTOP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)

_PAGE_HEADERS = {
    "User-Agent": _DESKTOP_UA,
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def extract_share_url(text: str) -> str | None:
    """Extract the first http(s) URL from a share text blob."""
    if not text:
        return None
    m = re.search(r"https?://[^\s]+", text)
    return m.group(0) if m else (text.strip() or None)


async def resolve_xhs_short_url(url: str) -> str:
    """Follow xhslink.com redirects to the canonical xiaohongshu.com URL."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=10, headers=_PAGE_HEADERS) as client:
        resp = await client.get(url)
        return str(resp.url)


def extract_note_id(url: str) -> tuple[str | None, str | None]:
    """Return (note_id, xsec_token). note_id is the hex id from URL path."""
    try:
        parsed = urlparse(url)
    except Exception:
        return None, None
    m = re.search(r"/(?:discovery/item|explore|item)/([0-9a-fA-F]+)", parsed.path)
    note_id = m.group(1) if m else None
    xsec = None
    if parsed.query:
        xsec = parse_qs(parsed.query).get("xsec_token", [None])[0]
    return note_id, xsec


def _parse_initial_state(html: str) -> dict | None:
    m = re.search(
        r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\})</script>",
        html,
        re.DOTALL,
    )
    if not m:
        return None
    raw = m.group(1)
    raw = re.sub(r"\bundefined\b", "null", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning(f"[XHS] Failed to parse __INITIAL_STATE__: {e}")
        return None


def _pick_note_detail(state: dict, note_id: str | None) -> dict | None:
    note_map = (
        state.get("note", {}).get("noteDetailMap")
        or state.get("noteDetailMap")
        or {}
    )
    if not note_map:
        return None
    entry = note_map.get(note_id) if note_id else None
    if not entry:
        entry = next(iter(note_map.values()))
    return entry.get("note") or entry


def _pick_video_url(note: dict) -> str | None:
    video = note.get("video")
    if not video:
        return None
    stream = video.get("media", {}).get("stream", {}) or {}
    for codec in ("h264", "h265", "av1"):
        arr = stream.get(codec) or []
        if arr:
            first = arr[0]
            url = first.get("masterUrl") or (first.get("backupUrls") or [None])[0]
            if url:
                return url
    consumer = video.get("consumer", {}) or {}
    key = consumer.get("originVideoKey") or consumer.get("origin_video_key")
    if key:
        return f"https://sns-video-bd.xhscdn.com/{key}"
    return None


def _pick_cover_url(note: dict) -> str:
    image_list = note.get("imageList") or note.get("image_list") or []
    if image_list:
        first = image_list[0]
        if isinstance(first, dict):
            return first.get("urlDefault") or first.get("url") or ""
    video = note.get("video") or {}
    image = video.get("image", {}) or {}
    return image.get("firstFrameFileid") or ""


async def get_xhs_info(raw_input: str) -> dict | None:
    """
    Full extraction: resolve share text / short link → parse note page → return info dict.

    Returns:
        {"title", "author", "cover", "direct_url", "note_id", "xsec_token"} or None on failure.
    """
    try:
        url = extract_share_url(raw_input) or raw_input
        if "xhslink.com" in url:
            url = await resolve_xhs_short_url(url)
        logger.info(f"[XHS] Resolved: {raw_input[:60]} -> {url}")

        note_id, xsec = extract_note_id(url)

        # XHS returns an empty body when share-tracking params (source, xhsshare, xsec_source)
        # are present. Fetch a clean canonical URL with only xsec_token.
        if note_id:
            fetch_url = f"https://www.xiaohongshu.com/discovery/item/{note_id}"
            if xsec:
                fetch_url += f"?xsec_token={xsec}"
        else:
            fetch_url = url

        async with httpx.AsyncClient(follow_redirects=True, timeout=20, headers=_PAGE_HEADERS) as client:
            resp = await client.get(fetch_url)
            resp.raise_for_status()
            html = resp.text

        if not html:
            logger.warning(f"[XHS] Empty response body for {fetch_url}")
            return None

        state = _parse_initial_state(html)
        if not state:
            logger.warning(f"[XHS] __INITIAL_STATE__ not found for {fetch_url}")
            return None

        note = _pick_note_detail(state, note_id)
        if not note:
            logger.warning(f"[XHS] note detail not found for note_id={note_id}")
            return None

        title = note.get("title") or (note.get("desc") or "")[:80]
        author = (note.get("user") or {}).get("nickname", "")
        cover = _pick_cover_url(note)
        direct_url = _pick_video_url(note)

        if not direct_url:
            logger.warning(f"[XHS] No video stream (image-only note?) for note_id={note_id}")
            return None

        # Prefer the actual note_id from the response to keep IDs stable across share variants
        resolved_note_id = note.get("noteId") or note.get("note_id") or note_id

        result = {
            "title": title or f"XHS {resolved_note_id}",
            "author": author,
            "cover": cover,
            "direct_url": direct_url,
            "note_id": resolved_note_id,
            "xsec_token": xsec,
        }
        logger.info(f"[XHS] Extracted: title={title[:40]}, author={author}, note_id={resolved_note_id}")
        return result

    except Exception as e:
        logger.error(f"[XHS] Extraction failed for {raw_input[:60]}: {e}")
        return None


@retry_on_network_error(max_retries=3, retry_delay=5)
def download_xhs_video(direct_url, referer="https://www.xiaohongshu.com/", task_id=None, check_cancel_func=None, progress_callback=None):
    """Download a XHS video from a CDN URL. Returns the local file path."""
    filename = f"{uuid.uuid4()}.mp4"
    output_path = storage.get_temp_download_path(filename)

    headers = {
        "User-Agent": _DESKTOP_UA,
        "Referer": referer,
    }

    logger.info(f"📥 [XHS] Downloading from CDN: {direct_url[:60]}...")

    if check_cancel_func:
        check_cancel_func(task_id)

    try:
        with requests.get(direct_url, headers=headers, stream=True, timeout=30) as r:
            if r.status_code != 200:
                logger.error(f"❌ [XHS] Download failed. Status: {r.status_code}")
                return None

            total_size = int(r.headers.get('content-length', 0))
            downloaded = 0

            with open(output_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if check_cancel_func:
                        check_cancel_func(task_id)
                    f.write(chunk)
                    downloaded += len(chunk)

                    if total_size > 0 and progress_callback:
                        pct = (downloaded / total_size) * 100
                        progress_callback(task_id, pct, f"Downloading: {int(pct)}%")

        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            logger.info(f"✅ [XHS] Download saved: {output_path}")
            return output_path
        else:
            logger.error("❌ [XHS] File not found or empty after download")
            safe_cleanup(output_path)
            return None

    except Exception as e:
        safe_cleanup(output_path)
        check_and_reraise_cancel(e)
        logger.error(f"❌ [XHS] Exception during download: {e}")
        raise
