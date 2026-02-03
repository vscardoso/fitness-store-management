"""
Schemas para descontos por forma de pagamento.
"""
from pydantic import BaseModel, Field, field_validator
from decimal import Decimal
from datetime import datetime


class PaymentDiscountBase(BaseModel):
    """Base schema for payment discount."""
    payment_method: str = Field(
        ...,
        description="Payment method (PIX, CASH, DEBIT_CARD, CREDIT_CARD, etc)"
    )
    discount_percentage: Decimal = Field(
        ...,
        ge=0,
        le=100,
        description="Discount percentage (0-100)"
    )
    description: str | None = Field(
        None,
        max_length=255,
        description="Optional description"
    )
    is_active: bool = Field(
        default=True,
        description="Whether discount is active"
    )
    
    @field_validator('discount_percentage')
    @classmethod
    def validate_discount(cls, v: Decimal) -> Decimal:
        """Validate discount percentage is between 0 and 100."""
        if v < 0 or v > 100:
            raise ValueError('Discount percentage must be between 0 and 100')
        return v
    
    @field_validator('payment_method')
    @classmethod
    def validate_payment_method(cls, v: str) -> str:
        """Validate and normalize payment method."""
        valid_methods = [
            'pix', 'cash', 'debit_card', 'credit_card', 
            'bank_transfer', 'installments', 'loyalty_points'
        ]
        method_lower = v.lower()
        if method_lower not in valid_methods:
            raise ValueError(f'Invalid payment method. Must be one of: {", ".join(valid_methods)}')
        return method_lower


class PaymentDiscountCreate(PaymentDiscountBase):
    """Schema for creating payment discount."""
    pass


class PaymentDiscountUpdate(BaseModel):
    """Schema for updating payment discount."""
    payment_method: str | None = None
    discount_percentage: Decimal | None = Field(None, ge=0, le=100)
    description: str | None = None
    is_active: bool | None = None
    
    @field_validator('discount_percentage')
    @classmethod
    def validate_discount(cls, v: Decimal | None) -> Decimal | None:
        """Validate discount percentage if provided."""
        if v is not None and (v < 0 or v > 100):
            raise ValueError('Discount percentage must be between 0 and 100')
        return v


class PaymentDiscountResponse(PaymentDiscountBase):
    """Schema for payment discount response."""
    id: int
    tenant_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PaymentDiscountCalculation(BaseModel):
    """Schema for discount calculation result."""
    payment_method: str
    original_amount: Decimal
    discount_percentage: Decimal
    discount_amount: Decimal
    final_amount: Decimal
    
    class Config:
        from_attributes = True


class PaymentDiscountListResponse(BaseModel):
    """Schema for list of payment discounts."""
    items: list[PaymentDiscountResponse]
    total: int
