"""
Modelos para gestão de despesas operacionais.

Permite calcular o lucro líquido real:
  Receita − CMV (FIFO) − Despesas Operacionais = Lucro Líquido
"""
from datetime import date as DateType
from decimal import Decimal
from typing import List, TYPE_CHECKING

from sqlalchemy import String, Numeric, Text, Boolean, Integer, ForeignKey, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    pass


class ExpenseCategory(BaseModel):
    """
    Categoria de despesa operacional.

    Exemplos: Aluguel, Energia, Salários, Marketing, Frete.
    """
    __tablename__ = "expense_categories"

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Nome da categoria"
    )

    color: Mapped[str] = mapped_column(
        String(20),
        default="#95a5a6",
        comment="Cor hex para exibição no app"
    )

    icon: Mapped[str] = mapped_column(
        String(60),
        default="ellipsis-horizontal-outline",
        comment="Nome do ícone Ionicons"
    )

    # Relacionamentos
    expenses: Mapped[List["Expense"]] = relationship(
        "Expense",
        back_populates="category",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ExpenseCategory(id={self.id}, name='{self.name}')>"


class Expense(BaseModel):
    """
    Despesa operacional da loja.

    Registra custos fixos e variáveis para cálculo de P&L real.
    """
    __tablename__ = "expenses"

    amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Valor da despesa"
    )

    description: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Descrição da despesa"
    )

    expense_date: Mapped[DateType] = mapped_column(
        Date,
        nullable=False,
        comment="Data de competência da despesa"
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Observações adicionais"
    )

    is_recurring: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        comment="Se é uma despesa recorrente (mensal)"
    )

    recurrence_day: Mapped[int | None] = mapped_column(
        Integer,
        comment="Dia do mês para recorrência (1-31)"
    )

    # Chave estrangeira
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("expense_categories.id", ondelete="SET NULL"),
        nullable=True,
        comment="Categoria da despesa"
    )

    # Relacionamentos
    category: Mapped["ExpenseCategory | None"] = relationship(
        "ExpenseCategory",
        back_populates="expenses"
    )

    def __repr__(self) -> str:
        return f"<Expense(id={self.id}, description='{self.description}', amount={self.amount})>"
