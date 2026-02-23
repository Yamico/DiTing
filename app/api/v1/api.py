"""
API v1 Router Aggregator
Mounts all sub-routers under /api prefix
"""
from fastapi import APIRouter

from app.api.v1.endpoints import library, tasks, system, ai, transcribe, settings, search, cache, covers, upload

# Create main API router
api_router = APIRouter()

# Mount sub-routers
api_router.include_router(library.router, prefix="")      # /api/videos, /api/segments
api_router.include_router(covers.router, prefix="")       # /api/covers, /api/proxy_image
api_router.include_router(tasks.router, prefix="")        # /api/tasks
api_router.include_router(system.router, prefix="")       # /api/system
api_router.include_router(ai.router, prefix="")           # /api/analyze, /api/summaries
api_router.include_router(transcribe.router, prefix="")   # /api/transcribe/*
api_router.include_router(settings.router, prefix="")     # /api/settings/* (new RESTful)
api_router.include_router(search.router, prefix="")       # /api/search
api_router.include_router(cache.router, prefix="")        # /api/cache/*
api_router.include_router(upload.router, prefix="")       # /api/upload/*
from app.api.v1.endpoints import asr, tags
api_router.include_router(asr.router, prefix="/asr")      # /api/asr/status, /api/asr/config
api_router.include_router(tags.router, prefix="")         # /api/tags, /api/videos/{id}/tags

