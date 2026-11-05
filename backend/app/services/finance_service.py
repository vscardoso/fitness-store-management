"""
Financeiro da loja: implantação (loja que já funcionava), saldo de cada conta calculado na hora, transferências e
contas a pagar. Regras e fórmula do saldo em `app/models/finance.py`.

- Tudo ou nada: a implantação grava contas, data de corte e contas a pagar numa transação só; erro em qualquer linha
  não grava nada. Só pode ser feita uma vez por loja.
- O saldo nunca é guardado: sai das vendas (`payments`), devoluções, caixa, transferências, contas pagas e despesas,
  desde a data de corte. Assim nunca discorda das vendas.
- Saldo pode ficar negativo (ex.: conta paga sem o dinheiro ter caído): é mostrado assim mesmo, para a loja ver.
"""
from __future__ import annotations

from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import make_aware, to_utc, today_brazil
from app.models.cash_register import KIND_SUPPLY, KIND_WITHDRAWAL, CashMovement
from app.models.expense import Expense
from app.models.finance import (
    ACCOUNT_KINDS, KIND_BANK, KIND_CARD, KIND_CASH, PAYABLE_CANCELED, PAYABLE_OPEN, PAYABLE_PAID,
    AccountTransfer, FinancialAccount, Payable,
)
from app.models.sale import Payment, PaymentMethod, Sale
from app.models.sale_return import SaleReturn
from app.models.store import Store
from app.models.supplier import Supplier
from app.models.user import User
from app.services.money_ledger import VALID_STATUS

D0 = Decimal("0.00")
MAX_AMOUNT = Decimal("10000000")

# forma de pagamento → tipo de conta onde o dinheiro cai
METHOD_TO_KIND = {
    PaymentMethod.CASH.value: KIND_CASH,
    PaymentMethod.PIX.value: "pix",
    PaymentMethod.BANK_TRANSFER.value: "pix",
    PaymentMethod.CREDIT_CARD.value: KIND_CARD,
    PaymentMethod.DEBIT_CARD.value: KIND_CARD,
    PaymentMethod.INSTALLMENTS.value: KIND_CARD,
}
KIND_LABEL = {KIND_CASH: "Gaveta", KIND_BANK: "Banco", KIND_CARD: "Maquininha a receber"}


class FinanceError(ValueError):
    """Recusado (400): a mensagem é mostrada à pessoa."""


class FinanceConflict(FinanceError):
    """Estado não permite (409)."""


class FinanceNotFound(FinanceError):
    pass


