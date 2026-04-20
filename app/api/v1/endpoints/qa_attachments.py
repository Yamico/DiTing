"""
Serve persisted QA image attachments.
"""
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings
from app.db.qa import get_message_attachment

router = APIRouter(tags=["QA Attachments"])


@router.get("/qa/attachments/{attachment_id}")
async def get_qa_attachment(attachment_id: int):
    attachment = get_message_attachment(attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    attachment_dict = dict(attachment)
    abs_path = os.path.abspath(attachment_dict["file_path"])
    base_dir = os.path.abspath(settings.QA_ATTACHMENTS_DIR)

    if not abs_path.startswith(base_dir):
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="Attachment file not found")

    return FileResponse(
        abs_path,
        media_type=attachment_dict["mime_type"],
        filename=attachment_dict["filename"],
    )
