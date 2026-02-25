"""
Settings schemas for LLM, ASR, and Prompt configuration.
Consolidated from inline models in api/v1/endpoints/settings.py
"""
from typing import Optional
from pydantic import BaseModel, Field


# ============ LLM Provider & Model ============

class LLMProviderCreate(BaseModel):
    """Request schema for creating/updating an LLM provider."""
    name: str = Field(..., min_length=1)
    base_url: str = Field(..., min_length=1)
    api_key: str = Field(..., min_length=1)
    api_type: str = Field('chat_completions', description="API protocol type: chat_completions or responses")


class LLMModelCreate(BaseModel):
    """Request schema for adding a model to an LLM provider."""
    model_name: str = Field(..., min_length=1)


class LLMProviderResponse(BaseModel):
    """Response schema for LLM provider with models."""
    id: int
    name: str
    base_url: str
    api_key: str
    models: list = []

    class Config:
        from_attributes = True


# ============ ASR Models ============

class ASRModelCreate(BaseModel):
    """Request schema for creating/updating an ASR model config."""
    name: str = Field(..., min_length=1)
    engine: str = Field(..., min_length=1, description="ASR engine type (e.g., whisper, paraformer)")
    config: str = Field("{}", description="JSON configuration string")


class ASRModelResponse(BaseModel):
    """Response schema for ASR model."""
    id: int
    name: str
    engine: str
    config: str
    is_active: bool = False

    class Config:
        from_attributes = True


# ============ Prompts & Categories ============

class PromptCreate(BaseModel):
    """Request schema for creating/updating a prompt."""
    name: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    category_id: Optional[int] = None


class PromptResponse(BaseModel):
    """Response schema for prompt with category info."""
    id: int
    name: str
    content: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    """Request schema for creating/updating a prompt category."""
    name: str = Field(..., min_length=1)
    key: Optional[str] = None


class CategoryResponse(BaseModel):
    """Response schema for prompt category."""
    id: int
    name: str
    key: Optional[str] = None

    class Config:
        from_attributes = True
