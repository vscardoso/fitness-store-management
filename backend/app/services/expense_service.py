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

    async def _validate_account(self, account_id: Optional[int], tenant_id: Optional[int]) -> None:
        """Conta de onde saiu o pagamento: tem de ser uma conta ativa da loja."""
        if account_id is None:
            return
        from app.models.finance import FinancialAccount
        found = (await self.db.execute(select(FinancialAccount.id).where(
            FinancialAccount.id == account_id, FinancialAccount.tenant_id == tenant_id,
            FinancialAccount.is_active == True,  # noqa: E712
        ))).scalar_one_or_none()
        if found is None:
            raise ValueError("Conta de pagamento não encontrada")

    async def _validate_link(self, stock_entry_id: Optional[int], tenant_id: Optional[int]) -> None:
        """O lote informado precisa existir, estar ativos e ser da mesma loja."""
        if stock_entry_id is not None:
            stmt = select(StockEntry.id).where(StockEntry.id == stock_entry_id, StockEntry.is_active == True)  # noqa: E712
            if tenant_id is not None:
                stmt = stmt.where(StockEntry.tenant_id == tenant_id)
            if (await self.db.execute(stmt)).scalar_one_or_none() is None:
                raise ValueError("Lote (entrada) não encontrado")

    async def _reallocate(self, entry_ids: set, tenant_id: Optional[int]) -> None:
        """Refaz o rateio dos lotes afetados (mesma transação da despesa)."""
        ids = {i for i in entry_ids if i}
        if ids:
            await lot_cost_service.recompute_entries(self.db, ids, tenant_id=tenant_id)

    async def _ensure_open(self, tenant_id: Optional[int], day: Optional[date]) -> None:
        """Despesa COM conta mexe no saldo: mês fechado não aceita (a fotografia não pode mudar por fora)."""
        if tenant_id is None or day is None:
            return
        from app.services.finance_service import FinanceService
        await FinanceService(self.db).ensure_open_month(tenant_id, day)

    async def period_summary(self, start: date, end: date, tenant_id: Optional[int] = None) -> dict:
        """Resumo do período para a tela de Despesas. Mesma regra do resultado do mês: gasto da loja = despesa SEM lote
        (a de lote já está no custo das peças). Total, contagens e quebra por categoria saem daqui, não de somar a lista no app."""
        def base(*conds):
            stmt = select(func.coalesce(func.sum(Expense.amount), 0), func.count(Expense.id)).where(
                Expense.is_active == True, Expense.expense_date >= start, Expense.expense_date <= end, *conds)  # noqa: E712
            return stmt.where(Expense.tenant_id == tenant_id) if tenant_id is not None else stmt
        store_total, store_count = (await self.db.execute(base(Expense.stock_entry_id.is_(None)))).one()
        lot_total, lot_count = (await self.db.execute(base(Expense.stock_entry_id.isnot(None)))).one()
        cat_stmt = (
            select(ExpenseCategory.id, ExpenseCategory.name, ExpenseCategory.color, ExpenseCategory.icon,
                   func.coalesce(func.sum(Expense.amount), 0), func.count(Expense.id))
            .select_from(Expense).outerjoin(ExpenseCategory, ExpenseCategory.id == Expense.category_id)
            .where(Expense.is_active == True, Expense.stock_entry_id.is_(None),  # noqa: E712
                   Expense.expense_date >= start, Expense.expense_date <= end)
            .group_by(ExpenseCategory.id, ExpenseCategory.name, ExpenseCategory.color, ExpenseCategory.icon)
        )
        if tenant_id is not None:
            cat_stmt = cat_stmt.where(Expense.tenant_id == tenant_id)
        rows = (await self.db.execute(cat_stmt)).all()
        by_category = sorted(
            ({"category_id": r[0], "name": r[1] or "Sem categoria", "color": r[2], "icon": r[3], "total": Decimal(str(r[4])), "count": int(r[5])}
             for r in rows), key=lambda c: (-c["total"], c["name"]))
        return {"start_date": start, "end_date": end, "store_total": Decimal(str(store_total)), "store_count": int(store_count),
                "lot_total": Decimal(str(lot_total)), "lot_count": int(lot_count), "by_category": by_category}

    async def ensure_no_pending_approval(self, expense_id: int, tenant_id: Optional[int]) -> None:
        """Despesa com pedido de aprovação em andamento (apagar ou mudar) fica travada: nada a edita nem apaga até o pedido ser
        decidido ou cancelado. Senão uma mudança "por fora" passava por cima do que os administradores estão avaliando."""
        probe = Expense(id=expense_id)
        await self.attach_pending_approvals([probe], tenant_id)
        p = probe.pending_approval
        if p:
            what = "apagar" if p["kind"] == "delete" else "mudar"
            raise ValueError(
                f"Esta despesa tem um pedido para {what} esperando aprovação (pedido #{p['id']}). "
                "Aguarde a decisão dos administradores ou cancele o pedido."
            )

    async def attach_pending_approvals(self, expenses: List[Expense], tenant_id: Optional[int]) -> None:
        """Põe em cada despesa `pending_approval` (pedido de apagar ou mudar esperando os administradores) ou None.
        Uma consulta só para a lista inteira."""
        from datetime import datetime, timezone
        from app.models.finance import FinanceApproval, FinanceApprovalVote
        for e in expenses:
            e.pending_approval = None
        ids = [e.id for e in expenses if getattr(e, "id", None)]
        if not ids or tenant_id is None:
            return
        keys = {f"{op}:{i}": (op, i) for i in ids for op in ("expense_delete", "expense_update")}
        aps = (await self.db.execute(select(FinanceApproval).where(
            FinanceApproval.tenant_id == tenant_id, FinanceApproval.status == "pending",
            FinanceApproval.dedupe_key.in_(list(keys))))).scalars().all()
        now = datetime.now(timezone.utc)
        aps = [a for a in aps if (a.expires_at is None or (a.expires_at if a.expires_at.tzinfo else a.expires_at.replace(tzinfo=timezone.utc)) > now)]
        if not aps:
            return
        votes = (await self.db.execute(select(FinanceApprovalVote.approval_id, func.count(FinanceApprovalVote.id)).where(
            FinanceApprovalVote.approval_id.in_([a.id for a in aps]), FinanceApprovalVote.vote == "approve")
            .group_by(FinanceApprovalVote.approval_id))).all()
        approved = {r[0]: int(r[1]) for r in votes}
        from app.services.finance_approval_service import FinanceApprovalService
        required = len(await FinanceApprovalService(self.db)._admins(tenant_id))
        by_id = {e.id: e for e in expenses}
        for a in aps:
            op, eid = keys[a.dedupe_key]
            e = by_id.get(eid)
            if e is not None:
                e.pending_approval = {"id": a.id, "kind": "delete" if op == "expense_delete" else "update",
                                      "requested_by_name": a.requested_by_name, "approved_count": approved.get(a.id, 0),
                                      "required_count": required}

    async def create_expense(
        self,
        data: ExpenseCreate,
        tenant_id: Optional[int] = None,
        created_by_name: Optional[str] = None,
    ) -> Expense:
        from sqlalchemy.orm import selectinload
        from sqlalchemy import select as sa_select

        await self._validate_category(data.category_id, tenant_id)
        await self._validate_link(data.stock_entry_id, tenant_id)
        await self._validate_account(data.account_id, tenant_id)
        if data.account_id:
            await self._ensure_open(tenant_id, data.expense_date)
        obj = Expense(**data.model_dump(), tenant_id=tenant_id, created_by_name=(created_by_name or None))
        self.db.add(obj)
        await self.db.flush()
        await self._reallocate({obj.stock_entry_id}, tenant_id)
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
        if exp.payable_id:
            # o app manda o formulário inteiro (valor e data inclusive): só é mudança de verdade se o valor, a data ou a conta DIFEREM
            # do que está gravado. Mudar só categoria, descrição ou observação é livre.
            def _differs(field: str) -> bool:
                if field not in changes:
                    return False
                new, cur = changes[field], getattr(exp, field)
                if field == "amount":
                    return Decimal(str(new)).quantize(Decimal("0.01")) != Decimal(str(cur)).quantize(Decimal("0.01"))
                return new != cur
            if any(_differs(f) for f in ("amount", "expense_date", "account_id")):
                raise ValueError("Esta despesa veio de uma conta paga: para mudar valor, data ou conta, desfaça o pagamento em Despesas a pagar.")
        if "category_id" in changes:
            await self._validate_category(changes["category_id"], tenant_id)
        if "account_id" in changes:
            await self._validate_account(changes["account_id"], tenant_id)
        new_account = changes.get("account_id", exp.account_id)
        new_date = changes.get("expense_date", exp.expense_date)
        if exp.account_id:
            await self._ensure_open(tenant_id, exp.expense_date)     # sai de um mês fechado
        if new_account:
            await self._ensure_open(tenant_id, new_date)             # entra num mês fechado
        old_entry = exp.stock_entry_id
        new_entry = changes.get("stock_entry_id", old_entry)
        await self._validate_link(new_entry if "stock_entry_id" in changes else None, tenant_id)
        for field, value in changes.items():
            setattr(exp, field, value)
        await self.db.flush()
        await self._reallocate({old_entry, exp.stock_entry_id}, tenant_id)
        await self.db.commit()
        # recarrega com a categoria (trocar a categoria deixa a relação velha e a resposta falhava ao ler o nome dela)
        await self.db.refresh(exp)
        await self.db.refresh(exp, attribute_names=["category"])
        return exp

    async def delete_expense(
        self,
        expense_id: int,
        tenant_id: Optional[int] = None,
    ) -> bool:
        exp = await _exp_repo.get(self.db, expense_id, tenant_id=tenant_id)
        if not exp:
            return False
        if exp.payable_id:
            raise ValueError("Esta despesa veio de uma conta paga: desfaça o pagamento em Despesas a pagar.")
        if exp.account_id:
            await self._ensure_open(tenant_id, exp.expense_date)
        exp.is_active = False
        await self.db.flush()
        await self._reallocate({exp.stock_entry_id}, tenant_id)
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

    @staticmethod
    def check_range(start: Optional[date], end: Optional[date]) -> tuple:
        """Confere um período livre: as duas datas, início antes do fim, no máximo 1 ano. Data final no futuro vira hoje."""
        from fastapi import HTTPException
        if not start or not end:
            raise HTTPException(status_code=400, detail="Informe a data inicial e a data final do período.")
        today = today_brazil()
        if start > today:
            raise HTTPException(status_code=400, detail="A data inicial ainda não chegou.")
        end = min(end, today)
        if start > end:
            raise HTTPException(status_code=400, detail="A data inicial vem depois da data final.")
        if (end - start).days > 366:
            raise HTTPException(status_code=400, detail="Escolha no máximo 1 ano por vez.")
        return start, end

    async def result_by_range(
        self,
        start: date,
        end: date,
        tenant_id: Optional[int] = None,
    ) -> MonthlyResultResponse:
        """Resultado entre duas datas (inclusive): mesma fórmula do mês e dos últimos N dias."""
        label = f"{start.strftime('%d/%m/%Y')} a {end.strftime('%d/%m/%Y')}"
        return await self._build_period_result(start, end, tenant_id, label)

    async def by_product_range(self, start: date, end: date, tenant_id: Optional[int]) -> List[dict]:
        """Produtos vendidos entre duas datas (a soma bate com o resultado do mesmo período)."""
        from app.services.money_ledger import period_by_product
        return await period_by_product(self.db, tenant_id, start, end)

    async def monthly_by_product(self, year: int, month: int, tenant_id: Optional[int]) -> List[dict]:
        """Produtos vendidos no mês com receita, custo e lucro (soma = receita e custo do Resultado do Mês)."""
        import calendar
        from app.services.money_ledger import period_by_product
        first_day = date(year, month, 1)
        last_day = date(year, month, calendar.monthrange(year, month)[1])
        return await period_by_product(self.db, tenant_id, first_day, last_day)

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
        gifts_total = led.gift_cost
        net_profit = gross_profit - total_expenses - gifts_total
        net_margin_pct = (net_profit / revenue * 100).quantize(Decimal("0.01")) if revenue > 0 else Decimal(0)

        return MonthlyResultResponse(
            period_label=period_label,
            revenue=revenue,
            cmv=cmv,
            gross_profit=gross_profit,
            gross_margin_pct=gross_margin_pct,
            total_expenses=total_expenses,
            stock_losses_total=stock_losses_total,
            gifts_total=gifts_total,
            gifts_count=led.gift_count,
            net_profit=net_profit,
            net_margin_pct=net_margin_pct,
            expenses_by_category=expenses_by_category,
            sales_count=sales_count,
            units_sold=units_sold,
        )
