import os
import uuid
import shutil
import mimetypes
from typing import Dict, Any, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks, Form, UploadFile, File

from app.core.config import settings
from app.core.logger import logger
from app.services.storage import storage
from app.services.transcription.dispatcher import create_and_dispatch

router = APIRouter(prefix="/upload", tags=["Chunked Upload"])

# In-memory store for active upload sessions.
# In a distributed environment, this should be in Redis.
# Format: { "upload_id": { "filename": str, "total_chunks": int, "received_chunks": set[int], "temp_path": str, "file_size": int, "metadata": dict, "updated_at": datetime } }
active_uploads: Dict[str, Dict[str, Any]] = {}

def get_temp_file_path(upload_id: str) -> str:
    return os.path.join(settings.TEMP_UPLOADS_DIR, f"{upload_id}.part")


@router.post("/init")
async def init_upload(
    filename: str = Form(...),
    file_size: int = Form(...),
    total_chunks: int = Form(...),
    task_type: str = Form("transcribe"),
    use_uvr: bool = Form(False),
    language: str = Form("zh"),
    prompt: str = Form(""),
    output_format: str = Form(None)
):
    """Initialize a chunked upload session"""
    upload_id = str(uuid.uuid4())
    temp_path = get_temp_file_path(upload_id)
    
    # Ensure previous interrupted uploads with same ID are cleared (highly unlikely due to uuid4)
    if os.path.exists(temp_path):
        os.remove(temp_path)
    
    # Create empty file
    with open(temp_path, "wb") as f:
        pass
        
    active_uploads[upload_id] = {
        "filename": filename,
        "file_size": file_size,
        "total_chunks": total_chunks,
        "received_chunks": set(),
        "temp_path": temp_path,
        "updated_at": datetime.now(),
        "metadata": {
            "task_type": task_type,
            "use_uvr": use_uvr,
            "language": language,
            "prompt": prompt,
            "output_format": output_format
        }
    }
    
    logger.info(f"📤 Upload initialized: {filename} ({file_size} bytes, {total_chunks} chunks) -> {upload_id}")
    return {"upload_id": upload_id}


@router.post("/chunk")
async def upload_chunk(
    upload_id: str = Form(...),
    index: int = Form(...),
    file: UploadFile = File(...)
):
    """Receive a single file chunk and append it to the temp file"""
    if upload_id not in active_uploads:
        raise HTTPException(status_code=404, detail="Upload session not found or expired")
        
    session = active_uploads[upload_id]
    temp_path = session["temp_path"]
    
    if index in session["received_chunks"]:
        return {"status": "already_received", "index": index}
        
    try:
        # In a real chunked upload with concurrent parts, we would need to seek to the right offset.
        # But for DiTing frontend we upload sequentially, so appending is fine, 
        # EXCEPT if a chunk fails and is retried. To be safe, we should seek.
        # However, since frontend uploads chunks strictly sequentially (waiting for previous to finish),
        # an append mode "ab" is acceptable if we know previous chunks succeeded in order.
        # For true random access chunk writes:
        # with open(temp_path, "r+b" if os.path.getsize(temp_path) > 0 else "wb") as f:
        #     f.seek(chunk_offset) 
        #     shutil.copyfileobj(file.file, f)
        
        # Since our React hook will send chunks strictly sequentially 0, 1, 2...
        # we can just append.
        with open(temp_path, "ab") as f:
            shutil.copyfileobj(file.file, f)
            
        session["received_chunks"].add(index)
        session["updated_at"] = datetime.now()
        
        return {"status": "success", "index": index, "received": len(session["received_chunks"])}
    except Exception as e:
        logger.error(f"❌ Failed to process chunk {index} for {upload_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{upload_id}/status")
async def get_upload_status(upload_id: str):
    """Get the status of an upload session, useful for resuming"""
    if upload_id not in active_uploads:
        raise HTTPException(status_code=404, detail="Upload session not found")
        
    session = active_uploads[upload_id]
    return {
        "upload_id": upload_id,
        "received_chunks": list(session["received_chunks"]),
        "total_chunks": session["total_chunks"]
    }


@router.delete("/{upload_id}")
async def cancel_upload(upload_id: str):
    """Cancel an upload and delete the temporary file"""
    if upload_id in active_uploads:
        session = active_uploads.pop(upload_id)
        temp_path = session["temp_path"]
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.info(f"🚫 Upload cancelled: {upload_id}")
        return {"status": "cancelled"}
    return {"status": "not_found"}


@router.post("/finalize")
async def finalize_upload(
    background_tasks: BackgroundTasks,
    upload_id: str = Form(...)
):
    """Finalize the upload, rename the file, and dispatch the transcription task"""
    if upload_id not in active_uploads:
        raise HTTPException(status_code=404, detail="Upload session not found")
        
    session = active_uploads.pop(upload_id)
    if len(session["received_chunks"]) < session["total_chunks"]:
        # Put back in case it was a premature call
        active_uploads[upload_id] = session
        raise HTTPException(status_code=400, detail=f"Missing chunks. Received {len(session['received_chunks'])}/{session['total_chunks']}")
        
    temp_path = session["temp_path"]
    filename = session["filename"]
    meta = session["metadata"]
    
    # Rename from .part to real filename with uuid prefix
    ext = os.path.splitext(filename)[1]
    final_filename = f"{upload_id}{ext}"
    final_path = os.path.join(settings.TEMP_UPLOADS_DIR, final_filename)
    
    try:
        os.rename(temp_path, final_path)
    except Exception as e:
        logger.error(f"❌ Failed to finalize file {upload_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to finalize file")
        
    logger.info(f"✅ Upload completed: {filename} -> {final_filename}")

    # Determine type
    mime, _ = mimetypes.guess_type(filename)
    mime = mime or ""
    source_type = "video" if mime.startswith("video") else "audio" if mime.startswith("audio") else "file"
    
    # Extract cover if video
    cover = ""
    if source_type == "video":
        from app.api.v1.endpoints.transcribe import extract_video_frame
        cover_name = f"{uuid.uuid4()}.jpg"
        cover_path = os.path.join(settings.COVERS_DIR, cover_name)
        if extract_video_frame(final_path, cover_path):
            cover = f"/api/covers/{cover_name}"

    try:
        # Dispatch task identically to /api/transcribe
        result = await create_and_dispatch(
            background_tasks,
            source_id=filename,  # Original filename
            original_source=filename,
            source_type=source_type,
            title=filename,
            cover=cover,
            task_type=meta["task_type"],
            use_uvr=meta["use_uvr"],
            language=meta["language"],
            prompt=meta["prompt"],
            output_format=meta["output_format"],
            file_path=final_path,
            file_filename=filename,
            covers_dir=settings.COVERS_DIR
        )
        return result
    except Exception as e:
        logger.error(f"❌ Finalize Dispatch Error: {e}")
        if os.path.exists(final_path):
            os.remove(final_path)
        raise HTTPException(status_code=500, detail=str(e))
