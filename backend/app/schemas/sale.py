"""Sale schemas for request/response validation."""

from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field

from app.models.sale import PaymentMethod


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
    customer_id: int
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
    total_amount: Decimal
    
    class Config:
        from_attributes = True


class PaymentResponse(BaseModel):
    """Schema for payment response."""
    id: int
    amount: Decimal
    payment_method: PaymentMethod
    payment_reference: Optional[str]
    payment_date: datetime
    
    class Config:
        from_attributes = True


class SaleResponse(BaseModel):
    """Schema for sale response."""
    id: int
    sale_number: str
    customer_id: int
    seller_id: int
    sale_date: datetime
    total_amount: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    payment_method: PaymentMethod
    status: str
    notes: Optional[str]
    items: List[SaleItemResponse] = []
    payments: List[PaymentResponse] = []
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SaleWithDetails(SaleResponse):
    """Schema for sale with full details (alias for SaleResponse)."""
    sale_number: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
