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

from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import make_aware, to_utc, today_brazil
from app.models.cash_register import KIND_SUPPLY, KIND_WITHDRAWAL, CashMovement
from app.models.expense import Expense
from app.models.finance import (
    ACCOUNT_KINDS, ENTRY_CLOSING_ADJUSTMENT, ENTRY_IN_KINDS, ENTRY_KIND_LABELS, ENTRY_OUT_KINDS, KIND_BANK, KIND_CARD,
    KIND_CASH, PAYABLE_CANCELED, PAYABLE_OPEN, PAYABLE_PAID, AccountEntry, AccountTransfer, FinancialAccount, MonthClosing,
    Payable,
)
from app.models.sale import Payment, PaymentMethod, Sale
from app.models.sale_return import SaleReturn
from app.models.store import Store
from app.models.supplier import Supplier
from app.models.user import User
from app.services.money_ledger import VALID_STATUS, br_day

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
CARD_FEE_CATEGORY = "Taxa da maquininha"
CARD_RULE_TEXT = "Cartão cai no próximo dia útil: venda de segunda a quinta cai no dia seguinte; sexta, sábado e domingo caem na segunda."


def card_expected_date(sale_day: date) -> date:
    """Dia em que o cartão cai no banco: segunda a quinta no dia seguinte; sexta, sábado e domingo na segunda (feriado não conta)."""
    wd = sale_day.weekday()          # 0 = segunda
    if wd <= 3:
        return sale_day + timedelta(days=1)
    if wd == 4:
        return sale_day + timedelta(days=3)
    if wd == 5:
        return sale_day + timedelta(days=2)
    return sale_day + timedelta(days=1)   # domingo


KIND_LABEL = {KIND_CASH: "Gaveta", KIND_BANK: "Banco", KIND_CARD: "Maquininha a receber"}


class FinanceError(ValueError):
    """Recusado (400): a mensagem é mostrada à pessoa."""


class FinanceConflict(FinanceError):
    """Estado não permite (409)."""


class FinanceNotFound(FinanceError):
    pass


def _q(v: Any) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def as_int(value: Any, label: str, *, required: bool = True) -> int:
    """Id vindo do corpo da requisição: texto, lista ou lixo vira 400 com frase, nunca 500."""
    if value is None or value == "" or value is False:
        if required:
            raise FinanceError(f"Escolha {label}.")
        return 0
    if isinstance(value, bool) or isinstance(value, (list, dict)):
        raise FinanceError(f"Escolha {label}.")
    try:
        n = int(str(value).strip())
    except Exception:
        raise FinanceError(f"Escolha {label}.")
    if n <= 0 or n > 2_147_483_647:
        raise FinanceError(f"Escolha {label}.")
    return n


