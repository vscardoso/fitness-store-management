"""
Caixa da loja: abrir com o dinheiro que já está na gaveta, lançar suprimento (entrou) e sangria (saiu) e fechar
contando o dinheiro. O esperado é calculado na hora:

    esperado = dinheiro na abertura
             + vendas pagas em dinheiro no turno
             - devoluções e trocas pagas em dinheiro no turno
             + suprimentos - sangrias

- Venda cancelada não conta (cancelar desfaz tudo). PIX, cartão e os outros meios NÃO entram na gaveta: aparecem só
  como informação ("por forma de pagamento") para a loja conferir com a maquininha e o banco.
- Devolução: `cash` sai integral; `original` sai a parte que foi paga em dinheiro na venda (se a venda foi toda em
  dinheiro, sai tudo); `store_credit` não mexe na gaveta. Troca: o que o cliente pagou a mais já é um pagamento da venda
  nova; o que a loja devolveu a mais (saldo negativo) sai se o acerto foi em dinheiro.
- Só pode haver UM caixa aberto por loja (índice único). Sem caixa aberto as vendas continuam normais: o caixa é opcional.
- Ao fechar, o resultado vira fotografia (esperado, contado, diferença e totais) e não muda mais.
"""
from __future__ import annotations

import json
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash_register import (
    KIND_SUPPLY, KIND_WITHDRAWAL, SESSION_CLOSED, SESSION_OPEN, CashMovement, CashSession,
)
from app.models.sale import Payment, PaymentMethod, Sale
from app.models.sale_return import SaleReturn
from app.models.user import User
from app.services.money_ledger import VALID_STATUS

D0 = Decimal("0.00")
MAX_AMOUNT = Decimal("1000000")
REASONS = {
    KIND_SUPPLY: {"troco": "Reforço de troco", "aporte": "Dinheiro colocado no caixa", "outro": "Outro"},
    KIND_WITHDRAWAL: {"sangria": "Retirada para guardar ou depositar", "pagamento": "Pagamento feito com dinheiro do caixa", "outro": "Outro"},
}


class CashError(ValueError):
    """Operação recusada (400): a mensagem é mostrada à pessoa."""


class CashConflict(CashError):
    """Estado não permite (409): caixa já aberto, já fechado, sem caixa aberto."""


class CashNotFound(CashError):
    pass


def _money(value: Any, label: str, *, allow_zero: bool) -> Decimal:
    try:
        v = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        raise CashError(f"{label} inválido.")
    if v < 0 or (v == 0 and not allow_zero):
        raise CashError(f"{label} precisa ser maior que zero." if not allow_zero else f"{label} não pode ser negativo.")
    if v > MAX_AMOUNT:
        raise CashError(f"{label} acima de R$ 1.000.000,00.")
    return v


