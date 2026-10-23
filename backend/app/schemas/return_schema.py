"""Schemas para devolução de vendas."""

from typing import List, Literal, Optional
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime


class ReturnItemCreate(BaseModel):
    """Schema para item de devolução."""
    sale_item_id: int = Field(..., description="ID do item da venda original")
    quantity: int = Field(..., gt=0, description="Quantidade a devolver")
    restock: bool = Field(True, description="False = peça com defeito, não volta ao estoque")
    replacement_variant_id: Optional[int] = Field(
        None, description="Troca: variação que o cliente leva no lugar (mesma quantidade)"
    )
    replacement_unit_price: Optional[Decimal] = Field(
        None, gt=0, description="Troca: preço de venda da peça nova (padrão: preço atual da variação)"
    )


class SaleReturnCreate(BaseModel):
    """Schema para criar uma devolução."""
    items: List[ReturnItemCreate] = Field(..., min_length=1, description="Itens a devolver")
    reason: str = Field(..., min_length=3, max_length=500, description="Motivo da devolução")
    refund_method: Optional[str] = Field(
        default="original", 
        description="Método de reembolso: 'original' (mesmo da venda), 'store_credit', 'cash'"
    )
    settlement_method: Literal["cash", "pix", "debit_card", "credit_card"] = Field(
        "cash", description="Troca: como o cliente paga a diferença (se houver)"
    )


class ReturnItemResponse(BaseModel):
    """Schema para resposta de item devolvido."""
    sale_item_id: int
    product_id: int
    product_name: Optional[str] = None
    quantity_returned: int
    unit_price: Decimal
    unit_cost: Optional[Decimal] = Decimal('0')
    refund_amount: Decimal
    restock: bool = True
    replacement_variant_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SaleReturnResponse(BaseModel):
    """Schema para resposta de devolução."""
    id: int
    sale_id: int
    sale_number: str
    return_number: str
    status: str
    reason: str
    total_refund: Decimal
    exchange_sale_id: Optional[int] = None
    exchange_sale_number: Optional[str] = None
    net_amount: Optional[Decimal] = None
    settlement_method: Optional[str] = None
    items: List[ReturnItemResponse] = []
    created_at: datetime
    processed_by_id: int
    processed_by_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ReturnEligibilityResponse(BaseModel):
    """Schema para verificar elegibilidade de devolução."""
    sale_id: int
    sale_number: str
    sale_date: datetime
    days_since_sale: int
    is_eligible: bool
    reason: Optional[str] = None
    max_return_days: int = 7
    allow_money_refund: bool = True
    items: List["ReturnableItemResponse"] = []


class ReturnableItemResponse(BaseModel):
    """Schema para item que pode ser devolvido."""
    sale_item_id: int
    product_id: int
    product_name: Optional[str] = None
    variant_id: Optional[int] = None
    variant_label: Optional[str] = None
    quantity_purchased: int
    quantity_already_returned: int
    quantity_available_for_return: int
    unit_price: Decimal
    max_refund_amount: Decimal


# Atualizar forward reference
ReturnEligibilityResponse.model_rebuild()