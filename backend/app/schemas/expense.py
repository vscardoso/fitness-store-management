"""
Schemas Pydantic para despesas e categorias de despesas.
"""
from datetime import date
from decimal import Decimal
from typing import Optional, List

from pydantic import BaseModel, field_validator


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


class ExpenseResponse(ExpenseBase):
    id: int
    is_active: bool
    category: Optional[ExpenseCategoryResponse] = None

    model_config = {"from_attributes": True}


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
    trip_costs: Decimal         # Custos de viagem do mês (combustível, hospedagem etc.)
    total_expenses: Decimal     # Soma das despesas operacionais
    net_profit: Decimal         # Lucro líquido = gross_profit − expenses
    net_margin_pct: Decimal     # % lucro líquido sobre receita
    expenses_by_category: List[dict]  # [{category, total, color, icon}]
