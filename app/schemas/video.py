"""
Video and Segment schemas.
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class VideoBase(BaseModel):
    """Base video fields."""
    id: int
    source_id: str
    title: str
    source_type: str
    cover: Optional[str] = None


class VideoResponse(VideoBase):
    """Video response with aggregated counts."""
    count: int = Field(0, description="Number of transcribed segments")
    ai_count: int = Field(0, description="Number of AI summaries")
    last_updated: Optional[datetime] = None
    is_subtitle: Optional[bool] = None
    latest_status: Optional[str] = None

    class Config:
        from_attributes = True


class SegmentBase(BaseModel):
    """Base segment fields."""
    text: str


class SegmentResponse(BaseModel):
    """Full segment response."""
    id: int
    source_id: str
    title: str
    source_type: str
    cover: Optional[str] = None
    text: str
    audio_file: Optional[str] = None
    language: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    direct_url: Optional[str] = None
    url_expired: bool = False

    class Config:
        from_attributes = True


class SegmentUpdate(BaseModel):
    """Request schema for updating segment text. Accepts either 'text' or 'raw_text'."""
    text: Optional[str] = Field(None, min_length=1)
    raw_text: Optional[str] = Field(None, min_length=1)
    
    @property
    def content(self) -> str:
        """Get the text content from either field."""
        return self.raw_text or self.text or ""


class AISummaryResponse(BaseModel):
    """AI summary attached to a segment."""
    id: int
    content: str
    prompt_name: Optional[str] = None
    model_name: Optional[str] = None
    parent_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SegmentWithSummaries(SegmentResponse):
    """Segment response with all AI summaries."""
    ai_summaries: List[AISummaryResponse] = []
