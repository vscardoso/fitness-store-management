"""Aprovação dos administradores para mexer no saldo de um banco.

Regra da loja: nenhum administrador mexe sozinho no saldo de um banco depois de lançado. Corrigir saldo, saldo de partida,
apagar ou corrigir transferência, lançamento (retirada, empréstimo, ajuste) ou conta paga que envolve um banco NÃO é aplicado
na hora: `gate()` guarda um pedido (com o motivo, escrito por quem pediu) e avisa os outros administradores. A mudança só é
aplicada quando TODOS os administradores ativos aprovaram (quem pediu já conta como sim, se for administrador); qualquer
recusa cancela o pedido; pedido parado vence em 7 dias. Venda, despesa nova, pagamento e repasse normal não passam por aqui.

O que fica para depois (e está dito na tela de ajuda): cancelar venda ou devolução de PIX, excluir compra paga pelo banco.
"""
import json
import logging
from types import SimpleNamespace
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import (
    APPROVAL_APPROVED, APPROVAL_CANCELED, APPROVAL_EXPIRED, APPROVAL_FAILED, APPROVAL_PENDING, APPROVAL_REJECTED,
    KIND_BANK, KIND_CASH, AccountEntry, AccountTransfer, FinanceApproval, FinanceApprovalVote, FinancialAccount, Payable,
    PAYABLE_PAID,
)
from app.models.user import User, UserRole
from app.services.finance_service import (
    FinanceConflict, FinanceError, FinanceNotFound, FinanceService, _q, as_int, money, parse_day,
)

logger = logging.getLogger(__name__)

APPROVAL_DAYS = 7
MIN_REASON = 20
# gaveta: diferença de contagem até este valor só pede o motivo; acima disso outro administrador precisa aprovar
DRAWER_TOLERANCE = Decimal("10.00")
RULE_ALL = "all_admins"
RULE_ONE_OTHER = "one_other"

# o que cada pedido faz, em palavras (aparece na tela e no aviso do celular)
OP_TITLE = {
    "account_adjust": "Corrigir saldo",
    "account_opening": "Corrigir saldo de partida",
    "transfer_update": "Corrigir transferência",
    "transfer_delete": "Apagar transferência",
    "entry_update": "Corrigir lançamento",
    "entry_delete": "Apagar lançamento",
    "payable_unpay": "Desfazer pagamento",
    "payable_update": "Corrigir conta paga",
    "expense_update": "Corrigir despesa",
    "expense_delete": "Apagar despesa",
}


def _brl(v: Any) -> str:
    n = Decimal(str(v or 0))
    s = f"{abs(n):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-" if n < 0 else "") + "R$ " + s


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _who(user: Optional[User]) -> str:
    return (getattr(user, "full_name", None) or getattr(user, "email", None) or "Um usuário")[:120]


def _actor(user: User) -> SimpleNamespace:
    """Cópia só com o que o pedido precisa de quem está agindo. O objeto do usuário expira em qualquer rollback (ex.: a operação
    aplicada falhou) e ler um campo dele depois disso, no meio do async, dá erro; esta cópia não expira."""
    role = getattr(user, "role", None)
    return SimpleNamespace(id=user.id, email=getattr(user, "email", None), full_name=getattr(user, "full_name", None),
                           role=role.value if hasattr(role, "value") else role)


def _is_admin(user: Optional[User]) -> bool:
    role = getattr(user, "role", None)
    return (role.value if hasattr(role, "value") else str(role or "")).lower() == "admin"


