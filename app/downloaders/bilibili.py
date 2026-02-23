import yt_dlp
import requests
import os
import uuid
import subprocess
from app.core.logger import logger
from app.core.config import settings
from app.services.storage import storage
from app.downloaders._utils import (
    make_progress_hook,
    find_downloaded_file,
    get_video_format_string,
    check_and_reraise_cancel,
    safe_cleanup,
    retry_on_network_error,
    get_bilibili_headers,
)


def _get_sessdata():
    """Read Bilibili SESSDATA cookie from system config."""
    from app.db import get_system_config
    return get_system_config('bilibili_sessdata')


def download_audio(url, start_time=None, end_time=None, task_id=None, check_cancel_func=None, progress_callback=None):
    """Downloads audio from Bilibili video URL. Optional start/end time in seconds."""
    range_info = f" ({start_time}-{end_time}s)" if start_time is not None else " (Full)"
    logger.info(f"📥 正在从 {url} 下载音频{range_info}...")

    filename = str(uuid.uuid4())
    output_template = storage.get_temp_download_path(f"{filename}.%(ext)s")
    download_dir = settings.TEMP_DOWNLOADS_DIR

    sessdata = _get_sessdata()

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
        'progress_hooks': [make_progress_hook(task_id, check_cancel_func, progress_callback)],
        'http_headers': get_bilibili_headers(sessdata),
        'extractor_args': {
            'bilibili': {
                'player_client': ['web', 'android']
            }
        }
    }

    # NOTE: We do NOT use yt-dlp's download_ranges here.
    # Combining download_ranges + force_keyframes_at_cuts + FFmpegExtractAudio
    # causes ffmpeg to exit with code 1. Instead, we download the full audio
    # and trim it with a separate ffmpeg call after download.
    needs_trim = (start_time is not None and end_time is not None and
                  (start_time > 0 or end_time is not None))

    @retry_on_network_error(max_retries=3, retry_delay=5)
    def _do_download():
        if check_cancel_func:
            check_cancel_func(task_id)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return find_downloaded_file(download_dir, filename, '.mp3')

    audio_path = _do_download()

    if not audio_path:
        return None

    # Post-download trim if time range was specified
    if needs_trim:
        trimmed_path = audio_path.rsplit('.', 1)[0] + '_trimmed.mp3'
        trim_cmd = [
            'ffmpeg', '-y',
            '-i', audio_path,
            '-ss', str(start_time),
        ]
        if end_time is not None:
            trim_cmd += ['-to', str(end_time)]
        trim_cmd += ['-c', 'copy', trimmed_path]

        logger.info(f"✂️ Trimming audio to {start_time}-{end_time}s...")
        result = subprocess.run(
            trim_cmd, capture_output=True, text=True,
            encoding='utf-8', errors='ignore'
        )
        if result.returncode == 0 and os.path.exists(trimmed_path):
            safe_cleanup(audio_path)
            audio_path = trimmed_path
            logger.info("✅ Audio trimmed successfully")
        else:
            logger.warning(f"⚠️ Trim failed (rc={result.returncode}), using full audio. stderr: {result.stderr[:200]}")

    return audio_path


def download_bilibili_video(url, quality='best', task_id=None, check_cancel_func=None, progress_callback=None):
    """Downloads full video from Bilibili URL."""
    try:
        logger.info(f"📥 正在从 {url} 下载视频(Video) [Quality: {quality}]...")

        filename = str(uuid.uuid4())
        download_dir = settings.TEMP_DOWNLOADS_DIR
        output_template = storage.get_temp_download_path(f"{filename}.%(ext)s")

        sessdata = _get_sessdata()

        ydl_opts = {
            'format': get_video_format_string(quality),
            'outtmpl': output_template,
            'merge_output_format': 'mp4',
            'quiet': True,
            'no_warnings': True,
            'progress_hooks': [make_progress_hook(task_id, check_cancel_func, progress_callback, label="Video")],
            'http_headers': get_bilibili_headers(sessdata),
            'extractor_args': {
                'bilibili': {
                    'player_client': ['web', 'android']
                }
            }
        }

        if check_cancel_func:
            check_cancel_func(task_id)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        return find_downloaded_file(download_dir, filename, '.mp4')

    except Exception as e:
        check_and_reraise_cancel(e)
        logger.error(f"❌ 视频下载失败: {e}")
        return None


