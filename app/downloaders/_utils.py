"""
Shared utilities for all downloaders.
Provides common logic: progress hooks, file lookup, retry, format selection, etc.
"""
import os
import time
import uuid
import functools
from app.core.logger import logger


class DownloadBlockedError(Exception):
    """
    Raised when a download is blocked by the source's anti-bot / risk control
    (e.g. Bilibili HTTP 412 Precondition Failed). Not retryable — the message is
    actionable and is surfaced to the user verbatim.
    """


def make_progress_hook(task_id=None, check_cancel_func=None, progress_callback=None, label="Downloading"):
    """
    Factory for yt-dlp progress hooks.
    Returns a hook function compatible with yt-dlp's `progress_hooks` option.
    """
    def hook(d):
        if check_cancel_func:
            check_cancel_func(task_id)

        if d['status'] == 'downloading':
            p = d.get('_percent_str', '0%').replace('%', '')
            try:
                val = float(p)
                if progress_callback:
                    progress_callback(
                        task_id, val,
                        f"{label}: {d.get('_percent_str')} | Speed: {d.get('_speed_str')} | ETA: {d.get('_eta_str')}"
                    )
            except ValueError:
                pass
        elif d['status'] == 'finished':
            if progress_callback:
                progress_callback(task_id, 100, "Download finished, converting...")

    return hook


def find_downloaded_file(download_dir, filename_base, expected_ext=None):
    """
    Locate a downloaded file by its UUID base name.
    
    Args:
        download_dir: Directory to search in.
        filename_base: UUID-based filename prefix (without extension).
        expected_ext: Expected extension (e.g. '.mp3', '.mp4', '.m4a').
                      If provided, checks the exact path first.
    
    Returns:
        Absolute path to the file, or None if not found.
    """
    # 1. Check exact expected path
    if expected_ext:
        expected_path = os.path.join(download_dir, f"{filename_base}{expected_ext}")
        if os.path.exists(expected_path):
            return expected_path

    # 2. Fallback: scan directory for any file starting with the base name
    try:
        for f in os.listdir(download_dir):
            if f.startswith(filename_base):
                return os.path.join(download_dir, f)
    except OSError:
        pass

    return None


def _height_capped_format(height):
    """
    Build a yt-dlp format string capped at a maximum resolution `height`.
    Prefers H.264 (avc1) + m4a for broad compatibility, then falls back through
    progressively looser constraints, and finally to any format at/under the cap.
    """
    return (
        f'bestvideo[height<={height}][vcodec^=avc]+bestaudio[ext=m4a]'
        f'/bestvideo[height<={height}][vcodec^=avc]+bestaudio'
        f'/bestvideo[height<={height}]+bestaudio[ext=m4a]'
        f'/bestvideo[height<={height}]+bestaudio'
        f'/best[height<={height}]'
        f'/best'
    )


def parse_max_height(value, default=1080):
    """
    Parse a stored `max_resolution` config value into an int height cap.
    Returns None (uncapped) for empty / 'unlimited' / '0' / 'none', otherwise the int.
    `default` is used only when value is None (config never set).
    """
    if value is None:
        return default
    s = str(value).strip().lower().replace('p', '')
    if s in ('', 'unlimited', '0', 'none', 'best', 'max'):
        return None
    try:
        return int(s)
    except ValueError:
        return default


def get_video_format_string(quality='best', max_height=None):
    """
    Map a quality label to a yt-dlp format string.
    Prefers H.264 (avc1) for iOS compatibility, with fallback to any codec.

    `quality` may be:
      - a numeric resolution string ('1080', '720', '480') -> capped at that height
      - 'best' (default)  -> capped at `max_height` if provided, else uncapped
      - 'medium'          -> capped at 720p
      - 'worst'           -> lowest available
    `max_height` is the global default cap, applied only to 'best'.
    """
    # Explicit numeric resolution (e.g. '1080', '720', '480') — user picked a tier
    if isinstance(quality, str) and quality.isdigit():
        return _height_capped_format(int(quality))

    if quality == 'worst':
        return (
            'worstvideo[vcodec^=avc]+worstaudio'
            '/worstvideo+worstaudio'
            '/worst'
        )
    elif quality == 'medium':
        return _height_capped_format(720)
    else:
        # Default 'best': apply the global resolution cap when configured,
        # so a 4K/8K source doesn't produce an enormous file by default.
        if max_height:
            return _height_capped_format(max_height)
        return (
            'bestvideo[vcodec^=avc]+bestaudio[ext=m4a]'
            '/bestvideo[vcodec^=avc]+bestaudio'
            '/bestvideo+bestaudio[ext=m4a]'
            '/bestvideo+bestaudio'
            '/best'
        )


