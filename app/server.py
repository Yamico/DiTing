"""
FastAPI Application Server - Refactored
Main entry point for the DiTing backend.
API endpoints are now organized in app/api/v1/endpoints/
"""
import sys
import os

# Ensure project root is in sys.path when running as a script
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import argparse
import uvicorn
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from app.asr.client import asr_client
from app.db import init_db
from app.core.logger import logger, setup_access_logger, trace_id_ctx
from app.api.v1.api import api_router
from app.core.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events"""
    # Startup: Initialize database
    logger.info("正在初始化数据库...")
    init_db()
    
    # Setup Uvicorn Access Logging (JSON)
    setup_access_logger()
    
    # Start ASR Client Health Check
    import asyncio
    asyncio.create_task(asr_client.start_health_check())

    # Start Background Media GC (Every hour)
    from app.services.media_cache import MediaCacheService
    async def periodic_gc():
        # Wait 5 minutes before first run to allow startup/transcription to settle
        # Initial next run time
        from datetime import datetime, timedelta
        from app.db.system_config import get_system_config
        
        # Determine first run time
        first_delay = 60 * 5
        MediaCacheService.next_gc_time = datetime.now() + timedelta(seconds=first_delay)
        
        await asyncio.sleep(first_delay) 
        while True:
            try:
                # Read interval config (hours)
                try:
                    interval_hours = float(get_system_config("media_retention_cron_interval", "1"))
                    if interval_hours <= 0:
                        interval_hours = 1
                except (ValueError, TypeError):
                    interval_hours = 1
                    
                logger.info(f"⏰ Starting background media GC (Interval: {interval_hours}h)...")
                count, bytes_freed = await run_in_threadpool(MediaCacheService.run_gc)
                if count > 0:
                    logger.info(f"✅ Background GC: Deleted {count} files ({bytes_freed/1024/1024:.2f} MB)")
            except Exception as e:
                logger.error(f"❌ Background GC Error: {e}")
            
            # Run every interval
            # Re-read config in case it changed during execution? 
            # We already read it at start of loop.
            next_run_delay = int(interval_hours * 60 * 60)
            MediaCacheService.next_gc_time = datetime.now() + timedelta(seconds=next_run_delay)
            await asyncio.sleep(next_run_delay)

    asyncio.create_task(periodic_gc())
        
    yield
    # Shutdown
    logger.info("服务关闭")


# Create FastAPI application
app = FastAPI(lifespan=lifespan)

# Mount static files
app.mount("/covers", StaticFiles(directory=settings.COVERS_DIR), name="covers")

# Legacy /static removed
# app.mount("/static", StaticFiles(directory="app/static"), name="static")


# Trace ID Middleware for request tracing
@app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    trace_id = str(uuid.uuid4())
    token = trace_id_ctx.set(trace_id)
    try:
        response = await call_next(request)
        response.headers["X-Trace-ID"] = trace_id
        return response
    finally:
        trace_id_ctx.reset(token)


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount modular API routers at /api prefix
app.include_router(api_router, prefix="/api")


# =============================================================================
# React SPA Serving (Modern Frontend)
# =============================================================================

# Path to React build directory
REACT_BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

# Mount React assets if build exists
if os.path.exists(REACT_BUILD_DIR):
    # Mount assets folder for JS/CSS bundles
    assets_dir = os.path.join(REACT_BUILD_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/app/assets", StaticFiles(directory=assets_dir), name="react-assets")
    
    # Pre-read index.html into memory (avoid repeated disk I/O)
    _index_html_path = os.path.join(REACT_BUILD_DIR, "index.html")
    _index_html_content = None
    if os.path.exists(_index_html_path):
        with open(_index_html_path, "r", encoding="utf-8") as f:
            _index_html_content = f.read()
    
    # Serve static files from dist root (favicon, etc.)
    from fastapi.responses import FileResponse
    
    @app.get("/app/icon.png")
    async def serve_icon():
        """Serve project icon for favicon and branding"""
        icon_path = os.path.join(REACT_BUILD_DIR, "icon.png")
        if os.path.exists(icon_path):
            return FileResponse(icon_path, media_type="image/png")
        return HTMLResponse(content="Not found", status_code=404)
    
    # Serve React app at /app/*
    @app.get("/app/{full_path:path}", response_class=HTMLResponse)
    async def react_spa(full_path: str = ""):
        """Serve React SPA - all routes return index.html for client-side routing"""
        if _index_html_content:
            return HTMLResponse(content=_index_html_content)
        return HTMLResponse(content="<h1>React build not found. Run `npm run build` in frontend/</h1>", status_code=404)
    
    @app.get("/app", response_class=HTMLResponse)
    async def react_spa_root():
        """Redirect /app to /app/"""
        return RedirectResponse(url="/app/")
else:
    logger.warning("⚠️ React build not found at frontend/dist. Run `npm run build` in frontend/ to enable modern UI.")


# =============================================================================
# HTML Template Routes (Dashboard) - REMOVED
# =============================================================================

@app.get("/", response_class=HTMLResponse)
async def root():
    """Redirect root to dashboard"""
    return RedirectResponse(url="/app")


# Legacy routes removed: /dashboard, /detail/{item_id}, /video/{source_id}


# =============================================================================
# Entry Point (for direct execution)
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DiTing Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind")
    parser.add_argument("--port", type=int, default=5023, help="Port to bind")
    args = parser.parse_args()
    
    uvicorn.run(app, host=args.host, port=args.port)
