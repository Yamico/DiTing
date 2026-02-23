"""
Pydantic schemas for API request/response validation.
Re-exports all schemas for convenient imports.
"""
# Base
from app.schemas.base import (
    SuccessResponse,
    ErrorResponse,
    PaginatedResponse,
)

# Transcription
from app.schemas.transcribe import (
    TranscribeBilibiliRequest,
    TranscribeYouTubeRequest,
    TranscribeNetworkRequest,
    TranscribeFileRequest,
    TranscribeDouyinRequest,
    RetranscribeRequest,
    TranscribeResponse,
)

# Video & Segments
from app.schemas.video import (
    VideoBase,
    VideoResponse,
    SegmentBase,
    SegmentResponse,
    SegmentUpdate,
    AISummaryResponse,
    SegmentWithSummaries,
)

# Settings
from app.schemas.settings import (
    LLMProviderCreate,
    LLMModelCreate,
    LLMProviderResponse,
    ASRModelCreate,
    ASRModelResponse,
    PromptCreate,
    PromptResponse,
    CategoryCreate,
    CategoryResponse,
)

__all__ = [
    # Base
    "SuccessResponse",
    "ErrorResponse",
    "PaginatedResponse",
    # Transcription
    "TranscribeBilibiliRequest",
    "TranscribeYouTubeRequest",
    "TranscribeNetworkRequest",
    "TranscribeFileRequest",
    "TranscribeDouyinRequest",
    "RetranscribeRequest",
    "TranscribeResponse",
    # Video
    "VideoBase",
    "VideoResponse",
    "SegmentBase",
    "SegmentResponse",
    "SegmentUpdate",
    "AISummaryResponse",
    "SegmentWithSummaries",
    # Settings
    "LLMProviderCreate",
    "LLMModelCreate",
    "LLMProviderResponse",
    "ASRModelCreate",
    "ASRModelResponse",
    "PromptCreate",
    "PromptResponse",
    "CategoryCreate",
    "CategoryResponse",
]
