"""
AI Analysis & Summaries Router
Handles: AI analysis (background), AI summary CRUD
All LLM/ASR/Prompt configuration routes are in settings.py
"""
import re
import time
import sqlite3
from typing import Optional

from fastapi import APIRouter, Body, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.db import (
    get_transcription_by_source, update_analysis, update_ai_status,
    add_ai_summary, get_ai_summaries, delete_ai_summary, clear_ai_summaries, update_ai_summary,
)
from app.core.config import settings
from app.services.llm import analyze_text
from app.core.logger import logger, trace_id_ctx
from app.utils.source_utils import normalize_source_id
from app.core.task_manager import task_manager, TaskCancelledException
import asyncio

router = APIRouter(tags=["AI"])


# --- Pydantic Models ---

class AnalyzeRequest(BaseModel):
    """Request schema for AI analysis."""
    prompt: str
    transcription_id: Optional[int] = None
    source_id: Optional[str] = None
    llm_model_id: Optional[int] = None
    overwrite: bool = False
    overwrite_id: Optional[int] = None
    parent_id: Optional[int] = None
    input_text: Optional[str] = None
    strip_subtitle: bool = False


# --- Background Worker ---

async def process_ai_analysis(
    item_id: int,
    task_id: int,
    text_to_analyze: str,
    prompt: str,
    llm_model_id: int,
    parent_id: int,
    input_text: str,
    overwrite: bool,
    overwrite_id: int,
    trace_id_token: str = None
):
    token = None
    if trace_id_token:
        token = trace_id_ctx.set(trace_id_token)
        
    try:
        logger.info(f"🧠 Starting AI Analysis for Item {item_id}, Task {task_id}...")
        update_ai_status(item_id, "processing")
        task_manager.update_progress(task_id, 10, "Requesting LLM...")
        
        start_time = time.time()
        
        llm_task = asyncio.create_task(analyze_text(text_to_analyze, prompt, llm_model_id))
        while not llm_task.done():
            if task_manager.is_cancelled(task_id):
                llm_task.cancel()
                raise TaskCancelledException(f"Task {task_id} cancelled by user")
            await asyncio.sleep(0.5)
            
        summary, model_name = llm_task.result()
        duration = round(time.time() - start_time, 2)
        
        task_manager.update_progress(task_id, 90, "Saving summary...")
        
        if overwrite:
            clear_ai_summaries(item_id)
        elif overwrite_id:
            delete_ai_summary(overwrite_id)
        
        add_ai_summary(item_id, prompt, summary, model_name, duration, parent_id=parent_id, input_text=input_text)
        update_analysis(item_id, prompt, summary, model_name)
        
        update_ai_status(item_id, "completed")
        logger.info(f"✅ AI Analysis completed for Item {item_id}")
        task_manager.update_progress(task_id, 100, "Completed")
        
    except TaskCancelledException as e:
        logger.warning(f"⚠️ AI Analysis cancelled for Item {item_id}: {e}")
        update_ai_status(item_id, "cancelled")
    except asyncio.CancelledError:
        logger.warning(f"⚠️ AI Analysis asyncio task cancelled for Item {item_id}")
        update_ai_status(item_id, "cancelled")
    except Exception as e:
        logger.error(f"❌ AI Analysis failed for Item {item_id}: {e}")
        update_ai_status(item_id, "failed")
        task_manager.update_progress(task_id, 0, f"Failed: {str(e)}")
    finally:
        task_manager.finish_task(task_id)
        if token:
            trace_id_ctx.reset(token)


# --- Analyze Endpoint ---

@router.post("/analyze")
async def analyze_endpoint(
    background_tasks: BackgroundTasks,
    request: AnalyzeRequest
):
    record = None
    if request.transcription_id:
        conn = sqlite3.connect(settings.DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM transcriptions WHERE id = ?", (request.transcription_id,))
        record = c.fetchone()
        conn.close()
    
    if request.source_id and not record:
        source_id = normalize_source_id(request.source_id)
        record = get_transcription_by_source(source_id)
    
    if not record:
        raise HTTPException(status_code=404, detail="Transcription not found. Please transcribe the video first.")
    
    text_to_analyze = request.input_text
    if not text_to_analyze:
        raw_text = record['raw_text']
        if request.strip_subtitle:
            from app.utils.preprocessing import strip_subtitle_metadata
            text_to_analyze = strip_subtitle_metadata(raw_text)
        else:
            text_to_analyze = re.sub(r'<\|.*?\|>', '', raw_text)
    
    item_id = record['id']
    
    # Generate ephemeral task ID for TaskManager
    task_id = -int(time.time() * 1000) % 1000000000
    
    from app.db import get_video_meta
    meta = get_video_meta(record['source'])
    title = dict(meta).get('video_title', 'Unknown') if meta else 'Unknown'
    
    task_manager.start_task(task_id, meta={
        "type": "ai",
        "filename": f"AI: {title}"
    })
    
    trace_id = trace_id_ctx.get()
    background_tasks.add_task(
        process_ai_analysis,
        item_id,
        task_id,
        text_to_analyze,
        request.prompt,
        request.llm_model_id,
        request.parent_id,
        request.input_text,
        request.overwrite,
        request.overwrite_id,
        trace_id
    )
    
    update_ai_status(item_id, "queued")

    return {"status": "queued", "message": "AI Analysis started in background", "task_id": task_id}


# --- Summaries CRUD ---

@router.delete("/summaries/{summary_id}")
async def delete_summary_endpoint(summary_id: int):
    """Delete a specific AI summary version"""
    delete_ai_summary(summary_id)
    return {"status": "success"}


@router.post("/summaries/manual")
async def create_manual_summary(item: dict = Body(...)):
    """Save a manual edit as a new summary version"""
    transcription_id = item.get("transcription_id")
    parent_id = item.get("parent_id")
    summary = item.get("summary")
    prompt = item.get("prompt", "Manual Edit")
    
    if not transcription_id or not summary:
        raise HTTPException(status_code=400, detail="Missing required fields")
        
    add_ai_summary(
        transcription_id,
        prompt,
        summary,
        model="User Edit",
        response_time=0,
        parent_id=parent_id
    )
    return {"status": "success"}


@router.patch("/summaries/{summary_id}")
async def update_summary_endpoint(summary_id: int, item: dict = Body(...)):
    """Update a specific AI summary content"""
    summary = item.get("summary")
    if not summary:
        raise HTTPException(status_code=400, detail="Missing summary content")
    update_ai_summary(summary_id, summary)
    return {"status": "success"}
