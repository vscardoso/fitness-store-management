"""Sale schemas for request/response validation."""

from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator

from app.models.sale import PaymentMethod, SaleStatus


class ProductInSale(BaseModel):
    """Simplified product schema for sale item response."""
    id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    sku: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


# Tetos de uma venda (iguais aos das telas): acima disso é erro de digitação, não venda
MAX_MONEY = Decimal("1000000.00")
MAX_QTY = 10_000
MAX_LINES = 200
_MSG_MONEY = "O valor informado é alto demais (o máximo é R$ 1.000.000,00)."


def _check_money(v):
    if v is not None and v > MAX_MONEY:
        raise ValueError(_MSG_MONEY)
    return v


class SaleItemCreate(BaseModel):
    """Schema for creating a sale item."""
    product_id: int
    variant_id: Optional[int] = None
    quantity: int = Field(..., gt=0, le=MAX_QTY, description="Máximo de 10.000 peças por linha")
    unit_price: Decimal = Field(..., gt=0, allow_inf_nan=False)
    discount_amount: Decimal = Field(default=0, ge=0, allow_inf_nan=False)

    @field_validator("unit_price", "discount_amount")
    @classmethod
    def _money_cap(cls, v):
        return _check_money(v)

    @field_validator("discount_amount")
    @classmethod
    def _discount_in_cents(cls, v):
        # o desconto da peça é dinheiro: sempre em centavos (33,333 vira 33,33), senão a linha, a venda e a devolução
        # somariam frações diferentes
        return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if v is not None else v


class PaymentCreate(BaseModel):
    """Schema for creating a payment."""
    amount: Decimal = Field(..., gt=0, allow_inf_nan=False)
    payment_method: PaymentMethod
    payment_reference: Optional[str] = None
    installments: int = Field(default=1, ge=1, le=12)
    # só no fiado (on_account): primeiro vencimento e intervalo entre parcelas (7, 15 ou 30 dias; padrão 30)
    first_due_date: Optional[date] = None
    interval_days: Optional[int] = Field(default=None, ge=7, le=30)

    @field_validator("amount")
    @classmethod
    def _money_cap(cls, v):
        return _check_money(v)


class SaleCreate(BaseModel):
    """Schema for creating a sale."""
    customer_id: Optional[int] = None
    payment_method: PaymentMethod
    discount_amount: Decimal = Field(default=0, ge=0, allow_inf_nan=False)
    tax_amount: Decimal = Field(default=0, ge=0, allow_inf_nan=False)
    notes: Optional[str] = None
    items: List[SaleItemCreate] = Field(..., min_length=1, max_length=MAX_LINES)
    payments: List[PaymentCreate] = Field(..., max_length=MAX_LINES)
    # Chave de idempotência (ou o header Idempotency-Key): a mesma chave na mesma loja em 24 h devolve a venda já criada
    client_request_id: Optional[str] = Field(default=None, max_length=80)

    @field_validator("discount_amount", "tax_amount")
    @classmethod
    def _money_cap(cls, v):
        return _check_money(v)

    @field_validator("client_request_id")
    @classmethod
    def _key_clean(cls, v):
        v = (v or "").strip()
        return v or None

    @model_validator(mode="after")
    def _payments_cover_total(self):
        # pagamentos vazios só valem se a venda for de R$ 0,00 (o servidor confere o total exato depois)
        if not self.payments:
            subtotal = sum((i.unit_price * i.quantity - i.discount_amount for i in self.items), Decimal("0"))
            if subtotal - self.discount_amount + self.tax_amount > 0:
                raise ValueError("Informe o pagamento da venda.")
        return self


class SaleSourceInfo(BaseModel):
    """Schema for FIFO source traceability."""
    entry_id: int
    entry_item_id: int
    quantity_taken: int
    quantity_returned: int = 0   # quantas dessas peças já voltaram ao estoque numa devolução
    unit_cost: float
    total_cost: float
    entry_code: Optional[str] = None
    entry_date: Optional[str] = None


