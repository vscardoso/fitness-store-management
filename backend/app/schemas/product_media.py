"""
Schemas Pydantic para ProductMedia (galeria de fotos do produto).
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProductMediaResponse(BaseModel):
    id: int
    product_id: int
    variant_id: Optional[int]
    url: str
    position: int
    is_cover: bool
    media_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductMediaReorderItem(BaseModel):
    id: int
    position: int
