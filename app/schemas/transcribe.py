"""
Transcription request/response schemas.
"""
from typing import Optional
from pydantic import BaseModel, Field


class TranscribeBilibiliRequest(BaseModel):
    """Request schema for Bilibili/Douyin video transcription."""
    # Source identification (one of these should be provided)
    url: Optional[str] = Field(None, description="Full Bilibili URL or short link (b23.tv)")
    source_id: Optional[str] = Field(None, description="BVID or unique source identifier")
    
    # Douyin specific
    direct_url: Optional[str] = Field(None, description="Direct video stream URL (required for Douyin)")
    stream_url: Optional[str] = Field(None, description="Alternative stream URL")
    source_type: str = Field("bilibili", description="Source platform: bilibili or douyin")
    
    # Metadata
    title: Optional[str] = Field(None, description="Video title")
    cover: Optional[str] = Field(None, description="Cover image URL")
    
    # Transcription options
    task_type: str = Field("transcribe", description="transcribe, subtitle, or uvr_transcribe")
    quality: Optional[str] = Field("best", description="Download quality (best, medium, worst, audio)")
    use_uvr: bool = Field(False, description="Enable vocal removal preprocessing")
    language: str = Field("zh", description="Target language code (zh, en, ja, ko)")
    prompt: Optional[str] = Field(None, description="Custom prompt for transcription")
    output_format: Optional[str] = Field(None, description="Output format: text, srt, srt_char")
    
    # Time range (optional)
    range_start: int = Field(0, description="Start time in seconds", ge=0)
    range_end: Optional[int] = Field(None, description="End time in seconds", ge=0)
    
    # Cache control
    bookmark_only: bool = Field(False, description="Save metadata only, do not trigger transcription")
    only_get_subtitles: bool = Field(False, description="Fail if subtitles are not available")
    force_transcription: bool = Field(False, description="Ignore subtitles and force ASR")




class TranscribeYouTubeRequest(BaseModel):
    """Request schema for YouTube video transcription."""
    url: str = Field(..., description="YouTube video URL")
    task_type: str = Field("transcribe", description="transcribe or uvr_transcribe")
    quality: Optional[str] = Field("best", description="Download quality (best, medium, worst, audio)")
    use_uvr: bool = Field(False, description="Enable vocal removal preprocessing")
    language: str = Field("zh", description="Target language code")
    prompt: Optional[str] = Field(None, description="Custom prompt for transcription")
    output_format: Optional[str] = Field(None, description="Output format: text, srt, srt_char")
    bookmark_only: bool = Field(False, description="Save metadata only, do not trigger transcription")
    only_get_subtitles: bool = Field(False, description="Fail if subtitles are not available")
    force_transcription: bool = Field(False, description="Ignore subtitles and force ASR")


class TranscribeNetworkRequest(BaseModel):
    """Request schema for direct network URL transcription."""
    url: str = Field(..., description="Direct media URL (e.g., http://example.com/video.mp4)")
    title: Optional[str] = Field(None, description="Optional custom title")
    task_type: str = Field("transcribe", description="transcribe or subtitle")
    quality: Optional[str] = Field("best", description="Download quality (best, medium, worst, audio)")
    use_uvr: bool = Field(False, description="Enable vocal removal preprocessing")
    language: str = Field("zh", description="Target language code")
    prompt: Optional[str] = Field(None, description="Custom prompt for transcription")
    output_format: Optional[str] = Field(None, description="Output format: text, srt, srt_char")
    bookmark_only: bool = Field(False, description="Save metadata only, do not trigger transcription")
    only_get_subtitles: bool = Field(False, description="Fail if subtitles are not available")
    force_transcription: bool = Field(False, description="Ignore subtitles and force ASR")




class TranscribeFileRequest(BaseModel):
    """Request schema for file upload transcription (Form data).
    Note: This is used with Form(...) parameters, not Body(...)."""
    source: str = Field("未知来源", description="Source description")
    task_type: str = Field("transcribe", description="transcribe or uvr_transcribe")
    quality: Optional[str] = Field("best", description="Download quality (best, medium, worst, audio)")
    use_uvr: bool = Field(False, description="Enable vocal removal preprocessing")
    language: str = Field("zh", description="Target language code")
    prompt: Optional[str] = Field(None, description="Custom prompt for transcription")
    output_format: Optional[str] = Field(None, description="Output format: text, srt, srt_char")


class TranscribeDouyinRequest(BaseModel):
    """Request schema for Douyin video transcription."""
    url: str = Field(..., description="Douyin video URL or short link (v.douyin.com)")
    source_id: Optional[str] = Field(None, description="BVID or unique source identifier")
    direct_url: Optional[str] = Field(None, description="Direct video stream URL (required for Douyin)")
    stream_url: Optional[str] = Field(None, description="Alternative stream URL")
    title: Optional[str] = Field(None, description="Video title")
    cover: Optional[str] = Field(None, description="Cover image URL")
    task_type: str = Field("transcribe", description="transcribe, cache_only, or uvr_transcribe")
    quality: Optional[str] = Field("best", description="Download quality (best, medium, worst, audio)")
    use_uvr: bool = Field(False, description="Enable vocal removal preprocessing")
    language: str = Field("zh", description="Target language code")
    prompt: Optional[str] = Field(None, description="Custom prompt for transcription")
    output_format: Optional[str] = Field(None, description="Output format: text, srt, srt_char")
    bookmark_only: bool = Field(False, description="Save metadata only, do not trigger transcription")
    only_get_subtitles: bool = Field(False, description="Fail if subtitles are not available")
    force_transcription: bool = Field(False, description="Ignore subtitles and force ASR")


class RetranscribeRequest(BaseModel):
    """Request schema for unified re-transcription."""
    source_id: str = Field(..., description="Source ID of the video to re-transcribe")
    language: str = Field("zh", description="Target language code")
    use_uvr: bool = Field(False, description="Enable vocal removal preprocessing")
    prompt: Optional[str] = Field(None, description="Custom prompt for transcription")
    output_format: Optional[str] = Field(None, description="Output format: text, srt, srt_char")


class TranscribeResponse(BaseModel):
    """Response schema for transcription initiation."""
    id: Optional[int] = None
    bvid: Optional[str] = None
    status: str = "pending"
    message: Optional[str] = None
    
    # For cached responses
    text: Optional[str] = None
    raw_text: Optional[str] = None
    ai_summary: Optional[str] = None
    cached: bool = False
    is_subtitle: bool = False

