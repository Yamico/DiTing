"""
System Settings & Control Router
Handles: System settings, restart, cache management, launcher config
"""
import os
import json

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from app.db import get_system_config, set_system_config
router = APIRouter(prefix="/system", tags=["System"])

from app.api.v1.endpoints.system_cache import router as cache_router
router.include_router(cache_router)


class LauncherConfig(BaseModel):
    asr_engine: str = "sensevoice"
    load_model: bool = False


# --- Settings ---

@router.get("/settings")
async def get_system_settings():
    """Get system configurations"""
    proxy_url = get_system_config('proxy_url')
    bilibili_sessdata = get_system_config('bilibili_sessdata')
    return {"proxy_url": proxy_url, "bilibili_sessdata": bilibili_sessdata}


@router.post("/settings")
async def save_system_settings(item: dict = Body(...)):
    key = item.get("key")
    value = item.get("value")
    if not key:
        raise HTTPException(status_code=400, detail="Missing key")
    
    set_system_config(key, value)
    return {"status": "success", "key": key, "value": value}


# --- Launcher Control ---

@router.get("/launcher-config")
async def get_launcher_config():
    """Read current launcher config from JSON"""
    cfg_path = "launcher_config.json"
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


@router.post("/launcher-config")
async def update_launcher_config(config: LauncherConfig):
    """Update launcher config and optionally trigger restart"""
    cfg_path = "launcher_config.json"
    current = {}
    
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, 'r') as f:
                current = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    
    current['asr_engine'] = config.asr_engine
    current['load_model'] = config.load_model
    
    with open(cfg_path, 'w') as f:
        json.dump(current, f, indent=4)
        
    return {"status": "ok", "config": current}


# --- Version & Update ---

@router.get("/version")
async def get_system_version():
    """Get system version info"""
    from app.core.config import APP_VERSION
    return {
        "version": APP_VERSION,
        "build": "",
        "channel": "stable"
    }


@router.get("/check-update")
async def check_system_update():
    """Check for updates via GitHub Releases API"""
    import httpx
    from app.core.config import APP_VERSION, GITHUB_REPO
    from app.core.logger import logger
    from packaging.version import Version, InvalidVersion

    api_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"

    # Read and validate proxy setting
    raw_proxy = (get_system_config("proxy_url") or "").strip()
    proxy_url = raw_proxy if raw_proxy.startswith(("http://", "https://", "socks")) else None

    try:
        async with httpx.AsyncClient(
            proxy=proxy_url,
            timeout=15,
            follow_redirects=True,
        ) as client:
            resp = await client.get(api_url, headers={
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": f"DiTing/{APP_VERSION}",
            })

        # Handle 404 inline (no releases yet — normal for new repos)
        if resp.status_code == 404:
            return {
                "update_available": False,
                "current_version": APP_VERSION,
                "latest_version": APP_VERSION,
                "release_notes": "No releases found on GitHub yet.",
                "download_url": "",
            }

        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"GitHub API returned {resp.status_code}")

        data = resp.json()
        tag = data.get("tag_name", "").lstrip("v")
        notes = data.get("body", "") or ""
        html_url = data.get("html_url", "")

        try:
            update_available = Version(tag) > Version(APP_VERSION)
        except InvalidVersion:
            update_available = False

        return {
            "update_available": update_available,
            "current_version": APP_VERSION,
            "latest_version": tag,
            "release_notes": notes[:500],
            "download_url": html_url,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Check update failed: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"无法连接 GitHub: {type(e).__name__} — 请检查网络或在系统设置中配置代理"
        )
