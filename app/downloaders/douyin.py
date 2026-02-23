import requests
import os
import uuid
from app.core.logger import logger
from app.services.storage import storage
from app.downloaders._utils import (
    check_and_reraise_cancel,
    safe_cleanup,
    retry_on_network_error,
)


@retry_on_network_error(max_retries=3, retry_delay=5)
def download_douyin_video(direct_url, referer="https://www.douyin.com/", task_id=None, check_cancel_func=None, progress_callback=None):
    """
    Downloads video from a direct CDN URL provided by the frontend.
    Returns the path to the downloaded file.
    """
    filename = f"{uuid.uuid4()}.mp4"
    output_path = storage.get_temp_download_path(filename)

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": referer
    }

    logger.info(f"📥 [Douyin] Downloading from CDN: {direct_url[:50]}...")

    if check_cancel_func:
        check_cancel_func(task_id)

    try:
        with requests.get(direct_url, headers=headers, stream=True, timeout=30) as r:
            if r.status_code != 200:
                logger.error(f"❌ [Douyin] Download failed. Status: {r.status_code}")
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
            logger.info(f"✅ [Douyin] Download saved: {output_path}")
            return output_path
        else:
            logger.error("❌ [Douyin] File not found or empty after download")
            safe_cleanup(output_path)
            return None

    except Exception as e:
        safe_cleanup(output_path)
        check_and_reraise_cancel(e)
        logger.error(f"❌ [Douyin] Exception during download: {e}")
        raise  # Let retry_on_network_error handle it
