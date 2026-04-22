"""
Service de despesas: criação, listagem e cálculo de P&L mensal.
"""
from calendar import monthrange
from datetime import date
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.expense import Expense, ExpenseCategory
from app.models.sale import Sale, SaleItem, SaleStatus
from app.models.trip import Trip
from app.repositories.expense import ExpenseCategoryRepository, ExpenseRepository
from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseCreate,
    ExpenseUpdate,
    MonthlyResultResponse,
)

_cat_repo = ExpenseCategoryRepository()
_exp_repo = ExpenseRepository()

# Categorias padrão criadas na primeira vez
DEFAULT_CATEGORIES = [
    {"name": "Aluguel",                  "color": "#e74c3c", "icon": "home-outline"},
    {"name": "Energia / Água / Internet", "color": "#f39c12", "icon": "flash-outline"},
    {"name": "Salários",                 "color": "#3498db", "icon": "people-outline"},
    {"name": "Fornecedores / Frete",     "color": "#9b59b6", "icon": "car-outline"},
    {"name": "Marketing / Publicidade",  "color": "#1abc9c", "icon": "megaphone-outline"},
    {"name": "Manutenção",               "color": "#95a5a6", "icon": "construct-outline"},
    {"name": "Perdas de Estoque",        "color": "#e74c3c", "icon": "warning-outline"},
    {"name": "Outros",                   "color": "#7f8c8d", "icon": "ellipsis-horizontal-outline"},
]


