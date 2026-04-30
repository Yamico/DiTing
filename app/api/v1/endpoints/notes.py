"""
Video Notes Router
Handles: AI note generation (background), note CRUD, version management.
"""
import hashlib
import io
import json
import os
import re
import time
import zipfile
from typing import Optional

from fastapi import APIRouter, Body, BackgroundTasks, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from app.db import (
    get_all_notes, get_active_note, get_note_by_id,
    add_video_note, update_note_content, reset_note_to_original,
    delete_video_note, set_note_active,
    get_all_transcriptions_by_source,
    get_active_model_full, get_llm_model_full_by_id,
)
from app.db.media_cache_entries import get_best_cache_path
from app.services.llm import analyze_text, create_analysis_stream
from app.core.logger import logger, trace_id_ctx
from app.core.config import settings
from app.core.task_manager import task_manager, TaskCancelledException
from app.utils.source_utils import normalize_source_id
from app.utils.media_utils import extract_frame_at_time
import asyncio
import shutil

router = APIRouter(tags=["Notes"])


# --- Pydantic Models ---

class NoteGenerateRequest(BaseModel):
    """Request schema for AI note generation."""
    source_id: str
    prompt: Optional[str] = None       # Custom user prompt; None = use built-in note prompt
    llm_model_id: Optional[int] = None
    style: Optional[str] = None        # 'concise' | 'detailed' | 'outline'
    screenshot_density: Optional[str] = None  # None/'few'/'moderate'/'dense'
    transcription_version: Optional[str] = None  # ASR model name to filter segments


class NoteUpdateRequest(BaseModel):
    content: str


# --- Built-in Note Generation Prompt ---

NOTE_SYSTEM_PROMPT = """你是一个专业的视频内容笔记助手，擅长将视频逐字稿整理成结构清晰、内容完整的学习笔记。

**笔记要求：**
1. **语言**：笔记使用中文，专有名词、技术术语保留英文。
2. **结构**：使用 Markdown 标题（##）区分主要章节，每个章节以时间戳开头，格式为 `⏱ mm:ss`。
3. **内容**：忠实还原视频核心信息，保留关键细节、示例、结论。省略广告、填充词。
4. **标题格式**：使用 `## 章节名 ⏱ mm:ss` 格式，`⏱` 后的时间戳代表该章节在视频中的起始时刻。
5. **结尾**：在笔记末尾添加一段 **AI 总结**，用 2-4 句话概括整个视频的核心观点。
6. **禁止**：不要用代码块包裹 Markdown，不要生成目录。

**时间戳格式说明（输入）：**
每一段转写文本的格式为：`[hh:mm:ss] 文本内容`
请根据这些时间信息，在合适的章节标题中使用 `⏱ mm:ss` 格式标注时间。"""

SCREENSHOT_PROMPTS = {
    "few": """

**关键帧截图指令：**
在笔记中关键章节开头处，使用 `[[SCREENSHOT:mm:ss]]` 标记来请求关键帧截图。
- 每篇笔记标注 3-5 个截图点，仅在主要章节标题后放置。
- mm:ss 应为视频中该画面出现的时间。
- 标记独占一行。
- 示例：`[[SCREENSHOT:02:15]]`""",
    "moderate": """

**关键帧截图指令：**
在笔记中每个 `##` 章节标题后放置一个 `[[SCREENSHOT:mm:ss]]` 标记。
- 每个章节至少 1 个截图，重要视觉内容处（图表、展示、分析）可额外添加。
- mm:ss 应为视频中该画面出现的时间。
- 标记独占一行。
- 示例：`[[SCREENSHOT:02:15]]`""",
    "dense": """

**关键帧截图指令：**
在笔记中尽可能多地放置 `[[SCREENSHOT:mm:ss]]` 标记，不设上限。
- 每个章节标题后必须有截图。
- 每个具体产品/型号/对比项/步骤处也应有截图。
- 图表、数据展示、UI 界面演示、产品外观等视觉重要内容必须截图。
- mm:ss 应为视频中该画面出现的时间。
- 标记独占一行。
- 示例：`[[SCREENSHOT:02:15]]`""",
}


