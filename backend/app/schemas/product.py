"""Product schemas for request/response validation."""

from typing import Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, validator


class ProductBase(BaseModel):
    """Base product schema."""
    name: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    sku: str = Field(..., max_length=100)
    barcode: Optional[str] = Field(None, max_length=100)
    price: Decimal = Field(..., gt=0)
    cost_price: Optional[Decimal] = Field(None, ge=0)
    category_id: int
    brand: Optional[str] = Field(None, max_length=100)
    color: Optional[str] = Field(None, max_length=50)
    size: Optional[str] = Field(None, max_length=20)
    gender: Optional[str] = Field(None, max_length=20)
    material: Optional[str] = Field(None, max_length=100)
    is_digital: bool = False
    is_activewear: bool = False


class ProductCreate(ProductBase):
    """Schema for creating a product."""
    initial_stock: Optional[int] = Field(0, ge=0, description="Quantidade inicial em estoque")
    min_stock: Optional[int] = Field(5, ge=0, description="Estoque mínimo")


class ProductUpdate(BaseModel):
    """Schema for updating a product."""
    name: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    sku: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, max_length=100)
    price: Optional[Decimal] = Field(None, gt=0)
    cost_price: Optional[Decimal] = Field(None, ge=0)
    category_id: Optional[int] = None
    brand: Optional[str] = Field(None, max_length=100)
    color: Optional[str] = Field(None, max_length=50)
    size: Optional[str] = Field(None, max_length=20)
    gender: Optional[str] = Field(None, max_length=20)
    material: Optional[str] = Field(None, max_length=100)
    is_digital: Optional[bool] = None
    is_activewear: Optional[bool] = None
    is_active: Optional[bool] = None


class ProductResponse(ProductBase):
    """Schema for product response."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    current_stock: Optional[int] = Field(None, description="Quantidade atual em estoque")
    min_stock_threshold: Optional[int] = Field(None, description="Estoque mínimo")
    
    class Config:
        from_attributes = True