def money(value: Any, label: str, *, allow_zero: bool = False, allow_negative: bool = False) -> Decimal:
    try:
        v = Decimal(str(value).replace(",", ".")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        raise FinanceError(f"{label}: valor inválido.")
    if not v.is_finite():
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

    async def _sales_by_method(self, tenant_id: int, start: datetime, end: Optional[datetime] = None) -> Dict[str, Decimal]:
        conds = [Sale.tenant_id == tenant_id, Sale.status.in_(VALID_STATUS), Payment.created_at >= start,
                 Payment.status == "confirmed", Payment.is_active == True]  # noqa: E712
        if end is not None:
            conds.append(Payment.created_at < end)
        rows = (await self.db.execute(
            select(Payment.payment_method, func.coalesce(func.sum(Payment.amount), 0))
            .join(Sale, Sale.id == Payment.sale_id)
            .where(*conds)
            .group_by(Payment.payment_method)
        )).all()
        return {getattr(m, "value", m): _q(a) for m, a in rows}

    async def _payment_shares(self, sale_id: int) -> Dict[str, Decimal]:
        rows = (await self.db.execute(
            select(Payment.payment_method, func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.sale_id == sale_id, Payment.status == "confirmed", Payment.is_active == True,  # noqa: E712
            ).group_by(Payment.payment_method)
        )).all()
        # o fiado não é dinheiro: a devolução do fiado abate as parcelas (receivable_abated) e o resto sai pelas outras formas
        rows = [(getattr(m, "value", m), a) for m, a in rows if getattr(m, "value", m) != PaymentMethod.ON_ACCOUNT.value]
        total = sum((Decimal(str(a)) for _m, a in rows), D0)
        if total <= 0:
            return {PaymentMethod.CASH.value: Decimal("1")}   # venda toda no fiado já paga em parte: devolve em dinheiro
        return {m: Decimal(str(a)) / total for m, a in rows}

    async def _refunds_by_method(self, tenant_id: int, start: datetime, end: Optional[datetime] = None) -> Dict[str, Decimal]:
        """Dinheiro devolvido ao cliente, por forma (mesma regra do caixa, para todas as formas)."""
        conds = [SaleReturn.tenant_id == tenant_id, SaleReturn.status == "completed", SaleReturn.is_active == True,  # noqa: E712
                 SaleReturn.created_at >= start, Sale.status.in_(VALID_STATUS)]
        if end is not None:
            conds.append(SaleReturn.created_at < end)
        returns = (await self.db.execute(
            select(SaleReturn, Sale.id).join(Sale, Sale.id == SaleReturn.sale_id).where(*conds)
        )).all()
        out: Dict[str, Decimal] = {}
        for r, sale_id in returns:
            if r.exchange_sale_id:
                net = _q(r.net_amount) if r.net_amount is not None else D0
                if net < 0 and r.settlement_method:
                    out[r.settlement_method] = out.get(r.settlement_method, D0) + (-net)
                continue
            method = (r.refund_method or "original").lower()
            money_back = _q(r.total_refund) - _q(getattr(r, "receivable_abated", 0))
            if method == "store_credit" or money_back <= 0:
                continue
            if method == "original":
                for m, share in (await self._payment_shares(sale_id)).items():
                    out[m] = out.get(m, D0) + money_back * share
            else:
                out[method] = out.get(method, D0) + money_back
        return {m: _q(v) for m, v in out.items()}

    async def _cash_register_net(self, tenant_id: int, start: datetime, end: Optional[datetime] = None) -> Decimal:
        conds = [CashMovement.tenant_id == tenant_id, CashMovement.created_at >= start, CashMovement.is_active == True,  # noqa: E712
                 CashMovement.transfer_id.is_(None)]   # ligado a uma transferência: o saldo já conta a transferência
        if end is not None:
            conds.append(CashMovement.created_at < end)
        rows = (await self.db.execute(
            select(CashMovement.kind, func.coalesce(func.sum(CashMovement.amount), 0)).where(*conds)
            .group_by(CashMovement.kind)
        )).all()
        totals = {k: _q(a) for k, a in rows}
        return totals.get(KIND_SUPPLY, D0) - totals.get(KIND_WITHDRAWAL, D0)

    async def flows(self, tenant_id: int, start_day: date, end_day: Optional[date] = None) -> Dict[str, Any]:
        """Tudo o que entrou e saiu de cada conta de start_day até ANTES de end_day (None = até agora).

        Devolve {"accounts": [FinancialAccount], "by_account": {id: {chave: Decimal}}, "sales"/"refunds"/"fiado":
        {forma: Decimal}}. Saldo = saldo de partida + net(by_account[id]).
        """
        accounts = await self._accounts(tenant_id)
        start = day_start_utc(start_day)
        end = day_start_utc(end_day) if end_day is not None else None
        sales = await self._sales_by_method(tenant_id, start, end)
        refunds = await self._refunds_by_method(tenant_id, start, end)
        register = await self._cash_register_net(tenant_id, start, end)
        from app.services.receivable_service import ReceivableService
        fiado = await ReceivableService(self.db).received_by_method(tenant_id, start_day, end_day)
        ids = [a.id for a in accounts]

        def day_range(col):
            return [col >= start_day] + ([col < end_day] if end_day is not None else [])

        transfers = (await self.db.execute(
            select(AccountTransfer).where(AccountTransfer.tenant_id == tenant_id, AccountTransfer.is_active == True,  # noqa: E712
                                          or_(AccountTransfer.from_account_id.in_(ids), AccountTransfer.to_account_id.in_(ids)),
                                          *day_range(AccountTransfer.occurred_on))
        )).scalars().all() if ids else []
        paid = dict((await self.db.execute(
            select(Payable.paid_account_id, func.coalesce(func.sum(Payable.amount), 0)).where(
                Payable.tenant_id == tenant_id, Payable.status == PAYABLE_PAID, Payable.is_active == True,  # noqa: E712
                Payable.paid_account_id.is_not(None), *day_range(Payable.paid_on),
            ).group_by(Payable.paid_account_id)
        )).all())
        expenses = dict((await self.db.execute(
            select(Expense.account_id, func.coalesce(func.sum(Expense.amount), 0)).where(
                Expense.tenant_id == tenant_id, Expense.is_active == True, Expense.account_id.is_not(None),  # noqa: E712
                Expense.payable_id.is_(None),   # nascida do pagamento de uma despesa a pagar: o pagamento já tirou da conta
                *day_range(Expense.expense_date),
            ).group_by(Expense.account_id)
        )).all())
        entries = (await self.db.execute(
            select(AccountEntry.account_id, AccountEntry.kind, func.coalesce(func.sum(AccountEntry.amount), 0)).where(
                AccountEntry.tenant_id == tenant_id, AccountEntry.is_active == True,  # noqa: E712
                *day_range(AccountEntry.occurred_on),
            ).group_by(AccountEntry.account_id, AccountEntry.kind)
        )).all()

        by_account: Dict[int, Dict[str, Decimal]] = {}
        for a in accounts:
            key = "pix" if a.receives_pix else a.kind
            methods = [m for m, k in METHOD_TO_KIND.items() if k == key]
            if a.kind == KIND_CASH:
                methods = [m for m, k in METHOD_TO_KIND.items() if k == KIND_CASH]
            mine = [(k, _q(v)) for acc, k, v in entries if acc == a.id]
            by_account[a.id] = {
                "sales": _q(sum((sales.get(m, D0) for m in methods), D0)),
                "receivables_received": _q(sum((fiado.get(m, D0) for m in methods), D0)),
                "refunds": _q(sum((refunds.get(m, D0) for m in methods), D0)),
                "cash_register": register if a.kind == KIND_CASH else D0,
                "transfers_in": _q(sum((_q(t.amount) for t in transfers if t.to_account_id == a.id), D0)),
                "transfers_out": _q(sum((_q(t.amount) for t in transfers if t.from_account_id == a.id), D0)),
                "payables_paid": _q(paid.get(a.id, 0)),
                "expenses_paid": _q(expenses.get(a.id, 0)),
                "other_in": _q(sum((v for k, v in mine if k in ENTRY_IN_KINDS), D0)),
                "other_out": _q(sum((v for k, v in mine if k in ENTRY_OUT_KINDS), D0)),
                "closing_adjustments": _q(sum((v for k, v in mine if k == ENTRY_CLOSING_ADJUSTMENT), D0)),
            }
        return {"accounts": accounts, "by_account": by_account, "sales": sales, "refunds": refunds, "fiado": fiado}

    @staticmethod
    def net(b: Dict[str, Decimal]) -> Decimal:
        """Quanto a conta mudou com estes movimentos."""
        return _q(b["sales"] + b["receivables_received"] - b["refunds"] + b["cash_register"] + b["transfers_in"]
                  - b["transfers_out"] - b["payables_paid"] - b["expenses_paid"] + b["other_in"] - b["other_out"]
                  + b["closing_adjustments"])

    async def balances_at(self, tenant_id: int, day: Optional[date]) -> Dict[int, Decimal]:
        """Saldo de cada conta no COMEÇO do dia `day` (None = agora)."""
        store = await self._store(tenant_id)
        if store.finance_start_date is None:
            return {}
        if day is not None and day <= store.finance_start_date:
            return {a.id: _q(a.opening_balance) for a in await self._accounts(tenant_id)}
        f = await self.flows(tenant_id, store.finance_start_date, day)
        return {a.id: _q(_q(a.opening_balance) + self.net(f["by_account"][a.id])) for a in f["accounts"]}

    async def balances(self, tenant_id: int) -> Dict[str, Any]:
        store = await self._store(tenant_id)
        if store.finance_start_date is None:
            return {"started": False, "start_date": None, "accounts": [], "total": 0.0}
        f = await self.flows(tenant_id, store.finance_start_date)
        out = []
        for a in f["accounts"]:
            b = f["by_account"][a.id]
            balance = _q(_q(a.opening_balance) + self.net(b))
            out.append({
                "id": a.id, "name": a.name, "kind": a.kind, "kind_label": KIND_LABEL[a.kind],
                "receives_pix": bool(a.receives_pix), "balance": float(balance),
                "opening_balance": float(_q(a.opening_balance)),
                "breakdown": {"opening": float(_q(a.opening_balance)), **{k: float(v) for k, v in b.items()}},
            })
        return {
            "started": True, "start_date": store.finance_start_date.isoformat(), "accounts": out,
            "total": float(_q(sum((Decimal(str(x["balance"])) for x in out), D0))),
        }

    async def projection(self, tenant_id: int, balances: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """"E se eu receber todo o fiado?": dinheiro de hoje nas contas + fiado a receber - despesas e contas a pagar em aberto.
        Só suposição (nada é gravado): o fiado real entra nas contas quando a cliente paga."""
        from app.services.receivable_service import ReceivableService
        bal = balances if balances is not None else await self.balances(tenant_id)
        now = _q(bal.get("total", 0))
        rec = await ReceivableService(self.db).summary(tenant_id)
        pays = await self.list_payables(tenant_id)
        open_fiado, overdue = _q(rec["open_total"]), _q(rec["overdue_total"])
        to_pay = _q(pays["open_total"])
        return {
            "money_now": float(now),
            "fiado_open": float(open_fiado), "fiado_overdue": float(overdue), "fiado_customers": rec["customers"],
            "payables_open": float(to_pay),
            "if_overdue_received": float(_q(now + overdue)),
            "if_all_received": float(_q(now + open_fiado)),
            "after_paying_everything": float(_q(now + open_fiado - to_pay)),
        }

    # ── maquininha: quando cai no banco e repasse com taxa ───────────────────
    async def card_schedule(self, tenant_id: int) -> Optional[Dict[str, Any]]:
        """Previsão de quando o dinheiro do cartão cai no banco (regra: próximo dia útil). É só previsão: o repasse real
        é lançado pela pessoa, olhando o extrato. O que já foi repassado (e a taxa) abate primeiro o saldo anterior e depois
        os dias mais antigos; devolução no cartão abate os dias mais novos."""
        store = await self._store(tenant_id)
        if store.finance_start_date is None:
            return None
        accs = await self._accounts(tenant_id)
        card = next((a for a in accs if a.kind == KIND_CARD), None)
        if card is None:
            return None
        f = await self.flows(tenant_id, store.finance_start_date)
        b = f["by_account"][card.id]
        balance = _q(_q(card.opening_balance) + self.net(b))
        methods = [PaymentMethod(m) for m, k in METHOD_TO_KIND.items() if k == KIND_CARD]
        rows = (await self.db.execute(
            select(Payment.created_at, Payment.amount).join(Sale, Sale.id == Payment.sale_id).where(
                Sale.tenant_id == tenant_id, Sale.status.in_(VALID_STATUS),
                Payment.created_at >= day_start_utc(store.finance_start_date),
                Payment.status == "confirmed", Payment.is_active == True, Payment.payment_method.in_(methods),  # noqa: E712
            )
        )).all()
        by_day: Dict[date, Decimal] = {}
        for created, amount in rows:
            d = card_expected_date(br_day(created))
            by_day[d] = by_day.get(d, D0) + _q(amount)
        # devolução no cartão: abate os dias mais novos
        refund = _q(b["refunds"])
        for d in sorted(by_day, reverse=True):
            if refund <= 0:
                break
            cut = min(by_day[d], refund)
            by_day[d] -= cut
            refund -= cut
        # o que já saiu da linha (repasse, taxa, outras saídas) abate primeiro o saldo anterior e depois os dias mais antigos
        out = _q(b["transfers_out"] + b["expenses_paid"] + b["payables_paid"] + b["other_out"])
        previous = _q(card.opening_balance)
        cut = min(previous, out)
        previous -= cut
        out -= cut
        for d in sorted(by_day):
            if out <= 0:
                break
            cut = min(by_day[d], out)
            by_day[d] -= cut
            out -= cut
        items_total = sum((v for v in by_day.values() if v > 0), D0)
        previous = _q(balance - items_total)          # o que sobra do saldo é "anterior" (inclui lançamentos avulsos)
        today = today_brazil()
        names = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
        items = [{"expected_on": d.isoformat(), "weekday": names[d.weekday()], "amount": float(_q(v)),
                  "status": "overdue" if d < today else "today" if d == today else "future"}
                 for d, v in sorted(by_day.items()) if _q(v) > 0]
        due_now = _q(max(previous, D0) + sum((Decimal(str(i["amount"])) for i in items if i["status"] != "future"), D0))
        pix = next((a for a in accs if a.receives_pix), None) or next((a for a in accs if a.kind == KIND_BANK), None)
        return {"account_id": card.id, "balance": float(balance), "previous": float(previous), "items": items,
                "due_now": float(due_now), "bank_account_id": pix.id if pix else None, "bank_name": pix.name if pix else None,
                "rule": CARD_RULE_TEXT}

    async def _fee_category_id(self, tenant_id: int) -> int:
        from app.models.expense import ExpenseCategory
        found = (await self.db.execute(select(ExpenseCategory.id).where(
            ExpenseCategory.name == CARD_FEE_CATEGORY, ExpenseCategory.is_active == True,  # noqa: E712
            or_(ExpenseCategory.tenant_id == tenant_id, ExpenseCategory.tenant_id.is_(None)),
        ).order_by(ExpenseCategory.tenant_id.is_not(None).desc()))).scalars().first()
        if found:
            return found
        cat = ExpenseCategory(name=CARD_FEE_CATEGORY, color="#64748b", icon="card-outline", tenant_id=tenant_id)
        self.db.add(cat)
        await self.db.flush()
        return cat.id

    async def settle_card(self, tenant_id: int, user: User, data: Dict[str, Any]) -> Dict[str, Any]:
        """Repasse da maquininha: `gross` = valor das vendas que saem da linha do cartão, `received` = o que caiu no banco.
        Se a loja repassa a taxa para a cliente, received costuma ser igual a gross. Qualquer diferença (gross - received)
        vira a despesa "Taxa da maquininha", paga pela linha do cartão (entra no resultado do mês)."""
        store = await self._require_started(tenant_id)
        accs = await self._accounts(tenant_id)
        card = next((a for a in accs if a.kind == KIND_CARD), None)
        if card is None:
            raise FinanceError("Esta loja não tem a conta da maquininha.")
        dst_id = data.get("to_account_id")
        dst = await self._account(tenant_id, as_int(dst_id, "a conta")) if dst_id else (
            next((a for a in accs if a.receives_pix), None) or next((a for a in accs if a.kind == KIND_BANK), None))
        if dst is None or dst.kind != KIND_BANK:
            raise FinanceError("Escolha o banco onde o dinheiro caiu.")
        gross = money(data.get("gross"), "Valor das vendas")
        received = money(data.get("received"), "Valor que caiu no banco")
        if received > gross:
            raise FinanceError("O valor que caiu no banco não pode ser maior que o das vendas.")
        day = parse_day(data.get("occurred_on") or today_brazil(), "Data")
        if day < store.finance_start_date:
            raise FinanceError("A data não pode ser antes de quando o app começou a contar.")
        await self.ensure_open_month(tenant_id, day)
        await self._store(tenant_id, lock=True)     # dois repasses juntos não passam do saldo
        bal = await self.balances(tenant_id)
        have = Decimal(str(next(a["balance"] for a in bal["accounts"] if a["id"] == card.id)))
        if gross > have:
            raise FinanceError(f"A maquininha tem só R$ {have:.2f} a receber.".replace(".", ","))
        fee = _q(gross - received)
        t = AccountTransfer(
            tenant_id=tenant_id, from_account_id=card.id, to_account_id=dst.id, occurred_on=day, amount=received,
            created_by_name=_who(user), description="Repasse da maquininha")
        self.db.add(t)
        await self.db.flush()
        if fee > 0:
            self.db.add(Expense(
                tenant_id=tenant_id, amount=fee, description="Taxa da maquininha", expense_date=day, account_id=card.id,
                category_id=await self._fee_category_id(tenant_id), notes=f"repasse:{t.id}"))
        await self.db.commit()
        return {"fee": float(fee), "balances": await self.balances(tenant_id), "card": await self.card_schedule(tenant_id)}

    # ── implantação ─────────────────────────────────────────────────────────
    async def setup(self, tenant_id: int, user: User, data: Dict[str, Any]) -> Dict[str, Any]:
        """Grava tudo ou nada: data de corte, gaveta, bancos, maquininha a receber e contas a pagar que já existem."""
        store = await self._store(tenant_id, lock=True)
        if store.finance_start_date is not None:
            raise FinanceConflict("O financeiro desta loja já foi implantado. Ajuste pelas contas e pelas contas a pagar.")
        start = parse_day(data.get("start_date") or today_brazil(), "Contar a partir de")

        cash = money(data.get("cash_balance", 0), "Dinheiro na gaveta", allow_zero=True)
        card = money(data.get("card_balance", 0), "Cartão a receber da maquininha", allow_zero=True)
        banks_in = data.get("banks") or []
        if not isinstance(banks_in, list) or len(banks_in) > 10:
            raise FinanceError("Informe no máximo 10 contas de banco.")
        banks = []
        names = set()
        for i, b in enumerate(banks_in, start=1):
            if not isinstance(b, dict):
                raise FinanceError(f"Banco {i}: informe o nome e o saldo.")
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
            if it is not None and not isinstance(it, dict):
                raise FinanceError(f"Conta {i}: informe a descrição, o valor e o vencimento.")
            out.append(await self._build_payable(tenant_id, it or {}, origin=origin, label=f"Conta {i}"))
        return out

    async def _build_payable(self, tenant_id: int, it: Dict[str, Any], *, origin: str, label: str) -> Payable:
        desc = str(it.get("description") or "").strip()[:200]
        supplier_id = it.get("supplier_id")
        if supplier_id is not None:
            supplier_id = as_int(supplier_id, "o fornecedor")
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
        src = await self._account(tenant_id, as_int(data.get("from_account_id"), "a conta de origem"))
        dst = await self._account(tenant_id, as_int(data.get("to_account_id"), "a conta de destino"))
        if src.id == dst.id:
            raise FinanceError("Escolha contas diferentes.")
        day = parse_day(data.get("occurred_on") or today_brazil(), "Data")
        if day < store.finance_start_date:
            raise FinanceError("A data não pode ser antes da implantação.")
        await self.ensure_open_month(tenant_id, day)
        amount = money(data.get("amount"), "Valor")
        await self._store(tenant_id, lock=True)     # duas saídas juntas não passam do saldo
        bal = await self.balances(tenant_id)
        have = Decimal(str(next(a["balance"] for a in bal["accounts"] if a["id"] == src.id)))
        warning = None
        if amount > have:
            have_txt = f"{have:.2f}".replace(".", ",")
            if src.kind in (KIND_CASH, KIND_CARD):
                raise FinanceError(f"A conta {src.name} só tem R$ {have_txt}.")
            warning = (f"A conta {src.name} ficou negativa (tinha R$ {have_txt}). "
                       "Confira se falta lançar alguma entrada.")
        self.db.add(AccountTransfer(
            tenant_id=tenant_id, from_account_id=src.id, to_account_id=dst.id, occurred_on=day,
            amount=amount, created_by_name=_who(user),
            description=(str(data.get("description") or "").strip()[:200] or f"{src.name} para {dst.name}"),
        ))
        await self.db.commit()
        result = await self.balances(tenant_id)
        if warning:
            result["warning"] = warning
        return result

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
        acc = await self._account(tenant_id, as_int(data.get("account_id"), "a conta"))
        day = parse_day(data.get("paid_on") or today_brazil(), "Data do pagamento")
        if day < store.finance_start_date:
            raise FinanceError("A data do pagamento não pode ser antes da implantação.")
        await self.ensure_open_month(tenant_id, day)
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
        if p.paid_on:
            await self.ensure_open_month(tenant_id, p.paid_on)
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
        await self.ensure_open_month(tenant_id, t.occurred_on)
        t.is_active = False
        self.db.add(t)
        await self.db.execute(update(Expense).where(
            Expense.tenant_id == tenant_id, Expense.notes == f"repasse:{t.id}", Expense.is_active == True,  # noqa: E712
        ).values(is_active=False))
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

    # ── fase 2: retiradas, empréstimos, fatura do cartão (não são despesa) ───────
    async def ensure_open_month(self, tenant_id: int, day: date) -> None:
        """Mês já fechado não recebe lançamento novo (o fechamento é uma fotografia): reabra o mês primeiro."""
        closed = (await self.db.execute(select(MonthClosing.id).where(
            MonthClosing.tenant_id == tenant_id, MonthClosing.is_active == True,  # noqa: E712
            MonthClosing.year == day.year, MonthClosing.month == day.month,
        ))).first()
        if closed:
            raise FinanceConflict(f"{day.month:02d}/{day.year} já foi fechado. Para lançar nele, reabra o mês no Fechamento.")

    def _entry_public(self, e: AccountEntry, names: Dict[int, str]) -> Dict[str, Any]:
        direction = "in" if e.kind in ENTRY_IN_KINDS else "out" if e.kind in ENTRY_OUT_KINDS else "adjust"
        return {
            "id": e.id, "kind": e.kind, "kind_label": ENTRY_KIND_LABELS.get(e.kind, e.kind), "direction": direction,
            "amount": float(_q(e.amount)), "occurred_on": e.occurred_on.isoformat(), "account_id": e.account_id,
            "account_name": names.get(e.account_id), "person": e.person, "description": e.description,
            "created_by_name": e.created_by_name, "closing_id": e.closing_id,
        }

    @staticmethod
    def _person_key(name: Optional[str]) -> str:
        import unicodedata
        s = unicodedata.normalize("NFKD", (name or "").strip().lower())
        return " ".join("".join(c for c in s if not unicodedata.combining(c)).split())

    async def loans(self, tenant_id: int) -> Dict[str, Any]:
        """Empréstimos por pessoa: o que a loja emprestou e ainda vai receber, e o que pegou e ainda deve."""
        rows = (await self.db.execute(select(AccountEntry).where(
            AccountEntry.tenant_id == tenant_id, AccountEntry.is_active == True,  # noqa: E712
            AccountEntry.kind.in_(("loan_given", "loan_repaid", "loan_taken", "loan_paid")),
        ).order_by(AccountEntry.occurred_on, AccountEntry.id))).scalars().all()
        people: Dict[str, Dict[str, Any]] = {}
        for e in rows:
            key = self._person_key(e.person)
            p = people.setdefault(key, {"person": e.person or "Sem nome", "given": D0, "repaid": D0, "taken": D0, "paid": D0})
            p[{"loan_given": "given", "loan_repaid": "repaid", "loan_taken": "taken", "loan_paid": "paid"}[e.kind]] += _q(e.amount)
        out = []
        for p in people.values():
            to_receive, to_pay = _q(p["given"] - p["repaid"]), _q(p["taken"] - p["paid"])
            out.append({"person": p["person"], "given": float(p["given"]), "repaid": float(p["repaid"]),
                        "to_receive": float(to_receive), "taken": float(p["taken"]), "paid": float(p["paid"]),
                        "to_pay": float(to_pay)})
        out.sort(key=lambda x: (-(x["to_receive"] + x["to_pay"]), x["person"].lower()))
        return {
            "people": out,
            "to_receive_total": float(_q(sum((Decimal(str(x["to_receive"])) for x in out), D0))),
            "to_pay_total": float(_q(sum((Decimal(str(x["to_pay"])) for x in out), D0))),
        }

    async def _loan_open(self, tenant_id: int, person_key: str, give_kind: str, back_kind: str,
                         exclude_id: Optional[int] = None) -> Decimal:
        rows = (await self.db.execute(select(AccountEntry.kind, AccountEntry.person, AccountEntry.amount, AccountEntry.id).where(
            AccountEntry.tenant_id == tenant_id, AccountEntry.is_active == True,  # noqa: E712
            AccountEntry.kind.in_((give_kind, back_kind)),
        ))).all()
        total = D0
        for kind, person, amount, eid in rows:
            if eid == exclude_id or self._person_key(person) != person_key:
                continue
            total += _q(amount) if kind == give_kind else -_q(amount)
        return _q(total)

    async def list_entries(self, tenant_id: int, limit: int = 100) -> List[Dict[str, Any]]:
        names = {a.id: a.name for a in await self._accounts(tenant_id)}
        rows = (await self.db.execute(select(AccountEntry).where(
            AccountEntry.tenant_id == tenant_id, AccountEntry.is_active == True,  # noqa: E712
        ).order_by(AccountEntry.occurred_on.desc(), AccountEntry.id.desc()).limit(max(1, min(int(limit), 500))))).scalars().all()
        return [self._entry_public(e, names) for e in rows]

    async def create_entry(self, tenant_id: int, user: User, data: Dict[str, Any]) -> Dict[str, Any]:
        kind = str(data.get("kind") or "")
        if kind not in ENTRY_IN_KINDS and kind not in ENTRY_OUT_KINDS:
            raise FinanceError("Escolha o tipo: retirada de sócio, empréstimo, fatura do cartão, outra entrada ou saída.")
        store = await self._store(tenant_id, lock=True)   # trava da loja: dois "recebi o empréstimo" juntos não passam do devido
        if store.finance_start_date is None:
            raise FinanceConflict("Implante o financeiro da loja primeiro (Mais > Financeiro).")
        try:
            account_id = as_int(data.get("account_id"), "a conta")
        except (TypeError, ValueError):
            raise FinanceError("Escolha a conta.")
        acc = await self._account(tenant_id, account_id)
        amount = money(data.get("amount"), "Valor")
        day = parse_day(data.get("occurred_on") or today_brazil(), "Data")
        if day < store.finance_start_date:
            raise FinanceError("A data não pode ser antes da implantação.")
        await self.ensure_open_month(tenant_id, day)
        person = (str(data.get("person") or "").strip()[:120]) or None
        description = (str(data.get("description") or "").strip()[:200]) or None
        if kind.startswith("loan_") and not person:
            raise FinanceError("Informe com quem é o empréstimo (nome da pessoa ou do banco).")
        if kind == "owner_withdrawal" and not person:
            raise FinanceError("Informe qual sócio retirou.")
        if kind in ("other_in", "other_out") and not description:
            raise FinanceError("Escreva o que foi (ex.: venda de um móvel da loja).")
        if kind in ("loan_repaid", "loan_paid"):
            give = "loan_given" if kind == "loan_repaid" else "loan_taken"
            open_amount = await self._loan_open(tenant_id, self._person_key(person), give, kind)
            if amount > open_amount:
                what = f"{person} deve R$ {open_amount:.2f}".replace(".", ",") if kind == "loan_repaid" \
                    else f"a loja deve R$ {open_amount:.2f} a {person}".replace(".", ",")
                raise FinanceError(f"Valor acima do empréstimo em aberto: {what}.")
        e = AccountEntry(tenant_id=tenant_id, account_id=acc.id, kind=kind, amount=amount, occurred_on=day,
                         person=person, description=description, created_by_name=_who(user))
        self.db.add(e)
        await self.db.commit()
        await self.db.refresh(e)
        return self._entry_public(e, {acc.id: acc.name})

    async def delete_entry(self, tenant_id: int, entry_id: int) -> Dict[str, Any]:
        await self._store(tenant_id, lock=True)
        e = (await self.db.execute(select(AccountEntry).where(
            AccountEntry.id == entry_id, AccountEntry.tenant_id == tenant_id, AccountEntry.is_active == True,  # noqa: E712
        ).with_for_update())).scalar_one_or_none()
        if e is None:
            raise FinanceNotFound("Lançamento não encontrado.")
        if e.kind == ENTRY_CLOSING_ADJUSTMENT:
            raise FinanceConflict("Este ajuste foi feito pelo fechamento do mês. Para desfazer, reabra o mês.")
        await self.ensure_open_month(tenant_id, e.occurred_on)
        if e.kind in ("loan_given", "loan_taken"):
            back = "loan_repaid" if e.kind == "loan_given" else "loan_paid"
            if await self._loan_open(tenant_id, self._person_key(e.person), e.kind, back, exclude_id=e.id) < 0:
                raise FinanceConflict("Já houve pagamento deste empréstimo. Apague primeiro o pagamento.")
        e.is_active = False
        self.db.add(e)
        await self.db.commit()
        return {"ok": True}

    # ── corrigir valores já lançados, no lugar (sem apagar e lançar de novo) ────────────────────────────
    async def _audit(self, tenant_id: int, user: Optional[User], action: str, entity: str, entity_id: int,
                     detail: Dict[str, Any]) -> None:
        from app.services.audit_service import AuditService
        await AuditService.log(self.db, action, tenant_id=tenant_id, user_id=getattr(user, "id", None),
                               user_email=getattr(user, "email", None), entity=entity, entity_id=entity_id, detail=detail)

    async def _has_closed_month(self, tenant_id: int) -> bool:
        return (await self.db.execute(select(MonthClosing.id).where(
            MonthClosing.tenant_id == tenant_id, MonthClosing.is_active == True,  # noqa: E712
        ).limit(1))).first() is not None

    async def _refuse_negative_cash(self, tenant_id: int, account_ids) -> None:
        """Gaveta e maquininha não ficam negativas (não existe dinheiro de menos na mão); banco pode."""
        bal = await self.balances(tenant_id)
        for a in bal["accounts"]:
            if a["id"] in set(account_ids) and a["kind"] in (KIND_CASH, KIND_CARD) and Decimal(str(a["balance"])) < 0:
                txt = f"{Decimal(str(a['balance'])):.2f}".replace(".", ",")
                raise FinanceError(f"Com este valor a conta {a['name']} ficaria negativa (R$ {txt}). Confira os lançamentos dela.")

    async def update_account(self, tenant_id: int, user: User, account_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Corrige o saldo de partida (o que foi digitado na implantação) e o nome do banco. Só admin."""
        await self._require_started(tenant_id)
        await self._store(tenant_id, lock=True)
        acc = await self._account(tenant_id, account_id)
        before = {"name": acc.name, "opening_balance": float(_q(acc.opening_balance))}
        opening_changed = False
        try:
            if data.get("name") is not None:
                name = str(data["name"]).strip()[:60]
                if name != acc.name:
                    if acc.kind != KIND_BANK:
                        raise FinanceError("O nome da gaveta e o da maquininha não mudam.")
                    if not name:
                        raise FinanceError("Informe o nome do banco.")
                    if any(a.id != acc.id and a.name.lower() == name.lower() for a in await self._accounts(tenant_id)):
                        raise FinanceError(f"Já existe uma conta chamada {name}.")
                    acc.name = name
            if data.get("opening_balance") is not None:
                new = money(data["opening_balance"], "Saldo de partida", allow_zero=True, allow_negative=acc.kind == KIND_BANK)
                if new != _q(acc.opening_balance):
                    if await self._has_closed_month(tenant_id):
                        raise FinanceConflict("Já existe mês fechado. O saldo de partida está dentro dessas contas: "
                                              "reabra os meses fechados (Fechamento do mês) antes de mudar.")
                    acc.opening_balance = new
                    opening_changed = True
            self.db.add(acc)
            await self.db.flush()
            if opening_changed:          # só o saldo de partida muda o dinheiro; trocar o nome não pode ser barrado por isso
                await self._refuse_negative_cash(tenant_id, {acc.id})
            await self._audit(tenant_id, user, "FINANCE_ACCOUNT_UPDATED", "financial_account", acc.id,
                              {"antes": before, "depois": {"name": acc.name, "opening_balance": float(_q(acc.opening_balance))}})
            await self.db.commit()
        except FinanceError:
            await self.db.rollback()
            raise
        return await self.balances(tenant_id)

    async def adjust_account(self, tenant_id: int, user: User, account_id: Any, data: Dict[str, Any]) -> Dict[str, Any]:
        """Ajuste de saldo (só admin): leva o saldo ATUAL da conta ao valor contado, com um lançamento de hoje
        (entrada ou saída "outra", fora do Resultado do Mês) e registro de auditoria."""
        aid = as_int(account_id, "a conta")
        reason = str(data.get("reason") or "").strip()
        if len(reason) < 5:
            raise FinanceError("Escreva o motivo do ajuste (pelo menos 5 letras).")
        target = money(data.get("target_balance"), "Saldo desejado", allow_zero=True, allow_negative=True)
        store = await self._require_started(tenant_id)
        await self._store(tenant_id, lock=True)         # dois ajustes juntos não se pisam
        acc = await self._account(tenant_id, aid)
        if acc.kind in (KIND_CASH, KIND_CARD) and target < 0:
            raise FinanceError(f"A conta {acc.name} não pode ficar negativa.")
        today = today_brazil()
        if today < store.finance_start_date:
            raise FinanceError("A data não pode ser antes da implantação.")
        await self.ensure_open_month(tenant_id, today)
        bal = await self.balances(tenant_id)
        current = Decimal(str(next(a["balance"] for a in bal["accounts"] if a["id"] == acc.id)))
        diff = _q(target - current)
        if diff == 0:
            raise FinanceError("O saldo já é esse: nada para ajustar.")
        kind = "other_in" if diff > 0 else "other_out"
        e = AccountEntry(tenant_id=tenant_id, account_id=acc.id, kind=kind, amount=abs(diff), occurred_on=today,
                         description=f"Ajuste de saldo: {reason}"[:200], created_by_name=_who(user))
        self.db.add(e)
        await self.db.flush()
        await self._audit(tenant_id, user, "FINANCE_ACCOUNT_ADJUSTED", "financial_account", acc.id, {
            "conta": acc.name, "antes": float(current), "depois": float(target), "diferenca": float(diff),
            "motivo": reason, "lancamento_id": e.id})
        await self.db.commit()
        result = await self.balances(tenant_id)
        if acc.kind == KIND_BANK and target < 0:
            result["warning"] = f"A conta {acc.name} ficou negativa. Confira se falta lançar alguma entrada."
        return result

    async def update_transfer(self, tenant_id: int, user: User, transfer_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Corrige valor, data ou descrição de uma transferência (as contas não mudam: para isso, apague e lance de novo)."""
        store = await self._require_started(tenant_id)
        await self._store(tenant_id, lock=True)
        t = (await self.db.execute(
            select(AccountTransfer).where(AccountTransfer.id == transfer_id, AccountTransfer.tenant_id == tenant_id,
                                          AccountTransfer.is_active == True).with_for_update()  # noqa: E712
        )).scalar_one_or_none()
        if t is None:
            raise FinanceNotFound("Transferência não encontrada.")
        if (await self.db.execute(select(CashMovement.id).where(
                CashMovement.transfer_id == t.id, CashMovement.is_active == True))).first():  # noqa: E712
            raise FinanceConflict("Esta transferência foi feita pelo caixa (retirada ou reforço) e não pode ser mudada aqui.")
        if (await self.db.execute(select(Expense.id).where(
                Expense.tenant_id == tenant_id, Expense.notes == f"repasse:{t.id}", Expense.is_active == True))).first():  # noqa: E712
            raise FinanceConflict("Este é um repasse da maquininha com taxa. Apague e lance de novo, para a taxa ficar certa.")
        await self.ensure_open_month(tenant_id, t.occurred_on)
        before = {"amount": float(_q(t.amount)), "occurred_on": t.occurred_on.isoformat(), "description": t.description}
        try:
            if data.get("amount") is not None:
                t.amount = money(data["amount"], "Valor")
            if data.get("occurred_on") is not None:
                day = parse_day(data["occurred_on"], "Data")
                if day < store.finance_start_date:
                    raise FinanceError("A data não pode ser antes de quando o app começou a contar.")
                await self.ensure_open_month(tenant_id, day)
                t.occurred_on = day
            if "description" in data:
                t.description = (str(data.get("description") or "").strip()[:200]) or t.description
            self.db.add(t)
            await self.db.flush()
            await self._refuse_negative_cash(tenant_id, {t.from_account_id, t.to_account_id})
            await self._audit(tenant_id, user, "FINANCE_TRANSFER_UPDATED", "account_transfer", t.id, {
                "antes": before, "depois": {"amount": float(_q(t.amount)), "occurred_on": t.occurred_on.isoformat(), "description": t.description}})
            await self.db.commit()
        except FinanceError:
            await self.db.rollback()
            raise
        return await self.balances(tenant_id)

    async def update_payable(self, tenant_id: int, user: User, payable_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Corrige o que é, o valor, o vencimento e a observação. Conta paga: o dinheiro e a despesa acompanham o novo valor."""
        await self._require_started(tenant_id)
        p = await self._payable(tenant_id, payable_id, lock=True)
        if p.status == PAYABLE_CANCELED:
            raise FinanceConflict("Conta cancelada não pode ser mudada.")
        if p.status == PAYABLE_PAID and p.paid_on:
            await self.ensure_open_month(tenant_id, p.paid_on)
        before = {"description": p.description, "amount": float(_q(p.amount)), "due_date": p.due_date.isoformat(), "notes": p.notes}
        try:
            if data.get("description") is not None:
                desc = str(data["description"]).strip()[:200]
                if not desc:
                    raise FinanceError("Informe o que é (ex.: boleto do fornecedor, aluguel).")
                p.description = desc
            if data.get("amount") is not None:
                p.amount = money(data["amount"], "Valor")
            if data.get("due_date") is not None:
                p.due_date = parse_day(data["due_date"], "Vencimento", allow_future=True)
            if "notes" in data:
                p.notes = (str(data.get("notes") or "").strip()) or None
            self.db.add(p)
            if p.status == PAYABLE_PAID:
                await self.db.execute(update(Expense).where(
                    Expense.payable_id == p.id, Expense.tenant_id == tenant_id, Expense.is_active == True,  # noqa: E712
                ).values(amount=_q(p.amount), description=p.description[:200], notes=p.notes))
            await self.db.flush()
            if p.status == PAYABLE_PAID and p.paid_account_id:
                await self._refuse_negative_cash(tenant_id, {p.paid_account_id})
            await self._audit(tenant_id, user, "FINANCE_PAYABLE_UPDATED", "payable", p.id, {
                "antes": before, "depois": {"description": p.description, "amount": float(_q(p.amount)),
                                            "due_date": p.due_date.isoformat(), "notes": p.notes}})
            await self.db.commit()
        except FinanceError:
            await self.db.rollback()
            raise
        await self.db.refresh(p)
        return self._payable_public(p)

    async def update_entry(self, tenant_id: int, user: User, entry_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Corrige valor, data, conta, pessoa e descrição de uma retirada, empréstimo ou outra entrada/saída."""
        store = await self._store(tenant_id, lock=True)
        if store.finance_start_date is None:
            raise FinanceConflict("Implante o financeiro da loja primeiro (Mais > Financeiro).")
        e = (await self.db.execute(select(AccountEntry).where(
            AccountEntry.id == entry_id, AccountEntry.tenant_id == tenant_id, AccountEntry.is_active == True,  # noqa: E712
        ).with_for_update())).scalar_one_or_none()
        if e is None:
            raise FinanceNotFound("Lançamento não encontrado.")
        if e.kind == ENTRY_CLOSING_ADJUSTMENT:
            raise FinanceConflict("Este ajuste foi feito pelo fechamento do mês. Para mudar, reabra o mês.")
        await self.ensure_open_month(tenant_id, e.occurred_on)
        before = {"amount": float(_q(e.amount)), "occurred_on": e.occurred_on.isoformat(), "account_id": e.account_id,
                  "person": e.person, "description": e.description}
        old_account = e.account_id
        is_loan = e.kind.startswith("loan_")
        try:
            if data.get("account_id") is not None:
                e.account_id = (await self._account(tenant_id, as_int(data["account_id"], "a conta"))).id
            amount = money(data["amount"], "Valor") if data.get("amount") is not None else _q(e.amount)
            if data.get("occurred_on") is not None:
                day = parse_day(data["occurred_on"], "Data")
                if day < store.finance_start_date:
                    raise FinanceError("A data não pode ser antes da implantação.")
                await self.ensure_open_month(tenant_id, day)
                e.occurred_on = day
            if "person" in data:
                person = (str(data.get("person") or "").strip()[:120]) or None
                if is_loan and self._person_key(person) != self._person_key(e.person):
                    raise FinanceError("Para trocar a pessoa de um empréstimo, apague o lançamento e lance de novo.")
                e.person = person
            if "description" in data:
                e.description = (str(data.get("description") or "").strip()[:200]) or None
            if e.kind == "owner_withdrawal" and not e.person:
                raise FinanceError("Informe qual sócio retirou.")
            if e.kind in ("other_in", "other_out") and not e.description:
                raise FinanceError("Escreva o que foi (ex.: venda de um móvel da loja).")
            key = self._person_key(e.person)
            if e.kind in ("loan_given", "loan_taken"):
                back = "loan_repaid" if e.kind == "loan_given" else "loan_paid"
                paid = -(await self._loan_open(tenant_id, key, e.kind, back, exclude_id=e.id))
                if amount < paid:
                    txt = f"{paid:.2f}".replace(".", ",")
                    raise FinanceError(f"Já foram pagos R$ {txt} deste empréstimo: o valor não pode ser menor. Apague primeiro o pagamento.")
            elif e.kind in ("loan_repaid", "loan_paid"):
                give = "loan_given" if e.kind == "loan_repaid" else "loan_taken"
                open_amount = await self._loan_open(tenant_id, key, give, e.kind, exclude_id=e.id)
                if amount > open_amount:
                    txt = f"{open_amount:.2f}".replace(".", ",")
                    raise FinanceError(f"Valor acima do empréstimo em aberto (R$ {txt}).")
            e.amount = amount
            self.db.add(e)
            await self.db.flush()
            await self._refuse_negative_cash(tenant_id, {old_account, e.account_id})
            await self._audit(tenant_id, user, "FINANCE_ENTRY_UPDATED", "account_entry", e.id, {
                "antes": before, "depois": {"amount": float(_q(e.amount)), "occurred_on": e.occurred_on.isoformat(),
                                            "account_id": e.account_id, "person": e.person, "description": e.description}})
            await self.db.commit()
        except FinanceError:
            await self.db.rollback()
            raise
        await self.db.refresh(e)
        names = {a.id: a.name for a in await self._accounts(tenant_id)}
        return self._entry_public(e, names)
