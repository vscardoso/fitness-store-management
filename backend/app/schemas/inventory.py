"""Inventory schemas for request/response validation."""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class StockMovementCreate(BaseModel):
    """Schema for creating a stock movement."""
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    notes: Optional[str] = Field(None, max_length=500)


class StockMovementResponse(BaseModel):
    """Schema for stock movement response."""
    id: int
    product_id: int
    movement_type: str
    quantity: int
    previous_quantity: int
    new_quantity: int
    user_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class InventoryResponse(BaseModel):
    """Schema for inventory response."""
    id: int
    product_id: int
    quantity: int
    min_stock: int
    max_stock: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