def get_video_info(bvid):
    """Fetch video title and cover from Bilibili API."""
    try:
        url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers)
        data = response.json()
        if data['code'] == 0:
            return {
                "title": data['data']['title'],
                "cover": data['data']['pic']
            }
        else:
            logger.error(f"Bilibili API Error: {data['message']}")
            return None
    except Exception as e:
        logger.error(f"Error fetching video info: {e}")
        return None


def download_bilibili_subtitles(bvid, page_index=1, sessdata=None, language='zh'):
    """
    Attempt to fetch CC subtitles from Bilibili.
    Args:
        bvid: Bilibili video ID
        page_index: Page index (1-based) for multi-part videos
        sessdata: Optional SESSDATA cookie for accessing AI-generated subtitles
        language: Preferred language code (e.g. 'zh', 'en', 'ja')
    Returns: (None, content_string) - compatible with YouTube hook signature
    """
    try:
        # 1. Get CID and AID
        view_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        cookies = {}
        if sessdata:
            cookies["SESSDATA"] = sessdata
        resp = requests.get(view_url, headers=headers, cookies=cookies).json()
        if resp['code'] != 0:
            logger.warning(f"Bilibili View API failed: {resp.get('message')}")
            return None, None

        aid = resp['data']['aid']
        pages = resp['data']['pages']
        if page_index > len(pages):
            page_index = 1

        # Find the correct CID for the page
        cid = None
        for p in pages:
            if p['page'] == page_index:
                cid = p['cid']
                break

        if not cid:
            cid = pages[0]['cid']

        # 2. Get Subtitles
        player_url = f"https://api.bilibili.com/x/player/wbi/v2?aid={aid}&cid={cid}"
        player_resp = requests.get(player_url, headers=headers, cookies=cookies).json()

        if player_resp['code'] != 0:
            return None, None

        subtitle_data = player_resp.get('data', {}).get('subtitle', {}).get('subtitles', [])

        if not subtitle_data:
            return None, None

        # Prioritize: user's preferred language > zh > en > first available
        target_sub = None

        for sub in subtitle_data:
            lang = sub.get('lan', '')
            if language in lang:
                target_sub = sub
                break

        if not target_sub and language != 'zh':
            for sub in subtitle_data:
                lang = sub.get('lan', '')
                if 'zh' in lang:
                    target_sub = sub
                    break

        if not target_sub and language != 'en':
            for sub in subtitle_data:
                lang = sub.get('lan', '')
                if 'en' in lang:
                    target_sub = sub
                    break

        if not target_sub:
            target_sub = subtitle_data[0]

        sub_url = target_sub.get('subtitle_url')
        if not sub_url:
            return None, None

        if sub_url.startswith('//'):
            sub_url = 'https:' + sub_url

        logger.info(f"📥 Found Bilibili Subtitle ({target_sub.get('lan_doc')}): {sub_url}")

        # 3. Download and Parse JSON
        sub_content = requests.get(sub_url, headers=headers).json()
        body = sub_content.get('body', [])

        # 4. Convert to SRT
        def sec_to_time(sec):
            m, s = divmod(sec, 60)
            h, m = divmod(m, 60)
            ms = int((sec % 1) * 1000)
            return f"{int(h):02}:{int(m):02}:{int(s):02},{ms:03}"

        srt_lines = []
        for i, item in enumerate(body):
            start = item['from']
            end = item['to']
            content = item['content']

            srt_lines.append(str(i + 1))
            srt_lines.append(f"{sec_to_time(start)} --> {sec_to_time(end)}")
            srt_lines.append(content)
            srt_lines.append("")  # Empty line

        return None, "\n".join(srt_lines)

    except Exception as e:
        logger.error(f"❌ Error fetching Bilibili subtitles: {e}")
        return None, None
