"""
QA (Video Q&A) router.
"""
import asyncio
import base64
import json
import mimetypes
import os
import re
import time
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.core.config import settings
from app.core.logger import logger, trace_id_ctx
from app.core.task_manager import TaskCancelledException, task_manager
from app.db import get_active_model_full, get_all_transcriptions_by_source, get_llm_model_full_by_id
from app.db.qa import (
    add_message,
    add_message_attachment,
    create_conversation,
    delete_conversation,
    delete_message,
    get_attachments_for_conversation,
    get_conversation,
    get_conversations_by_source,
    get_message,
    get_message_attachment,
    get_message_attachments,
    get_messages_with_attachments,
    touch_conversation,
    update_conversation_title,
)
from app.services.llm import create_analysis_stream
from app.utils.source_utils import normalize_source_id

router = APIRouter(tags=["QA"])

MAX_HISTORY_ROUNDS = 10
MAX_IMAGES_PER_QA_TURN = 4
IMAGE_FIELD_NAME = "images"
LEGACY_IMAGE_FIELD_NAME = "image"


class CreateConversationRequest(BaseModel):
    source_id: str
    title: Optional[str] = None


class AskRequest(BaseModel):
    conversation_id: int
    question: str
    llm_model_id: Optional[int] = None


class UpdateTitleRequest(BaseModel):
    title: str


QA_SYSTEM_PROMPT = """你是一个专业的视频内容问答助手，负责结合视频材料、图片和对话上下文回答问题。

规则：
1. 优先依据视频转写内容、用户提供的图片和当前对话上下文回答。
2. 如果视频材料没有说清楚，也可以结合图片内容、常识和通用知识补充回答，但不要把补充内容冒充成视频原话。
3. 明确区分哪些内容来自视频材料，哪些是基于图片、常识或通用知识的补充说明；不确定时要说明不确定性。
4. 当答案直接来自视频材料时，尽量标注对应时间戳，格式为 [MM:SS]。
5. 不要编造视频中明确不存在的事实。
6. 用简洁、有条理的方式组织答案，并使用与用户提问相同的语言回答。"""

QA_TRANSCRIPT_PROMPT = (
    "以下是视频相关材料（主要是转写文本，可能不完整）。"
    "请优先基于这些材料回答后续问题；如果视频材料没有说清楚，"
    "可以结合图片内容、常识和通用知识补充说明，但要明确标注哪些内容是补充信息：\n\n{transcript_text}"
)
QA_TRANSCRIPT_ACK = "好的，我已阅读视频材料。请继续提问；如果材料没有说清楚，我会明确区分视频内容与补充说明。"


def _resolve_llm_api_type(llm_model_id: Optional[int]) -> str:
    model_info = get_llm_model_full_by_id(llm_model_id) if llm_model_id else get_active_model_full()
    if not model_info:
        return "chat_completions"
    return model_info.get("api_type", "chat_completions")


