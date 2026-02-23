"""
Downloaders for Transcription Service
Contains factory functions that return async callables for downloading media.
"""
import os
from typing import Callable, Awaitable
from starlette.concurrency import run_in_threadpool

from app.core.logger import logger
from app.core.config import settings
from app.utils.progress import ProgressHelper
from app.core.task_manager import task_manager

# Clients
from app.downloaders.bilibili import download_audio
from app.downloaders.douyin import download_douyin_video
from app.downloaders.youtube import download_youtube_video, download_youtube_media

def make_bilibili_downloader(url: str, range_start: float, range_end: float, progress_helper: ProgressHelper) -> Callable[[int], Awaitable[str]]:
    """Factory for Bilibili downloader"""
    async def download(transcription_id: int) -> str:
        check_cancel_wrapper = lambda tid=None: task_manager.check_cancel(transcription_id)
        
        audio_path = await run_in_threadpool(
            download_audio,
            url,
            range_start,
            range_end,
            transcription_id,
            check_cancel_wrapper,
            progress_helper.get_callback()
        )
        if not audio_path:
            raise Exception("Failed to download audio from Bilibili")
        return audio_path
    return download

def make_youtube_downloader(url: str, proxy: str, progress_helper: ProgressHelper) -> Callable[[int], Awaitable[str]]:
    """Factory for YouTube downloader"""
    async def download(transcription_id: int) -> str:
        check_cancel_wrapper = lambda tid=None: task_manager.check_cancel(transcription_id)
        
        audio_path = await run_in_threadpool(
            download_youtube_video,
            url,
            settings.TEMP_UPLOADS_DIR,
            proxy,
            transcription_id,
            check_cancel_wrapper,
            progress_helper.get_callback()
        )
        if not audio_path:
            raise Exception("Failed to download audio from YouTube")
        return audio_path
    return download

def make_douyin_downloader(direct_url: str, source_id: str, progress_helper: ProgressHelper) -> Callable[[int], Awaitable[str]]:
    """Factory for Douyin downloader"""
    async def download(transcription_id: int) -> str:
        check_cancel_wrapper = lambda tid=None: task_manager.check_cancel(transcription_id)
        
        video_path = await run_in_threadpool(
            download_douyin_video,
            direct_url,
            "https://www.douyin.com/",
            transcription_id,
            check_cancel_wrapper,
            progress_helper.get_callback()
        )
        if not video_path:
            raise Exception("Failed to download video from Douyin")
        return video_path
    return download

def make_network_downloader(file_path: str) -> Callable[[int], Awaitable[str]]:
    """Factory for Network/File downloader (Identity)"""
    async def download(transcription_id: int) -> str:
        # File is already downloaded/uploaded by endpoint
        if not file_path or not os.path.exists(file_path):
             raise Exception(f"File not found: {file_path}")
        return file_path
    return download

def download_network_file(url: str, output_dir: str) -> tuple[str, str]:
    """
    Synchronously download a file from a URL. 
    Returns (file_path, display_type).
    """
    import requests
    import hashlib
    import os
    
    try:
        # Stream download to temp file
        resp = requests.get(url, stream=True, timeout=30, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        resp.raise_for_status()
        
        # Determine file extension
        content_type = resp.headers.get("Content-Type", "")
        ext = ".mp4"  # default
        if "audio/mpeg" in content_type or url.endswith(".mp3"):
            ext = ".mp3"
        elif "audio/wav" in content_type or url.endswith(".wav"):
            ext = ".wav"
        elif "audio/m4a" in content_type or url.endswith(".m4a"):
            ext = ".m4a"
        elif "video/webm" in content_type or url.endswith(".webm"):
            ext = ".webm"
        elif url.endswith(".mp4"):
            ext = ".mp4"
            
        display_type = "video" if ext in [".mp4", ".webm"] else "audio"
        
        # Generate a unique filename
        url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
        filename = f"network_{url_hash}{ext}"
        file_path = os.path.join(output_dir, filename)
        
        with open(file_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
                
        logger.info(f"✅ Downloaded network file: {file_path} ({display_type})")
        return file_path, display_type
        
    except Exception as e:
        logger.error(f"❌ Failed to download network URL: {e}")
        raise e
