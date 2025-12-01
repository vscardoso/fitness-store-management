"""Sale schemas for request/response validation."""

from typing import List, Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict

from app.models.sale import PaymentMethod


class ProductInSale(BaseModel):
    """Simplified product schema for sale item response."""
    id: int
    name: str
    description: Optional[str] = None
    sku: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class SaleItemCreate(BaseModel):
    """Schema for creating a sale item."""
    product_id: int
    quantity: int = Field(..., gt=0)
    unit_price: Decimal = Field(..., gt=0)
    discount_amount: Decimal = Field(default=0, ge=0)


class PaymentCreate(BaseModel):
    """Schema for creating a payment."""
    amount: Decimal = Field(..., gt=0)
    payment_method: PaymentMethod
    payment_reference: Optional[str] = None


class SaleCreate(BaseModel):
    """Schema for creating a sale."""
    customer_id: Optional[int] = None
    payment_method: PaymentMethod
    discount_amount: Decimal = Field(default=0, ge=0)
    tax_amount: Decimal = Field(default=0, ge=0)
    notes: Optional[str] = None
    items: List[SaleItemCreate]
    payments: List[PaymentCreate]


class SaleItemResponse(BaseModel):
    """Schema for sale item response."""
    id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    discount_amount: Decimal
    subtotal: Decimal  # Fixed: modelo usa 'subtotal', não 'total_amount'
    product: Optional[ProductInSale] = None  # Dados do produto

    model_config = ConfigDict(from_attributes=True)


class PaymentResponse(BaseModel):
    """Schema for payment response."""
    id: int
    amount: Decimal
    payment_method: PaymentMethod
    payment_reference: Optional[str] = None
    status: str  # "confirmed", "pending", "failed"
    created_at: Optional[datetime] = None  # Fixed: Payment usa 'created_at', não 'payment_date'

    model_config = ConfigDict(from_attributes=True)


class SaleResponse(BaseModel):
    """Schema for sale response."""
    id: int
    sale_number: str
    customer_id: Optional[int] = None  # Fixed: customer_id is optional (walk-in sales)
    seller_id: int
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    payment_method: PaymentMethod
    payment_reference: Optional[str] = None
    loyalty_points_used: Decimal = Decimal(0)
    loyalty_points_earned: Decimal = Decimal(0)
    status: str
    notes: Optional[str] = None
    items: List[SaleItemResponse] = []
    payments: List[PaymentResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    customer_name: Optional[str] = None
    seller_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SaleWithDetails(SaleResponse):
    """Schema for sale with full details (alias for SaleResponse)."""
    sale_number: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)
