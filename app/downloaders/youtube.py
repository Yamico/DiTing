import yt_dlp
import os
import time
import uuid
import tempfile
from app.core.logger import logger
from app.core.config import settings
from app.services.storage import storage
from app.downloaders._utils import (
    make_progress_hook,
    find_downloaded_file,
    get_video_format_string,
    parse_max_height,
    check_and_reraise_cancel,
    safe_cleanup,
    retry_on_network_error,
)


def _get_youtube_cookies():
    """Read YouTube cookies text from system config, write to temp file for yt-dlp."""
    from app.db import get_system_config
    cookie_text = get_system_config('youtube_cookies')
    if not cookie_text or not cookie_text.strip():
        return None
    try:
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8')
        tmp.write(cookie_text)
        tmp.close()
        return tmp.name
    except Exception as e:
        logger.warning(f"⚠️ Failed to create YouTube cookie file: {e}")
        return None


def _cleanup_cookie_file(cookie_file):
    """Remove temporary cookie file."""
    if cookie_file:
        try:
            os.remove(cookie_file)
        except OSError:
            pass


def _get_max_resolution_config():
    """Read the global `max_resolution` config (raw string), or None if unset."""
    try:
        from app.db import get_system_config
        return get_system_config('max_resolution')
    except Exception:
        return None


def _is_format_error(e):
    """Check if an exception is a yt-dlp format availability error (often caused by bad cookies)."""
    msg = str(e).lower()
    return 'requested format is not available' in msg


def _is_rate_limit_error(e):
    """Check if an exception is a YouTube rate-limit (HTTP 429) error."""
    msg = str(e).lower()
    return '429' in msg or 'too many requests' in msg


# Subtitle language groups, keyed by primary language. Each group lists the
# YouTube language codes (most-preferred first) that satisfy that language.
_SUBTITLE_LANG_GROUPS = {
    'zh': ['zh-Hans', 'zh-CN', 'zh', 'zh-TW', 'zh-Hant'],
    'en': ['en', 'en-US', 'en-GB', 'en-orig'],
    'ja': ['ja'],
    'ko': ['ko'],
}


def _build_subtitle_lang_priority(language):
    """
    Build an ordered list of language-code groups based on the requested language.
    The requested language's group comes first; the remaining groups follow as
    fallbacks. Returns a list of lists, e.g. [['en', 'en-US', ...], ['zh-Hans', ...]].
    """
    lang = (language or 'zh').lower()
    if lang.startswith('en'):
        primary = 'en'
    elif lang.startswith('zh'):
        primary = 'zh'
    elif lang.startswith('ja'):
        primary = 'ja'
    elif lang.startswith('ko'):
        primary = 'ko'
    else:
        primary = 'zh'

    ordered_keys = [primary] + [k for k in _SUBTITLE_LANG_GROUPS if k != primary]
    return [_SUBTITLE_LANG_GROUPS[k] for k in ordered_keys]


def get_youtube_info(url, proxy=None):
    """
    Fetch metadata for a YouTube video.
    If cookies cause a format error, automatically retries without cookies.
    """
    cookie_file = _get_youtube_cookies()
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'ignore_no_formats_error': True,
        'proxy': proxy,
    }
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'title': info.get('title'),
                'cover': info.get('thumbnail'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader'),
                'description': info.get('description'),
                'view_count': info.get('view_count'),
                'id': info.get('id')
            }
    except Exception as e:
        # If cookies caused format error, retry without cookies
        if cookie_file and _is_format_error(e):
            logger.warning(f"⚠️ yt-dlp format error with cookies (original error: {e}), retrying without cookies...")
            _cleanup_cookie_file(cookie_file)
            cookie_file = None
            try:
                ydl_opts.pop('cookiefile', None)
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    return {
                        'title': info.get('title'),
                        'cover': info.get('thumbnail'),
                        'duration': info.get('duration'),
                        'uploader': info.get('uploader'),
                        'description': info.get('description'),
                        'view_count': info.get('view_count'),
                        'id': info.get('id')
                    }
            except Exception as e2:
                logger.error(f"❌ yt-dlp Info Fetch Error (no cookies): {e2}")
                return None
        logger.error(f"❌ yt-dlp Info Fetch Error: {e}")
        return None
    finally:
        _cleanup_cookie_file(cookie_file)


# In-memory TTL cache for format probes, to avoid re-hitting YouTube (rate limits)
# when the user opens the picker repeatedly. Keyed by URL -> (timestamp, result).
_PROBE_CACHE = {}
_PROBE_TTL_SECONDS = 300

