"""
Shared utilities for all downloaders.
Provides common logic: progress hooks, file lookup, retry, format selection, etc.
"""
import os
import time
import functools
from app.core.logger import logger


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


def get_video_format_string(quality='best'):
    """
    Map quality label to yt-dlp format string.
    Prefers H.264 (avc1) for iOS compatibility, with fallback to any codec.
    """
    if quality == 'worst':
        return 'worstvideo[vcodec^=avc]+worstaudio/worstvideo+worstaudio/worst'
    elif quality == 'medium':
        return 'bestvideo[height<=720][vcodec^=avc]+bestaudio/bestvideo[height<=720]+bestaudio/best[height<=720]/best'
    else:
        # Default: best quality
        return 'bestvideo[vcodec^=avc]+bestaudio/bestvideo+bestaudio/best'


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


def get_bilibili_headers(sessdata=None):
    """
    Build HTTP headers for Bilibili requests.
    Optionally includes SESSDATA cookie for higher quality access.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
    }
    if sessdata:
        headers['Cookie'] = f'SESSDATA={sessdata}'
    return headers