def _build_transcript_text(segments: list) -> str:
    lines = []
    for seg in segments:
        seg_dict = dict(seg)
        start = seg_dict.get("segment_start") or 0
        h = int(start // 3600)
        m = int((start % 3600) // 60)
        s = int(start % 60)
        ts = f"{h:02d}:{m:02d}:{s:02d}"
        text = (seg_dict.get("raw_text") or "").strip()
        text = re.sub(r"<\|.*?\|>", "", text).strip()
        if text:
            lines.append(f"[{ts}] {text}")
    return "\n".join(lines)


def _attachment_to_data_url(attachment: dict) -> str:
    with open(attachment["file_path"], "rb") as file_obj:
        encoded = base64.b64encode(file_obj.read()).decode("ascii")
    return f"data:{attachment['mime_type']};base64,{encoded}"


def _build_chat_user_content(text: str, attachments: list[dict]) -> Any:
    if not attachments:
        return text

    content = [{"type": "text", "text": text}]
    for attachment in attachments:
        content.append({
            "type": "image_url",
            "image_url": {"url": _attachment_to_data_url(attachment)},
        })
    return content


def _build_responses_user_content(text: str, attachments: list[dict]) -> list[dict]:
    content = [{"type": "input_text", "text": text}]
    for attachment in attachments:
        content.append({
            "type": "input_image",
            "image_url": _attachment_to_data_url(attachment),
        })
    return content


def _serialize_attachment(attachment: dict) -> dict:
    return {
        "id": attachment["id"],
        "filename": attachment["filename"],
        "mime_type": attachment["mime_type"],
        "url": f"/api/qa/attachments/{attachment['id']}",
    }


def _serialize_message(message: dict) -> dict:
    return {
        "id": message["id"],
        "conversation_id": message["conversation_id"],
        "role": message["role"],
        "content": message["content"],
        "model": message.get("model"),
        "response_time": message.get("response_time"),
        "created_at": message["created_at"],
        "attachments": [_serialize_attachment(attachment) for attachment in message.get("attachments", [])],
    }


def build_messages_for_llm(
    transcript_text: str,
    history: list,
    question: str,
    current_attachments: Optional[list[dict]] = None,
    api_type: str = "chat_completions",
):
    current_attachments = current_attachments or []
    recent = history[-(MAX_HISTORY_ROUNDS * 2):]
    transcript_prompt = QA_TRANSCRIPT_PROMPT.format(transcript_text=transcript_text)

    if api_type == "responses":
        input_messages = [
            {"role": "user", "content": _build_responses_user_content(transcript_prompt, [])},
            {"role": "assistant", "content": QA_TRANSCRIPT_ACK},
        ]
        for message in recent:
            message_dict = dict(message)
            if message_dict["role"] == "user":
                input_messages.append({
                    "role": "user",
                    "content": _build_responses_user_content(
                        message_dict["content"],
                        message_dict.get("attachments", []),
                    ),
                })
            else:
                input_messages.append({
                    "role": "assistant",
                    "content": message_dict["content"],
                })
        input_messages.append({
            "role": "user",
            "content": _build_responses_user_content(question, current_attachments),
        })
        return {"instructions": QA_SYSTEM_PROMPT, "input": input_messages}

    messages = [
        {"role": "system", "content": QA_SYSTEM_PROMPT},
        {"role": "user", "content": transcript_prompt},
        {"role": "assistant", "content": QA_TRANSCRIPT_ACK},
    ]
    for message in recent:
        message_dict = dict(message)
        if message_dict["role"] == "user":
            messages.append({
                "role": "user",
                "content": _build_chat_user_content(
                    message_dict["content"],
                    message_dict.get("attachments", []),
                ),
            })
        else:
            messages.append({"role": "assistant", "content": message_dict["content"]})
    messages.append({
        "role": "user",
        "content": _build_chat_user_content(question, current_attachments),
    })
    return messages


async def _parse_image_upload(upload: Optional[UploadFile]) -> Optional[dict]:
    if not upload:
        return None

    mime_type = (upload.content_type or "").lower()
    if not mime_type.startswith("image/"):
        raise HTTPException(400, "Only image attachments are supported.")

    contents = await upload.read()
    if not contents:
        raise HTTPException(400, "Image attachment is empty.")

    ext = os.path.splitext(upload.filename or "")[1]
    if not ext:
        ext = mimetypes.guess_extension(mime_type) or ".img"

    return {
        "bytes": contents,
        "mime_type": mime_type,
        "extension": ext,
    }


async def _parse_ask_request(request: Request) -> tuple[AskRequest, list[dict]]:
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        try:
            conversation_id = int(form.get("conversation_id", ""))
        except (TypeError, ValueError) as exc:
            raise HTTPException(422, "conversation_id is required") from exc

        question = str(form.get("question") or "").strip()
        if not question:
            raise HTTPException(422, "question is required")

        llm_model_id_raw = form.get("llm_model_id")
        llm_model_id = int(llm_model_id_raw) if llm_model_id_raw not in (None, "") else None
        uploads = []
        for field_name in (IMAGE_FIELD_NAME, LEGACY_IMAGE_FIELD_NAME):
            uploads.extend(item for item in form.getlist(field_name) if isinstance(item, UploadFile))

        if len(uploads) > MAX_IMAGES_PER_QA_TURN:
            raise HTTPException(400, f"A maximum of {MAX_IMAGES_PER_QA_TURN} images is allowed.")

        image_payloads = []
        for upload in uploads:
            image_payload = await _parse_image_upload(upload)
            if image_payload is not None:
                image_payloads.append(image_payload)

        return AskRequest(
            conversation_id=conversation_id,
            question=question,
            llm_model_id=llm_model_id,
        ), image_payloads

    try:
        payload = AskRequest.model_validate(await request.json())
    except Exception as exc:
        raise HTTPException(422, f"Invalid request payload: {exc}") from exc

    return payload, []


def _save_message_attachment(message_id: int, image_payload: dict) -> dict:
    out_dir = os.path.join(settings.QA_ATTACHMENTS_DIR, str(message_id))
    os.makedirs(out_dir, exist_ok=True)

    filename = f"{uuid4().hex}{image_payload['extension']}"
    out_path = os.path.join(out_dir, filename)
    with open(out_path, "wb") as file_obj:
        file_obj.write(image_payload["bytes"])

    attachment_id = add_message_attachment(
        message_id,
        filename,
        out_path,
        image_payload["mime_type"],
    )
    attachment = get_message_attachment(attachment_id)
    return dict(attachment)


def _cleanup_attachment_files(attachments: list[dict]):
    base_dir = os.path.abspath(settings.QA_ATTACHMENTS_DIR)
    directories = set()
    for attachment in attachments:
        attachment_path = os.path.abspath(attachment["file_path"])
        if attachment_path.startswith(base_dir) and os.path.isfile(attachment_path):
            os.remove(attachment_path)
            directories.add(os.path.dirname(attachment_path))

    for directory in sorted(directories, reverse=True):
        if directory.startswith(base_dir) and os.path.isdir(directory) and not os.listdir(directory):
            os.rmdir(directory)


async def _process_qa(
    conversation_id: int,
    task_id: int,
    messages_for_llm,
    llm_model_id: Optional[int],
    question: str,
    trace_id_token: str = None,
):
    token = None
    if trace_id_token:
        token = trace_id_ctx.set(trace_id_token)

    task = task_manager.tasks.get(task_id)
    if task:
        task["_stream_chunks"] = []
        task["_stream_model"] = ""
        task["_stream_done"] = False
        task["_stream_result"] = ""
        task["_stream_duration"] = 0
        task["_stream_error"] = ""

    try:
        logger.info(f"QA: Starting for conversation {conversation_id}, task {task_id}")
        task_manager.update_progress(task_id, 10, "Requesting LLM...")

        start_time = time.time()
        model_name, stream = create_analysis_stream(
            None,
            None,
            llm_model_id,
            messages_override=messages_for_llm,
        )

        if task:
            task["_stream_model"] = model_name

        full_text = ""
        async for chunk in stream:
            if task_manager.is_cancelled(task_id):
                raise TaskCancelledException(f"Task {task_id} cancelled")
            full_text += chunk
            if task:
                task["_stream_chunks"].append(chunk)

        duration = round(time.time() - start_time, 2)
        add_message(conversation_id, "assistant", full_text, model_name, duration)
        touch_conversation(conversation_id)

        conv = get_conversation(conversation_id)
        if conv and not conv["title"]:
            title = question[:50] + ("..." if len(question) > 50 else "")
            update_conversation_title(conversation_id, title)

        task_manager.update_progress(task_id, 100, "Completed")
        if task:
            task["_stream_done"] = True
            task["_stream_result"] = "completed"
            task["_stream_duration"] = duration

    except TaskCancelledException:
        logger.warning(f"QA: Cancelled for conversation {conversation_id}")
        if task:
            task["_stream_done"] = True
            task["_stream_result"] = "cancelled"
    except asyncio.CancelledError:
        logger.warning(f"QA: Asyncio cancelled for conversation {conversation_id}")
        if task:
            task["_stream_done"] = True
            task["_stream_result"] = "cancelled"
    except Exception as exc:
        logger.error(f"QA: Failed for conversation {conversation_id}: {exc}", exc_info=True)
        task_manager.update_progress(task_id, 0, f"Failed: {str(exc)}")
        if task:
            task["_stream_done"] = True
            task["_stream_result"] = "failed"
            task["_stream_error"] = str(exc)
    finally:
        task_manager.finish_task(task_id)
        if token:
            trace_id_ctx.reset(token)


@router.post("/qa/conversations")
async def create_conversation_endpoint(request: CreateConversationRequest):
    source_id = normalize_source_id(request.source_id)
    conv_id = create_conversation(source_id, request.title)
    return {"id": conv_id}


@router.get("/qa/conversations")
async def list_conversations(source_id: str):
    source_id = normalize_source_id(source_id)
    rows = get_conversations_by_source(source_id)
    return [dict(row) for row in rows]


@router.patch("/qa/conversations/{conversation_id}")
async def update_conversation_endpoint(conversation_id: int, request: UpdateTitleRequest):
    conv = get_conversation(conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    update_conversation_title(conversation_id, request.title)
    return {"status": "success"}


@router.delete("/qa/conversations/{conversation_id}")
async def delete_conversation_endpoint(conversation_id: int):
    conv = get_conversation(conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    attachments = [dict(attachment) for attachment in get_attachments_for_conversation(conversation_id)]
    delete_conversation(conversation_id)
    _cleanup_attachment_files(attachments)
    return {"status": "success"}


@router.get("/qa/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: int):
    conv = get_conversation(conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    rows = get_messages_with_attachments(conversation_id)
    return [_serialize_message(row) for row in rows]


@router.delete("/qa/messages/{message_id}")
async def delete_message_endpoint(message_id: int):
    msg = get_message(message_id)
    if not msg:
        raise HTTPException(404, "Message not found")

    attachments = [dict(attachment) for attachment in get_message_attachments(message_id)]
    delete_message(message_id)
    _cleanup_attachment_files(attachments)
    return {"status": "success"}


@router.post("/qa/ask")
async def ask_endpoint(request: Request, background_tasks: BackgroundTasks):
    ask_request, image_payloads = await _parse_ask_request(request)

    conv = get_conversation(ask_request.conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    source_id = conv["source_id"]
    all_segments = get_all_transcriptions_by_source(source_id)
    if not all_segments:
        raise HTTPException(404, "No transcriptions found for this video.")

    pinned = [segment for segment in all_segments if dict(segment).get("is_pinned")]
    segments = pinned if pinned else all_segments
    transcript_text = _build_transcript_text(segments)
    if not transcript_text.strip():
        raise HTTPException(422, "Transcription text is empty.")

    user_message_id = add_message(ask_request.conversation_id, "user", ask_request.question)
    current_attachments = []
    if image_payloads:
        try:
            for image_payload in image_payloads:
                current_attachments.append(_save_message_attachment(user_message_id, image_payload))
        except Exception:
            delete_message(user_message_id)
            raise

    history = get_messages_with_attachments(ask_request.conversation_id)
    history = [message for message in history if message["id"] != user_message_id]
    api_type = _resolve_llm_api_type(ask_request.llm_model_id)
    messages_for_llm = build_messages_for_llm(
        transcript_text=transcript_text,
        history=history,
        question=ask_request.question,
        current_attachments=current_attachments,
        api_type=api_type,
    )

    task_id = -int(time.time() * 1000) % 1000000000
    task_manager.start_task(task_id, meta={
        "type": "qa",
        "conversation_id": ask_request.conversation_id,
    })

    trace_id = trace_id_ctx.get()
    background_tasks.add_task(
        _process_qa,
        ask_request.conversation_id,
        task_id,
        messages_for_llm,
        ask_request.llm_model_id,
        ask_request.question,
        trace_id,
    )

    return {"task_id": task_id}


@router.get("/qa/stream/{task_id}")
async def observe_qa_stream(task_id: int):
    task = task_manager.tasks.get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    async def event_stream():
        cursor = 0
        model_sent = False

        while True:
            task = task_manager.tasks.get(task_id)
            if not task:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Task removed'}, ensure_ascii=False)}\n\n"
                break

            if not model_sent:
                model = task.get("_stream_model", "")
                if model:
                    yield f"data: {json.dumps({'type': 'start', 'model': model}, ensure_ascii=False)}\n\n"
                    model_sent = True

            chunks = task.get("_stream_chunks", [])
            while cursor < len(chunks):
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunks[cursor]}, ensure_ascii=False)}\n\n"
                cursor += 1

            if task.get("_stream_done"):
                chunks = task.get("_stream_chunks", [])
                while cursor < len(chunks):
                    yield f"data: {json.dumps({'type': 'chunk', 'text': chunks[cursor]}, ensure_ascii=False)}\n\n"
                    cursor += 1

                result = task.get("_stream_result", "failed")
                if result == "completed":
                    duration = task.get("_stream_duration", 0)
                    yield f"data: {json.dumps({'type': 'done', 'duration': duration}, ensure_ascii=False)}\n\n"
                elif result == "cancelled":
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Task cancelled'}, ensure_ascii=False)}\n\n"
                else:
                    error_msg = task.get("_stream_error", "Unknown error")
                    yield f"data: {json.dumps({'type': 'error', 'message': error_msg}, ensure_ascii=False)}\n\n"
                break

            await asyncio.sleep(0.05)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
