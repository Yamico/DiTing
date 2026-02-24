"""
Transcribe Router
Thin routing layer: parameter validation → service preparation → dispatcher.
Business logic lives in app/services/transcription/request_service.py.
"""
import os

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Form

from app.core.logger import logger
from app.services.transcription.dispatcher import create_and_dispatch
from app.services.transcription.request_service import (
    prepare_file_transcription,
    prepare_bilibili_transcription,
    prepare_youtube_transcription,
    prepare_douyin_transcription,
    prepare_network_transcription,
    prepare_retranscription,
)
from app.schemas import (
    TranscribeBilibiliRequest,
    TranscribeYouTubeRequest,
    TranscribeNetworkRequest,
    TranscribeDouyinRequest,
    RetranscribeRequest,
)

router = APIRouter(tags=["Transcribe"])


@router.post("/transcribe")
async def transcribe_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    source: str = Form("未知来源"),
    task_type: str = Form("transcribe"),
    use_uvr: bool = Form(False),
    language: str = Form("zh"),
    prompt: str = Form(None),
    auto_analyze_prompt: str = Form(None),
    auto_analyze_prompt_id: int = Form(None),
    auto_analyze_strip_subtitle: bool = Form(True),
    output_format: str = Form(None)
):
    """Transcribe an uploaded audio/video file."""
    file_path = None
    try:
        params = await prepare_file_transcription(
            file, source, task_type, use_uvr, language, prompt, auto_analyze_prompt, auto_analyze_prompt_id, auto_analyze_strip_subtitle, output_format
        )
        file_path = params.get('file_path')
        return await create_and_dispatch(background_tasks, **params)
    except Exception as e:
        logger.error(f"❌ Transcription request failed: {e}")
        if file_path:
            try: os.remove(file_path)
            except OSError: pass
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcribe/bilibili")
async def transcribe_bilibili(
    background_tasks: BackgroundTasks,
    request: TranscribeBilibiliRequest
):
    """Transcribe a Bilibili video."""
    try:
        params = prepare_bilibili_transcription(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await create_and_dispatch(background_tasks, **params)


@router.post("/transcribe/youtube")
async def transcribe_youtube(
    background_tasks: BackgroundTasks,
    request: TranscribeYouTubeRequest
):
    """Transcribe a YouTube video."""
    try:
        params = prepare_youtube_transcription(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await create_and_dispatch(background_tasks, **params)


@router.post("/transcribe/douyin")
async def transcribe_douyin(
    background_tasks: BackgroundTasks,
    request: TranscribeDouyinRequest
):
    """Transcribe a Douyin video."""
    try:
        params = await prepare_douyin_transcription(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await create_and_dispatch(background_tasks, **params)


@router.post("/transcribe/network")
async def transcribe_network(
    background_tasks: BackgroundTasks,
    request: TranscribeNetworkRequest
):
    """Transcribe a direct network media URL."""
    try:
        params = await prepare_network_transcription(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await create_and_dispatch(background_tasks, **params)


@router.post("/transcribe/retranscribe")
async def retranscribe(
    background_tasks: BackgroundTasks,
    request: RetranscribeRequest
):
    """Unified re-transcription endpoint."""
    try:
        params = await prepare_retranscription(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await create_and_dispatch(background_tasks, **params)
