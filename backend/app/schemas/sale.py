"""Sale schemas for request/response validation."""

from typing import List, Optional, Dict, Any
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict, field_validator

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


class SaleSourceInfo(BaseModel):
    """Schema for FIFO source traceability."""
    entry_id: int
    entry_item_id: int
    quantity_taken: int
    unit_cost: float
    total_cost: float
    entry_code: Optional[str] = None
    entry_date: Optional[str] = None


class SaleItemResponse(BaseModel):
    """Schema for sale item response."""
    id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    unit_cost: Optional[Decimal] = None
    discount_amount: Decimal
    subtotal: Decimal
    cost_total: Optional[float] = None
    profit: Optional[float] = None
    margin_percent: Optional[float] = None
    sale_sources: Optional[List[SaleSourceInfo]] = None
    product: Optional[ProductInSale] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("sale_sources", mode="before")
    @classmethod
    def parse_sale_sources(cls, v: Any) -> Optional[List[Dict]]:
        """Transform {"sources": [...]} from DB to flat list."""
        if v is None:
            return None
        if isinstance(v, dict) and "sources" in v:
            return v["sources"]
        if isinstance(v, list):
            return v
        return None

    def model_post_init(self, __context: Any) -> None:
        """Calculate profit fields from available data."""
        if self.unit_cost is not None and self.quantity:
            cost = float(self.unit_cost) * self.quantity
            self.cost_total = round(cost, 2)
            revenue = float(self.subtotal) if self.subtotal else 0.0
            self.profit = round(revenue - cost, 2)
            if revenue > 0:
                self.margin_percent = round((self.profit / revenue) * 100, 2)
            else:
                self.margin_percent = 0.0


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
    customer_id: Optional[int] = None
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
    # FIFO profit summary
    total_cost: Optional[float] = None
    total_profit: Optional[float] = None
    profit_margin_percent: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

    def model_post_init(self, __context: Any) -> None:
        """Calculate sale-level profit from items."""
        if self.items:
            costs = [item.cost_total for item in self.items if item.cost_total is not None]
            if costs:
                self.total_cost = round(sum(costs), 2)
                revenue = float(self.total_amount) if self.total_amount else 0.0
                self.total_profit = round(revenue - self.total_cost, 2)
                if revenue > 0:
                    self.profit_margin_percent = round((self.total_profit / revenue) * 100, 2)
                else:
                    self.profit_margin_percent = 0.0


class SaleWithDetails(SaleResponse):
    """Schema for sale with full details (alias for SaleResponse)."""
    sale_number: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)