def _q(v: Any) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def money(value: Any, label: str, *, allow_zero: bool = False, allow_negative: bool = False) -> Decimal:
    try:
        v = Decimal(str(value).replace(",", ".")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        raise FinanceError(f"{label}: valor inválido.")
    if v < 0 and not allow_negative:
        raise FinanceError(f"{label}: não pode ser negativo.")
    if v == 0 and not allow_zero:
        raise FinanceError(f"{label}: precisa ser maior que zero.")
    if abs(v) > MAX_AMOUNT:
        raise FinanceError(f"{label}: valor acima de R$ 10.000.000,00.")
    return v


def parse_day(value: Any, label: str, *, allow_future: bool = False) -> date:
    if isinstance(value, date):
        d = value
    else:
        try:
            d = date.fromisoformat(str(value)[:10])
        except Exception:
            raise FinanceError(f"{label}: data inválida (use AAAA-MM-DD).")
    if not allow_future and d > today_brazil():
        raise FinanceError(f"{label}: não pode ser no futuro.")
    return d


def day_start_utc(d: date) -> datetime:
    """Começo do dia no Brasil, em UTC (as vendas são gravadas em UTC)."""
    return to_utc(make_aware(datetime.combine(d, time.min)))


def _who(user: Optional[User]) -> Optional[str]:
    if user is None:
        return None
    return (getattr(user, "full_name", None) or getattr(user, "email", None) or "")[:120]


class FinanceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── leitura ─────────────────────────────────────────────────────────────
    async def _store(self, tenant_id: int, *, lock: bool = False) -> Store:
        q = select(Store).where(Store.id == tenant_id)
        if lock:
            q = q.with_for_update()
        store = (await self.db.execute(q)).scalar_one_or_none()
        if store is None:
            raise FinanceNotFound("Loja não encontrada.")
        return store

    async def _accounts(self, tenant_id: int) -> List[FinancialAccount]:
        return list((await self.db.execute(
            select(FinancialAccount).where(FinancialAccount.tenant_id == tenant_id, FinancialAccount.is_active == True)  # noqa: E712
            .order_by(FinancialAccount.id)
        )).scalars().all())

    async def _account(self, tenant_id: int, account_id: int) -> FinancialAccount:
        acc = (await self.db.execute(
            select(FinancialAccount).where(FinancialAccount.id == account_id, FinancialAccount.tenant_id == tenant_id,
                                           FinancialAccount.is_active == True)  # noqa: E712
        )).scalar_one_or_none()
        if acc is None:
            raise FinanceNotFound("Conta não encontrada.")
        return acc

    async def _sales_by_method(self, tenant_id: int, start: datetime) -> Dict[str, Decimal]:
        rows = (await self.db.execute(
            select(Payment.payment_method, func.coalesce(func.sum(Payment.amount), 0))
            .join(Sale, Sale.id == Payment.sale_id)
            .where(Sale.tenant_id == tenant_id, Sale.status.in_(VALID_STATUS), Payment.created_at >= start,
                   Payment.status == "confirmed", Payment.is_active == True)  # noqa: E712
            .group_by(Payment.payment_method)
        )).all()
        return {getattr(m, "value", m): _q(a) for m, a in rows}

    async def _payment_shares(self, sale_id: int) -> Dict[str, Decimal]:
        rows = (await self.db.execute(
            select(Payment.payment_method, func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.sale_id == sale_id, Payment.status == "confirmed", Payment.is_active == True,  # noqa: E712
            ).group_by(Payment.payment_method)
        )).all()
        total = sum((Decimal(str(a)) for _m, a in rows), D0)
        if total <= 0:
            return {}
        return {getattr(m, "value", m): Decimal(str(a)) / total for m, a in rows}

    async def _refunds_by_method(self, tenant_id: int, start: datetime) -> Dict[str, Decimal]:
        """Dinheiro devolvido ao cliente, por forma (mesma regra do caixa, para todas as formas)."""
        returns = (await self.db.execute(
            select(SaleReturn, Sale.id).join(Sale, Sale.id == SaleReturn.sale_id).where(
                SaleReturn.tenant_id == tenant_id, SaleReturn.status == "completed", SaleReturn.is_active == True,  # noqa: E712
                SaleReturn.created_at >= start, Sale.status.in_(VALID_STATUS),
            )
        )).all()
        out: Dict[str, Decimal] = {}
        for r, sale_id in returns:
            if r.exchange_sale_id:
                net = _q(r.net_amount) if r.net_amount is not None else D0
                if net < 0 and r.settlement_method:
                    out[r.settlement_method] = out.get(r.settlement_method, D0) + (-net)
                continue
            method = (r.refund_method or "original").lower()
            if method == "store_credit":
                continue
            if method == "original":
                for m, share in (await self._payment_shares(sale_id)).items():
                    out[m] = out.get(m, D0) + _q(r.total_refund) * share
            else:
                out[method] = out.get(method, D0) + _q(r.total_refund)
        return {m: _q(v) for m, v in out.items()}

    async def _cash_register_net(self, tenant_id: int, start: datetime) -> Decimal:
        rows = (await self.db.execute(
            select(CashMovement.kind, func.coalesce(func.sum(CashMovement.amount), 0)).where(
                CashMovement.tenant_id == tenant_id, CashMovement.created_at >= start, CashMovement.is_active == True,  # noqa: E712
                CashMovement.transfer_id.is_(None),   # ligado a uma transferência: o saldo já conta a transferência
            ).group_by(CashMovement.kind)
        )).all()
        totals = {k: _q(a) for k, a in rows}
        return totals.get(KIND_SUPPLY, D0) - totals.get(KIND_WITHDRAWAL, D0)

    async def balances(self, tenant_id: int) -> Dict[str, Any]:
        store = await self._store(tenant_id)
        accounts = await self._accounts(tenant_id)
        if store.finance_start_date is None:
            return {"started": False, "start_date": None, "accounts": [], "total": 0.0}
        start = day_start_utc(store.finance_start_date)
        sales = await self._sales_by_method(tenant_id, start)
        refunds = await self._refunds_by_method(tenant_id, start)
        register = await self._cash_register_net(tenant_id, start)
        ids = [a.id for a in accounts]

        transfers = (await self.db.execute(
            select(AccountTransfer).where(AccountTransfer.tenant_id == tenant_id, AccountTransfer.is_active == True,  # noqa: E712
                                          or_(AccountTransfer.from_account_id.in_(ids), AccountTransfer.to_account_id.in_(ids)))
        )).scalars().all() if ids else []
        paid = dict((await self.db.execute(
            select(Payable.paid_account_id, func.coalesce(func.sum(Payable.amount), 0)).where(
                Payable.tenant_id == tenant_id, Payable.status == PAYABLE_PAID, Payable.is_active == True,  # noqa: E712
                Payable.paid_account_id.is_not(None),
            ).group_by(Payable.paid_account_id)
        )).all())
        expenses = dict((await self.db.execute(
            select(Expense.account_id, func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.tenant_id == tenant_id, Expense.is_active == True, Expense.account_id.is_not(None),  # noqa: E712
                Expense.payable_id.is_(None),   # nascida do pagamento de uma despesa a pagar: o pagamento já tirou da conta
                Expense.expense_date >= store.finance_start_date,
            ).group_by(Expense.account_id)
        )).all())

        out = []
        for a in accounts:
            key = "pix" if a.receives_pix else a.kind
            methods = [m for m, k in METHOD_TO_KIND.items() if k == key]
            if a.kind == KIND_CASH:
                methods = [m for m, k in METHOD_TO_KIND.items() if k == KIND_CASH]
            sales_in = _q(sum((sales.get(m, D0) for m in methods), D0))
            refunds_out = _q(sum((refunds.get(m, D0) for m in methods), D0))
            t_in = _q(sum((_q(t.amount) for t in transfers if t.to_account_id == a.id), D0))
            t_out = _q(sum((_q(t.amount) for t in transfers if t.from_account_id == a.id), D0))
            reg = register if a.kind == KIND_CASH else D0
            pay = _q(paid.get(a.id, 0))
            exp = _q(expenses.get(a.id, 0))
            balance = _q(a.opening_balance) + sales_in - refunds_out + reg + t_in - t_out - pay - exp
            out.append({
                "id": a.id, "name": a.name, "kind": a.kind, "kind_label": KIND_LABEL[a.kind],
                "receives_pix": bool(a.receives_pix), "balance": float(balance),
                "breakdown": {
                    "opening": float(_q(a.opening_balance)), "sales": float(sales_in), "refunds": float(refunds_out),
                    "cash_register": float(reg), "transfers_in": float(t_in), "transfers_out": float(t_out),
                    "payables_paid": float(pay), "expenses_paid": float(exp),
                },
            })
        return {
            "started": True, "start_date": store.finance_start_date.isoformat(), "accounts": out,
            "total": float(_q(sum((Decimal(str(x["balance"])) for x in out), D0))),
        }

    # ── implantação ─────────────────────────────────────────────────────────
    async def setup(self, tenant_id: int, user: User, data: Dict[str, Any]) -> Dict[str, Any]:
        """Grava tudo ou nada: data de corte, gaveta, bancos, maquininha a receber e contas a pagar que já existem."""
        store = await self._store(tenant_id, lock=True)
        if store.finance_start_date is not None:
            raise FinanceConflict("O financeiro desta loja já foi implantado. Ajuste pelas contas e pelas contas a pagar.")
        start = parse_day(data.get("start_date") or today_brazil(), "Data de corte")

        cash = money(data.get("cash_balance", 0), "Dinheiro na gaveta", allow_zero=True)
        card = money(data.get("card_balance", 0), "Cartão a receber da maquininha", allow_zero=True)
        banks_in = data.get("banks") or []
        if not isinstance(banks_in, list) or len(banks_in) > 10:
            raise FinanceError("Informe no máximo 10 contas de banco.")
        banks = []
        names = set()
        for i, b in enumerate(banks_in, start=1):
            name = str((b or {}).get("name") or "").strip()[:60]
            if not name:
                raise FinanceError(f"Banco {i}: informe o nome (ex.: Nubank, Itaú).")
            if name.lower() in names:
                raise FinanceError(f"Banco {i}: nome repetido ({name}).")
            names.add(name.lower())
            banks.append((name, money(b.get("balance", 0), f"Banco {name}", allow_zero=True, allow_negative=True),
                          bool(b.get("receives_pix"))))
        if banks and sum(1 for _n, _v, pix in banks if pix) != 1:
            # sem marcação: o primeiro banco recebe o PIX
            if not any(pix for _n, _v, pix in banks):
                banks[0] = (banks[0][0], banks[0][1], True)
            else:
                raise FinanceError("Marque só UM banco para receber o PIX das vendas.")

        payables = await self._validate_payables(tenant_id, data.get("payables") or [], origin="implantacao")

        try:
            self.db.add(FinancialAccount(tenant_id=tenant_id, name="Gaveta", kind=KIND_CASH, opening_balance=cash))
            self.db.add(FinancialAccount(tenant_id=tenant_id, name="Maquininha a receber", kind=KIND_CARD, opening_balance=card))
            for name, bal, pix in banks:
                self.db.add(FinancialAccount(tenant_id=tenant_id, name=name, kind=KIND_BANK, opening_balance=bal, receives_pix=pix))
            for p in payables:
                self.db.add(p)
            store.finance_start_date = start
            self.db.add(store)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return await self.balances(tenant_id)

    async def _validate_payables(self, tenant_id: int, items: List[Dict[str, Any]], *, origin: str) -> List[Payable]:
        if not isinstance(items, list) or len(items) > 500:
            raise FinanceError("No máximo 500 contas a pagar de uma vez.")
        out = []
        for i, it in enumerate(items, start=1):
            out.append(await self._build_payable(tenant_id, it or {}, origin=origin, label=f"Conta {i}"))
        return out

    async def _build_payable(self, tenant_id: int, it: Dict[str, Any], *, origin: str, label: str) -> Payable:
        desc = str(it.get("description") or "").strip()[:200]
        supplier_id = it.get("supplier_id")
        supplier_name = str(it.get("supplier_name") or "").strip()[:120] or None
        if supplier_id is not None:
            sup = (await self.db.execute(
                select(Supplier).where(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id)
            )).scalar_one_or_none()
            if sup is None:
                raise FinanceError(f"{label}: fornecedor não encontrado.")
            supplier_name = sup.name
        if not desc:
            desc = supplier_name or ""
        if not desc:
            raise FinanceError(f"{label}: informe o que é (ex.: boleto do fornecedor, aluguel).")
        # despesa da loja (entra no resultado ao pagar) ou compra de mercadoria / dívida de antes (só tira da conta);
        # padrão: as da implantação são dívidas de antes; as novas são despesa da loja, salvo se for de fornecedor
        counts = it.get("counts_as_expense")
        counts = (origin != "implantacao" and supplier_id is None and not supplier_name) if counts is None else bool(counts)
        category_id = it.get("expense_category_id") if counts else None
        if category_id is not None:
            from app.models.expense import ExpenseCategory
            cat = (await self.db.execute(select(ExpenseCategory).where(
                ExpenseCategory.id == category_id, ExpenseCategory.is_active == True,  # noqa: E712
                or_(ExpenseCategory.tenant_id == tenant_id, ExpenseCategory.tenant_id.is_(None)),
            ))).scalar_one_or_none()
            if cat is None:
                raise FinanceError(f"{label}: categoria de despesa não encontrada.")
        return Payable(
            counts_as_expense=counts, expense_category_id=category_id,
            tenant_id=tenant_id, description=desc, supplier_id=supplier_id, supplier_name=supplier_name,
            amount=money(it.get("amount"), f"{label} ({desc})"),
            due_date=parse_day(it.get("due_date"), f"{label} ({desc}): vencimento", allow_future=True),
            status=PAYABLE_OPEN, origin=origin, notes=(str(it.get("notes") or "").strip() or None),
        )

    # ── contas ──────────────────────────────────────────────────────────────
    async def _require_started(self, tenant_id: int) -> Store:
        store = await self._store(tenant_id)
        if store.finance_start_date is None:
            raise FinanceConflict("Implante o financeiro da loja primeiro (Mais > Financeiro).")
        return store

    async def add_bank(self, tenant_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        await self._require_started(tenant_id)
        name = str(data.get("name") or "").strip()[:60]
        if not name:
            raise FinanceError("Informe o nome do banco.")
        existing = await self._accounts(tenant_id)
        if any(a.name.lower() == name.lower() for a in existing):
            raise FinanceError(f"Já existe uma conta chamada {name}.")
        pix = bool(data.get("receives_pix")) or not any(a.receives_pix for a in existing)
        if pix:
            await self.db.execute(update(FinancialAccount).where(FinancialAccount.tenant_id == tenant_id)
                                  .values(receives_pix=False))
        self.db.add(FinancialAccount(tenant_id=tenant_id, name=name, kind=KIND_BANK, receives_pix=pix,
                                     opening_balance=money(data.get("balance", 0), "Saldo inicial", allow_zero=True,
                                                           allow_negative=True)))
        await self.db.commit()
        return await self.balances(tenant_id)

    async def set_pix_account(self, tenant_id: int, account_id: int) -> Dict[str, Any]:
        acc = await self._account(tenant_id, account_id)
        if acc.kind != KIND_BANK:
            raise FinanceError("Só uma conta de banco pode receber o PIX.")
        await self.db.execute(update(FinancialAccount).where(FinancialAccount.tenant_id == tenant_id)
                              .values(receives_pix=False))
        acc.receives_pix = True
        self.db.add(acc)
        await self.db.commit()
        return await self.balances(tenant_id)

    async def transfer(self, tenant_id: int, user: User, data: Dict[str, Any]) -> Dict[str, Any]:
        store = await self._require_started(tenant_id)
        src = await self._account(tenant_id, int(data.get("from_account_id") or 0))
        dst = await self._account(tenant_id, int(data.get("to_account_id") or 0))
        if src.id == dst.id:
            raise FinanceError("Escolha contas diferentes.")
        day = parse_day(data.get("occurred_on") or today_brazil(), "Data")
        if day < store.finance_start_date:
            raise FinanceError("A data não pode ser antes da implantação.")
        self.db.add(AccountTransfer(
            tenant_id=tenant_id, from_account_id=src.id, to_account_id=dst.id, occurred_on=day,
            amount=money(data.get("amount"), "Valor"), created_by_name=_who(user),
            description=(str(data.get("description") or "").strip()[:200] or f"{src.name} para {dst.name}"),
        ))
        await self.db.commit()
        return await self.balances(tenant_id)

    async def list_transfers(self, tenant_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        rows = (await self.db.execute(
            select(AccountTransfer).where(AccountTransfer.tenant_id == tenant_id, AccountTransfer.is_active == True)  # noqa: E712
            .order_by(AccountTransfer.occurred_on.desc(), AccountTransfer.id.desc()).limit(limit)
        )).scalars().all()
        return [{"id": t.id, "from_account_id": t.from_account_id, "to_account_id": t.to_account_id,
                 "amount": float(_q(t.amount)), "occurred_on": t.occurred_on.isoformat(), "description": t.description,
                 "created_by_name": t.created_by_name} for t in rows]

    # ── contas a pagar ──────────────────────────────────────────────────────
    def _payable_public(self, p: Payable) -> Dict[str, Any]:
        today = today_brazil()
        return {
            "id": p.id, "description": p.description, "supplier_id": p.supplier_id, "supplier_name": p.supplier_name,
            "amount": float(_q(p.amount)), "due_date": p.due_date.isoformat(), "status": p.status,
            "overdue": p.status == PAYABLE_OPEN and p.due_date < today,
            "paid_on": p.paid_on.isoformat() if p.paid_on else None, "paid_account_id": p.paid_account_id,
            "origin": p.origin, "notes": p.notes,
            "counts_as_expense": bool(p.counts_as_expense), "expense_category_id": p.expense_category_id,
        }

    async def list_payables(self, tenant_id: int, status: Optional[str] = None) -> Dict[str, Any]:
        q = select(Payable).where(Payable.tenant_id == tenant_id, Payable.is_active == True)  # noqa: E712
        if status in (PAYABLE_OPEN, PAYABLE_PAID, PAYABLE_CANCELED):
            q = q.where(Payable.status == status)
        rows = (await self.db.execute(q.order_by(Payable.due_date, Payable.id))).scalars().all()
        items = [self._payable_public(p) for p in rows]
        open_items = [x for x in items if x["status"] == PAYABLE_OPEN]
        return {
            "items": items,
            "open_total": float(_q(sum((Decimal(str(x["amount"])) for x in open_items), D0))),
            "overdue_total": float(_q(sum((Decimal(str(x["amount"])) for x in open_items if x["overdue"]), D0))),
            "overdue_count": sum(1 for x in open_items if x["overdue"]),
        }

    async def create_payable(self, tenant_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        p = await self._build_payable(tenant_id, data, origin="manual", label="Conta")
        self.db.add(p)
        await self.db.commit()
        await self.db.refresh(p)
        return self._payable_public(p)

    async def _payable(self, tenant_id: int, payable_id: int, *, lock: bool = False) -> Payable:
        q = select(Payable).where(Payable.id == payable_id, Payable.tenant_id == tenant_id, Payable.is_active == True)  # noqa: E712
        if lock:
            q = q.with_for_update()
        p = (await self.db.execute(q)).scalar_one_or_none()
        if p is None:
            raise FinanceNotFound("Conta a pagar não encontrada.")
        return p

    async def pay_payable(self, tenant_id: int, payable_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        store = await self._require_started(tenant_id)
        p = await self._payable(tenant_id, payable_id, lock=True)
        if p.status != PAYABLE_OPEN:
            raise FinanceConflict("Esta conta não está em aberto.")
        acc = await self._account(tenant_id, int(data.get("account_id") or 0))
        day = parse_day(data.get("paid_on") or today_brazil(), "Data do pagamento")
        if day < store.finance_start_date:
            raise FinanceError("A data do pagamento não pode ser antes da implantação.")
        p.status, p.paid_on, p.paid_account_id, p.paid_at = PAYABLE_PAID, day, acc.id, datetime.utcnow()
        self.db.add(p)
        if p.counts_as_expense:
            # despesa da loja: entra no resultado do mês do pagamento (o dinheiro sai uma vez só, pelo pagamento)
            self.db.add(Expense(
                tenant_id=tenant_id, amount=_q(p.amount), description=p.description[:200], expense_date=day,
                category_id=p.expense_category_id, account_id=acc.id, payable_id=p.id, notes=p.notes, is_active=True,
            ))
        await self.db.commit()
        await self.db.refresh(p)
        return self._payable_public(p)

    async def unpay_payable(self, tenant_id: int, payable_id: int) -> Dict[str, Any]:
        """Desfazer pagamento (pagou pela conta errada, valor errado): volta para em aberto e o dinheiro volta para a conta."""
        p = await self._payable(tenant_id, payable_id, lock=True)
        if p.status != PAYABLE_PAID:
            raise FinanceConflict("Só conta paga pode ter o pagamento desfeito.")
        p.status, p.paid_on, p.paid_account_id, p.paid_at = PAYABLE_OPEN, None, None, None
        self.db.add(p)
        await self.db.execute(update(Expense).where(
            Expense.payable_id == p.id, Expense.tenant_id == tenant_id, Expense.is_active == True,  # noqa: E712
        ).values(is_active=False))
        await self.db.commit()
        await self.db.refresh(p)
        return self._payable_public(p)

    async def delete_transfer(self, tenant_id: int, transfer_id: int) -> Dict[str, Any]:
        """Apagar transferência lançada errado (exclusão lógica): as duas contas voltam ao que eram."""
        t = (await self.db.execute(
            select(AccountTransfer).where(AccountTransfer.id == transfer_id, AccountTransfer.tenant_id == tenant_id,
                                          AccountTransfer.is_active == True).with_for_update()  # noqa: E712
        )).scalar_one_or_none()
        if t is None:
            raise FinanceNotFound("Transferência não encontrada.")
        linked = (await self.db.execute(select(CashMovement.id).where(
            CashMovement.transfer_id == t.id, CashMovement.is_active == True))).first()  # noqa: E712
        if linked:
            raise FinanceConflict("Esta transferência foi feita pelo caixa (retirada ou reforço) e não pode ser apagada aqui.")
        t.is_active = False
        self.db.add(t)
        await self.db.commit()
        return await self.balances(tenant_id)

    async def cancel_payable(self, tenant_id: int, payable_id: int) -> Dict[str, Any]:
        p = await self._payable(tenant_id, payable_id, lock=True)
        if p.status != PAYABLE_OPEN:
            raise FinanceConflict("Só conta em aberto pode ser cancelada.")
        p.status = PAYABLE_CANCELED
        self.db.add(p)
        await self.db.commit()
        await self.db.refresh(p)
        return self._payable_public(p)