def build_note_prompt(style: Optional[str], screenshot_density: Optional[str] = None) -> str:
    """Build the final user prompt for note generation based on style."""
    base = NOTE_SYSTEM_PROMPT
    if screenshot_density and screenshot_density in SCREENSHOT_PROMPTS:
        base += SCREENSHOT_PROMPTS[screenshot_density]
    if style == "concise":
        return base + "\n\n**风格要求**：简洁模式，每个章节使用 3-5 条要点列表，避免大段文字。"
    elif style == "outline":
        return base + "\n\n**风格要求**：大纲模式，只输出标题和子标题，不需要详细内容。"
    else:  # 'detailed' or default
        return base + "\n\n**风格要求**：详细模式，充分展开每个章节，保留所有重要细节。"


def build_transcript_text(segments: list) -> str:
    """Combine all segments into a timestamped transcript text."""
    lines = []
    for seg in segments:
        # sqlite3.Row supports column-name access but not .get() — convert to dict
        seg_dict = dict(seg)
        start = seg_dict.get("segment_start") or 0
        h = int(start // 3600)
        m = int((start % 3600) // 60)
        s = int(start % 60)
        ts = f"{h:02d}:{m:02d}:{s:02d}"
        text = (seg_dict.get("raw_text") or "").strip()
        # Strip ASR emotion tags like <|HAPPY|>
        text = re.sub(r"<\|.*?\|>", "", text).strip()
        if text:
            lines.append(f"[{ts}] {text}")
    return "\n".join(lines)


# --- Screenshot Post-Processor ---

def _parse_ts_to_seconds(ts: str) -> float:
    """Convert 'mm:ss' or 'hh:mm:ss' to seconds."""
    parts = ts.split(':')
    parts = [int(p) for p in parts]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return 0


def _extract_screenshots(content: str, source_id: str) -> str:
    """Replace [[SCREENSHOT:mm:ss]] markers with actual screenshot images.

    1. Find all markers via regex.
    2. Find the video file via get_best_cache_path.
    3. For each timestamp, extract a frame with FFmpeg.
    4. Replace marker with Markdown image link.
    If no video is cached, all markers are silently removed.
    """
    markers = re.findall(r'\[\[SCREENSHOT:(\d{1,2}:\d{2}(?::\d{2})?)\]\]', content)
    if not markers:
        return content

    # Get video file path (prefer video quality, not audio_only)
    media_path, quality = get_best_cache_path(source_id, 'playback')
    if not media_path or quality == 'audio_only':
        logger.info(f"📷 No video cache for {source_id}, removing screenshot markers")
        return re.sub(r'\[\[SCREENSHOT:\d{1,2}:\d{2}(?::\d{2})?\]\]\n?', '', content)

    full_video_path = os.path.abspath(media_path)
    if not os.path.exists(full_video_path):
        logger.warning(f"📷 Video file missing: {full_video_path}")
        return re.sub(r'\[\[SCREENSHOT:\d{1,2}:\d{2}(?::\d{2})?\]\]\n?', '', content)

    # Create output directory
    out_dir = os.path.join(settings.NOTE_SCREENSHOTS_DIR, source_id)
    os.makedirs(out_dir, exist_ok=True)

    processed = set()  # avoid duplicate timestamps
    for ts in markers:
        if ts in processed:
            continue
        processed.add(ts)

        seconds = _parse_ts_to_seconds(ts)
        # Deterministic filename based on source + timestamp
        name_hash = hashlib.md5(f"{source_id}_{ts}".encode()).hexdigest()[:12]
        filename = f"{name_hash}.jpg"
        out_path = os.path.join(out_dir, filename)

        if not os.path.exists(out_path):
            ok = extract_frame_at_time(full_video_path, seconds, out_path)
            if not ok:
                logger.warning(f"📷 Failed to extract frame at {ts} for {source_id}")
                content = content.replace(f"[[SCREENSHOT:{ts}]]", '')
                continue

        img_url = f"/api/note-screenshots/{source_id}/{filename}"
        content = content.replace(
            f"[[SCREENSHOT:{ts}]]",
            f"![⏱ {ts}]({img_url})"
        )

    logger.info(f"📷 Extracted {len(processed)} screenshots for {source_id}")
    return content


# --- Background Worker ---

async def process_note_generation(
    source_id: str,
    task_id: int,
    transcript_text: str,
    prompt: str,
    llm_model_id: Optional[int],
    style: Optional[str],
    screenshot_density: Optional[str] = None,
    user_prompt: Optional[str] = None,
    transcription_version: Optional[str] = None,
    trace_id_token: str = None,
):
    token = None
    if trace_id_token:
        token = trace_id_ctx.set(trace_id_token)

    # Attach stream data to task for SSE observer
    task = task_manager.tasks.get(task_id)
    if task:
        task["_stream_chunks"] = []
        task["_stream_model"] = ""
        task["_stream_done"] = False
        task["_stream_result"] = ""
        task["_stream_duration"] = 0
        task["_stream_error"] = ""

    try:
        logger.info(f"📝 Starting note generation for {source_id}, Task {task_id}...")
        task_manager.update_progress(task_id, 10, f"Requesting LLM... (style={style or 'default'})")

        start_time = time.time()

        model_name, stream = create_analysis_stream(transcript_text, prompt, llm_model_id)

        if task:
            task["_stream_model"] = model_name

        content = ""
        async for chunk in stream:
            if task_manager.is_cancelled(task_id):
                raise TaskCancelledException(f"Task {task_id} cancelled by user")
            content += chunk
            if task:
                task["_stream_chunks"].append(chunk)

        duration = round(time.time() - start_time, 2)

        # Post-process: extract keyframe screenshots if enabled
        if screenshot_density:
            task_manager.update_progress(task_id, 80, "Extracting keyframe screenshots...")
            content = _extract_screenshots(content, source_id)

        task_manager.update_progress(task_id, 90, "Saving note...")

        # Resolve provider_id from model if possible
        provider_id = None
        if llm_model_id:
            model_info = get_llm_model_full_by_id(llm_model_id)
            if model_info:
                provider_id = model_info.get("provider_id")
        else:
            model_info = get_active_model_full()
            if model_info:
                provider_id = model_info.get("id")

        # Extract finished stages from task status before saving
        task_status = task_manager.get_task_status(task_id)
        stages = task_status.get("stages", []) if task_status else []

        add_video_note(
            source_id=source_id,
            content=content,
            original_content=content,
            prompt=prompt,
            model=model_name,
            provider_id=provider_id,
            style=style,
            response_time=duration,
            gen_params=json.dumps({
                k: v for k, v in {
                    "user_prompt": user_prompt,
                    "screenshot_density": screenshot_density,
                    "transcription_version": transcription_version,
                    "stages": stages if stages else None,
                }.items() if v
            }, ensure_ascii=False) or None,
        )

        logger.info(f"✅ Note generation completed for {source_id}")
        task_manager.update_progress(task_id, 100, "Note generated successfully")

        if task:
            task["_stream_done"] = True
            task["_stream_result"] = "completed"
            task["_stream_duration"] = duration

    except TaskCancelledException as e:
        logger.warning(f"⚠️ Note generation cancelled for {source_id}: {e}")
        if task:
            task["_stream_done"] = True
            task["_stream_result"] = "cancelled"
    except asyncio.CancelledError:
        logger.warning(f"⚠️ Note generation asyncio task cancelled for {source_id}")
        if task:
            task["_stream_done"] = True
            task["_stream_result"] = "cancelled"
    except Exception as e:
        logger.error(f"❌ Note generation failed for {source_id}: {e}", exc_info=True)
        task_manager.update_progress(task_id, 0, f"Failed: {str(e)}")
        if task:
            task["_stream_done"] = True
            task["_stream_result"] = "failed"
            task["_stream_error"] = str(e)
    finally:
        task_manager.finish_task(task_id)
        if token:
            trace_id_ctx.reset(token)


# --- Helper: row to dict ---

def _note_to_dict(row) -> dict:
    d = dict(row)
    d["is_edited"] = bool(d.get("is_edited"))
    d["is_active"] = bool(d.get("is_active"))
    # Parse gen_params JSON if present
    gp = d.get("gen_params")
    if gp and isinstance(gp, str):
        try:
            d["gen_params"] = json.loads(gp)
        except (json.JSONDecodeError, TypeError):
            d["gen_params"] = None
    return d


# --- Endpoints ---

@router.post("/notes/generate")
async def generate_note(request: NoteGenerateRequest, background_tasks: BackgroundTasks):
    """Generate an AI note for a whole video in the background."""
    source_id = normalize_source_id(request.source_id)

    # Fetch segments, filtering by transcription version if specified
    all_segments = get_all_transcriptions_by_source(source_id)
    if not all_segments:
        raise HTTPException(status_code=404, detail="No transcriptions found for this video. Please transcribe first.")

    if request.transcription_version:
        if request.transcription_version == '__all__':
            segments = all_segments
        else:
            # Filter to only segments from the specified ASR model, or match by segment ID directly
            segments = [s for s in all_segments if dict(s).get('asr_model') == request.transcription_version or str(dict(s).get('id')) == request.transcription_version]
            if not segments:
                raise HTTPException(status_code=404, detail=f"No segments found for transcription version: {request.transcription_version}")
    else:
        # Default: use pinned segments if any, else all segments
        pinned = [s for s in all_segments if dict(s).get('is_pinned')]
        segments = pinned if pinned else all_segments

    transcript_text = build_transcript_text(segments)
    if not transcript_text.strip():
        raise HTTPException(status_code=422, detail="Transcription text is empty.")

    # Build final prompt — always start from built-in, append user instructions if provided
    base_prompt = build_note_prompt(request.style, request.screenshot_density)
    if request.prompt and request.prompt.strip():
        base_prompt += f"\n\n**用户附加指令：**\n{request.prompt.strip()}"

    # Create task
    task_id = -int(time.time() * 1000) % 1000000000
    task_manager.start_task(task_id, meta={
        "type": "ai",
        "filename": f"Note: {source_id}",
        "prompt": request.prompt,
        "style": request.style,
        "screenshot_density": request.screenshot_density,
        "transcription_version": request.transcription_version,
        "llm_model_id": request.llm_model_id,
    })

    trace_id = trace_id_ctx.get()
    background_tasks.add_task(
        process_note_generation,
        source_id,
        task_id,
        transcript_text,
        base_prompt,
        request.llm_model_id,
        request.style,
        request.screenshot_density,
        request.prompt,              # user_prompt
        request.transcription_version,
        trace_id,
    )

    return {"status": "queued", "message": "Note generation started in background", "task_id": task_id}


@router.get("/notes")
async def list_notes(source_id: str):
    """List all note versions for a video."""
    source_id = normalize_source_id(source_id)
    rows = get_all_notes(source_id)
    return [_note_to_dict(r) for r in rows]


@router.get("/notes/active")
async def get_active_note_endpoint(source_id: str):
    """Get the currently active note for a video."""
    source_id = normalize_source_id(source_id)
    row = get_active_note(source_id)
    if not row:
        return None
    return _note_to_dict(row)


@router.patch("/notes/{note_id}")
async def update_note(note_id: int, payload: NoteUpdateRequest):
    """Update note content (user edit)."""
    row = get_note_by_id(note_id)
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    update_note_content(note_id, payload.content)
    return {"status": "success"}


@router.patch("/notes/{note_id}/reset")
async def reset_note(note_id: int):
    """Reset note content back to AI-generated original."""
    row = get_note_by_id(note_id)
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    reset_note_to_original(note_id)
    return {"status": "success"}


@router.patch("/notes/{note_id}/activate")
async def activate_note(note_id: int):
    """Switch the active note version."""
    row = get_note_by_id(note_id)
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    set_note_active(note_id, row["source_id"])
    return {"status": "success"}


def _delete_note_screenshots(note_row) -> int:
    """Delete only the screenshot files referenced by the given note row.

    Parses Markdown image links of the form
    ``![...]( /api/note-screenshots/{source_id}/{filename} )``
    and removes the corresponding files from NOTE_SCREENSHOTS_DIR.
    Returns the number of files deleted.
    """
    content: str = note_row["content"] or ""
    source_id: str = note_row["source_id"]
    pattern = re.compile(
        r'!\[[^\]]*\]\(/api/note-screenshots/[^/]+/([^)]+\.jpg)\)'
    )
    filenames = pattern.findall(content)
    if not filenames:
        return 0

    images_dir = os.path.join(settings.NOTE_SCREENSHOTS_DIR, source_id)
    deleted = 0
    for filename in set(filenames):
        img_path = os.path.join(images_dir, filename)
        if os.path.isfile(img_path):
            try:
                os.remove(img_path)
                deleted += 1
                logger.info(f"📷 Deleted screenshot: {img_path}")
            except OSError as exc:
                logger.warning(f"📷 Failed to delete screenshot {img_path}: {exc}")
    return deleted


def delete_note_screenshots_dir(source_id: str) -> bool:
    """Delete the entire screenshots directory for a video.

    Called when a whole video record is being deleted.
    Returns True if the directory was removed.
    """
    images_dir = os.path.join(settings.NOTE_SCREENSHOTS_DIR, source_id)
    if os.path.isdir(images_dir):
        try:
            shutil.rmtree(images_dir)
            logger.info(f"📷 Deleted screenshots directory: {images_dir}")
            return True
        except OSError as exc:
            logger.warning(f"📷 Failed to delete screenshots directory {images_dir}: {exc}")
    return False


@router.delete("/notes/{note_id}")
async def delete_note(note_id: int):
    """Delete a specific note version and its referenced screenshots."""
    row = get_note_by_id(note_id)
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    _delete_note_screenshots(row)
    delete_video_note(note_id)
    return {"status": "success"}


@router.get("/notes/{note_id}/export")
async def export_note(note_id: int):
    """Export a note as a ZIP (with screenshots) or plain Markdown if no images."""
    row = get_note_by_id(note_id)
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")

    content: str = row["content"]
    source_id: str = row["source_id"]

    # Detect screenshot references: /api/note-screenshots/{source_id}/{filename}
    screenshot_pattern = re.compile(
        r'!\[([^\]]*)\]\(/api/note-screenshots/[^/]+/([^)]+\.jpg)\)'
    )
    matches = screenshot_pattern.findall(content)  # list of (alt, filename)

    if not matches:
        # No images — plain Markdown download
        return Response(
            content=content.encode('utf-8'),
            media_type='text/markdown; charset=utf-8',
            headers={"Content-Disposition": f'attachment; filename="note-{source_id}.md"'},
        )

    # Rewrite image URLs to relative paths before packing
    md_for_zip = screenshot_pattern.sub(
        lambda m: f"![{m.group(1)}](./images/{m.group(2)})",
        content,
    )

    # Build ZIP in memory
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('note.md', md_for_zip.encode('utf-8'))
        images_dir = os.path.join(settings.NOTE_SCREENSHOTS_DIR, source_id)
        seen = set()
        for _, filename in matches:
            if filename in seen:
                continue
            seen.add(filename)
            img_path = os.path.join(images_dir, filename)
            if os.path.isfile(img_path):
                zf.write(img_path, arcname=f'images/{filename}')
            else:
                logger.warning(f"📷 Export: screenshot file missing {img_path}")

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type='application/zip',
        headers={"Content-Disposition": f'attachment; filename="note-{source_id}.zip"'},
    )
