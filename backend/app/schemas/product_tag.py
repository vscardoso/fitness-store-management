"""Schemas Pydantic para ProductTag."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

TAG_TYPES = ["color", "style", "occasion", "season"]


class ProductTagCreate(BaseModel):
    product_id: int = Field(..., gt=0)
    tag_type: str = Field(..., description="color | style | occasion | season")
    tag_value: str = Field(..., min_length=1, max_length=100)


class ProductTagResponse(BaseModel):
    id: int
    product_id: int
    tag_type: str
    tag_value: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SuggestionResponse(BaseModel):
    """Produto sugerido como combinação."""
    product_id: int
    product_name: str
    product_image_url: Optional[str] = None
    min_price: float
    max_price: float
    total_stock: int
    matching_tags: List[str] = []
    score: int = 0
