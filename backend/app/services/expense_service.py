"""
Service de despesas: criação, listagem e cálculo de P&L mensal.
"""
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import today_brazil
from app.models.expense import Expense, ExpenseCategory
from app.models.stock_entry import StockEntry
from app.models.trip import Trip
from app.services import lot_cost_service
from app.models.sale import Sale, SaleItem, SaleStatus
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

    async def _validate_category(self, category_id: Optional[int], tenant_id: Optional[int]) -> None:
        """Categoria informada precisa ser da mesma loja (ou padrão global sem tenant)."""
        if category_id is None:
            return
        stmt = select(ExpenseCategory.id).where(ExpenseCategory.id == category_id, ExpenseCategory.is_active == True)  # noqa: E712
        if tenant_id is not None:
            stmt = stmt.where((ExpenseCategory.tenant_id == tenant_id) | ExpenseCategory.tenant_id.is_(None))
        if (await self.db.execute(stmt)).scalar_one_or_none() is None:
            raise ValueError("Categoria não encontrada")

    async def _validate_link(self, stock_entry_id: Optional[int], trip_id: Optional[int], tenant_id: Optional[int]) -> None:
        """Lote/viagem informados precisam existir, estar ativos e ser da mesma loja."""
        if stock_entry_id is not None:
            stmt = select(StockEntry.id).where(StockEntry.id == stock_entry_id, StockEntry.is_active == True)  # noqa: E712
            if tenant_id is not None:
                stmt = stmt.where(StockEntry.tenant_id == tenant_id)
            if (await self.db.execute(stmt)).scalar_one_or_none() is None:
                raise ValueError("Lote (entrada) não encontrado")
        if trip_id is not None:
            stmt = select(Trip.id).where(Trip.id == trip_id, Trip.is_active == True)  # noqa: E712
            if tenant_id is not None:
                stmt = stmt.where(Trip.tenant_id == tenant_id)
            if (await self.db.execute(stmt)).scalar_one_or_none() is None:
                raise ValueError("Viagem não encontrada")

    async def _reallocate(self, entry_ids: set, trip_ids: set, tenant_id: Optional[int]) -> None:
        """Refaz o rateio dos lotes/viagens afetados (mesma transação da despesa)."""
        ids = {i for i in entry_ids if i}
        if ids:
            await lot_cost_service.recompute_entries(self.db, ids, tenant_id=tenant_id)
        for t in {i for i in trip_ids if i}:
            await lot_cost_service.recompute_trip(self.db, t, tenant_id=tenant_id)

    async def create_expense(
        self,
        data: ExpenseCreate,
        tenant_id: Optional[int] = None,
    ) -> Expense:
        from sqlalchemy.orm import selectinload
        from sqlalchemy import select as sa_select

        await self._validate_category(data.category_id, tenant_id)
        await self._validate_link(data.stock_entry_id, data.trip_id, tenant_id)
        obj = Expense(**data.model_dump(), tenant_id=tenant_id)
        self.db.add(obj)
        await self.db.flush()
        await self._reallocate({obj.stock_entry_id}, {obj.trip_id}, tenant_id)
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
        changes = data.model_dump(exclude_unset=True)
        if "category_id" in changes:
            await self._validate_category(changes["category_id"], tenant_id)
        old_entry, old_trip = exp.stock_entry_id, exp.trip_id
        new_entry = changes.get("stock_entry_id", old_entry)
        new_trip = changes.get("trip_id", old_trip)
        # trocar de lote para viagem (ou vice-versa) exige limpar o outro vínculo na mesma chamada
        if new_entry is not None and new_trip is not None:
            raise ValueError("A despesa pode ser de um lote ou de uma viagem, não dos dois")
        await self._validate_link(
            new_entry if "stock_entry_id" in changes else None,
            new_trip if "trip_id" in changes else None,
            tenant_id,
        )
        for field, value in changes.items():
            setattr(exp, field, value)
        await self.db.flush()
        await self._reallocate({old_entry, exp.stock_entry_id}, {old_trip, exp.trip_id}, tenant_id)
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
        await self.db.flush()
        await self._reallocate({exp.stock_entry_id}, {exp.trip_id}, tenant_id)
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

        month_names = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
        ]
        period_label = f"{month_names[month - 1]} {year}"

        return await self._build_period_result(first_day, last_day, tenant_id, period_label)

    async def result_by_days(
        self,
        days: int,
        tenant_id: Optional[int] = None,
    ) -> MonthlyResultResponse:
        """
        Calcula o resultado financeiro dos últimos N dias corridos
        (janela móvel, ex.: 7/30/60/90 dias) — mesma fórmula do P&L mensal.
        """
        end_day = today_brazil()
        start_day = end_day - timedelta(days=days - 1)
        period_label = f"Últimos {days} dias"

        return await self._build_period_result(start_day, end_day, tenant_id, period_label)

    async def _build_period_result(
        self,
        first_day: date,
        last_day: date,
        tenant_id: Optional[int],
        period_label: str,
    ) -> MonthlyResultResponse:
        """Núcleo do cálculo de P&L, compartilhado entre monthly_result e result_by_days."""
        # 1-2. Receita, custo, vendas e peças pela conta única (app/services/money_ledger.py): receita líquida de
        #      devolução (abate no dia em que aconteceu), troca contada uma vez, cancelada fora. Antes só contava venda
        #      "concluída": uma venda com uma peça devolvida sumia INTEIRA do resultado.
        from app.services.money_ledger import period_totals
        led = await period_totals(self.db, tenant_id, first_day, last_day)
        revenue = led.revenue
        sales_count = led.sales_count
        cmv = led.cost
        units_sold = led.pieces_sold - led.pieces_returned

        # 3. Custos de viagem: entram no CUSTO das peças do lote (custo posto, rateado em entry_items.extra_unit_cost)
        #    e portanto já estão no CMV quando a peça é vendida. Não somar de novo aqui (antes a viagem inteira caía
        #    no mês da viagem, muito antes da venda). O campo trip_costs segue na resposta, sempre 0, por compatibilidade.
        trip_costs = Decimal("0")

        # 4. Despesas operacionais (inclui perdas de estoque, destacadas à parte abaixo)
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
        stock_losses_total = Decimal(str(
            sum(Decimal(str(c["total"])) for c in expenses_by_category if c["category"] == self.STOCK_LOSS_CATEGORY_NAME)
        ))

        # 5. Cálculos
        gross_profit = revenue - cmv
        gross_margin_pct = (gross_profit / revenue * 100).quantize(Decimal("0.01")) if revenue > 0 else Decimal(0)
        net_profit = gross_profit - total_expenses - trip_costs
        net_margin_pct = (net_profit / revenue * 100).quantize(Decimal("0.01")) if revenue > 0 else Decimal(0)

        return MonthlyResultResponse(
            period_label=period_label,
            revenue=revenue,
            cmv=cmv,
            gross_profit=gross_profit,
            gross_margin_pct=gross_margin_pct,
            trip_costs=trip_costs,
            total_expenses=total_expenses,
            stock_losses_total=stock_losses_total,
            net_profit=net_profit,
            net_margin_pct=net_margin_pct,
            expenses_by_category=expenses_by_category,
            sales_count=sales_count,
            units_sold=units_sold,
        )