# Standard resolution rungs to surface in the picker (descending).
_RESOLUTION_LADDER = [1080, 720, 480, 360]


def _stream_size_bytes(fmt, duration):
    """Best-effort byte size of a single stream: exact filesize, approx, or bitrate*duration."""
    size = fmt.get('filesize') or fmt.get('filesize_approx')
    if size:
        return int(size), True
    tbr = fmt.get('tbr')  # total bitrate, kbit/s
    if tbr and duration:
        return int(tbr * 1000 / 8 * duration), False
    return 0, False


def _pick_video_at_height(video_formats, height):
    """Among formats at a given height, prefer H.264 (avc1, what we download), then highest bitrate."""
    same = [f for f in video_formats if f.get('height') == height]
    if not same:
        return None
    return max(same, key=lambda f: (str(f.get('vcodec') or '').startswith('avc'), f.get('tbr') or 0))


def _pick_best_audio(audio_formats):
    """Pick the highest-bitrate audio-only stream."""
    if not audio_formats:
        return None
    return max(audio_formats, key=lambda f: (f.get('abr') or f.get('tbr') or 0))


def probe_youtube_formats(url, proxy=None):
    """
    Inspect a YouTube video and return the concrete download options available,
    grouped into resolution tiers with approximate file sizes. Result is cached
    for a few minutes to avoid hammering YouTube (which rate-limits aggressively).

    Returns a dict:
        {
          "title": str,
          "duration": int | None,
          "tiers": [{"quality","label","height","fps","approx_bytes","exact"}, ...],
          "audio": {"quality":"audio","label","approx_bytes","exact"} | None
        }
    or None on failure.
    """
    cached = _PROBE_CACHE.get(url)
    if cached and (time.time() - cached[0]) < _PROBE_TTL_SECONDS:
        return cached[1]

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'ignore_no_formats_error': True,
        'proxy': proxy,
    }
    cookie_file = _get_youtube_cookies()
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file

    def _extract():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        try:
            info = _extract()
        except Exception as e:
            # Bad cookies can cause format errors — retry once without them
            if cookie_file and _is_format_error(e):
                logger.warning(f"⚠️ Format probe error with cookies ({e}), retrying without cookies...")
                ydl_opts.pop('cookiefile', None)
                info = _extract()
            else:
                raise

        formats = info.get('formats') or []
        duration = info.get('duration')

        video_formats = [f for f in formats if f.get('vcodec') not in (None, 'none') and f.get('height')]
        audio_formats = [f for f in formats if f.get('acodec') not in (None, 'none') and f.get('vcodec') in (None, 'none')]
        best_audio = _pick_best_audio(audio_formats)
        audio_bytes, audio_exact = _stream_size_bytes(best_audio, duration) if best_audio else (0, False)

        heights = sorted({f['height'] for f in video_formats}, reverse=True)
        target_heights = [h for h in heights if h in _RESOLUTION_LADDER]
        # Always surface the true max if it's above our ladder (e.g. 1440p/2160p)
        if heights and heights[0] > _RESOLUTION_LADDER[0]:
            target_heights = [heights[0]] + target_heights
        # If nothing matched the ladder (only very low res), fall back to the max available
        if not target_heights and heights:
            target_heights = [heights[0]]
        target_heights = sorted(set(target_heights), reverse=True)

        tiers = []
        for h in target_heights:
            vf = _pick_video_at_height(video_formats, h)
            if not vf:
                continue
            v_bytes, v_exact = _stream_size_bytes(vf, duration)
            tiers.append({
                "quality": str(h),
                "label": f"{h}p",
                "height": h,
                "fps": vf.get('fps'),
                "approx_bytes": (v_bytes + audio_bytes) if v_bytes else 0,
                "exact": bool(v_exact and (audio_exact or not best_audio)),
            })

        audio_tier = None
        if best_audio:
            audio_tier = {
                "quality": "audio",
                "label": "Audio",
                "approx_bytes": audio_bytes,
                "exact": audio_exact,
            }

        result = {
            "title": info.get('title'),
            "duration": duration,
            "tiers": tiers,
            "audio": audio_tier,
        }
        _PROBE_CACHE[url] = (time.time(), result)
        return result

    except Exception as e:
        logger.error(f"❌ Format probe failed for {url}: {e}")
        return None
    finally:
        _cleanup_cookie_file(cookie_file)


