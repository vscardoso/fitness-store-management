"""
Schemas Pydantic para despesas e categorias de despesas.
"""
from datetime import date
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, field_validator, model_validator


# ─────────────────────────────────────────────
# ExpenseCategory
# ─────────────────────────────────────────────

class ExpenseCategoryBase(BaseModel):
    name: str
    color: str = "#95a5a6"
    icon: str = "ellipsis-horizontal-outline"


class ExpenseCategoryCreate(ExpenseCategoryBase):
    pass


class ExpenseCategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class ExpenseCategoryResponse(ExpenseCategoryBase):
    id: int
    is_active: bool

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────
# Expense
# ─────────────────────────────────────────────

class ExpenseBase(BaseModel):
    amount: Decimal
    description: str
    expense_date: date
    notes: Optional[str] = None
    is_recurring: bool = False
    recurrence_day: Optional[int] = None
    category_id: Optional[int] = None
    # Despesa de um lote (entrada); sem lote é despesa geral.
    stock_entry_id: Optional[int] = None
    # Financeiro: conta de onde saiu o dinheiro (gaveta, banco); nulo = só entra no resultado do mês
    account_id: Optional[int] = None

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("O valor da despesa deve ser positivo")
        return v

    @field_validator("recurrence_day")
    @classmethod
    def recurrence_day_range(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (1 <= v <= 31):
            raise ValueError("O dia de recorrência deve ser entre 1 e 31")
        return v


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    amount: Optional[Decimal] = None
    description: Optional[str] = None
    expense_date: Optional[date] = None
    notes: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurrence_day: Optional[int] = None
    category_id: Optional[int] = None
    stock_entry_id: Optional[int] = None
    account_id: Optional[int] = None


class ExpensePendingApproval(BaseModel):
    """Pedido de aprovação em andamento sobre esta despesa (despesa paga por banco só muda com todos os administradores)."""
    id: int
    kind: str                      # 'delete' (apagar) ou 'update' (mudar valor, dia ou conta)
    requested_by_name: Optional[str] = None
    approved_count: int = 0
    required_count: int = 0


class ExpenseResponse(ExpenseBase):
    id: int
    is_active: bool
    payable_id: Optional[int] = None  # veio de uma despesa a pagar (mudar valor/apagar = desfazer o pagamento)
    category: Optional[ExpenseCategoryResponse] = None
    created_by_name: Optional[str] = None
    pending_approval: Optional[ExpensePendingApproval] = None

    model_config = {"from_attributes": True}


class ExpenseCategoryTotal(BaseModel):
    category_id: Optional[int] = None
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    total: Decimal
    count: int


class ExpensePeriodSummary(BaseModel):
    """Resumo de um período para a tela de Despesas: tudo calculado no servidor (a tela não soma páginas da lista).
    `store_*` é o gasto da loja (o que entra no resultado do mês); `lot_*` é o gasto de lote, que já está no custo das peças."""
    start_date: date
    end_date: date
    store_total: Decimal
    store_count: int
    lot_total: Decimal
    lot_count: int
    by_category: List[ExpenseCategoryTotal]


# ─────────────────────────────────────────────
# P&L (Resultado do Mês)
# ─────────────────────────────────────────────

class MonthlyResultResponse(BaseModel):
    """Resultado financeiro do mês: Receita − CMV − Despesas = Lucro Líquido."""
    period_label: str           # e.g. "Março 2026"
    revenue: Decimal            # Total de vendas (total_amount)
    cmv: Decimal                # Custo das mercadorias vendidas (FIFO)
    gross_profit: Decimal       # Receita − CMV
    gross_margin_pct: Decimal   # % margem bruta
    total_expenses: Decimal     # Soma das despesas operacionais (inclui perdas de estoque)
    stock_losses_total: Decimal = Decimal(0)  # Subconjunto de total_expenses — perdas de estoque
    gifts_total: Decimal = Decimal(0)  # Custo dos brindes dados (fora do CMV e das despesas): abate o lucro líquido
    gifts_count: int = 0
    net_profit: Decimal         # Lucro líquido = gross_profit − expenses
    net_margin_pct: Decimal     # % lucro líquido sobre receita
    expenses_by_category: List[dict]  # [{category, total, color, icon}]
    sales_count: int = 0         # Quantidade de vendas concluídas no período
    units_sold: int = 0          # Soma de itens vendidos no período