class ExpenseService:
    STOCK_LOSS_CATEGORY_NAME = "Perdas de Estoque"

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─────────────────────────────────────────────
    # Categorias
    # ─────────────────────────────────────────────

    async def ensure_default_categories(self, tenant_id: Optional[int] = None) -> None:
        """Cria as categorias padrão se não existirem (sem tenant para serem globais)."""
        existing = await _cat_repo.list_active(self.db, tenant_id=None)
        existing_names = {c.name for c in existing}
        for cat in DEFAULT_CATEGORIES:
            if cat["name"] not in existing_names:
                obj = ExpenseCategory(
                    name=cat["name"],
                    color=cat["color"],
                    icon=cat["icon"],
                    tenant_id=None,  # global
                )
                self.db.add(obj)
        await self.db.commit()

    async def list_categories(self, tenant_id: Optional[int] = None) -> List[ExpenseCategory]:
        return await _cat_repo.list_active(self.db, tenant_id=tenant_id)

    async def create_category(
        self,
        data: ExpenseCategoryCreate,
        tenant_id: Optional[int] = None,
    ) -> ExpenseCategory:
        obj = ExpenseCategory(**data.model_dump(), tenant_id=tenant_id)
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def update_category(
        self,
        category_id: int,
        data: ExpenseCategoryUpdate,
        tenant_id: Optional[int] = None,
    ) -> Optional[ExpenseCategory]:
        cat = await _cat_repo.get(self.db, category_id, tenant_id=tenant_id)
        if not cat:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(cat, field, value)
        await self.db.commit()
        await self.db.refresh(cat)
        return cat

    async def delete_category(
        self,
        category_id: int,
        tenant_id: Optional[int] = None,
    ) -> bool:
        cat = await _cat_repo.get(self.db, category_id, tenant_id=tenant_id)
        if not cat:
            return False
        cat.is_active = False
        await self.db.commit()
        return True

    # ─────────────────────────────────────────────
    # Despesas
    # ─────────────────────────────────────────────

    async def list_expenses(
        self,
        *,
        start_date: date,
        end_date: date,
        category_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Expense]:
        return await _exp_repo.list_by_period(
            self.db,
            start_date=start_date,
            end_date=end_date,
            category_id=category_id,
            tenant_id=tenant_id,
            skip=skip,
            limit=limit,
        )

    async def list_stock_losses(
        self,
        *,
        start_date: date,
        end_date: date,
        tenant_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Expense]:
        await self.ensure_default_categories(tenant_id)

        category_stmt = (
            select(ExpenseCategory.id)
            .where(
                ExpenseCategory.is_active == True,
                ExpenseCategory.name == self.STOCK_LOSS_CATEGORY_NAME,
            )
            .order_by(ExpenseCategory.tenant_id.is_not(None).desc())
        )
        if tenant_id is not None:
            category_stmt = category_stmt.where(
                (ExpenseCategory.tenant_id == tenant_id) | (ExpenseCategory.tenant_id.is_(None))
            )
        else:
            category_stmt = category_stmt.where(ExpenseCategory.tenant_id.is_(None))

        category_result = await self.db.execute(category_stmt)
        category_id = category_result.scalar_one_or_none()
        if category_id is None:
            return []

        return await self.list_expenses(
            start_date=start_date,
            end_date=end_date,
            category_id=category_id,
            tenant_id=tenant_id,
            skip=skip,
            limit=limit,
        )

    async def create_expense(
        self,
        data: ExpenseCreate,
        tenant_id: Optional[int] = None,
    ) -> Expense:
        from sqlalchemy.orm import selectinload
        from sqlalchemy import select as sa_select

        obj = Expense(**data.model_dump(), tenant_id=tenant_id)
        self.db.add(obj)
        await self.db.commit()
        # Recarregar com categoria
        result = await self.db.execute(
            sa_select(Expense)
            .options(selectinload(Expense.category))
            .where(Expense.id == obj.id)
        )
        return result.scalar_one()

    async def update_expense(
        self,
        expense_id: int,
        data: ExpenseUpdate,
        tenant_id: Optional[int] = None,
    ) -> Optional[Expense]:
        exp = await _exp_repo.get_with_category(self.db, expense_id, tenant_id=tenant_id)
        if not exp:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(exp, field, value)
        await self.db.commit()
        await self.db.refresh(exp)
        return exp

    async def delete_expense(
        self,
        expense_id: int,
        tenant_id: Optional[int] = None,
    ) -> bool:
        exp = await _exp_repo.get(self.db, expense_id, tenant_id=tenant_id)
        if not exp:
            return False
        exp.is_active = False
        await self.db.commit()
        return True

    async def get_expense(
        self,
        expense_id: int,
        tenant_id: Optional[int] = None,
    ) -> Optional[Expense]:
        return await _exp_repo.get_with_category(self.db, expense_id, tenant_id=tenant_id)

    # ─────────────────────────────────────────────
    # P&L — Resultado do Mês
    # ─────────────────────────────────────────────

    async def monthly_result(
        self,
        year: int,
        month: int,
        tenant_id: Optional[int] = None,
    ) -> MonthlyResultResponse:
        """
        Calcula o P&L completo de um mês:
          Receita − CMV − Despesas Operacionais = Lucro Líquido
        """
        first_day = date(year, month, 1)
        last_day = date(year, month, monthrange(year, month)[1])

        # 1. Receita bruta (soma de total_amount de vendas completed)
        from app.core.timezone import get_day_range_utc
        from datetime import datetime, timedelta

        UTC_OFFSET = timedelta(hours=3)
        start_dt = datetime.combine(first_day, datetime.min.time()) + UTC_OFFSET
        end_dt = datetime.combine(last_day + timedelta(days=1), datetime.min.time()) + UTC_OFFSET

        revenue_stmt = select(
            func.coalesce(func.sum(Sale.total_amount), 0)
        ).where(
            Sale.is_active == True,
            Sale.status == SaleStatus.COMPLETED,
            Sale.created_at >= start_dt,
            Sale.created_at < end_dt,
        )
        if tenant_id is not None:
            revenue_stmt = revenue_stmt.where(Sale.tenant_id == tenant_id)
        revenue_result = await self.db.execute(revenue_stmt)
        revenue = Decimal(str(revenue_result.scalar() or 0))

        # 2. CMV (Custo das Mercadorias Vendidas) — sum(unit_cost * quantity) dos itens
        cmv_stmt = (
            select(func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0))
            .join(Sale, SaleItem.sale_id == Sale.id)
            .where(
                Sale.is_active == True,
                Sale.status == SaleStatus.COMPLETED,
                Sale.created_at >= start_dt,
                Sale.created_at < end_dt,
            )
        )
        if tenant_id is not None:
            cmv_stmt = cmv_stmt.where(Sale.tenant_id == tenant_id)
        cmv_result = await self.db.execute(cmv_stmt)
        cmv = Decimal(str(cmv_result.scalar() or 0))

        # 3. Custos de viagem do mês (soma de travel_cost_total das viagens com trip_date no período)
        trip_costs_stmt = select(
            func.coalesce(func.sum(Trip.travel_cost_total), 0)
        ).where(
            Trip.is_active == True,
            Trip.trip_date >= first_day,
            Trip.trip_date <= last_day,
        )
        if tenant_id is not None:
            trip_costs_stmt = trip_costs_stmt.where(Trip.tenant_id == tenant_id)
        trip_costs_result = await self.db.execute(trip_costs_stmt)
        trip_costs = Decimal(str(trip_costs_result.scalar() or 0))

        # 4. Despesas operacionais
        total_expenses = await _exp_repo.sum_by_period(
            self.db,
            start_date=first_day,
            end_date=last_day,
            tenant_id=tenant_id,
        )
        expenses_by_category = await _exp_repo.sum_by_category(
            self.db,
            start_date=first_day,
            end_date=last_day,
            tenant_id=tenant_id,
        )

        # 5. Cálculos
        gross_profit = revenue - cmv
        gross_margin_pct = (gross_profit / revenue * 100).quantize(Decimal("0.01")) if revenue > 0 else Decimal(0)
        net_profit = gross_profit - total_expenses
        net_margin_pct = (net_profit / revenue * 100).quantize(Decimal("0.01")) if revenue > 0 else Decimal(0)

        import locale
        month_names = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
        ]
        period_label = f"{month_names[month - 1]} {year}"

        return MonthlyResultResponse(
            period_label=period_label,
            revenue=revenue,
            cmv=cmv,
            gross_profit=gross_profit,
            gross_margin_pct=gross_margin_pct,
            trip_costs=trip_costs,
            total_expenses=total_expenses,
            net_profit=net_profit,
            net_margin_pct=net_margin_pct,
            expenses_by_category=expenses_by_category,
        )