def download_youtube_video(url, output_dir=None, proxy=None, task_id=None, check_cancel_func=None, progress_callback=None):
    """
    Download YouTube video as audio (m4a/best audio) for ASR.
    Returns the absolute path to the downloaded file.
    """
    if output_dir is None:
        output_dir = settings.TEMP_DOWNLOADS_DIR

    filename_base = str(uuid.uuid4())
    output_template = os.path.join(output_dir, f"{filename_base}.%(ext)s")

    cookie_file = _get_youtube_cookies()
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
        'proxy': proxy,
        'progress_hooks': [make_progress_hook(task_id, check_cancel_func, progress_callback)],
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'm4a',
        }],
    }
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file

    @retry_on_network_error(max_retries=3, retry_delay=5)
    def _do_download():
        if check_cancel_func:
            check_cancel_func(task_id)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(f"📥 Downloading YouTube: {url} (Proxy: {proxy})")
            ydl.extract_info(url, download=True)
        return find_downloaded_file(output_dir, filename_base, '.m4a')

    try:
        return _do_download()
    except Exception as e:
        check_and_reraise_cancel(e)
        # Retry with simpler format on format error (keep cookies for auth)
        if _is_format_error(e):
            logger.warning(f"⚠️ yt-dlp format error (original: {e}), retrying with fallback format...")
            filename_base2 = str(uuid.uuid4())
            ydl_opts['outtmpl'] = os.path.join(output_dir, f"{filename_base2}.%(ext)s")
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts.pop('postprocessors', None)
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.extract_info(url, download=True)
                return find_downloaded_file(output_dir, filename_base2)
            except Exception as e2:
                check_and_reraise_cancel(e2)
                logger.error(f"❌ yt-dlp Download Error (fallback format): {e2}")
                return None
        logger.error(f"❌ yt-dlp Download Error: {e}")
        return None
    finally:
        _cleanup_cookie_file(cookie_file)


def download_youtube_media(url, quality='best', output_dir=None, proxy=None, task_id=None, check_cancel_func=None, progress_callback=None):
    """
    Download YouTube video (video+audio).
    Returns the absolute path to the downloaded file (.mp4).
    """
    if output_dir is None:
        output_dir = settings.TEMP_DOWNLOADS_DIR

    filename_base = str(uuid.uuid4())
    output_template = os.path.join(output_dir, f"{filename_base}.%(ext)s")

    cookie_file = _get_youtube_cookies()
    max_height = parse_max_height(_get_max_resolution_config())
    ydl_opts = {
        'format': get_video_format_string(quality, max_height=max_height),
        'outtmpl': output_template,
        'merge_output_format': 'mp4',
        'quiet': True,
        'no_warnings': True,
        'proxy': proxy,
        'progress_hooks': [make_progress_hook(task_id, check_cancel_func, progress_callback, label="Downloading Video")],
    }
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file

    @retry_on_network_error(max_retries=3, retry_delay=5)
    def _do_download():
        if check_cancel_func:
            check_cancel_func(task_id)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(f"📥 Downloading YouTube Video: {url} (Proxy: {proxy})")
            ydl.extract_info(url, download=True)
        return find_downloaded_file(output_dir, filename_base, '.mp4')

    try:
        return _do_download()
    except Exception as e:
        check_and_reraise_cancel(e)
        # Retry with simpler format on format error (keep cookies for auth)
        if _is_format_error(e):
            logger.warning(f"⚠️ yt-dlp video format error (original: {e}), retrying with fallback format...")
            filename_base2 = str(uuid.uuid4())
            ydl_opts['outtmpl'] = os.path.join(output_dir, f"{filename_base2}.%(ext)s")
            ydl_opts['format'] = 'worst' if quality == 'worst' else get_video_format_string('best', max_height=max_height)
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.extract_info(url, download=True)
                return find_downloaded_file(output_dir, filename_base2, '.mp4')
            except Exception as e2:
                check_and_reraise_cancel(e2)
                logger.error(f"❌ yt-dlp Video Download Error (fallback format): {e2}")
                return None
        logger.error(f"❌ yt-dlp Video Download Error: {e}")
        return None
    finally:
        _cleanup_cookie_file(cookie_file)


