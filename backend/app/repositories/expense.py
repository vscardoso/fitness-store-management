"""
Repositório de despesas e categorias de despesas.
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.expense import Expense, ExpenseCategory
from app.schemas.expense import ExpenseCategoryCreate, ExpenseCreate, ExpenseUpdate
from app.repositories.base import BaseRepository


class ExpenseCategoryRepository(
    BaseRepository[ExpenseCategory, ExpenseCategoryCreate, ExpenseCategoryCreate]
):
    def __init__(self):
        super().__init__(ExpenseCategory)

    async def list_active(
        self,
        db: AsyncSession,
        *,
        tenant_id: Optional[int] = None,
    ) -> List[ExpenseCategory]:
        stmt = (
            select(ExpenseCategory)
            .where(ExpenseCategory.is_active == True)
            .order_by(ExpenseCategory.name)
        )
        if tenant_id is not None:
            stmt = stmt.where(
                (ExpenseCategory.tenant_id == tenant_id)
                | (ExpenseCategory.tenant_id == None)  # categorias globais
            )
        result = await db.execute(stmt)
        return list(result.scalars().all())


class ExpenseRepository(
    BaseRepository[Expense, ExpenseCreate, ExpenseUpdate]
):
    def __init__(self):
        super().__init__(Expense)

    async def list_by_period(
        self,
        db: AsyncSession,
        *,
        start_date: date,
        end_date: date,
        category_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Expense]:
        stmt = (
            select(Expense)
            .options(selectinload(Expense.category))
            .where(
                Expense.is_active == True,
                Expense.expense_date >= start_date,
                Expense.expense_date <= end_date,
            )
            .order_by(Expense.expense_date.desc())
            .offset(skip)
            .limit(limit)
        )
        if category_id is not None:
            stmt = stmt.where(Expense.category_id == category_id)
        if tenant_id is not None:
            stmt = stmt.where(Expense.tenant_id == tenant_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def sum_by_period(
        self,
        db: AsyncSession,
        *,
        start_date: date,
        end_date: date,
        tenant_id: Optional[int] = None,
    ) -> Decimal:
        """Retorna o total de despesas no período."""
        stmt = select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.is_active == True,
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date,
        )
        if tenant_id is not None:
            stmt = stmt.where(Expense.tenant_id == tenant_id)
        result = await db.execute(stmt)
        return Decimal(str(result.scalar() or 0))

    async def sum_by_category(
        self,
        db: AsyncSession,
        *,
        start_date: date,
        end_date: date,
        tenant_id: Optional[int] = None,
    ) -> List[dict]:
        """Retorna soma agrupada por categoria."""
        stmt = (
            select(
                ExpenseCategory.id,
                ExpenseCategory.name,
                ExpenseCategory.color,
                ExpenseCategory.icon,
                func.coalesce(func.sum(Expense.amount), 0).label("total"),
            )
            .outerjoin(Expense, (
                (Expense.category_id == ExpenseCategory.id)
                & (Expense.is_active == True)
                & (Expense.expense_date >= start_date)
                & (Expense.expense_date <= end_date)
                & (
                    (Expense.tenant_id == tenant_id)
                    if tenant_id is not None
                    else True
                )
            ))
            .where(ExpenseCategory.is_active == True)
            .group_by(
                ExpenseCategory.id,
                ExpenseCategory.name,
                ExpenseCategory.color,
                ExpenseCategory.icon,
            )
            .having(func.coalesce(func.sum(Expense.amount), 0) > 0)
            .order_by(func.coalesce(func.sum(Expense.amount), 0).desc())
        )
        result = await db.execute(stmt)
        rows = result.all()
        return [
            {
                "category_id": row.id,
                "category": row.name,
                "color": row.color,
                "icon": row.icon,
                "total": Decimal(str(row.total)),
            }
            for row in rows
        ]

    async def get_with_category(
        self,
        db: AsyncSession,
        id: int,
        *,
        tenant_id: Optional[int] = None,
    ) -> Optional[Expense]:
        stmt = (
            select(Expense)
            .options(selectinload(Expense.category))
            .where(Expense.id == id, Expense.is_active == True)
        )
        if tenant_id is not None:
            stmt = stmt.where(Expense.tenant_id == tenant_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
