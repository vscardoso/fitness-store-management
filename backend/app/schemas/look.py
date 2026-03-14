"""Schemas Pydantic para Look e LookItem."""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
from decimal import Decimal


# ── LookItem ─────────────────────────────────────────────────────────────────

class LookItemCreate(BaseModel):
    product_id: int = Field(..., gt=0)
    variant_id: Optional[int] = None
    position: int = Field(0, ge=0)


class LookItemResponse(BaseModel):
    id: int
    look_id: int
    product_id: int
    variant_id: Optional[int] = None
    position: int
    product_name: Optional[str] = None
    variant_description: Optional[str] = None
    product_image_url: Optional[str] = None
    unit_price: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Look ─────────────────────────────────────────────────────────────────────

class LookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    customer_id: Optional[int] = None
    is_public: bool = True
    discount_percentage: float = Field(0.0, ge=0, le=100)
    items: List[LookItemCreate] = []


class LookUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    is_public: Optional[bool] = None
    discount_percentage: Optional[float] = Field(None, ge=0, le=100)


class LookResponse(BaseModel):
    id: int
    tenant_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    customer_id: Optional[int] = None
    is_public: bool
    discount_percentage: float
    items: List[LookItemResponse] = []
    total_price: float = 0.0
    items_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LookListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    customer_id: Optional[int] = None
    is_public: bool
    discount_percentage: float
    items_count: int = 0
    total_price: float = 0.0
    created_at: datetime

    model_config = {"from_attributes": True}
