
# CUDA Memory Optimization — MUST be set before importing torch
import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import uuid
import shutil
import asyncio
import uvicorn
from fastapi import FastAPI, HTTPException, Request, UploadFile, Form
from pydantic import BaseModel
from contextlib import asynccontextmanager
import time
from starlette.concurrency import run_in_threadpool
from worker_logger import setup_worker_logger
from config import get_config

# Import Engines
# Lazy import in lifespan
# from engines.sensevoice import SenseVoiceEngine
# from engines.whisper import WhisperEngine
# from engines.qwen3asr import Qwen3ASREngine

# Load unified configuration (env > yaml > defaults)
_cfg = get_config()
ASR_ENGINE_TYPE = _cfg["engine"]
PORT = _cfg["port"]
SHARED_PATHS = _cfg["shared_paths"]
TEMP_UPLOAD_DIR = _cfg["temp_upload_dir"]
MAX_CONCURRENCY = _cfg.get("max_concurrency", 1)
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

# Concurrency control: queue excess requests instead of OOM
_gpu_semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
_queue_depth = 0  # Track how many requests are waiting

# Initialize Logger
logger = setup_worker_logger(ASR_ENGINE_TYPE)
recognizer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global recognizer
    logger.info(f"🚀 Starting ASR Worker for Engine: {ASR_ENGINE_TYPE}")
    
    if ASR_ENGINE_TYPE == "sensevoice":
        try:
            from engines.sensevoice import SenseVoiceEngine
            recognizer = SenseVoiceEngine()
        except ImportError as e:
            logger.error(f"❌ Failed to load SenseVoice: {e}")
            raise
    elif ASR_ENGINE_TYPE == "whisper":
        try:
            from engines.whisper import WhisperEngine
            recognizer = WhisperEngine() 
        except ImportError as e:
            logger.error(f"❌ Failed to load Whisper: {e}")
            raise
    elif ASR_ENGINE_TYPE == "qwen3asr":
        try:
            from engines.qwen3asr import Qwen3ASREngine
            recognizer = Qwen3ASREngine()
        except ImportError as e:
            logger.error(f"❌ Failed to load Qwen3-ASR: {e}")
            raise
    else:
        logger.error(f"❌ Unknown Engine: {ASR_ENGINE_TYPE}")
        
    yield
    logger.info("🛑 Shutting down ASR Worker")

app = FastAPI(lifespan=lifespan)

class TranscribeRequest(BaseModel):
    audio_path: str
    language: str = "zh"
    output_format: str = "text" # text | srt | srt_char
    prompt: str = None

@app.get("/health")
async def health():
    gpu_info = None
    try:
        import torch
        if torch.cuda.is_available():
            gpu_info = {
                "name": torch.cuda.get_device_name(0),
                "total_gb": round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1),
                "allocated_gb": round(torch.cuda.memory_allocated() / 1024**3, 2),
                "reserved_gb": round(torch.cuda.memory_reserved() / 1024**3, 2),
            }
    except Exception:
        pass
    return {
        "status": "ok", 
        "engine": ASR_ENGINE_TYPE, 
        "loaded": recognizer is not None,
        "gpu": gpu_info,
        "shared_paths": SHARED_PATHS,
        "concurrency": {
            "max": MAX_CONCURRENCY,
            "queue": _queue_depth,
        },
    }

@app.get("/gpu-status")
async def gpu_status():
    """Detailed GPU memory status for monitoring OOM risk."""
    try:
        import torch
        if not torch.cuda.is_available():
            return {"available": False, "message": "CUDA not available"}
        return {
            "available": True,
            "device": torch.cuda.get_device_name(0),
            "total_gb": round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2),
            "allocated_gb": round(torch.cuda.memory_allocated() / 1024**3, 2),
            "reserved_gb": round(torch.cuda.memory_reserved() / 1024**3, 2),
            "free_gb": round((torch.cuda.get_device_properties(0).total_memory - torch.cuda.memory_allocated()) / 1024**3, 2),
            "peak_gb": round(torch.cuda.max_memory_allocated() / 1024**3, 2),
        }
    except Exception as e:
        return {"available": False, "error": str(e)}

def _do_transcribe(audio_path: str, language: str, prompt: str, output_format: str) -> dict:
    """Core transcription logic shared by path mode and upload mode."""
    if not recognizer:
        raise HTTPException(status_code=503, detail="ASR Engine not loaded")
    
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=400, detail=f"Audio file not found: {audio_path}")
        
    logger.info(f"📥 Received Task: {audio_path} | Lang: {language} | Prompt: {prompt}")
    start_time = time.time()
    
    try:
        if output_format == "srt":
            result = recognizer.generate_srt(audio_path, language, prompt)
        elif output_format == "srt_char":
            # Per-character SRT (Qwen3-ASR only, others fallback to standard srt)
            if hasattr(recognizer, 'generate_srt_char'):
                result = recognizer.generate_srt_char(audio_path, language, prompt)
            else:
                logger.warning(f"⚠️ Engine {ASR_ENGINE_TYPE} does not support srt_char, falling back to srt")
                result = recognizer.generate_srt(audio_path, language, prompt)
        else:
            result = recognizer.predict(audio_path, language, prompt)
            
        duration = time.time() - start_time
        logger.info(f"✅ Completed in {duration:.2f}s")
        return {"text": result, "engine": ASR_ENGINE_TYPE}
    except Exception as e:
        logger.error(f"❌ Transcription Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe")
async def transcribe(request: Request):
    """
    Unified transcribe endpoint with concurrency control.
    - Supports JSON (path mode) and multipart (upload mode) via Content-Type.
    - Queues excess requests via Semaphore to prevent GPU OOM.
    """
    global _queue_depth
    content_type = request.headers.get("content-type", "")

    # ── Parse request params BEFORE acquiring semaphore (don't hold GPU lock during I/O) ──
    temp_path = None
    if "multipart" in content_type:
        form = await request.form()
        upload_file: UploadFile = form.get("file")
        if not upload_file:
            raise HTTPException(status_code=400, detail="No file provided in upload mode")
        language = form.get("language", "zh")
        output_format = form.get("output_format", "text")
        prompt = form.get("prompt", "") or None
        ext = os.path.splitext(upload_file.filename)[1] if upload_file.filename else ".wav"
        temp_path = os.path.join(TEMP_UPLOAD_DIR, f"{uuid.uuid4()}{ext}")
        logger.info(f"📤 Upload mode: saving to {temp_path}")
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(upload_file.file, f)
        audio_path = temp_path
    else:
        body = await request.json()
        req = TranscribeRequest(**body)
        audio_path, language, prompt, output_format = req.audio_path, req.language, req.prompt, req.output_format

    # ── Queue for GPU access ──
    _queue_depth += 1
    if _gpu_semaphore.locked():
        logger.info(f"⏳ Queued (waiting: {_queue_depth}) — {os.path.basename(audio_path)}")
    try:
        async with _gpu_semaphore:
            _queue_depth -= 1
            result = await run_in_threadpool(_do_transcribe, audio_path, language, prompt, output_format)
            return result
    except Exception:
        _queue_depth = max(0, _queue_depth - 1)
        raise
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
