from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.asr.client import asr_client

router = APIRouter(tags=["ASR Config"])

class ASRConfigUpdate(BaseModel):
    priority: Optional[List[str]] = None
    strict_mode: Optional[bool] = None
    active_engine: Optional[str] = None
    disabled_engines: Optional[List[str]] = None

@router.get("/status")
async def get_asr_status(refresh: bool = False):
    """
    Get status of all ASR engines.
    If refresh=True, performs an immediate health check.
    """
    if refresh:
        await asr_client.check_health()
    return asr_client.get_status()

@router.post("/config")
async def update_asr_config(config: ASRConfigUpdate):
    """
    Update ASR runtime configuration (priority, strict mode, active engine).
    """
    asr_client.update_config(
        priority=config.priority, 
        strict_mode=config.strict_mode, 
        active_engine=config.active_engine,
        disabled_engines=config.disabled_engines
    )
    return {"status": "updated", "config": asr_client.config}