def download_youtube_subtitles(url, output_dir=None, proxy=None, language='zh'):
    """
    Attempt to download subtitles for a YouTube video.
    Logic:
    1. Prefer Manual Subtitles > Auto-generated
    2. Prefer the requested `language` (e.g. 'en' -> en, en-US...) > other languages
    Returns: (path_to_subtitle_file, subtitle_content_string) or (None, None)
    """
    if output_dir is None:
        output_dir = settings.TEMP_DOWNLOADS_DIR

    filename_base = str(uuid.uuid4())
    output_template = os.path.join(output_dir, f"{filename_base}")  # yt-dlp appends .lang.srt

    # Ordered language-code groups: requested language first, others as fallback
    lang_priority = _build_subtitle_lang_priority(language)

    cookie_file = _get_youtube_cookies()
    try:
        result = _download_subtitles_inner(url, output_dir, proxy, cookie_file, filename_base, output_template, lang_priority)
        if result:
            return result

        # If failed with cookies, retry without
        if cookie_file:
            logger.warning(f"⚠️ Subtitle fetch failed with cookies, retrying without cookies...")
            _cleanup_cookie_file(cookie_file)
            cookie_file = None
            filename_base = str(uuid.uuid4())
            output_template = os.path.join(output_dir, f"{filename_base}")
            result = _download_subtitles_inner(url, output_dir, proxy, None, filename_base, output_template, lang_priority)
            if result:
                return result

        return None, None

    except Exception as e:
        logger.error(f"❌ Subtitle download error: {e}")
        return None, None
    finally:
        _cleanup_cookie_file(cookie_file)


def _download_subtitles_inner(url, output_dir, proxy, cookie_file, filename_base, output_template, lang_priority):
    """Inner implementation for subtitle download. Returns (path, content) or None on failure."""
    try:
        # Step 1: Fetch metadata to inspect available subtitles
        ydl_opts_meta = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'ignore_no_formats_error': True,
            'proxy': proxy,
        }
        if cookie_file:
            ydl_opts_meta['cookiefile'] = cookie_file

        target_lang = None
        is_auto = False

        def find_lang(available_langs):
            """Pick the first available code, scanning groups in priority order."""
            for group in lang_priority:
                for code in group:
                    if code in available_langs:
                        return code
            return None

        with yt_dlp.YoutubeDL(ydl_opts_meta) as ydl:
            logger.info(f"🔍 Fetching subtitle metadata for {url}...")
            info = ydl.extract_info(url, download=False)

            subtitles = info.get('subtitles', {})
            auto_captions = info.get('automatic_captions', {})

            # 1. Check Manual Subtitles
            target_lang = find_lang(subtitles.keys())
            if not target_lang and subtitles:
                target_lang = list(subtitles.keys())[0]

            if target_lang:
                logger.info(f"✅ Found Manual Subtitle: {target_lang}")
                is_auto = False
            else:
                # 2. Check Auto Subtitles
                target_lang = find_lang(auto_captions.keys())
                if not target_lang and auto_captions:
                    target_lang = list(auto_captions.keys())[0]

                if target_lang:
                    logger.info(f"✅ Found Auto-Generated Subtitle: {target_lang}")
                    is_auto = True

        if not target_lang:
            logger.info("❌ No subtitles found.")
            return None

        # Step 2: Download specific subtitle.
        # YouTube's timedtext endpoint rate-limits aggressively (HTTP 429), so we
        # retry with exponential backoff — 429 is transient and waiting clears it.
        ydl_opts_down = {
            'skip_download': True,
            'ignore_no_formats_error': True,
            'writesubtitles': not is_auto,
            'writeautomaticsub': is_auto,
            'subtitleslangs': [target_lang],
            'subtitlesformat': 'srt',
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': True,
            'proxy': proxy,
            'sleep_interval_requests': 1,
        }
        if cookie_file:
            ydl_opts_down['cookiefile'] = cookie_file

        max_retries = 3
        for attempt in range(max_retries):
            try:
                with yt_dlp.YoutubeDL(ydl_opts_down) as ydl:
                    ydl.download([url])
                break
            except Exception as e:
                if _is_rate_limit_error(e) and attempt < max_retries - 1:
                    wait_time = 10 * (attempt + 1)
                    logger.warning(
                        f"⚠️ Subtitle download rate-limited (429), "
                        f"retrying in {wait_time}s ({attempt + 1}/{max_retries})..."
                    )
                    time.sleep(wait_time)
                    continue
                raise

        # Find the downloaded file
        for f in os.listdir(output_dir):
            if f.startswith(filename_base) and f.endswith('.srt'):
                expected_file = os.path.join(output_dir, f)
                with open(expected_file, 'r', encoding='utf-8') as fh:
                    content = fh.read()
                return expected_file, content

    except Exception as e:
        if _is_format_error(e):
            logger.warning(f"⚠️ Subtitle fetch format error (likely bad cookies): {e}")
            return None  # Signal caller to retry without cookies
        logger.error(f"❌ Subtitle download error: {e}")
        return None

    return None