class FinanceApprovalService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── quem aprova ─────────────────────────────────────────────────────────────────────────────────────────────
    async def _admins(self, tenant_id: int) -> List[User]:
        """Os administradores que APROVAM (o dono pode ser administrador só para acompanhar: `finance_approver` falso)."""
        rows = (await self.db.execute(select(User).where(
            User.tenant_id == tenant_id, User.role == UserRole.ADMIN, User.is_active == True,  # noqa: E712
            User.finance_approver == True,  # noqa: E712
        ).order_by(User.id))).scalars().all()
        return list(rows)

    async def approvers(self, tenant_id: int) -> List[Dict[str, Any]]:
        """Todos os administradores ativos e se cada um aprova (para a tela escolher quem aprova)."""
        rows = (await self.db.execute(select(User).where(
            User.tenant_id == tenant_id, User.role == UserRole.ADMIN, User.is_active == True,  # noqa: E712
        ).order_by(User.id))).scalars().all()
        return [{"user_id": u.id, "name": _who(u), "approver": bool(u.finance_approver)} for u in rows]

    async def set_approvers(self, tenant_id: int, user: User, approver_ids: List[int]) -> List[Dict[str, Any]]:
        """Escolhe quem aprova (só administrador). Pelo menos um administrador precisa aprovar."""
        if not _is_admin(user):
            raise FinanceError("Só administrador escolhe quem aprova.")
        rows = (await self.db.execute(select(User).where(
            User.tenant_id == tenant_id, User.role == UserRole.ADMIN, User.is_active == True))).scalars().all()  # noqa: E712
        ids = {int(i) for i in approver_ids}
        if not ids & {u.id for u in rows}:
            raise FinanceError("Escolha pelo menos um administrador para aprovar.")
        pending = (await self.db.execute(select(FinanceApproval.id).where(
            FinanceApproval.tenant_id == tenant_id, FinanceApproval.status == APPROVAL_PENDING))).first()
        if pending:
            raise FinanceConflict("Há pedido esperando aprovação. Decida ou cancele os pedidos antes de mudar quem aprova.")
        antes = {u.id: bool(u.finance_approver) for u in rows}
        for u in rows:
            u.finance_approver = u.id in ids
            self.db.add(u)
        from app.services.audit_service import AuditService
        await AuditService.log(self.db, "FINANCE_APPROVERS_CHANGED", tenant_id=tenant_id, user_id=user.id, user_email=user.email,
                               entity="user", entity_id=user.id,
                               detail={"antes": antes, "depois": {u.id: u.id in ids for u in rows}})
        await self.db.commit()
        return await self.approvers(tenant_id)

    async def _account(self, tenant_id: int, account_id: int) -> FinancialAccount:
        a = (await self.db.execute(select(FinancialAccount).where(
            FinancialAccount.id == account_id, FinancialAccount.tenant_id == tenant_id))).scalar_one_or_none()
        if a is None:
            raise FinanceNotFound("Conta não encontrada.")
        return a

    async def _names(self, tenant_id: int) -> Dict[int, FinancialAccount]:
        rows = (await self.db.execute(select(FinancialAccount).where(FinancialAccount.tenant_id == tenant_id))).scalars().all()
        return {a.id: a for a in rows}

    # ── o pedido: o que muda, em quais contas, e se envolve banco ────────────────────────────────────────────────
    async def _context(self, tenant_id: int, op: str, key: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """None = não mexe em banco (aplica direto). Senão: resumo, conta principal e valor para mostrar."""
        accs = await self._names(tenant_id)
        brl = _brl

        def bank(*ids) -> bool:
            return any(i in accs and accs[i].kind == KIND_BANK for i in ids if i)

        if op == "account_adjust":
            acc = accs.get(as_int(key, "a conta"))
            if acc is None:
                raise FinanceNotFound("Conta não encontrada.")
            if acc.kind not in (KIND_BANK, KIND_CASH):
                return None
            target = money(data.get("target_balance"), "Saldo desejado", allow_zero=True, allow_negative=True)
            current = Decimal(str(next(a["balance"] for a in (await FinanceService(self.db).balances(tenant_id))["accounts"] if a["id"] == acc.id)))
            diff = _q(target - current)
            if diff == 0:
                raise FinanceError("O saldo já é esse: nada para ajustar.")
            if acc.kind == KIND_CASH:
                if abs(diff) <= DRAWER_TOLERANCE:
                    return None          # quebra pequena: só o motivo (a própria correção exige), sem aprovação
                return {"account_id": acc.id, "amount": diff, "extra": {"diff": str(diff), "current_at_request": str(current)},
                        "rule": RULE_ONE_OTHER, "kind": KIND_CASH,
                        "summary": f"Acertar a gaveta de {brl(current)} para {brl(target)} ({'+' if diff > 0 else '−'} {brl(abs(diff))})"}
            return {"account_id": acc.id, "amount": diff, "extra": {"diff": str(diff), "current_at_request": str(current)},
                    "summary": f"Corrigir o saldo do {acc.name} de {brl(current)} para {brl(target)} ({'+' if diff > 0 else '−'} {brl(abs(diff))})"}

        if op == "account_opening":
            acc = accs.get(as_int(key, "a conta"))
            if acc is None:
                raise FinanceNotFound("Conta não encontrada.")
            if acc.kind != KIND_BANK or data.get("opening_balance") is None:
                return None
            new = money(data["opening_balance"], "Saldo de partida", allow_zero=True, allow_negative=True)
            if new == _q(acc.opening_balance):
                return None
            return {"account_id": acc.id, "amount": _q(new - _q(acc.opening_balance)), "extra": {},
                    "summary": f"Corrigir o saldo de partida do {acc.name} de {brl(acc.opening_balance)} para {brl(new)}"}

        if op in ("transfer_update", "transfer_delete"):
            t = (await self.db.execute(select(AccountTransfer).where(
                AccountTransfer.id == key, AccountTransfer.tenant_id == tenant_id, AccountTransfer.is_active == True,  # noqa: E712
            ))).scalar_one_or_none()
            if t is None:
                raise FinanceNotFound("Transferência não encontrada.")
            if not bank(t.from_account_id, t.to_account_id):
                return None
            if op == "transfer_update" and data.get("amount") is None and data.get("occurred_on") is None:
                return None          # só a descrição: não mexe em saldo
            de, para = accs[t.from_account_id].name, accs[t.to_account_id].name
            main = t.to_account_id if bank(t.to_account_id) else t.from_account_id
            base = f"a transferência #{t.id} de {brl(t.amount)} de {de} para {para} (dia {t.occurred_on:%d/%m/%Y})"
            if op == "transfer_delete":
                return {"account_id": main, "amount": -_q(t.amount), "extra": {}, "summary": f"Apagar {base}"}
            novo = []
            if data.get("amount") is not None:
                novo.append(f"valor {brl(t.amount)} → {brl(money(data['amount'], 'Valor'))}")
            if data.get("occurred_on") is not None:
                novo.append(f"dia {t.occurred_on:%d/%m/%Y} → {parse_day(data['occurred_on'], 'Data'):%d/%m/%Y}")
            return {"account_id": main, "amount": None, "extra": {}, "summary": f"Corrigir {base}: " + "; ".join(novo)}

        if op in ("entry_update", "entry_delete"):
            e = (await self.db.execute(select(AccountEntry).where(
                AccountEntry.id == key, AccountEntry.tenant_id == tenant_id, AccountEntry.is_active == True,  # noqa: E712
            ))).scalar_one_or_none()
            if e is None:
                raise FinanceNotFound("Lançamento não encontrado.")
            new_acc = as_int(data["account_id"], "a conta") if (op == "entry_update" and data.get("account_id") is not None) else None
            if not bank(e.account_id, new_acc):
                return None
            if op == "entry_update" and all(data.get(k) is None for k in ("amount", "occurred_on", "account_id")):
                return None          # pessoa ou descrição: não mexe em saldo
            name = accs[e.account_id].name
            base = f"o lançamento #{e.id} ({(e.description or e.kind)[:60]}) de {brl(e.amount)} no {name} (dia {e.occurred_on:%d/%m/%Y})"
            if op == "entry_delete":
                return {"account_id": e.account_id, "amount": _q(e.amount), "extra": {}, "summary": f"Apagar {base}"}
            novo = []
            if data.get("amount") is not None:
                novo.append(f"valor {brl(e.amount)} → {brl(money(data['amount'], 'Valor'))}")
            if data.get("occurred_on") is not None:
                novo.append(f"dia {e.occurred_on:%d/%m/%Y} → {parse_day(data['occurred_on'], 'Data'):%d/%m/%Y}")
            if new_acc and new_acc != e.account_id:
                novo.append(f"conta {name} → {accs[new_acc].name if new_acc in accs else '?'}")
            return {"account_id": e.account_id, "amount": None, "extra": {}, "summary": f"Corrigir {base}: " + "; ".join(novo)}

        if op in ("payable_unpay", "payable_update"):
            p = (await self.db.execute(select(Payable).where(Payable.id == key, Payable.tenant_id == tenant_id))).scalar_one_or_none()
            if p is None:
                raise FinanceNotFound("Conta não encontrada.")
            if p.status != PAYABLE_PAID or not bank(p.paid_account_id):
                return None
            if op == "payable_update" and data.get("amount") is None:
                return None          # nome, vencimento e observação não mexem no saldo
            name = accs[p.paid_account_id].name
            base = f"a conta paga \"{p.description[:60]}\" de {brl(p.amount)} (paga pelo {name} em {p.paid_on:%d/%m/%Y})"
            if op == "payable_unpay":
                return {"account_id": p.paid_account_id, "amount": _q(p.amount), "extra": {}, "summary": f"Desfazer o pagamento de {base}"}
            return {"account_id": p.paid_account_id, "amount": None, "extra": {},
                    "summary": f"Corrigir {base}: valor {brl(p.amount)} → {brl(money(data['amount'], 'Valor'))}"}

        if op in ("expense_update", "expense_delete"):
            from app.models.expense import Expense
            x = (await self.db.execute(select(Expense).where(
                Expense.id == key, Expense.tenant_id == tenant_id, Expense.is_active == True))).scalar_one_or_none()  # noqa: E712
            if x is None:
                raise FinanceNotFound("Despesa não encontrada.")
            if x.payable_id:
                return None          # veio de uma conta paga: a própria despesa recusa e manda desfazer o pagamento (que é pedido)
            new_acc = data.get("account_id") if op == "expense_update" else None
            if not bank(x.account_id, new_acc):
                return None
            novo = []
            if op == "expense_update":
                if data.get("amount") is not None and _q(data["amount"]) != _q(x.amount):
                    novo.append(f"valor {brl(x.amount)} → {brl(_q(data['amount']))}")
                if data.get("expense_date") is not None and str(data["expense_date"])[:10] != x.expense_date.isoformat():
                    novo.append(f"dia {x.expense_date:%d/%m/%Y} → {parse_day(data['expense_date'], 'Data'):%d/%m/%Y}")
                if new_acc is not None and new_acc != x.account_id:
                    novo.append(f"conta {accs[x.account_id].name if x.account_id in accs else '?'} → {accs[new_acc].name if new_acc in accs else '?'}")
                if not novo:
                    return None          # categoria, descrição ou observação: não mexe em saldo
            where = accs[x.account_id].name if x.account_id in accs else "banco"
            base = f"a despesa \"{(x.description or '')[:60]}\" de {brl(x.amount)} paga pelo {where} (dia {x.expense_date:%d/%m/%Y})"
            if op == "expense_delete":
                return {"account_id": x.account_id, "amount": _q(x.amount), "extra": {}, "summary": f"Apagar {base}"}
            return {"account_id": x.account_id, "amount": None, "extra": {}, "summary": f"Corrigir {base}: " + "; ".join(novo)}

        raise FinanceError("Operação desconhecida.")

    async def _precheck(self, tenant_id: int, op: str, key: int) -> None:
        """Recusas que a própria operação daria na hora de aplicar: não vale gastar a aprovação de ninguém com elas."""
        if op in ("transfer_update", "transfer_delete"):
            from app.models.cash_register import CashMovement
            if (await self.db.execute(select(CashMovement.id).where(
                    CashMovement.transfer_id == key, CashMovement.is_active == True))).first():  # noqa: E712
                raise FinanceConflict("Esta transferência foi feita pelo caixa (retirada ou reforço) e não pode ser mudada aqui.")
            if op == "transfer_update":
                from app.models.expense import Expense
                if (await self.db.execute(select(Expense.id).where(
                        Expense.tenant_id == tenant_id, Expense.notes == f"repasse:{key}", Expense.is_active == True))).first():  # noqa: E712
                    raise FinanceConflict("Este é um repasse da maquininha com taxa. Apague e lance de novo, para a taxa ficar certa.")

    # ── pedir ───────────────────────────────────────────────────────────────────────────────────────────────────
    async def gate(self, tenant_id: int, user: User, op: str, key: int, data: Dict[str, Any], reason: Any,
                   rule: str = RULE_ALL) -> Optional[Dict[str, Any]]:
        try:
            return await self._gate(tenant_id, user, op, key, data, reason, rule)
        except FinanceError:
            await self.db.rollback()
            raise

    async def _gate(self, tenant_id: int, user: User, op: str, key: int, data: Dict[str, Any], reason: Any,
                    rule: str = RULE_ALL) -> Optional[Dict[str, Any]]:
        """None = pode aplicar direto (não mexe em banco, ou a loja só tem este administrador). Senão cria o pedido e o
        devolve (o endpoint responde 202). Sem motivo escrito (20 letras), recusa com 400."""
        user = _actor(user)
        ctx = await self._context(tenant_id, op, key, data)
        if ctx is None:
            return None
        await self._precheck(tenant_id, op, key)
        reason = str(reason or "").strip()
        rule = ctx.get("rule", rule)
        if len(reason) < MIN_REASON:
            if ctx.get("kind") == KIND_CASH:
                raise FinanceError("Para acertar a gaveta com uma diferença acima de R$ 10, explique o motivo com pelo menos 20 letras: o que aconteceu e como você contou o dinheiro.")
            raise FinanceError("Para mexer no saldo de um banco, explique o motivo com pelo menos 20 letras: o que aconteceu e como você conferiu (por exemplo, o extrato do banco).")
        admins = await self._admins(tenant_id)
        others = [a for a in admins if a.id != user.id]
        if _is_admin(user) and not others:
            # loja com um administrador só: ninguém mais para aprovar; o motivo fica registrado e a mudança segue
            from app.services.audit_service import AuditService
            await AuditService.log(self.db, "FINANCE_BANK_CHANGE_JUSTIFIED", tenant_id=tenant_id, user_id=user.id,
                                   user_email=user.email, entity="financial_account", entity_id=ctx["account_id"],
                                   detail={"operacao": op, "resumo": ctx["summary"], "motivo": reason})
            return None
        dedupe = f"{op}:{key}"
        pending = (await self.db.execute(select(FinanceApproval).where(
            FinanceApproval.tenant_id == tenant_id, FinanceApproval.dedupe_key == dedupe,
            FinanceApproval.status == APPROVAL_PENDING, FinanceApproval.expires_at > _now()))).scalars().first()
        if pending is not None:
            raise FinanceConflict(f"Já existe o pedido #{pending.id} para isto, esperando aprovação. Aprove ou recuse aquele pedido.")
        params = {"op": op, "key": key, "data": {k: v for k, v in data.items() if k != "reason"}, **ctx["extra"]}
        ap = FinanceApproval(
            tenant_id=tenant_id, kind=op, summary=ctx["summary"][:400], reason=reason, params=json.dumps(params, default=str),
            account_id=ctx["account_id"], amount=ctx["amount"], dedupe_key=dedupe, status=APPROVAL_PENDING, rule=rule,
            requested_by_id=user.id, requested_by_name=_who(user), expires_at=_now() + timedelta(days=APPROVAL_DAYS))
        self.db.add(ap)
        await self.db.flush()
        if _is_admin(user) and user.id in {a.id for a in admins}:       # quem pediu já conta como sim (se for aprovador)
            self.db.add(FinanceApprovalVote(tenant_id=tenant_id, approval_id=ap.id, user_id=user.id, user_name=_who(user),
                                            vote="approve", comment="Pediu a mudança"))
        await self._audit(tenant_id, user, "FINANCE_APPROVAL_REQUESTED", ap, {"resumo": ap.summary, "motivo": reason, "regra": rule})
        await self.db.commit()
        await self._notify(tenant_id, user, ("Pedido para acertar a gaveta" if ctx.get("kind") == KIND_CASH
                                             else f"Pedido para mexer no saldo do banco: {OP_TITLE.get(op, op)}"),
                           f"{_who(user)} quer: {ap.summary}. Abra e aprove ou recuse.", ap_id=ap.id)
        return await self.public(tenant_id, user, ap.id)

    # ── votar ───────────────────────────────────────────────────────────────────────────────────────────────────
    async def _load(self, tenant_id: int, approval_id: int, lock: bool = False) -> FinanceApproval:
        q = select(FinanceApproval).where(FinanceApproval.id == approval_id, FinanceApproval.tenant_id == tenant_id)
        if lock:
            q = q.with_for_update()
        ap = (await self.db.execute(q)).scalar_one_or_none()
        if ap is None:
            raise FinanceNotFound("Pedido não encontrado.")
        return ap

    async def _expire_if_needed(self, ap: FinanceApproval) -> None:
        if ap.status == APPROVAL_PENDING and _aware(ap.expires_at) <= _now():
            ap.status = APPROVAL_EXPIRED
            ap.decided_at = _now()
            ap.result_message = "Venceu sem todas as aprovações."
            self.db.add(ap)
            await self.db.commit()

    async def _votes(self, approval_id: int) -> List[FinanceApprovalVote]:
        return list((await self.db.execute(select(FinanceApprovalVote).where(
            FinanceApprovalVote.approval_id == approval_id).order_by(FinanceApprovalVote.id))).scalars().all())

    async def _required_ids(self, tenant_id: int, ap: FinanceApproval) -> List[int]:
        admins = await self._admins(tenant_id)
        return [a.id for a in admins]

    async def vote(self, tenant_id: int, user: User, approval_id: int, approve: bool, comment: Any = None) -> Dict[str, Any]:
        try:
            return await self._vote(tenant_id, user, approval_id, approve, comment)
        except FinanceError:
            await self.db.rollback()
            raise

    async def _vote(self, tenant_id: int, user: User, approval_id: int, approve: bool, comment: Any = None) -> Dict[str, Any]:
        user = _actor(user)
        if not _is_admin(user):
            raise FinanceError("Só administrador vota nos pedidos.")
        if user.id not in {a.id for a in await self._admins(tenant_id)}:
            raise FinanceError("Você acompanha os pedidos, mas não está entre os administradores que aprovam.")
        ap = await self._load(tenant_id, approval_id, lock=True)
        ap_id = ap.id
        await self._expire_if_needed(ap)
        if ap.status != APPROVAL_PENDING:
            raise FinanceConflict("Este pedido já foi decidido ou venceu.")
        votes = await self._votes(ap.id)
        if any(v.user_id == user.id for v in votes):
            raise FinanceConflict("Você já votou neste pedido.")
        comment = (str(comment or "").strip()[:500]) or None
        if not approve and (not comment or len(comment) < 5):
            raise FinanceError("Para recusar, escreva o motivo (pelo menos 5 letras).")
        self.db.add(FinanceApprovalVote(tenant_id=tenant_id, approval_id=ap.id, user_id=user.id, user_name=_who(user),
                                        vote="approve" if approve else "reject", comment=comment))
        await self.db.flush()
        if not approve:
            ap.status, ap.decided_at = APPROVAL_REJECTED, _now()
            ap.result_message = f"Recusado por {_who(user)}: {comment}"
            self.db.add(ap)
            await self._audit(tenant_id, user, "FINANCE_APPROVAL_REJECTED", ap, {"resumo": ap.summary, "motivo_da_recusa": comment})
            await self.db.commit()
            await self._notify(tenant_id, user, "Pedido de saldo recusado", f"{_who(user)} recusou: {ap.summary}. Motivo: {comment}", ap_id=ap_id)
            return await self.public(tenant_id, user, ap_id)
        approved_ids = {v.user_id for v in votes if v.vote == "approve"} | {user.id}
        required = await self._required_ids(tenant_id, ap)
        done = all(i in approved_ids for i in required) if ap.rule == RULE_ALL else len(approved_ids - {ap.requested_by_id}) >= 1
        await self._audit(tenant_id, user, "FINANCE_APPROVAL_VOTED", ap, {"resumo": ap.summary, "voto": "aprovou", "comentario": comment})
        if not done:
            await self.db.commit()
            # aprovou, mas ainda faltam outros: avisa quem pediu e quem ainda precisa votar (antes ninguém era avisado)
            admins_now = await self._admins(tenant_id)
            faltam = [a for a in admins_now if a.id in required and a.id not in approved_ids]
            nomes = ", ".join(_who(a) for a in faltam) or "ninguém"
            await self._notify(tenant_id, user, "Pedido de saldo: falta aprovar",
                               f"{_who(user)} aprovou: {ap.summary}. Falta aprovar: {nomes}.", ap_id=ap_id)
            return await self.public(tenant_id, user, ap_id)
        ap.status, ap.decided_at = APPROVAL_APPROVED, _now()
        self.db.add(ap)
        await self.db.commit()                         # o voto fica gravado ANTES de aplicar (a operação faz o próprio commit)
        await self._apply(tenant_id, ap_id)
        return await self.public(tenant_id, user, ap_id)

    async def cancel(self, tenant_id: int, user: User, approval_id: int) -> Dict[str, Any]:
        try:
            return await self._cancel(tenant_id, user, approval_id)
        except FinanceError:
            await self.db.rollback()
            raise

    async def _cancel(self, tenant_id: int, user: User, approval_id: int) -> Dict[str, Any]:
        user = _actor(user)
        ap = await self._load(tenant_id, approval_id, lock=True)
        await self._expire_if_needed(ap)
        if ap.status != APPROVAL_PENDING:
            raise FinanceConflict("Este pedido já foi decidido ou venceu.")
        if ap.requested_by_id != user.id and not _is_admin(user):
            raise FinanceError("Só quem pediu (ou um administrador) cancela o pedido.")
        ap.status, ap.decided_at, ap.result_message = APPROVAL_CANCELED, _now(), f"Cancelado por {_who(user)}."
        self.db.add(ap)
        await self._audit(tenant_id, user, "FINANCE_APPROVAL_CANCELED", ap, {"resumo": ap.summary})
        await self.db.commit()
        return await self.public(tenant_id, user, ap.id)

    # ── aplicar o que todos aprovaram ───────────────────────────────────────────────────────────────────────────
    async def _apply(self, tenant_id: int, approval_id: int) -> None:
        ap = await self._load(tenant_id, approval_id)
        params = json.loads(ap.params)
        op, key, data = params["op"], params["key"], dict(params.get("data") or {})
        summary, requester_id, reason, rule = ap.summary, ap.requested_by_id, ap.reason, ap.rule   # lidos agora: o objeto expira nas operações abaixo
        requester = (await self.db.execute(select(User).where(User.id == requester_id))).scalar_one_or_none()
        svc = FinanceService(self.db)
        try:
            if op == "account_adjust":
                # o valor relativo vale, não o saldo absoluto do dia do pedido: pode ter entrado venda nesse tempo
                current = Decimal(str(next(a["balance"] for a in (await svc.balances(tenant_id))["accounts"] if a["id"] == int(key))))
                data["target_balance"] = str(_q(current + Decimal(params["diff"])))
                data["reason"] = f"{reason} (aprovado, pedido #{approval_id})"
                await svc.adjust_account(tenant_id, requester, key, data)
            elif op == "account_opening":
                await svc.update_account(tenant_id, requester, int(key), data)
            elif op == "transfer_update":
                await svc.update_transfer(tenant_id, requester, int(key), data)
            elif op == "transfer_delete":
                await svc.delete_transfer(tenant_id, int(key))
            elif op == "entry_update":
                await svc.update_entry(tenant_id, requester, int(key), data)
            elif op == "entry_delete":
                await svc.delete_entry(tenant_id, int(key))
            elif op == "payable_unpay":
                await svc.unpay_payable(tenant_id, int(key))
            elif op == "payable_update":
                await svc.update_payable(tenant_id, requester, int(key), data)
            elif op in ("expense_update", "expense_delete"):
                from app.schemas.expense import ExpenseUpdate
                from app.services.expense_service import ExpenseService
                esvc = ExpenseService(self.db)
                if op == "expense_delete":
                    if not await esvc.delete_expense(int(key), tenant_id):
                        raise FinanceNotFound("Despesa não encontrada.")
                elif not await esvc.update_expense(int(key), ExpenseUpdate(**data), tenant_id):
                    raise FinanceNotFound("Despesa não encontrada.")
            else:
                raise FinanceError("Operação desconhecida.")
            msg, ok = ("Aplicado depois da aprovação de outro administrador." if rule == RULE_ONE_OTHER
                       else "Aplicado depois da aprovação de todos os administradores."), True
        except (FinanceError, ValueError) as e:      # a despesa recusa com ValueError simples
            await self.db.rollback()
            msg, ok = f"Aprovado, mas não foi possível aplicar: {e}", False
        except Exception as e:  # noqa: BLE001
            await self.db.rollback()
            logger.exception("Pedido de aprovação %s não aplicou", approval_id)
            msg, ok = f"Aprovado, mas deu erro ao aplicar: {e}", False
        # grava o resultado por UPDATE direto: a operação acima fez commit/rollback e o objeto do pedido pode estar expirado
        await self.db.execute(update(FinanceApproval).where(FinanceApproval.id == approval_id).values(
            status=APPROVAL_APPROVED if ok else APPROVAL_FAILED, applied_at=_now() if ok else None, result_message=msg))
        from app.services.audit_service import AuditService
        await AuditService.log(self.db, "FINANCE_APPROVAL_APPLIED" if ok else "FINANCE_APPROVAL_FAILED", tenant_id=tenant_id,
                               user_id=requester_id, entity="finance_approval", entity_id=approval_id,
                               detail={"pedido": approval_id, "resumo": summary, "resultado": msg})
        await self.db.commit()
        await self._notify(tenant_id, None, "Pedido de saldo aprovado e aplicado" if ok else "Pedido aprovado, mas não aplicou",
                           f"{summary}. {msg}", ap_id=approval_id)

    # ── mostrar ─────────────────────────────────────────────────────────────────────────────────────────────────
    async def public(self, tenant_id: int, user: User, approval_id: int) -> Dict[str, Any]:
        ap = await self._load(tenant_id, approval_id)
        await self._expire_if_needed(ap)
        return await self._public(tenant_id, user, ap)

    async def _public(self, tenant_id: int, user: User, ap: FinanceApproval) -> Dict[str, Any]:
        votes = await self._votes(ap.id)
        admins = await self._admins(tenant_id)
        by_user = {v.user_id: v for v in votes}
        waiting = [{"user_id": a.id, "name": _who(a)} for a in admins if a.id not in by_user] if ap.status == APPROVAL_PENDING else []
        can_vote = bool(ap.status == APPROVAL_PENDING and _is_admin(user) and user.id not in by_user
                        and user.id in {a.id for a in admins})
        return {
            "id": ap.id, "kind": ap.kind, "title": OP_TITLE.get(ap.kind, ap.kind), "summary": ap.summary, "reason": ap.reason,
            "status": ap.status, "rule": ap.rule, "account_id": ap.account_id,
            "amount": float(ap.amount) if ap.amount is not None else None,
            "requested_by": ap.requested_by_name, "requested_by_id": ap.requested_by_id,
            "created_at": _aware(ap.created_at).isoformat() if ap.created_at else None,
            "expires_at": _aware(ap.expires_at).isoformat(),
            "decided_at": _aware(ap.decided_at).isoformat() if ap.decided_at else None,
            "result_message": ap.result_message,
            "votes": [{"user_id": v.user_id, "name": v.user_name, "vote": v.vote, "comment": v.comment,
                       "at": _aware(v.created_at).isoformat() if v.created_at else None} for v in votes],
            "waiting_for": waiting, "can_vote": can_vote,
            "can_cancel": bool(ap.status == APPROVAL_PENDING and (ap.requested_by_id == user.id or _is_admin(user))),
            "approved_count": sum(1 for v in votes if v.vote == "approve"), "admins_total": len(admins),
        }

    async def list(self, tenant_id: int, user: User, limit: int = 50) -> Dict[str, Any]:
        rows = (await self.db.execute(select(FinanceApproval).where(FinanceApproval.tenant_id == tenant_id)
                                      .order_by(FinanceApproval.id.desc()).limit(limit))).scalars().all()
        items = []
        for ap in rows:
            await self._expire_if_needed(ap)
            items.append(await self._public(tenant_id, user, ap))
        pending = [i for i in items if i["status"] == APPROVAL_PENDING]
        return {"items": items, "pending": len(pending), "waiting_for_me": sum(1 for i in pending if i["can_vote"]),
                "approvers": await self.approvers(tenant_id)}

    async def summary(self, tenant_id: int, user: User) -> Dict[str, Any]:
        r = await self.list(tenant_id, user, limit=30)
        return {"pending": r["pending"], "waiting_for_me": r["waiting_for_me"]}

    # ── apoio ───────────────────────────────────────────────────────────────────────────────────────────────────
    async def _audit(self, tenant_id: int, user: Optional[User], action: str, ap: FinanceApproval, detail: Dict[str, Any]) -> None:
        from app.services.audit_service import AuditService
        await AuditService.log(self.db, action, tenant_id=tenant_id, user_id=getattr(user, "id", None),
                               user_email=getattr(user, "email", None), entity="finance_approval", entity_id=ap.id,
                               detail={"pedido": ap.id, **detail})

    async def _notify(self, tenant_id: int, user: Optional[User], title: str, body: str, ap_id: Optional[int] = None) -> None:
        """Push para os outros administradores (quem fez a ação não recebe). Tocar abre direto a tela de pedidos de aprovação;
        a etiqueta é uma por pedido, então um aviso novo do mesmo pedido substitui o anterior em vez de empilhar."""
        from app.services.audit_service import notify_other_admins
        await notify_other_admins(tenant_id, user, title, body, url="/finance/approvals",
                                  tag=f"aprovacao-{ap_id}" if ap_id else "aprovacao")
