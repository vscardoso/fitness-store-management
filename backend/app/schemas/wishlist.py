"""Schemas Pydantic para Wishlist."""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


class WishlistCreate(BaseModel):
    customer_id: int = Field(..., gt=0)
    product_id: int = Field(..., gt=0)
    variant_id: Optional[int] = None
    look_id: Optional[int] = None
    notes: Optional[str] = None


class WishlistResponse(BaseModel):
    id: int
    customer_id: int
    product_id: int
    variant_id: Optional[int] = None
    look_id: Optional[int] = None
    notified: bool
    notified_at: Optional[datetime] = None
    notes: Optional[str] = None
    product_name: Optional[str] = None
    variant_description: Optional[str] = None
    customer_name: Optional[str] = None
    product_image_url: Optional[str] = None
    in_stock: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class DemandItem(BaseModel):
    """Produto com demanda agregada da wishlist — para dashboard da vendedora."""
    product_id: int
    product_name: str
    variant_id: Optional[int] = None
    variant_description: Optional[str] = None
    waiting_count: int
    potential_revenue: float
    product_image_url: Optional[str] = None