class SaleItemResponse(BaseModel):
    """Schema for sale item response."""
    id: int
    product_id: Optional[int] = None  # Agora opcional (pode usar variant_id)
    variant_id: Optional[int] = None  # Novo campo
    variant_label: Optional[str] = None  # "Preto · M"
    variant_code: Optional[str] = None  # código da etiqueta, ex.: "#101-1" (controle na tela)
    quantity: int
    unit_price: Decimal
    unit_cost: Optional[Decimal] = None
    discount_amount: Decimal
    subtotal: Decimal
    cost_total: Optional[float] = None
    profit: Optional[float] = None
    margin_percent: Optional[float] = None
    quantity_returned: int = 0           # peças desta linha que voltaram ao estoque (devolução ou troca)
    cost_returned: Optional[float] = None  # custo dessas peças (sai do custo da venda)
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
        """Calculate cost_total from unit_cost. Profit is set by SaleResponse after discount distribution."""
        if self.unit_cost is not None and self.quantity:
            cost = float(self.unit_cost) * self.quantity
            self.cost_total = round(cost, 2)
        # peças que voltaram ao estoque: o custo delas deixa de ser custo da venda (peça com defeito não volta e segue como custo)
        if self.sale_sources:
            self.quantity_returned = sum(int(x.quantity_returned or 0) for x in self.sale_sources)
            self.cost_returned = round(sum(float(x.unit_cost) * int(x.quantity_returned or 0) for x in self.sale_sources), 2)


class PaymentResponse(BaseModel):
    """Schema for payment response."""
    id: int
    amount: Decimal
    payment_method: PaymentMethod
    payment_reference: Optional[str] = None
    installments: int = 1
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
    refunded_amount: float = 0.0   # quanto já foi devolvido/estornado desta venda (devolução parcial não é o total da venda)
    # FIFO profit summary
    total_cost: Optional[float] = None
    total_profit: Optional[float] = None
    profit_margin_percent: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("status", "payment_method", mode="before")
    @classmethod
    def enum_to_str(cls, v: Any) -> str:
        """Convert Enum to string value."""
        if isinstance(v, Enum):
            return v.value
        return v

    def model_post_init(self, __context: Any) -> None:
        """Calculate sale-level profit and distribute discount proportionally to each item."""
        if not self.items:
            return

        # Total gross subtotal (sum of item subtotals before sale-level discount)
        gross_subtotal = sum(float(item.subtotal) for item in self.items)
        sale_discount = float(self.discount_amount) if self.discount_amount else 0.0

        # Líquido de devolução (mesma regra do money_ledger): o que foi devolvido sai da receita e, se a peça voltou ao
        # estoque, o custo dela sai do custo. Sem devolução, nada muda.
        for item in self.items:
            if item.cost_total is None:
                continue
            item_subtotal = float(item.subtotal)
            # Distribute global discount proportionally by item subtotal weight
            if gross_subtotal > 0 and sale_discount > 0:
                item_discount_share = sale_discount * (item_subtotal / gross_subtotal)
            else:
                item_discount_share = 0.0
            effective_revenue = item_subtotal - item_discount_share
            kept = max(0, item.quantity - item.quantity_returned) / item.quantity if item.quantity else 1.0
            net_revenue = effective_revenue * kept
            net_cost = item.cost_total - float(item.cost_returned or 0)
            item.profit = round(net_revenue - net_cost, 2)
            item.margin_percent = round((item.profit / net_revenue) * 100, 2) if net_revenue > 0 else 0.0

        costs = [item.cost_total - float(item.cost_returned or 0) for item in self.items if item.cost_total is not None]
        if costs:
            self.total_cost = round(sum(costs), 2)
            revenue = (float(self.total_amount) if self.total_amount else 0.0) - float(self.refunded_amount or 0)
            self.total_profit = round(revenue - self.total_cost, 2)
            self.profit_margin_percent = round((self.total_profit / revenue) * 100, 2) if revenue > 0 else 0.0


class SaleWithDetails(SaleResponse):
    """Schema for sale with full details (alias for SaleResponse)."""
    sale_number: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)
