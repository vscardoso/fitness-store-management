"""Customer schemas for request/response validation."""

from typing import Optional
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, EmailStr, Field

from app.models.customer import CustomerType


class CustomerBase(BaseModel):
    """Base customer schema."""
    full_name: str = Field(..., min_length=3, max_length=200)
    email: Optional[EmailStr] = None
    phone: str = Field(..., max_length=20)
    document_number: Optional[str] = Field(None, max_length=20)
    birth_date: Optional[date] = None
    address: Optional[str] = Field(None, max_length=255)
    address_number: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=50)
    zip_code: Optional[str] = Field(None, max_length=10)
    customer_type: CustomerType = CustomerType.REGULAR
    marketing_consent: bool = False


class CustomerCreate(CustomerBase):
    """Schema for creating a customer."""
    pass


class CustomerUpdate(BaseModel):
    """Schema for updating a customer."""
    full_name: Optional[str] = Field(None, min_length=3, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    document_number: Optional[str] = Field(None, max_length=20)
    birth_date: Optional[date] = None
    address: Optional[str] = Field(None, max_length=255)
    address_number: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=50)
    zip_code: Optional[str] = Field(None, max_length=10)
    customer_type: Optional[CustomerType] = None
    marketing_consent: Optional[bool] = None
    is_active: Optional[bool] = None


class CustomerResponse(CustomerBase):
    """Schema for customer response."""
    id: int
    loyalty_points: Decimal
    total_spent: Decimal
    total_purchases: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
