"""
Fechamento do mês: a planilha da dona em forma de tela (estudo em docs/ESTUDO_FECHAMENTO_DO_MES.md).

    começo do mês (saldo de cada conta) + entrou - saiu = deveria ter
    tem (o que ela contou na gaveta e viu no extrato) - deveria ter = diferença (quebra de caixa)

- Regime de caixa: só conta dinheiro que mexeu nas contas. Venda no fiado não é dinheiro (aparece à parte); o
  recebimento do fiado é.
- Tudo é calculado na hora pela mesma conta do Financeiro (`FinanceService.flows`): nada é copiado das vendas.
- Fechar grava a fotografia (`month_closings.snapshot`) e, em cada conta com diferença, um ajuste
  (`account_entries.kind = closing_adjustment`, no último dia do mês): o saldo contado vira o começo do mês seguinte.
  Mês fechado não recebe lançamento do Financeiro (409); venda ou despesa lançada depois aparece como "mudou depois do
  fechamento". Reabrir (só admin, só o último mês fechado) desfaz a fotografia e os ajustes.
"""
from __future__ import annotations

import calendar
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import today_brazil
from app.models.entry_item import EntryItem
from app.models.expense import Expense, ExpenseCategory
from app.models.finance import (
    ENTRY_CLOSING_ADJUSTMENT, ENTRY_IN_KINDS, ENTRY_KIND_LABELS, ENTRY_OUT_KINDS, KIND_CASH, PAYABLE_OPEN, PAYABLE_PAID,
    AccountEntry, MonthClosing, Payable,
)
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.receivable import RECEIVABLE_OPEN, RECEIVABLE_PARTIAL, Receivable
from app.models.stock_entry import StockEntry
from app.models.user import User
from app.services.finance_service import (
    D0, FinanceConflict, FinanceError, FinanceNotFound, FinanceService, _q, _who, money,
)

MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
          "novembro", "dezembro"]
METHOD_LABEL = {
    "cash": "Dinheiro", "pix": "PIX", "bank_transfer": "Transferência", "debit_card": "Débito",
    "credit_card": "Crédito", "installments": "Parcelado", "on_account": "Fiado",
}


def _f(v: Decimal) -> float:
    return float(_q(v))


def month_bounds(year: int, month: int) -> Tuple[date, date]:
    if not (2000 <= int(year) <= 2100) or not (1 <= int(month) <= 12):
        raise FinanceError("Mês inválido.")
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


