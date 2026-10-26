"""
Schemas Pydantic para relatórios.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from decimal import Decimal


class PaymentMethodBreakdown(BaseModel):
    """Breakdown por forma de pagamento"""
    method: str = Field(..., description="Forma de pagamento")
    total: float = Field(..., description="Total em R$")
    count: int = Field(..., description="Quantidade de vendas")
    percentage: float = Field(..., description="Percentual do total")


class TopProduct(BaseModel):
    """Produto mais vendido"""
    product_id: int
    product_name: str
    variant_id: int | None = None
    variant_sku: str | None = None
    variant_size: str | None = None
    variant_color: str | None = None
    variant_label: str | None = None
    variant_short_code: int | None = None
    quantity_sold: int
    revenue: float
    profit: float
    margin: float


class PeriodComparison(BaseModel):
    """Comparação com período anterior"""
    current_total: float
    previous_total: float
    difference: float
    percentage_change: float
    is_growth: bool
    previous_sales: int = 0
    previous_profit: float = 0
    previous_start: Optional[datetime] = None
    previous_end: Optional[datetime] = None


class DaySales(BaseModel):
    """Vendas de um dia"""
    date: str
    revenue: float
    sales: int
    profit: float


class WeekdaySales(BaseModel):
    """Vendas somadas por dia da semana (0 = segunda)"""
    weekday: int
    revenue: float
    sales: int


class CategorySales(BaseModel):
    category: str
    pieces: int
    revenue: float
    profit: float
    percentage: float


class SellerSales(BaseModel):
    seller_id: int
    seller_name: str
    sales: int
    revenue: float
    average_ticket: float
    percentage: float


class SalesReportResponse(BaseModel):
    """Relatório de vendas por período"""
    # Período
    period: str = Field(..., description="Período selecionado")
    start_date: datetime
    end_date: datetime

    # Métricas principais
    total_revenue: float = Field(..., description="Total de vendas")
    total_sales: int = Field(..., description="Quantidade de vendas")
    average_ticket: float = Field(..., description="Ticket médio")
    total_cost: float = Field(..., description="CMV total (FIFO)")
    total_profit: float = Field(..., description="Lucro total")
    profit_margin: float = Field(..., description="Margem de lucro %")

    # Breakdown
    payment_breakdown: List[PaymentMethodBreakdown]
    top_products: List[TopProduct]

    # Comparação
    comparison: Optional[PeriodComparison] = None

    # Detalhes (todos opcionais: o app antigo ignora)
    pieces_sold: int = 0
    discount_total: float = 0
    sales_with_customer: int = 0
    sales_without_customer: int = 0
    returns_count: int = 0
    returns_total: float = 0
    cancelled_count: int = 0
    cancelled_total: float = 0
    daily: List[DaySales] = Field(default_factory=list)
    by_weekday: List[WeekdaySales] = Field(default_factory=list)
    by_category: List[CategorySales] = Field(default_factory=list)
    by_seller: List[SellerSales] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class CashFlowReportResponse(BaseModel):
    """Relatório de fluxo de caixa"""
    period: str
    start_date: datetime
    end_date: datetime

    total: float
    breakdown: List[PaymentMethodBreakdown]

    model_config = {"from_attributes": True}


class TopCustomer(BaseModel):
    """Cliente top"""
    customer_id: int
    customer_name: str
    total_purchases: float
    purchase_count: int
    average_purchase: float
    customer_type: str


class CustomersReportResponse(BaseModel):
    """Relatório de clientes"""
    period: str
    start_date: datetime
    end_date: datetime

    total_customers: int
    new_customers: int
    top_customers: List[TopCustomer]
    average_ticket: float

    model_config = {"from_attributes": True}
