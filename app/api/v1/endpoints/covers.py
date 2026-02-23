
import os
import hashlib
import urllib.parse
import io
import requests
from PIL import Image
from fastapi import APIRouter
from fastapi.responses import Response, FileResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool

from app.core.logger import logger
from app.db import get_system_config
from app.core.config import settings

router = APIRouter(tags=["Covers"])

def get_cached_cover_path(url: str):
    """Get local path for a cover URL. Download if not exists."""
    if not url:
        return None
    
    if url.startswith("//"):
        url = "https:" + url
        
    if not url.startswith("http"):
        # Already a local path or invalid
        return None

    # Strip query parameters for hashing (prevents duplicate downloads on token refresh)
    parsed = urllib.parse.urlparse(url)
    clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    
    # Determine extension (default to .jpg for resized images)
    ext = ".jpg"
    if ".png" in clean_url.lower():
        ext = ".png"
    elif ".webp" in clean_url.lower():
        ext = ".webp"
    
    hash_name = hashlib.md5(clean_url.encode('utf-8')).hexdigest() + ext
    file_path = os.path.join(settings.COVERS_DIR, hash_name)
    
    if os.path.exists(file_path):
        return file_path
        
    try:
        proxy_url = get_system_config('proxy_url')
        proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
        
        referer = "https://www.bilibili.com/"
        if "douyin" in url or "bytecdn" in url:
            referer = "https://www.douyin.com/"
        elif "youtube" in url or "ytimg" in url or "googlevideo" in url:
            referer = "https://www.youtube.com/"
            
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": referer
        }
        
        logger.info(f"💾 Caching Cover: {url} -> {file_path}")
        resp = requests.get(url, headers=headers, proxies=proxies, timeout=10, verify=False)
        
        if resp.status_code == 200:
            # Optimize Image
            try:
                img = Image.open(io.BytesIO(resp.content))
                
                # Resize if too large (max width 480px)
                max_width = 480
                if img.width > max_width:
                    ratio = max_width / img.width
                    new_height = int(img.height * ratio)
                    img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                
                # Convert to RGB if necessary (e.g. RGBA -> JPEG)
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                    
                # Save optimized
                img.save(file_path, quality=85, optimize=True)
                logger.info(f"✅ Cover cached & optimized: {file_path}")
            except Exception as img_err:
                # Fallback to direct save if image processing fails
                logger.warning(f"⚠️ Image optimization failed: {img_err}. Saving original.")
                with open(file_path, "wb") as f:
                    f.write(resp.content)
            
            return file_path
        else:
            logger.warning(f"⚠️ Failed to cache cover {url}: Status {resp.status_code}")
            return None
    except Exception as e:
        logger.error(f"❌ Cover Cache Error {url}: {e}")
        return None


def download_and_cache_cover(url: str) -> str:
    """Download and cache a cover image from a URL.
    Returns the local API path (e.g. /api/covers/xxx.jpg) or original URL if failed.
    """
    if not url:
        return ""
    
    # Already a local API path
    if url.startswith("/api/covers/"):
        return url
        
    try:
        # Reuse existing logic to download/cache
        # get_cached_cover_path returns absolute file path
        file_path = get_cached_cover_path(url)
        
        if file_path and os.path.exists(file_path):
            filename = os.path.basename(file_path)
            return f"/api/covers/{filename}"
            
    except Exception as e:
        logger.error(f"Failed to download/cache cover {url}: {e}")
        
    # Return original if failed (fallback)
    return url


@router.get("/covers/cache")
async def get_cached_cover_endpoint(url: str):
    """Proxy endpoint that caches images locally."""
    if not url:
        return Response(status_code=404)
        
    logger.info(f"🔎 /api/covers/cache Request for: {url}")
    
    local_path = await run_in_threadpool(get_cached_cover_path, url)
    
    if local_path and os.path.exists(local_path):
        return FileResponse(local_path)
    
    logger.warning(f"⚠️ Fallback to redirect for: {url}")
    return RedirectResponse(url)


@router.get("/covers/{filename}")
async def get_cover(filename: str):
    """Serve generated video covers"""
    path = os.path.join(settings.COVERS_DIR, filename)
    if os.path.exists(path):
        return FileResponse(path)
    return Response(status_code=404)


@router.get("/proxy_image")
async def proxy_image(url: str):
    """Proxy image to bypass referrer checks"""
    if not url:
        return Response(status_code=404)
    url = url.strip()
    if url.startswith("//"):
        url = "https:" + url
    
    headers = {
        "Referer": "https://www.bilibili.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    
    proxy_url = get_system_config('proxy_url')
    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
    
    try:
        resp = requests.get(url, headers=headers, proxies=proxies, timeout=10, verify=False)
        
        content_type = resp.headers.get("Content-Type", "")
        if resp.status_code == 200:
            return Response(
                content=resp.content,
                media_type=content_type or "image/jpeg",
                headers={"X-Content-Type-Options": "nosniff"}
            )
        else:
            return Response(status_code=404)
    except Exception as e:
        logger.error(f"Proxy Error: {e}")
        return Response(status_code=500)