class MonthClosingService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.fin = FinanceService(db)

    async def _closing(self, tenant_id: int, year: int, month: int, *, lock: bool = False) -> Optional[MonthClosing]:
        q = select(MonthClosing).where(MonthClosing.tenant_id == tenant_id, MonthClosing.is_active == True,  # noqa: E712
                                       MonthClosing.year == year, MonthClosing.month == month)
        if lock:
            q = q.with_for_update()
        return (await self.db.execute(q)).scalar_one_or_none()

    async def _later_closed(self, tenant_id: int, year: int, month: int) -> bool:
        key = year * 12 + month
        row = (await self.db.execute(select(MonthClosing.id).where(
            MonthClosing.tenant_id == tenant_id, MonthClosing.is_active == True,  # noqa: E712
            (MonthClosing.year * 12 + MonthClosing.month) > key,
        ))).first()
        return row is not None

    # ── a tela ──────────────────────────────────────────────────────────────
    async def compute(self, tenant_id: int, year: int, month: int, *, ignore_closing_id: Optional[int] = None) -> Dict[str, Any]:
        store = await self.fin._require_started(tenant_id)
        first, last = month_bounds(year, month)
        today = today_brazil()
        if first > today:
            raise FinanceError("Este mês ainda não começou.")
        if last < store.finance_start_date:
            raise FinanceError("Este mês é de antes da implantação do financeiro.")
        start = max(first, store.finance_start_date)
        end = last + timedelta(days=1)

        opening = await self.fin.balances_at(tenant_id, start)
        f = await self.fin.flows(tenant_id, start, end)
        by_acc = f["by_account"]
        if ignore_closing_id is not None:
            # o próprio ajuste do fechamento não faz parte do "deveria ter" daquele mês
            adj = dict((await self.db.execute(select(AccountEntry.account_id, func.coalesce(func.sum(AccountEntry.amount), 0)).where(
                AccountEntry.closing_id == ignore_closing_id, AccountEntry.is_active == True,  # noqa: E712
            ).group_by(AccountEntry.account_id))).all())
            for acc_id, v in adj.items():
                if acc_id in by_acc:
                    by_acc[acc_id]["closing_adjustments"] = _q(by_acc[acc_id]["closing_adjustments"] - _q(v))

        accounts = []
        for a in f["accounts"]:
            b = by_acc[a.id]
            expected = _q(opening.get(a.id, D0) + self.fin.net(b))
            accounts.append({
                "id": a.id, "name": a.name, "kind": a.kind, "receives_pix": bool(a.receives_pix),
                "start": _f(opening.get(a.id, D0)), "expected": _f(expected),
                "movements": {k: _f(v) for k, v in b.items()},
            })
        tot = lambda key: _q(sum((by_acc[a.id][key] for a in f["accounts"]), D0))  # noqa: E731

        # ENTROU
        sales_lines = [{"label": METHOD_LABEL.get(m, m), "method": m, "amount": _f(v)}
                       for m, v in sorted(f["sales"].items()) if m != "on_account" and _q(v) != 0]
        fiado_received = _q(sum(f["fiado"].values(), D0))
        entries = (await self.db.execute(select(AccountEntry.kind, func.coalesce(func.sum(AccountEntry.amount), 0)).where(
            AccountEntry.tenant_id == tenant_id, AccountEntry.is_active == True,  # noqa: E712
            AccountEntry.occurred_on >= start, AccountEntry.occurred_on < end,
            AccountEntry.kind != ENTRY_CLOSING_ADJUSTMENT,
        ).group_by(AccountEntry.kind))).all()
        other_in = [{"kind": k, "label": ENTRY_KIND_LABELS[k], "amount": _f(v)} for k, v in entries if k in ENTRY_IN_KINDS]
        other_out = [{"kind": k, "label": ENTRY_KIND_LABELS[k], "amount": _f(v)} for k, v in entries if k in ENTRY_OUT_KINDS]
        register = tot("cash_register")

        # SAIU: despesas (com a conta de onde saiu) por categoria, compras e dívidas pagas, devoluções
        exp_rows = (await self.db.execute(
            select(ExpenseCategory.name, func.coalesce(func.sum(Expense.amount), 0))
            .select_from(Expense).outerjoin(ExpenseCategory, ExpenseCategory.id == Expense.category_id)
            .where(Expense.tenant_id == tenant_id, Expense.is_active == True, Expense.account_id.is_not(None),  # noqa: E712
                   Expense.expense_date >= start, Expense.expense_date < end)
            .group_by(ExpenseCategory.name)
        )).all()
        grouped: Dict[str, Decimal] = {}
        for n, v in exp_rows:
            grouped[n or "Sem categoria"] = grouped.get(n or "Sem categoria", D0) + _q(v)
        expenses_lines = sorted([{"label": n, "amount": _f(v)} for n, v in grouped.items()], key=lambda x: -x["amount"])
        no_account = (await self.db.execute(select(func.count(Expense.id), func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.tenant_id == tenant_id, Expense.is_active == True, Expense.account_id.is_(None),  # noqa: E712
            Expense.expense_date >= start, Expense.expense_date < end,
        ))).one()
        purchases = _q((await self.db.execute(select(func.coalesce(func.sum(Payable.amount), 0)).where(
            Payable.tenant_id == tenant_id, Payable.is_active == True, Payable.status == PAYABLE_PAID,  # noqa: E712
            Payable.counts_as_expense == False, Payable.paid_on >= start, Payable.paid_on < end,  # noqa: E712
        ))).scalar())
        refunds = tot("refunds")

        total_in = _q(sum((Decimal(str(x["amount"])) for x in sales_lines), D0) + fiado_received
                      + sum((Decimal(str(x["amount"])) for x in other_in), D0) + max(register, D0))
        total_out = _q(sum((Decimal(str(x["amount"])) for x in expenses_lines), D0) + purchases + refunds
                       + sum((Decimal(str(x["amount"])) for x in other_out), D0) + max(-register, D0))
        start_total = _q(sum(opening.values(), D0))
        expected_total = _q(sum((Decimal(str(a["expected"])) for a in accounts), D0))
        # transferências entre contas se anulam no total; ajuste de fechamento de outro mês dentro deste não existe
        # (ajuste é sempre do último dia do próprio mês). Confere: começo + entrou - saiu = deveria ter.
        check = _q(start_total + total_in - total_out + tot("closing_adjustments") + tot("transfers_in") - tot("transfers_out"))

        # O QUE A LOJA TEM A RECEBER E A PAGAR (hoje)
        open_rec = (await self.db.execute(select(Receivable).where(
            Receivable.tenant_id == tenant_id, Receivable.is_active == True,  # noqa: E712
            Receivable.status.in_((RECEIVABLE_OPEN, RECEIVABLE_PARTIAL)),
        ))).scalars().all()
        fiado_open = _q(sum((_q(r.amount) - _q(r.received_amount) - _q(r.abated_amount) for r in open_rec), D0))
        fiado_overdue = _q(sum((_q(r.amount) - _q(r.received_amount) - _q(r.abated_amount) for r in open_rec if r.due_date < today), D0))
        payables_open = _q((await self.db.execute(select(func.coalesce(func.sum(Payable.amount), 0)).where(
            Payable.tenant_id == tenant_id, Payable.is_active == True, Payable.status == PAYABLE_OPEN,  # noqa: E712
        ))).scalar())
        loans = await self.fin.loans(tenant_id)

        # RESULTADO E ESTOQUE
        from app.services.expense_service import ExpenseService
        res = await ExpenseService(self.db)._build_period_result(first, min(last, today), tenant_id, f"{MONTHS[month - 1]} de {year}")
        stock = await self._stock_value(tenant_id)

        return {
            "year": year, "month": month, "label": f"{MONTHS[month - 1].capitalize()} de {year}",
            "period_start": start.isoformat(), "period_end": last.isoformat(),
            "month_finished": last < today, "partial_start": start > first,
            "start_total": _f(start_total),
            "entered": {
                "sales": sales_lines, "sales_on_account": _f(f["sales"].get("on_account", D0)),
                "receivables_received": _f(fiado_received), "other": other_in,
                "cash_register_in": _f(max(register, D0)), "total": _f(total_in),
            },
            "left": {
                "expenses": expenses_lines, "purchases_and_debts": _f(purchases), "refunds": _f(refunds), "other": other_out,
                "cash_register_out": _f(max(-register, D0)), "total": _f(total_out),
                "expenses_without_account": {"count": int(no_account[0] or 0), "amount": _f(_q(no_account[1]))},
            },
            "transfers_between_accounts": _f(tot("transfers_in")),
            "expected_total": _f(expected_total), "check_ok": check == expected_total,
            "accounts": accounts,
            "to_receive": {"fiado_open": _f(fiado_open), "fiado_overdue": _f(fiado_overdue),
                           "fiado_count": len(open_rec), "loans": loans["to_receive_total"]},
            "to_pay": {"payables_open": _f(payables_open), "loans": loans["to_pay_total"]},
            "result": {"revenue": _f(res.revenue), "cost": _f(res.cmv), "expenses": _f(res.total_expenses),
                       "profit": _f(res.net_profit), "sales_count": res.sales_count, "units_sold": res.units_sold},
            "stock": stock,
        }

    async def _stock_value(self, tenant_id: int) -> Dict[str, Any]:
        """Estoque de hoje: peças, valor a preço de venda e a custo (custo posto, igual ao FIFO)."""
        price = func.coalesce(ProductVariant.price, Product.base_price, 0)
        row = (await self.db.execute(
            select(func.coalesce(func.sum(EntryItem.quantity_remaining), 0),
                   func.coalesce(func.sum(EntryItem.quantity_remaining * price), 0),
                   func.coalesce(func.sum(EntryItem.quantity_remaining * (EntryItem.unit_cost + func.coalesce(EntryItem.extra_unit_cost, 0))), 0))
            .select_from(EntryItem)
            .join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .outerjoin(ProductVariant, ProductVariant.id == EntryItem.variant_id)
            .outerjoin(Product, Product.id == func.coalesce(ProductVariant.product_id, EntryItem.product_id))
            .where(EntryItem.tenant_id == tenant_id, EntryItem.is_active == True, StockEntry.is_active == True,  # noqa: E712
                   EntryItem.quantity_remaining > 0)
        )).one()
        return {"pieces": int(row[0] or 0), "sale_value": _f(_q(row[1])), "cost_value": _f(_q(row[2]))}

    async def get(self, tenant_id: int, year: int, month: int) -> Dict[str, Any]:
        closing = await self._closing(tenant_id, year, month)
        if closing is None:
            data = await self.compute(tenant_id, year, month)
            data["closed"] = None
            return data
        snap = json.loads(closing.snapshot)
        now = await self.compute(tenant_id, year, month, ignore_closing_id=closing.id)
        changed = _q(Decimal(str(now["expected_total"])) - Decimal(str(snap["expected_total"])))
        snap["closed"] = {
            "id": closing.id, "closed_at": closing.closed_at.isoformat(), "closed_by_name": closing.closed_by_name,
            "notes": closing.notes, "counted_total": _f(closing.counted_total), "difference": _f(closing.difference),
            "changed_since_close": _f(changed),
            # despesa SEM conta lançada/mudada depois do fechamento não mexe no dinheiro das contas: avisa à parte
            "expenses_without_account_changed": (
                now["left"]["expenses_without_account"] != snap.get("left", {}).get("expenses_without_account")),
            "is_latest": not await self._later_closed(tenant_id, year, month),
        }
        return snap

    async def list_months(self, tenant_id: int) -> Dict[str, Any]:
        store = await self.fin._store(tenant_id)
        if store.finance_start_date is None:
            return {"started": False, "months": []}
        closings = {(c.year, c.month): c for c in (await self.db.execute(select(MonthClosing).where(
            MonthClosing.tenant_id == tenant_id, MonthClosing.is_active == True,  # noqa: E712
        ))).scalars().all()}
        today = today_brazil()
        y, m = store.finance_start_date.year, store.finance_start_date.month
        out: List[Dict[str, Any]] = []
        while (y, m) <= (today.year, today.month) and len(out) < 240:
            c = closings.get((y, m))
            out.append({"year": y, "month": m, "label": f"{MONTHS[m - 1].capitalize()} de {y}",
                        "closed": c is not None, "difference": _f(c.difference) if c else None})
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        out.reverse()
        return {"started": True, "months": out}

    # ── fechar e reabrir ────────────────────────────────────────────────────
    async def close(self, tenant_id: int, user: User, year: int, month: int, data: Dict[str, Any]) -> Dict[str, Any]:
        await self.fin._store(tenant_id, lock=True)   # um fechamento por vez na loja
        if await self._closing(tenant_id, year, month) is not None:
            raise FinanceConflict("Este mês já foi fechado.")
        if await self._later_closed(tenant_id, year, month):
            raise FinanceConflict("Um mês depois deste já foi fechado. Reabra aquele mês antes.")
        data_now = await self.compute(tenant_id, year, month)
        _first, last = month_bounds(year, month)
        if last > today_brazil():
            raise FinanceError("O mês ainda não terminou. Feche no último dia do mês ou depois.")

        counted_in = data.get("counted") or {}
        if not isinstance(counted_in, dict):
            raise FinanceError("Informe quanto tem em cada conta.")
        counted_in = {str(k): v for k, v in counted_in.items()}
        rows = []
        for a in data_now["accounts"]:
            raw = counted_in.get(str(a["id"]))
            if raw is None or str(raw).strip() == "":
                raise FinanceError(f"Informe quanto tem em {a['name']} (o que você contou ou viu no extrato).")
            counted = money(raw, a["name"], allow_zero=True, allow_negative=a["kind"] != KIND_CASH)
            expected = _q(Decimal(str(a["expected"])))
            rows.append((a, counted, _q(counted - expected)))
        extra = set(counted_in) - {str(a["id"]) for a in data_now["accounts"]}
        if extra:
            raise FinanceError("Conta informada não existe nesta loja.")

        counted_total = _q(sum((c for _a, c, _d in rows), D0))
        difference = _q(sum((d for _a, _c, d in rows), D0))
        notes = (str(data.get("notes") or "").strip()[:2000]) or None
        if difference != 0 and not notes and abs(difference) >= Decimal("50"):
            raise FinanceError("A diferença passou de R$ 50,00: escreva uma observação (o que pode ter acontecido).")
        for a, c, d in rows:
            a["counted"], a["difference"] = _f(c), _f(d)
        data_now["counted_total"], data_now["difference"] = _f(counted_total), _f(difference)

        closing = MonthClosing(
            tenant_id=tenant_id, year=year, month=month, expected_total=_q(Decimal(str(data_now["expected_total"]))),
            counted_total=counted_total, difference=difference, snapshot="{}", notes=notes,
            closed_by_name=_who(user), closed_at=datetime.now(timezone.utc),
        )
        try:
            self.db.add(closing)
            await self.db.flush()
            for a, _c, d in rows:
                if d != 0:
                    self.db.add(AccountEntry(
                        tenant_id=tenant_id, account_id=a["id"], kind=ENTRY_CLOSING_ADJUSTMENT, amount=d,
                        occurred_on=last, closing_id=closing.id, created_by_name=_who(user),
                        description=f"Quebra do fechamento de {MONTHS[month - 1]} de {year}",
                    ))
            closing.snapshot = json.dumps(data_now, ensure_ascii=False)
            self.db.add(closing)
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise FinanceConflict("Este mês acabou de ser fechado por outra pessoa.")
        except Exception:
            await self.db.rollback()
            raise
        return await self.get(tenant_id, year, month)

    async def reopen(self, tenant_id: int, year: int, month: int) -> Dict[str, Any]:
        await self.fin._store(tenant_id, lock=True)
        closing = await self._closing(tenant_id, year, month, lock=True)
        if closing is None:
            raise FinanceNotFound("Este mês não está fechado.")
        if await self._later_closed(tenant_id, year, month):
            raise FinanceConflict("Só o último mês fechado pode ser reaberto. Reabra os meses seguintes antes.")
        adjustments = (await self.db.execute(select(AccountEntry).where(
            AccountEntry.closing_id == closing.id, AccountEntry.tenant_id == tenant_id,
            AccountEntry.is_active == True,  # noqa: E712
        ))).scalars().all()
        for e in adjustments:
            e.is_active = False
            self.db.add(e)
        closing.is_active = False
        self.db.add(closing)
        await self.db.commit()
        return await self.get(tenant_id, year, month)
