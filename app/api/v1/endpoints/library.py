"""
Library Router — aggregates video & segment sub-routers
"""
from fastapi import APIRouter
from app.api.v1.endpoints.videos import router as videos_router
from app.api.v1.endpoints.segments import router as segments_router

router = APIRouter(tags=["Library"])

# Include segments FIRST so that static routes like /videos/segments
# are evaluated before parameterized routes like /videos/{source_id}
router.include_router(segments_router)
router.include_router(videos_router)
