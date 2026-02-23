"""
Media utility functions.
Extracted from transcribe endpoint for reusability.
"""
import subprocess
import mimetypes
from app.core.logger import logger


def extract_video_frame(video_path: str, output_path: str) -> bool:
    """Extract the first frame from a video using FFmpeg."""
    try:
        cmd = [
            'ffmpeg', '-y',
            '-ss', '0.5',
            '-i', video_path,
            '-vframes', '1',
            '-q:v', '2',
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        if result.returncode != 0:
            logger.error(f"FFmpeg Error: {result.stderr}")
            return False
        return True
    except Exception as e:
        logger.error(f"FFmpeg Exception: {e}")
        return False


def is_network_media_url(url: str) -> bool:
    """Check if URL is a direct media link."""
    url_lower = url.lower()
    # Common media extensions
    media_extensions = ['.mp4', '.mp3', '.wav', '.m4a', '.webm', '.ogg', '.flac', '.aac']
    if any(url_lower.endswith(ext) or f"{ext}?" in url_lower for ext in media_extensions):
        return True
    # Douyin CDN patterns
    if "douyin.com/aweme/v1/play" in url_lower or "bytecdn.cn" in url_lower:
        return True
    return False


def detect_media_type(filename: str, content_type: str = None) -> str:
    """Detect media type from filename/content_type. Returns 'video', 'audio', or 'file'."""
    mime = content_type or ""
    if not mime or mime == "application/octet-stream":
        mime, _ = mimetypes.guess_type(filename)
        mime = mime or ""
    
    if mime.startswith("video"):
        return "video"
    elif mime.startswith("audio"):
        return "audio"
    return "file"