def check_and_reraise_cancel(e):
    """
    Check if an exception is a cancellation signal and re-raise it.
    Returns True if re-raised (never actually returns in that case),
    or False if the exception is NOT a cancellation.
    """
    error_str = str(e).lower()
    if "cancelled" in error_str or type(e).__name__ == "TaskCancelledException":
        raise e
    return False


def safe_cleanup(path):
    """Remove a temporary file if it exists. Silently ignores errors."""
    if path and os.path.exists(path):
        try:
            os.remove(path)
            logger.debug(f"🗑️ Cleaned up temp file: {path}")
        except OSError:
            pass


def retry_on_network_error(max_retries=3, retry_delay=5):
    """
    Decorator that retries a function on network-related errors.
    Uses exponential backoff. Cancellation errors are always re-raised immediately.
    
    Usage:
        @retry_on_network_error(max_retries=3, retry_delay=5)
        def my_download_func(...):
            ...
    """
    NETWORK_KEYWORDS = ['timeout', 'connection', 'network', 'timed out', 'urlopen']

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    # Always re-raise cancellation
                    check_and_reraise_cancel(e)

                    # Fatal, non-retryable blocks (risk control) propagate to caller
                    if isinstance(e, DownloadBlockedError):
                        logger.error(f"❌ {e}")
                        raise

                    error_str = str(e).lower()
                    is_network = any(kw in error_str for kw in NETWORK_KEYWORDS)

                    if is_network and attempt < max_retries - 1:
                        wait_time = retry_delay * (2 ** attempt)
                        logger.warning(
                            f"⚠️ Network error (attempt {attempt + 1}/{max_retries}), "
                            f"retrying in {wait_time}s... Error: {e}"
                        )
                        time.sleep(wait_time)
                        continue

                    # Non-retryable or last attempt
                    logger.error(f"❌ Download failed: {e}")
                    return None
            return None
        return wrapper
    return decorator


def get_bilibili_headers():
    """
    Build HTTP headers for Bilibili requests (User-Agent + Referer only).

    Cookies are intentionally NOT set here. yt-dlp ignores a `Cookie` HTTP
    header for its login / risk-control logic (it reads the cookie *jar*
    instead), so SESSDATA passed as a header was being silently dropped.
    Use apply_bilibili_cookies() on the live YoutubeDL instance instead.
    """
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
    }


def apply_bilibili_cookies(ydl, sessdata=None):
    """
    Inject Bilibili cookies into a live YoutubeDL instance's cookie jar.

    Bilibili's risk control (gaia WAF) has two gates that both return
    HTTP 412 Precondition Failed:

    1. The initial webpage request fails without a `buvid3` cookie. We mint one
       the same way yt-dlp's own search extractor does ('<uuid4>infoc').
    2. The anonymous stream API ('/x/player/wbi/playurl?try_look=1') is blocked.
       The only reliable bypass is being logged in: yt-dlp's `is_logged_in`
       check reads the cookie JAR (not http_headers), and only the logged-in
       branch reads play info straight from the page HTML, skipping that API.

    Must be called AFTER constructing YoutubeDL and BEFORE download().
    """
    import requests  # project dependency; used only to build cookie objects

    def _set(name, value):
        ydl.cookiejar.set_cookie(
            requests.cookies.create_cookie(domain='.bilibili.com', name=name, value=value)
        )

    have = {c.name for c in ydl.cookiejar.get_cookies_for_url('https://www.bilibili.com')}
    if 'buvid3' not in have:
        _set('buvid3', f'{uuid.uuid4()}infoc')
    if sessdata:
        _set('SESSDATA', sessdata)
