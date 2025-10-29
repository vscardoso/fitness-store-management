"""Category schemas for request/response validation."""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class CategoryBase(BaseModel):
    """Base category schema."""
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    parent_id: Optional[int] = None


class CategoryCreate(CategoryBase):
    """Schema for creating a category."""
    pass


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    parent_id: Optional[int] = None


class CategoryResponse(CategoryBase):
    """Schema for category response."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CategoryWithChildren(CategoryResponse):
    """Schema for category with subcategories."""
    subcategories: List['CategoryWithChildren'] = []
    
    class Config:
        from_attributes = True


# Update forward references
CategoryWithChildren.model_rebuild()
