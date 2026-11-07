"""
Programa de fidelidade por loja: ganho de pontos com validade, resgate como cashback (pontos viram desconto) e devolução.

Regras:
- Cada loja escolhe se tem o programa (`stores.loyalty_enabled`), quantos reais gastos dão 1 ponto, quanto vale 1 ponto em
  reais ao usar, o mínimo de pontos para usar e a validade (dias contados da compra; vazio = não vence).
- Cada ganho vira um lançamento no extrato (`loyalty_entries`) com `remaining` (quanto ainda está disponível) e `expires_at`.
  O saldo é a soma do que ainda não venceu. Usar pontos gasta primeiro o que vence antes.
- `customers.loyalty_points` guarda o saldo atual (as telas antigas continuam lendo ele) e é refeito a cada movimento.
- Pontos ganhos contam sobre o que foi pago em DINHEIRO/cartão/PIX: a parte paga com pontos não gera ponto novo.
- Devolução e cancelamento tiram os pontos ganhos na proporção e devolvem os pontos que a cliente tinha usado.
"""
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.loyalty import (
    KIND_ADJUST, KIND_EARN, KIND_EXPIRE, KIND_LABELS, KIND_OPENING, KIND_REDEEM, KIND_RESTORE, KIND_REVOKE, LoyaltyEntry,
)
from app.models.store import Store

CENT = Decimal("0.01")
D0 = Decimal("0")


def _d(v: Any) -> Decimal:
    return Decimal(str(v if v is not None else 0))


def _q(v: Decimal) -> Decimal:
    return v.quantize(CENT, ROUND_HALF_UP)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class LoyaltyError(ValueError):
    """Erro de regra do programa (frase pronta para a lojista)."""


class LoyaltyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------ configuração
    async def settings(self, tenant_id: int) -> Dict[str, Any]:
        store = (await self.db.execute(select(Store).where(Store.id == tenant_id))).scalar_one_or_none()
        if store is None:
            return {"enabled": False, "spend_per_point": D0, "point_value": D0, "min_redeem": D0, "expiry_days": None}
        return {
            "enabled": bool(store.loyalty_enabled),
            "spend_per_point": _d(store.loyalty_spend_per_point),
            "point_value": _d(store.loyalty_point_value),
            "min_redeem": _d(store.loyalty_min_redeem),
            "expiry_days": int(store.loyalty_expiry_days) if store.loyalty_expiry_days else None,
        }

    @staticmethod
    def points_for(amount: Decimal, cfg: Dict[str, Any]) -> Decimal:
        """Pontos que um valor pago dá (0 com o programa desligado)."""
        if not cfg["enabled"] or cfg["spend_per_point"] <= 0 or amount <= 0:
            return D0
        return _q(_d(amount) / cfg["spend_per_point"])

    @staticmethod
    def value_of(points: Decimal, cfg: Dict[str, Any]) -> Decimal:
        """Quanto os pontos valem em reais ao usar."""
        return _q(_d(points) * cfg["point_value"])

    # ------------------------------------------------------------------ saldo
    async def _live(self, customer_id: int, tenant_id: int) -> List[LoyaltyEntry]:
        """Lançamentos com saldo disponível, do que vence primeiro para o que não vence."""
        rows = (await self.db.execute(
            select(LoyaltyEntry).where(LoyaltyEntry.tenant_id == tenant_id, LoyaltyEntry.customer_id == customer_id,
                                       LoyaltyEntry.is_active == True, LoyaltyEntry.remaining > 0)  # noqa: E712
        )).scalars().all()
        far = datetime.max.replace(tzinfo=timezone.utc)
        return sorted(rows, key=lambda e: (_aware(e.expires_at) or far, e.id))

    async def expire_due(self, customer_id: int, tenant_id: int, now: Optional[datetime] = None) -> Decimal:
        """Tira do saldo o que já venceu (grava 'Pontos vencidos' no extrato). Devolve quantos pontos venceram."""
        now = now or _now()
        total = D0
        for e in await self._live(customer_id, tenant_id):
            if e.expires_at is not None and _aware(e.expires_at) <= now:
                gone = _d(e.remaining)
                total += gone
                e.remaining = D0
                self.db.add(LoyaltyEntry(
                    tenant_id=tenant_id, customer_id=customer_id, sale_id=e.sale_id, kind=KIND_EXPIRE, points=-gone,
                    remaining=D0, note="Venceram", is_active=True))
        return total

    async def balance(self, customer_id: int, tenant_id: int) -> Decimal:
        await self.expire_due(customer_id, tenant_id)
        return _q(sum((_d(e.remaining) for e in await self._live(customer_id, tenant_id)), D0))

    async def _sync(self, customer: Customer, tenant_id: int) -> Decimal:
        await self.db.flush()
        bal = await self.balance(customer.id, tenant_id)
        customer.loyalty_points = float(bal)
        return bal

    async def _lock(self, customer: Customer) -> None:
        """Trava a linha da cliente: dois resgates ao mesmo tempo não gastam o mesmo saldo (no SQLite não faz nada)."""
        await self.db.execute(select(Customer.id).where(Customer.id == customer.id).with_for_update())

    # ------------------------------------------------------------------ ganho
    def _expiry(self, cfg: Dict[str, Any], now: Optional[datetime] = None) -> Optional[datetime]:
        return (now or _now()) + timedelta(days=cfg["expiry_days"]) if cfg["expiry_days"] else None

    async def earn(self, customer: Customer, sale_id: Optional[int], paid_amount: Decimal, tenant_id: int,
                   *, note: Optional[str] = None) -> Decimal:
        """Pontos de uma compra, sobre o valor pago sem contar a parte paga com pontos. 0 com o programa desligado."""
        cfg = await self.settings(tenant_id)
        pts = self.points_for(_d(paid_amount), cfg)
        if pts <= 0:
            return D0
        self.db.add(LoyaltyEntry(
            tenant_id=tenant_id, customer_id=customer.id, sale_id=sale_id, kind=KIND_EARN, points=pts, remaining=pts,
            expires_at=self._expiry(cfg), note=note, is_active=True))
        await self._sync(customer, tenant_id)
        return pts

    # ------------------------------------------------------------------ resgate (cashback)
    async def redeem_amount(self, customer: Customer, sale_id: Optional[int], amount: Decimal, tenant_id: int) -> Decimal:
        """Usa pontos para pagar `amount` reais. Devolve os pontos gastos. Erro com frase pronta se não puder."""
        cfg = await self.settings(tenant_id)
        if not cfg["enabled"]:
            raise LoyaltyError("Esta loja não tem programa de fidelidade ligado.")
        if cfg["point_value"] <= 0:
            raise LoyaltyError("O valor do ponto não está definido nas configurações de fidelidade.")
        amount = _q(_d(amount))
        points = _q(amount / cfg["point_value"])
        if points <= 0:
            raise LoyaltyError("Informe quanto da compra será pago com pontos.")
        if points < cfg["min_redeem"]:
            raise LoyaltyError(f"A loja só aceita usar a partir de {cfg['min_redeem']:.0f} pontos.")
        await self._lock(customer)
        bal = await self.balance(customer.id, tenant_id)
        if points > bal:
            raise LoyaltyError(f"A cliente tem {bal:.0f} pontos (vale R$ {self.value_of(bal, cfg):.2f}); você tentou usar {points:.0f}.")
        left = points
        for e in await self._live(customer.id, tenant_id):
            if left <= 0:
                break
            take = min(_d(e.remaining), left)
            e.remaining = _d(e.remaining) - take
            left -= take
        self.db.add(LoyaltyEntry(
            tenant_id=tenant_id, customer_id=customer.id, sale_id=sale_id, kind=KIND_REDEEM, points=-points, remaining=D0,
            note=f"Pagou R$ {amount:.2f} com pontos", is_active=True))
        await self._sync(customer, tenant_id)
        return points

    # ------------------------------------------------------------------ devolução e cancelamento
    async def revoke(self, customer: Customer, sale_id: int, points: Decimal, tenant_id: int, *, note: str = "Devolução") -> Decimal:
        """Tira pontos (ganhos numa compra devolvida ou cancelada): primeiro os daquela venda, depois os que vencem antes.
        Nunca deixa o saldo negativo. Devolve quantos pontos saíram de fato."""
        points = _q(_d(points))
        if points <= 0:
            return D0
        mine = [e for e in await self._live(customer.id, tenant_id) if e.sale_id == sale_id and e.kind in (KIND_EARN, KIND_RESTORE)]
        others = [e for e in await self._live(customer.id, tenant_id) if e not in mine]
        left = points
        for e in mine + others:
            if left <= 0:
                break
            take = min(_d(e.remaining), left)
            e.remaining = _d(e.remaining) - take
            left -= take
        taken = points - left
        if taken > 0:
            self.db.add(LoyaltyEntry(
                tenant_id=tenant_id, customer_id=customer.id, sale_id=sale_id, kind=KIND_REVOKE, points=-taken,
                remaining=D0, note=note, is_active=True))
        await self._sync(customer, tenant_id)
        return taken

    async def restore(self, customer: Customer, sale_id: int, points: Decimal, tenant_id: int, *, note: str = "Pontos devolvidos") -> Decimal:
        """Devolve pontos que a cliente tinha usado numa compra cancelada ou devolvida (com validade nova)."""
        points = _q(_d(points))
        if points <= 0:
            return D0
        cfg = await self.settings(tenant_id)
        self.db.add(LoyaltyEntry(
            tenant_id=tenant_id, customer_id=customer.id, sale_id=sale_id, kind=KIND_RESTORE, points=points, remaining=points,
            expires_at=self._expiry(cfg), note=note, is_active=True))
        await self._sync(customer, tenant_id)
        return points

    async def adjust(self, customer: Customer, points: Decimal, tenant_id: int, note: str) -> Decimal:
        """Ajuste manual do administrador (positivo soma com validade, negativo tira os que vencem antes)."""
        points = _q(_d(points))
        if points == 0:
            return D0
        if points > 0:
            cfg = await self.settings(tenant_id)
            self.db.add(LoyaltyEntry(
                tenant_id=tenant_id, customer_id=customer.id, kind=KIND_ADJUST, points=points, remaining=points,
                expires_at=self._expiry(cfg), note=note[:200], is_active=True))
        else:
            left = -points
            for e in await self._live(customer.id, tenant_id):
                if left <= 0:
                    break
                take = min(_d(e.remaining), left)
                e.remaining = _d(e.remaining) - take
                left -= take
            self.db.add(LoyaltyEntry(
                tenant_id=tenant_id, customer_id=customer.id, kind=KIND_ADJUST, points=points + left, remaining=D0,
                note=note[:200], is_active=True))
        return await self._sync(customer, tenant_id)

    # ------------------------------------------------------------------ consulta
    async def summary(self, customer_id: int, tenant_id: int, limit: int = 20) -> Dict[str, Any]:
        cfg = await self.settings(tenant_id)
        await self.expire_due(customer_id, tenant_id)
        live = await self._live(customer_id, tenant_id)
        bal = _q(sum((_d(e.remaining) for e in live), D0))
        soon = _now() + timedelta(days=30)
        expiring = _q(sum((_d(e.remaining) for e in live if e.expires_at and _aware(e.expires_at) <= soon), D0))
        next_exp = next((_aware(e.expires_at) for e in live if e.expires_at), None)
        rows = (await self.db.execute(
            select(LoyaltyEntry).where(LoyaltyEntry.tenant_id == tenant_id, LoyaltyEntry.customer_id == customer_id,
                                       LoyaltyEntry.is_active == True)  # noqa: E712
            .order_by(LoyaltyEntry.id.desc()).limit(limit)
        )).scalars().all()
        return {
            "enabled": cfg["enabled"], "balance": float(bal), "value": float(self.value_of(bal, cfg)),
            "expiring_soon": float(expiring), "next_expiry": next_exp.isoformat() if next_exp else None,
            "entries": [{
                "id": e.id, "kind": e.kind, "label": KIND_LABELS.get(e.kind, e.kind), "points": float(e.points), "sale_id": e.sale_id,
                "created_at": _aware(e.created_at).isoformat() if e.created_at else None,
                "expires_at": _aware(e.expires_at).isoformat() if e.expires_at else None, "note": e.note,
            } for e in rows],
        }

    async def peek(self, customer_id: int, tenant_id: int) -> Dict[str, Any]:
        """Saldo atual sem mexer em nada (não grava vencimentos): para o comprovante e telas de leitura."""
        cfg = await self.settings(tenant_id)
        now = _now()
        live = [e for e in await self._live(customer_id, tenant_id) if e.expires_at is None or _aware(e.expires_at) > now]
        bal = _q(sum((_d(e.remaining) for e in live), D0))
        soon = now + timedelta(days=30)
        expiring = [e for e in live if e.expires_at and _aware(e.expires_at) <= soon]
        next_exp = next((_aware(e.expires_at) for e in live if e.expires_at), None)
        return {
            "enabled": cfg["enabled"], "balance": float(bal), "value": float(self.value_of(bal, cfg)),
            "expiring_soon": float(_q(sum((_d(e.remaining) for e in expiring), D0))),
            "next_expiry": next_exp.strftime("%d/%m/%Y") if next_exp else None,
        }

    async def expire_all(self, tenant_id: int) -> int:
        """Venceu na loja inteira (para a tarefa diária e o aviso de pontos a vencer)."""
        ids = (await self.db.execute(
            select(LoyaltyEntry.customer_id).where(LoyaltyEntry.tenant_id == tenant_id, LoyaltyEntry.remaining > 0,
                                                   LoyaltyEntry.expires_at.isnot(None), LoyaltyEntry.expires_at <= _now(),
                                                   LoyaltyEntry.is_active == True).distinct()  # noqa: E712
        )).scalars().all()
        for cid in ids:
            customer = (await self.db.execute(select(Customer).where(Customer.id == cid))).scalar_one_or_none()
            if customer:
                await self._sync(customer, tenant_id)
        return len(ids)