def _num(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _who(user: User) -> str:
    return (getattr(user, "full_name", None) or getattr(user, "email", None) or "")[:120]


class CashRegisterService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── consultas ───────────────────────────────────────────────────────────
    async def _open_session(self, tenant_id: int, *, lock: bool = False) -> Optional[CashSession]:
        q = select(CashSession).where(CashSession.tenant_id == tenant_id, CashSession.status == SESSION_OPEN)
        if lock:
            q = q.with_for_update()
        return (await self.db.execute(q)).scalar_one_or_none()

    async def _get(self, tenant_id: int, session_id: int) -> CashSession:
        s = (await self.db.execute(
            select(CashSession).where(CashSession.id == session_id, CashSession.tenant_id == tenant_id)
        )).scalar_one_or_none()
        if s is None:
            raise CashNotFound("Caixa não encontrado.")
        return s

    async def _movements(self, session_id: int) -> List[CashMovement]:
        return list((await self.db.execute(
            select(CashMovement).where(CashMovement.session_id == session_id).order_by(CashMovement.id)
        )).scalars().all())

    async def _live_totals(self, s: CashSession, tenant_id: int, end: datetime) -> Dict[str, Any]:
        """Conta o turno [abertura, end] nos pagamentos e devoluções (nada é copiado)."""
        start = s.opened_at
        valid_sale = (Sale.tenant_id == tenant_id, Sale.status.in_(VALID_STATUS))
        window = (Payment.created_at >= start, Payment.created_at <= end, Payment.status == "confirmed", Payment.is_active == True)  # noqa: E712

        rows = (await self.db.execute(
            select(Payment.payment_method, func.coalesce(func.sum(Payment.amount), 0), func.count(func.distinct(Payment.sale_id)))
            .join(Sale, Sale.id == Payment.sale_id).where(*valid_sale, *window).group_by(Payment.payment_method)
        )).all()
        cash_sales, other = D0, {}
        for method, amount, n in rows:
            key = getattr(method, "value", method)
            if key == PaymentMethod.CASH.value:
                cash_sales = _num(amount)
            else:
                other[key] = {"amount": float(_num(amount)), "sales": int(n)}
        sales_count = (await self.db.execute(
            select(func.count(func.distinct(Payment.sale_id))).join(Sale, Sale.id == Payment.sale_id).where(*valid_sale, *window)
        )).scalar() or 0

        cash_refunds = await self._cash_refunds(tenant_id, start, end)
        movs = await self._movements(s.id)
        supplies = _num(sum((m.amount for m in movs if m.kind == KIND_SUPPLY), D0))
        withdrawals = _num(sum((m.amount for m in movs if m.kind == KIND_WITHDRAWAL), D0))
        opening = _num(s.opening_amount)
        expected = opening + cash_sales - cash_refunds + supplies - withdrawals
        return {
            "opening_amount": float(opening), "cash_sales": float(cash_sales), "cash_refunds": float(cash_refunds),
            "supplies": float(supplies), "withdrawals": float(withdrawals), "expected_amount": float(expected),
            "sales_count": int(sales_count), "other_methods": other,
        }

    async def _cash_refunds(self, tenant_id: int, start: datetime, end: datetime) -> Decimal:
        returns = (await self.db.execute(
            select(SaleReturn, Sale.id).join(Sale, Sale.id == SaleReturn.sale_id).where(
                SaleReturn.tenant_id == tenant_id, SaleReturn.status == "completed", SaleReturn.is_active == True,  # noqa: E712
                SaleReturn.created_at >= start, SaleReturn.created_at <= end, Sale.status.in_(VALID_STATUS),
            )
        )).all()
        total = D0
        for r, sale_id in returns:
            if r.exchange_sale_id:
                net = _num(r.net_amount) if r.net_amount is not None else D0
                if net < 0 and r.settlement_method == PaymentMethod.CASH.value:
                    total += -net
                continue
            method = (r.refund_method or "original").lower()
            if method == "cash":
                total += _num(r.total_refund)
            elif method == "original":
                total += _num(r.total_refund) * await self._cash_share(sale_id)
        return total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    async def _cash_share(self, sale_id: int) -> Decimal:
        rows = (await self.db.execute(
            select(Payment.payment_method, func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.sale_id == sale_id, Payment.status == "confirmed", Payment.is_active == True,  # noqa: E712
            ).group_by(Payment.payment_method)
        )).all()
        total = sum((Decimal(str(a)) for _m, a in rows), D0)
        cash = sum((Decimal(str(a)) for m, a in rows if getattr(m, "value", m) == PaymentMethod.CASH.value), D0)
        return (cash / total) if total > 0 else D0

    def _public(self, s: CashSession, totals: Dict[str, Any], movs: List[CashMovement]) -> Dict[str, Any]:
        return {
            "id": s.id, "status": s.status, "opened_at": s.opened_at, "opened_by": s.opened_by_name,
            "opening_note": s.opening_note, "closed_at": s.closed_at, "closed_by": s.closed_by_name,
            "closing_note": s.closing_note,
            "counted_amount": float(s.counted_amount) if s.counted_amount is not None else None,
            "difference": float(s.difference) if s.difference is not None else None,
            **totals,
            "movements": [
                {"id": m.id, "kind": m.kind, "amount": float(m.amount), "reason": m.reason,
                 "reason_label": REASONS.get(m.kind, {}).get(m.reason, m.reason), "note": m.note,
                 "created_at": m.created_at, "created_by": m.created_by_name}
                for m in movs
            ],
        }

    async def _view(self, s: CashSession, tenant_id: int) -> Dict[str, Any]:
        movs = await self._movements(s.id)
        if s.status == SESSION_CLOSED:
            totals = {
                "opening_amount": float(s.opening_amount), "cash_sales": float(s.cash_sales or 0),
                "cash_refunds": float(s.cash_refunds or 0), "supplies": float(s.supplies_total or 0),
                "withdrawals": float(s.withdrawals_total or 0), "expected_amount": float(s.expected_amount or 0),
                "sales_count": int(s.sales_count or 0), "other_methods": json.loads(s.other_methods or "{}"),
            }
        else:
            totals = await self._live_totals(s, tenant_id, datetime.utcnow())
        return self._public(s, totals, movs)

    # ── operações ───────────────────────────────────────────────────────────
    async def current(self, tenant_id: int) -> Dict[str, Any]:
        s = await self._open_session(tenant_id)
        if s is None:
            last = (await self.db.execute(
                select(CashSession).where(CashSession.tenant_id == tenant_id, CashSession.status == SESSION_CLOSED)
                .order_by(CashSession.id.desc()).limit(1)
            )).scalar_one_or_none()
            return {
                "open": False, "session": None,
                "last_closed": {"id": last.id, "closed_at": last.closed_at, "counted_amount": float(last.counted_amount or 0),
                                "difference": float(last.difference or 0)} if last else None,
            }
        return {"open": True, "session": await self._view(s, tenant_id), "last_closed": None}

    async def open(self, tenant_id: int, user: User, amount: Any, note: Optional[str]) -> Dict[str, Any]:
        opening = _money(amount, "Valor do dinheiro no caixa", allow_zero=True)
        if await self._open_session(tenant_id):
            raise CashConflict("Já existe um caixa aberto. Feche o caixa atual antes de abrir outro.")
        s = CashSession(
            tenant_id=tenant_id, status=SESSION_OPEN, opened_at=datetime.utcnow(), opened_by_id=user.id,
            opened_by_name=_who(user), opening_amount=opening, opening_note=(note or "").strip()[:500] or None, is_active=True,
        )
        self.db.add(s)
        try:
            await self.db.commit()          # o índice único barra duas aberturas ao mesmo tempo
        except IntegrityError:
            await self.db.rollback()
            raise CashConflict("Já existe um caixa aberto. Feche o caixa atual antes de abrir outro.")
        await self.db.refresh(s)
        return await self._view(s, tenant_id)

    async def add_movement(
        self, tenant_id: int, user: User, kind: str, amount: Any, reason: str, note: Optional[str],
    ) -> Dict[str, Any]:
        if kind not in REASONS:
            raise CashError("Tipo de movimento inválido.")
        if reason not in REASONS[kind]:
            raise CashError("Motivo inválido.")
        value = _money(amount, "Valor", allow_zero=False)
        s = await self._open_session(tenant_id, lock=True)   # trava o turno: duas sangrias juntas não furam o saldo
        if s is None:
            raise CashConflict("Não há caixa aberto. Abra o caixa primeiro.")
        if kind == KIND_WITHDRAWAL:
            have = _num((await self._live_totals(s, tenant_id, datetime.utcnow()))["expected_amount"])
            if value > have:
                raise CashError(f"Não há esse dinheiro no caixa: o sistema espera R$ {have:.2f}.".replace(".", ","))
        self.db.add(CashMovement(
            tenant_id=tenant_id, session_id=s.id, kind=kind, amount=value, reason=reason,
            note=(note or "").strip()[:500] or None, created_by_id=user.id, created_by_name=_who(user), is_active=True,
        ))
        await self.db.commit()
        return await self._view(s, tenant_id)

    async def close(self, tenant_id: int, user: User, counted: Any, note: Optional[str]) -> Dict[str, Any]:
        value = _money(counted, "Dinheiro contado", allow_zero=True)
        s = await self._open_session(tenant_id, lock=True)
        if s is None:
            raise CashConflict("Não há caixa aberto para fechar.")
        end = datetime.utcnow()
        t = await self._live_totals(s, tenant_id, end)
        expected = _num(t["expected_amount"])
        s.status = SESSION_CLOSED
        s.closed_at, s.closed_by_id, s.closed_by_name = end, user.id, _who(user)
        s.closing_note = (note or "").strip()[:500] or None
        s.counted_amount, s.expected_amount, s.difference = value, expected, (value - expected)
        s.cash_sales, s.cash_refunds = _num(t["cash_sales"]), _num(t["cash_refunds"])
        s.supplies_total, s.withdrawals_total = _num(t["supplies"]), _num(t["withdrawals"])
        s.sales_count = t["sales_count"]
        s.other_methods = json.dumps(t["other_methods"])
        await self.db.commit()
        return await self._view(s, tenant_id)

    async def list_sessions(self, tenant_id: int, skip: int, limit: int) -> List[Dict[str, Any]]:
        rows = (await self.db.execute(
            select(CashSession).where(CashSession.tenant_id == tenant_id)
            .order_by(CashSession.id.desc()).offset(skip).limit(limit)
        )).scalars().all()
        out = []
        for s in rows:
            closed = s.status == SESSION_CLOSED
            out.append({
                "id": s.id, "status": s.status, "opened_at": s.opened_at, "opened_by": s.opened_by_name,
                "closed_at": s.closed_at, "closed_by": s.closed_by_name,
                "opening_amount": float(s.opening_amount),
                "expected_amount": float(s.expected_amount) if closed else None,
                "counted_amount": float(s.counted_amount) if closed else None,
                "difference": float(s.difference) if closed else None,
                "cash_sales": float(s.cash_sales or 0) if closed else None,
                "sales_count": int(s.sales_count or 0) if closed else None,
            })
        return out

    async def detail(self, tenant_id: int, session_id: int) -> Dict[str, Any]:
        return await self._view(await self._get(tenant_id, session_id), tenant_id)
