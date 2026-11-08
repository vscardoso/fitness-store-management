"""
Fiado (contas a receber): parcelas das vendas no fiado e saldos antigos, recebimentos e abatimento por devolução.
Regras do dinheiro em `app/models/receivable.py`.

- Venda no fiado: `create_for_sale` roda DENTRO da transação da venda (sem commit próprio).
- Receber: valor parcial permitido; com cliente (sem parcela escolhida) paga das mais antigas para as mais novas.
- Desfazer recebimento e cancelar lançamento antigo: gerente/admin (a rota cuida do papel).
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import ROUND_DOWN, Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import today_brazil
from app.models.customer import Customer
from app.models.receivable import (
    ORIGIN_OPENING, ORIGIN_SALE, RECEIVABLE_CANCELED, RECEIVABLE_OPEN, RECEIVABLE_PAID, RECEIVABLE_PARTIAL,
    RECEIVE_METHODS, Receivable, ReceivablePayment,
)
from app.models.user import User
from app.services.finance_service import D0, FinanceConflict, FinanceError, FinanceNotFound, _q, _who, as_int, money, parse_day

INTERVALS = (7, 15, 30)   # semanal, quinzenal, mensal
MAX_INSTALLMENTS = 12
MIN_INSTALLMENT = Decimal("1.00")
METHOD_LABEL = {"cash": "Dinheiro", "pix": "PIX", "bank_transfer": "Transferência",
                "debit_card": "Débito", "credit_card": "Crédito"}


def outstanding(r: Receivable) -> Decimal:
    return max(D0, _q(r.amount) - _q(r.received_amount) - _q(r.abated_amount))


def _refresh_status(r: Receivable) -> None:
    left = outstanding(r)
    received = _q(r.received_amount)
    if left > 0:
        r.status = RECEIVABLE_PARTIAL if received > 0 or _q(r.abated_amount) > 0 else RECEIVABLE_OPEN
    else:
        r.status = RECEIVABLE_PAID if received > 0 else RECEIVABLE_CANCELED


def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def due_dates(first: date, count: int, interval_days: int) -> List[date]:
    if interval_days == 30:
        return [_add_months(first, k) for k in range(count)]
    return [first + timedelta(days=interval_days * k) for k in range(count)]


def split_amount(total: Decimal, count: int) -> List[Decimal]:
    """Parcelas iguais em centavos; a sobra fica na última (R$ 100 em 3 = 33,33 + 33,33 + 33,34)."""
    if count > 1 and total / count < MIN_INSTALLMENT:
        raise ValueError(
            f"Fiado: o valor é pequeno demais para {count} parcelas: a parcela mínima é R$ 1,00. "
            "Reduza o número de vezes.")
    part = (total / count).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    return [part] * (count - 1) + [total - part * (count - 1)]


class ReceivableService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── criação ─────────────────────────────────────────────────────────────
    async def create_for_sale(
        self, *, tenant_id: int, sale_id: int, customer_id: Optional[int], amount: Decimal, installments: int,
        first_due_date: Optional[date], interval_days: Optional[int], created_by: Optional[str],
    ) -> List[Receivable]:
        if not customer_id:
            raise ValueError("Venda no fiado precisa de cliente: escolha a cliente antes de finalizar.")
        installments = int(installments or 1)
        if installments < 1 or installments > MAX_INSTALLMENTS:
            raise ValueError(f"Fiado: de 1 a {MAX_INSTALLMENTS} parcelas.")
        interval = int(interval_days or 30)
        if interval not in INTERVALS:
            raise ValueError("Fiado: intervalo entre parcelas deve ser semanal (7), quinzenal (15) ou mensal (30).")
        today = today_brazil()
        first = first_due_date or (_add_months(today, 1) if interval == 30 else today + timedelta(days=interval))
        if first < today:
            raise ValueError("Fiado: o primeiro vencimento não pode ser antes de hoje.")
        out = []
        for k, (value, due) in enumerate(zip(split_amount(_q(amount), installments), due_dates(first, installments, interval)), 1):
            r = Receivable(
                tenant_id=tenant_id, customer_id=customer_id, sale_id=sale_id, origin=ORIGIN_SALE,
                installment_number=k, installments_total=installments, amount=value, due_date=due,
                status=RECEIVABLE_OPEN, created_by_name=created_by,
            )
            self.db.add(r)
            out.append(r)
        await self.db.flush()
        return out

    async def _customer(self, tenant_id: int, customer_id: Any) -> Customer:
        try:
            cid = int(customer_id)
        except Exception:
            raise FinanceError("Escolha a cliente.")
        c = (await self.db.execute(select(Customer).where(
            Customer.id == cid, Customer.tenant_id == tenant_id, Customer.is_active == True))).scalar_one_or_none()  # noqa: E712
        if c is None:
            raise FinanceNotFound("Cliente não encontrada.")
        return c

    async def create_opening(self, tenant_id: int, user: User, data: Dict[str, Any]) -> Dict[str, Any]:
        """Fiado que já existia antes do app (ex.: caderno ou planilha): uma ou várias parcelas, sem venda."""
        c = await self._customer(tenant_id, data.get("customer_id"))
        items = data.get("installments") or [{"amount": data.get("amount"), "due_date": data.get("due_date")}]
        if len(items) > MAX_INSTALLMENTS * 2:
            raise FinanceError("No máximo 24 parcelas por lançamento.")
        parsed = []
        for k, it in enumerate(items, 1):
            label = f"Parcela {k}" if len(items) > 1 else "Valor"
            parsed.append((money(it.get("amount"), label), parse_day(it.get("due_date"), f"{label}: vencimento", allow_future=True)))
        desc = (data.get("description") or "").strip()[:200] or "Fiado anterior ao app"
        made = []
        try:
            for k, (value, due) in enumerate(parsed, 1):
                r = Receivable(
                    tenant_id=tenant_id, customer_id=c.id, origin=ORIGIN_OPENING, installment_number=k,
                    installments_total=len(parsed), amount=value, due_date=due, description=desc,
                    notes=(data.get("notes") or "").strip() or None, status=RECEIVABLE_OPEN, created_by_name=_who(user),
                )
                self.db.add(r)
                made.append(r)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return {"created": len(made), "total": float(sum((v for v, _ in parsed), D0))}

    # ── leitura ─────────────────────────────────────────────────────────────
    async def _names(self, ids) -> Dict[int, str]:
        ids = set(ids)
        if not ids:
            return {}
        return dict((await self.db.execute(select(Customer.id, Customer.full_name).where(Customer.id.in_(ids)))).all())

    def _public(self, r: Receivable, names: Dict[int, str], today: date) -> Dict[str, Any]:
        left = outstanding(r)
        return {
            "id": r.id, "customer_id": r.customer_id, "customer_name": names.get(r.customer_id),
            "sale_id": r.sale_id, "origin": r.origin, "description": r.description,
            "installment_number": r.installment_number, "installments_total": r.installments_total,
            "amount": float(_q(r.amount)), "received_amount": float(_q(r.received_amount)),
            "abated_amount": float(_q(r.abated_amount)), "outstanding": float(left),
            "due_date": r.due_date.isoformat(), "status": r.status,
            "overdue": left > 0 and r.due_date < today, "notes": r.notes,
        }

    async def list(self, tenant_id: int, *, status: Optional[str] = None, customer_id: Optional[int] = None) -> Dict[str, Any]:
        """status: open (em aberto, inclui parcial e vencida), overdue, paid, canceled, all."""
        today = today_brazil()
        stmt = select(Receivable).where(Receivable.tenant_id == tenant_id, Receivable.is_active == True)  # noqa: E712
        if customer_id:
            stmt = stmt.where(Receivable.customer_id == customer_id)
        st = status or "open"
        if st in ("open", "overdue"):
            stmt = stmt.where(Receivable.status.in_((RECEIVABLE_OPEN, RECEIVABLE_PARTIAL)))
            if st == "overdue":
                stmt = stmt.where(Receivable.due_date < today)
        elif st in (RECEIVABLE_PAID, RECEIVABLE_CANCELED):
            stmt = stmt.where(Receivable.status == st)
        rows = list((await self.db.execute(stmt.order_by(Receivable.due_date, Receivable.id))).scalars().all())
        names = await self._names(r.customer_id for r in rows)
        items = [self._public(r, names, today) for r in rows]
        return {"items": items, "summary": await self.summary(tenant_id, customer_id=customer_id)}

    async def summary(self, tenant_id: int, *, customer_id: Optional[int] = None) -> Dict[str, Any]:
        today = today_brazil()
        week = today + timedelta(days=7)
        stmt = select(Receivable).where(
            Receivable.tenant_id == tenant_id, Receivable.is_active == True,  # noqa: E712
            Receivable.status.in_((RECEIVABLE_OPEN, RECEIVABLE_PARTIAL)),
        )
        if customer_id:
            stmt = stmt.where(Receivable.customer_id == customer_id)
        rows = (await self.db.execute(stmt)).scalars().all()
        total = overdue = this_week = D0
        customers = set()
        for r in rows:
            left = outstanding(r)
            total += left
            customers.add(r.customer_id)
            if r.due_date < today:
                overdue += left
            elif r.due_date <= week:
                this_week += left
        return {"open_total": float(total), "overdue_total": float(overdue), "due_this_week": float(this_week),
                "customers": len(customers), "installments": len(rows)}

    async def payments(self, tenant_id: int, receivable_id: int) -> List[Dict[str, Any]]:
        rows = (await self.db.execute(select(ReceivablePayment).where(
            ReceivablePayment.tenant_id == tenant_id, ReceivablePayment.receivable_id == receivable_id,
            ReceivablePayment.is_active == True,  # noqa: E712
        ).order_by(ReceivablePayment.id))).scalars().all()
        return [{"id": p.id, "amount": float(_q(p.amount)), "payment_method": p.payment_method,
                 "method_label": METHOD_LABEL.get(p.payment_method, p.payment_method),
                 "received_on": p.received_on.isoformat(), "created_by_name": p.created_by_name} for p in rows]

    # ── receber / desfazer / cancelar ───────────────────────────────────────
    async def receive(self, tenant_id: int, user: User, data: Dict[str, Any]) -> Dict[str, Any]:
        """Recebe `amount` de uma parcela (`receivable_id`) ou da cliente (`customer_id`, das mais antigas primeiro)."""
        value = money(data.get("amount"), "Valor recebido")
        method = (data.get("payment_method") or "").strip()
        if method not in RECEIVE_METHODS:
            raise FinanceError("Escolha como ela pagou: dinheiro, PIX, transferência, débito ou crédito.")
        on = parse_day(data.get("received_on") or today_brazil(), "Data do recebimento")
        stmt = select(Receivable).where(
            Receivable.tenant_id == tenant_id, Receivable.is_active == True,  # noqa: E712
            Receivable.status.in_((RECEIVABLE_OPEN, RECEIVABLE_PARTIAL)),
        ).order_by(Receivable.due_date, Receivable.id).with_for_update()
        if data.get("receivable_id"):
            stmt = stmt.where(Receivable.id == as_int(data["receivable_id"], "a parcela"))
        elif data.get("customer_id"):
            stmt = stmt.where(Receivable.customer_id == as_int(data["customer_id"], "a cliente"))
        else:
            raise FinanceError("Escolha a parcela ou a cliente.")
        try:
            rows = list((await self.db.execute(stmt)).scalars().all())
            if not rows:
                raise FinanceConflict("Não há valor em aberto para receber.")
            owed = sum((outstanding(r) for r in rows), D0)
            if value > owed:
                raise FinanceError(f"O valor passa do que está em aberto (R$ {owed:.2f}).".replace(".", ","))
            left = value
            touched = []
            for r in rows:
                if left <= 0:
                    break
                take = min(left, outstanding(r))
                if take <= 0:
                    continue
                self.db.add(ReceivablePayment(tenant_id=tenant_id, receivable_id=r.id, amount=take,
                                              payment_method=method, received_on=on, created_by_name=_who(user)))
                r.received_amount = _q(r.received_amount) + take
                _refresh_status(r)
                left -= take
                touched.append(r.id)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return {"received": float(value), "receivables": touched}

    async def undo_payment(self, tenant_id: int, payment_id: int) -> Dict[str, Any]:
        try:
            p = (await self.db.execute(select(ReceivablePayment).where(
                ReceivablePayment.id == payment_id, ReceivablePayment.tenant_id == tenant_id,
                ReceivablePayment.is_active == True).with_for_update())).scalar_one_or_none()  # noqa: E712
            if p is None:
                raise FinanceNotFound("Recebimento não encontrado.")
            r = (await self.db.execute(select(Receivable).where(Receivable.id == p.receivable_id).with_for_update())).scalar_one()
            if r.status == RECEIVABLE_CANCELED:
                raise FinanceConflict("A parcela foi cancelada; o recebimento não pode ser desfeito.")
            p.is_active = False
            r.received_amount = max(D0, _q(r.received_amount) - _q(p.amount))
            _refresh_status(r)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return {"undone": payment_id, "receivable_id": r.id, "status": r.status}

    async def cancel(self, tenant_id: int, receivable_id: int) -> Dict[str, Any]:
        """Só fiado antigo lançado à mão e sem recebimento (lançado errado). Parcela de venda: cancelar a venda ou devolver."""
        try:
            r = (await self.db.execute(select(Receivable).where(
                Receivable.id == receivable_id, Receivable.tenant_id == tenant_id,
                Receivable.is_active == True).with_for_update())).scalar_one_or_none()  # noqa: E712
            if r is None:
                raise FinanceNotFound("Parcela não encontrada.")
            if r.origin != ORIGIN_OPENING:
                raise FinanceConflict("Parcela de venda não se cancela aqui: cancele a venda ou faça a devolução.")
            if _q(r.received_amount) > 0:
                raise FinanceConflict("Esta parcela já tem recebimento: desfaça o recebimento antes.")
            r.status = RECEIVABLE_CANCELED
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return {"canceled": receivable_id}

    # ── venda cancelada e devolução (dentro da transação de quem chama) ─────
    async def _for_sale(self, sale_id: int) -> List[Receivable]:
        return list((await self.db.execute(select(Receivable).where(
            Receivable.sale_id == sale_id, Receivable.is_active == True,  # noqa: E712
        ).order_by(Receivable.installment_number.desc()).with_for_update())).scalars().all())

    async def cancel_for_sale(self, sale_id: int) -> None:
        rows = await self._for_sale(sale_id)
        if any(_q(r.received_amount) > 0 for r in rows):
            raise ValueError("Esta venda no fiado já tem parcela recebida: use Devolução em vez de cancelar.")
        for r in rows:
            r.status = RECEIVABLE_CANCELED

    async def abate_for_return(self, sale_id: int, amount: Decimal) -> Decimal:
        """Devolução: abate do que ainda está em aberto, da última parcela para a primeira. Devolve quanto abateu."""
        left = _q(amount)
        done = D0
        for r in await self._for_sale(sale_id):
            if left <= 0:
                break
            if r.status not in (RECEIVABLE_OPEN, RECEIVABLE_PARTIAL):
                continue
            take = min(left, outstanding(r))
            if take <= 0:
                continue
            r.abated_amount = _q(r.abated_amount) + take
            _refresh_status(r)
            left -= take
            done += take
        return done

    # ── dinheiro recebido (Financeiro e caixa) ──────────────────────────────
    async def received_by_method(self, tenant_id: int, start_day: date,
                                 end_day: Optional[date] = None) -> Dict[str, Decimal]:
        """Recebido de fiado por forma, de start_day até antes de end_day (None = até hoje)."""
        conds = [ReceivablePayment.tenant_id == tenant_id, ReceivablePayment.is_active == True,  # noqa: E712
                 ReceivablePayment.received_on >= start_day]
        if end_day is not None:
            conds.append(ReceivablePayment.received_on < end_day)
        rows = (await self.db.execute(
            select(ReceivablePayment.payment_method, func.coalesce(func.sum(ReceivablePayment.amount), 0)).where(
                *conds
            ).group_by(ReceivablePayment.payment_method)
        )).all()
        return {m: _q(a) for m, a in rows}

    async def cash_received_between(self, tenant_id: int, start: datetime, end: datetime) -> Decimal:
        """Dinheiro de fiado recebido no turno do caixa, pela DATA DO RECEBIMENTO (`received_on`), a mesma regra do
        Financeiro: o dia (Brasil) da abertura até o dia do fim do turno. Assim o esperado do caixa e a gaveta batem."""
        from app.core.timezone import to_brazil_tz
        d0 = to_brazil_tz(start).date()
        d1 = to_brazil_tz(end).date()
        v = (await self.db.execute(
            select(func.coalesce(func.sum(ReceivablePayment.amount), 0)).where(
                ReceivablePayment.tenant_id == tenant_id, ReceivablePayment.is_active == True,  # noqa: E712
                ReceivablePayment.payment_method == "cash",
                ReceivablePayment.received_on >= d0, ReceivablePayment.received_on <= d1,
                # um recebimento entra em UM só turno: o do instante do lançamento
                ReceivablePayment.created_at >= start, ReceivablePayment.created_at < end,
            )
        )).scalar()
        return _q(v)
