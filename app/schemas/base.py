"""
Base Pydantic models for common API responses and patterns.
"""
from typing import Generic, TypeVar, Optional, List
from pydantic import BaseModel

T = TypeVar('T')


class SuccessResponse(BaseModel):
    """Standard success response for mutation operations."""
    status: str = "success"
    id: Optional[int] = None
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error response."""
    status: str = "error"
    detail: str
    code: Optional[str] = None


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""
    items: List[T]
    total: int
    page: int
    limit: int
