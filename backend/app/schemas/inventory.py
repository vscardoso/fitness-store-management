"""Inventory schemas for request/response validation."""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


class StockMovementCreate(BaseModel):
    """Schema for creating a stock movement."""
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    notes: Optional[str] = Field(None, max_length=500)


class StockMovementResponse(BaseModel):
    """Schema for stock movement response."""
    id: int
    product_id: int
    movement_type: str
    quantity: int
    previous_quantity: int
    new_quantity: int
    user_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class InventoryResponse(BaseModel):
    """Schema for inventory response."""
    id: int
    product_id: int
    quantity: int
    min_stock: int
    max_stock: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class InventoryRebuildDelta(BaseModel):
    """Delta retornado por rebuild de inventário."""
    product_id: int
    tenant_id: int | None = None
    fifo_sum: int
    inventory_quantity: int
    created: bool
    updated: bool
    previous_quantity: int | None = None


class InventoryRebuildResult(BaseModel):
    """Resultado do rebuild de inventário."""
    updated: int
    deltas: list[InventoryRebuildDelta]


class CostReconciliationResponse(BaseModel):
    """Resumo de reconciliação de custo FIFO."""
    tenant_id: int
    product_id: int | None = None
    custo_recebido_total: float
    custo_restante: float
    custo_vendido_entry_items: float
    custo_vendido_por_fontes: float
    diferenca: float
    unidades_vendidas_por_fontes: int
