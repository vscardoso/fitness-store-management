"""
Brinde: peça que sai do estoque sem cobrança. Só administrador dá, cancela e vê (regra do dono, 09/11/2026).

- Tudo ou nada: tira as peças pelo FIFO (mesmo da venda, com as camadas guardadas), trava as variações antes de ler o saldo
  e só então grava. Sem estoque suficiente, nada é gravado.
- Não é venda: sem pagamento, sem receita, sem caixa, sem Financeiro, sem fiado, sem pontos de fidelidade.
- O custo (custo posto de cada camada) vira a linha "Brindes" do Resultado do Mês (`money_ledger`), fora do custo das vendidas.
- Cancelar (engano, mesmo mês): a peça volta às mesmas camadas e o brinde some do mês. Brinde NÃO aceita devolução (decisão do
  dono, 09/11/2026) e nunca gera dinheiro de volta.
"""
from __future__ import annotations

import copy
import logging
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dashboard_cache import invalidate_dashboard_cache
from app.core.timezone import today_brazil
from app.models.customer import Customer
from app.models.gift import GIFT_CANCELLED, GIFT_GIVEN, GIFT_REASONS, Gift, GiftItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.sale import Sale
from app.models.user import User
from app.services.fifo_service import FIFOService
from app.services.money_ledger import br_day
from app.services.stock_lock import lock_stock

logger = logging.getLogger(__name__)
D0 = Decimal("0.00")
MAX_QTY = 1000


def _q(v: Any) -> Decimal:
    return Decimal(str(v if v is not None else 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class GiftError(ValueError):
    """Recusado (400): a mensagem é mostrada à pessoa."""


class GiftConflict(GiftError):
    """O estado não permite (409)."""


class GiftNotFound(GiftError):
    pass


def _who(user: Optional[User]) -> Optional[str]:
    return (getattr(user, "full_name", None) or getattr(user, "email", None) or None)


class GiftService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.fifo = FIFOService(db)

    # ── apoio ────────────────────────────────────────────────────────────────
    async def _ensure_open_month(self, tenant_id: int, day: date) -> None:
        from app.services.finance_service import FinanceError, FinanceService
        try:
            await FinanceService(self.db).ensure_open_month(tenant_id, day)
        except FinanceError as e:
            raise GiftConflict(str(e))

    async def _audit(self, tenant_id: int, user: Optional[User], action: str, gift_id: int, detail: Dict[str, Any]) -> None:
        from app.services.audit_service import AuditService
        await AuditService.log(self.db, action, tenant_id=tenant_id, user_id=getattr(user, "id", None),
                               user_email=getattr(user, "email", None), entity="gift", entity_id=gift_id, detail=detail)

    async def _sync_inventory(self, product_ids, tenant_id: int) -> None:
        from app.services.inventory_service import InventoryService
        for pid in {p for p in product_ids if p}:
            try:
                await InventoryService(self.db).rebuild_product_from_fifo(pid, tenant_id=tenant_id)
            except Exception as e:  # noqa: BLE001  (o saldo agregado não derruba o brinde)
                logger.warning("Sincronia do estoque do produto %s falhou depois do brinde: %s", pid, e)
        await self.db.commit()

    async def _gift(self, tenant_id: int, gift_id: int) -> Gift:
        g = (await self.db.execute(select(Gift).where(
            Gift.id == gift_id, Gift.tenant_id == tenant_id, Gift.is_active == True))).scalar_one_or_none()  # noqa: E712
        if g is None:
            raise GiftNotFound("Brinde não encontrado.")
        return g

    async def _items(self, gift_id: int) -> List[GiftItem]:
        return list((await self.db.execute(select(GiftItem).where(
            GiftItem.gift_id == gift_id, GiftItem.is_active == True).order_by(GiftItem.id))).scalars().all())  # noqa: E712

    async def _public(self, g: Gift) -> Dict[str, Any]:
        items = await self._items(g.id)
        customer = None
        if g.customer_id:
            c = (await self.db.execute(select(Customer).where(Customer.id == g.customer_id))).scalar_one_or_none()
            customer = c.full_name if c else None
        return {
            "id": g.id, "gift_number": g.gift_number, "status": g.status, "reason_type": g.reason_type,
            "reason_label": GIFT_REASONS.get(g.reason_type, g.reason_type), "reason_note": g.reason_note,
            "customer_id": g.customer_id, "customer_name": customer, "recipient_name": g.recipient_name,
            "recipient": customer or g.recipient_name, "related_sale_id": g.related_sale_id,
            "given_by_name": g.given_by_name, "total_cost": float(_q(g.total_cost)),
            "net_cost": float(_q(g.total_cost)) if g.status == GIFT_GIVEN else 0.0,
            "list_value": float(_q(g.list_value)), "created_at": g.created_at.isoformat() if g.created_at else None,
            "cancelled_at": g.cancelled_at.isoformat() if g.cancelled_at else None, "cancel_reason": g.cancel_reason,
            "items": [{"id": i.id, "product_id": i.product_id, "variant_id": i.variant_id, "product_name": i.product_name,
                       "variant_label": i.variant_label, "quantity": i.quantity,
                       "unit_cost": float(Decimal(str(i.unit_cost)).quantize(Decimal("0.0001"))), "list_price": float(_q(i.list_price))}
                      for i in items],
        }

    # ── dar o brinde ─────────────────────────────────────────────────────────
    async def create(self, tenant_id: int, user: User, data: Dict[str, Any]) -> Dict[str, Any]:
        gift, product_ids = await self._build(tenant_id, user, data, own_tx=True)
        await self._sync_inventory(product_ids, tenant_id)
        invalidate_dashboard_cache(tenant_id)
        await self._notify(tenant_id, user, f"deu um brinde de R$ {self._fmt(gift.total_cost)} (custo para a loja)")
        return await self._public(await self._gift(tenant_id, gift.id))

    async def create_in_sale(self, tenant_id: int, user: User, data: Dict[str, Any]):
        """Brinde dado DENTRO de uma venda: usa a transação da venda (não grava sozinho). Quem chama grava tudo junto
        (a venda e o brinde saem ou não saem juntos) e depois sincroniza o estoque dos produtos devolvidos aqui."""
        return await self._build(tenant_id, user, data, own_tx=False)

    async def _build(self, tenant_id: int, user: User, data: Dict[str, Any], *, own_tx: bool):
        raw_items = data.get("items") or []
        if not isinstance(raw_items, list) or not raw_items:
            raise GiftError("Escolha pelo menos uma peça para o brinde.")
        reason_type = str(data.get("reason_type") or "").strip()
        if reason_type not in GIFT_REASONS:
            raise GiftError("Escolha o motivo do brinde.")
        note = (data.get("reason_note") or "").strip()
        if reason_type == "voucher" and len(note) < 3:
            raise GiftError("Informe o número do voucher resgatado (mínimo 3 caracteres).")
        if reason_type == "other" and len(note) < 3:
            raise GiftError("Escreva o motivo do brinde (mínimo 3 letras).")
        recipient = (data.get("recipient_name") or "").strip()
        customer_id = data.get("customer_id") or None
        if not customer_id and len(recipient) < 3:
            raise GiftError("Informe para quem é o brinde: escolha a cliente cadastrada ou escreva o nome da pessoa.")
        lines: List[tuple] = []
        for it in raw_items:
            try:
                vid, qty = int(it.get("variant_id")), int(it.get("quantity"))
            except (TypeError, ValueError, AttributeError):
                raise GiftError("Peça ou quantidade inválida no brinde.")
            if qty <= 0 or qty > MAX_QTY:
                raise GiftError(f"A quantidade de cada peça deve ficar entre 1 e {MAX_QTY}.")
            lines.append((vid, qty))
        if customer_id:
            ok = (await self.db.execute(select(Customer.id).where(
                Customer.id == int(customer_id), Customer.tenant_id == tenant_id, Customer.is_active == True))).first()  # noqa: E712
            if not ok:
                raise GiftError("Cliente não encontrada.")
            customer_id = int(customer_id)
        sale_id = data.get("related_sale_id") or None
        if sale_id:
            ok = (await self.db.execute(select(Sale.id).where(Sale.id == int(sale_id), Sale.tenant_id == tenant_id))).first()
            if not ok:
                raise GiftError("Venda não encontrada.")
            sale_id = int(sale_id)

        today = today_brazil()
        await self._ensure_open_month(tenant_id, today)
        await lock_stock(self.db, variant_ids=[v for v, _ in lines])     # dois brindes não levam a mesma última peça
        try:
            gift = Gift(
                tenant_id=tenant_id, gift_number="PENDENTE", status=GIFT_GIVEN, reason_type=reason_type,
                reason_note=note or None, customer_id=customer_id, recipient_name=recipient or None,
                related_sale_id=sale_id, given_by_id=getattr(user, "id", None), given_by_name=_who(user),
                is_active=True,
            )
            self.db.add(gift)
            await self.db.flush()
            gift.gift_number = f"BRINDE-{today.strftime('%Y%m%d')}-{gift.id:04d}"
            total_cost, list_value, product_ids = D0, D0, set()
            for vid, qty in lines:
                v = (await self.db.execute(select(ProductVariant).where(
                    ProductVariant.id == vid, ProductVariant.tenant_id == tenant_id, ProductVariant.is_active == True))).scalar_one_or_none()  # noqa: E712
                if v is None:
                    raise GiftError("Peça não encontrada.")
                p = (await self.db.execute(select(Product).where(Product.id == v.product_id, Product.tenant_id == tenant_id))).scalar_one_or_none()
                if p is None or not p.is_active:
                    raise GiftError("Produto não encontrado.")
                label = " / ".join(x for x in (v.color, v.size) if x)
                try:
                    sources = await self.fifo.process_sale(
                        p.id, qty, variant_id=v.id, tenant_id=tenant_id, reason="brinde", ref=f"gift:{gift.id}",
                        user_id=getattr(user, "id", None))
                except ValueError as e:
                    if "Insufficient stock" in str(e):
                        have = str(e).rsplit("Available:", 1)[-1].strip() if "Available:" in str(e) else "0"
                        raise GiftError(f"Sem estoque suficiente de {p.name}{(' ' + label) if label else ''}: pedido {qty}, tem {have}.")
                    raise GiftError(f"Não foi possível tirar {p.name} do estoque: {e}")
                cost = sum((Decimal(str(s["quantity_taken"])) * Decimal(str(s["unit_cost"])) for s in sources), Decimal("0"))
                price = Decimal(str(v.price if v.price is not None else (p.base_price or 0)))
                self.db.add(GiftItem(
                    tenant_id=tenant_id, gift_id=gift.id, product_id=p.id, variant_id=v.id, product_name=p.name,
                    variant_label=label or None, quantity=qty, unit_cost=(cost / qty), list_price=price,
                    sale_sources={"sources": sources}, is_active=True))
                total_cost += cost
                list_value += price * qty
                product_ids.add(p.id)
            gift.total_cost = _q(total_cost)
            gift.list_value = _q(list_value)
            await self.db.flush()
            await self._audit(tenant_id, user, "GIFT_CREATED", gift.id, {
                "numero": gift.gift_number, "motivo": GIFT_REASONS[reason_type], "observacao": note or None,
                "para": recipient or None, "cliente_id": customer_id, "venda_id": sale_id,
                "custo": float(gift.total_cost), "valor_de_vitrine": float(gift.list_value),
                "pecas": sum(q for _, q in lines)})
            if own_tx:
                await self.db.commit()
        except Exception:
            if own_tx:
                await self.db.rollback()
            raise
        return gift, product_ids

    @staticmethod
    def _fmt(v: Any) -> str:
        return f"{_q(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    async def _notify(self, tenant_id: int, user: Optional[User], text: str) -> None:
        from app.services.audit_service import notify_other_admins
        await notify_other_admins(tenant_id, user, "Brinde", f"{_who(user) or 'Um administrador'} {text}", url="/gifts")

    # ── cancelar (engano de lançamento) ──────────────────────────────────────
    async def cancel(self, tenant_id: int, user: User, gift_id: int, reason: str) -> Dict[str, Any]:
        reason = (reason or "").strip()
        if len(reason) < 3:
            raise GiftError("Escreva o motivo do cancelamento (mínimo 3 letras).")
        g = await self._gift(tenant_id, gift_id)
        if g.status != GIFT_GIVEN:
            raise GiftConflict("Este brinde já foi cancelado.")
        items = await self._items(g.id)
        today = today_brazil()
        if (br_day(g.created_at).year, br_day(g.created_at).month) != (today.year, today.month):
            raise GiftConflict("Só dá para cancelar um brinde no mesmo mês em que foi dado. Brinde não aceita devolução.")
        await self._ensure_open_month(tenant_id, today)
        await lock_stock(self.db, variant_ids=[i.variant_id for i in items])
        try:
            g = await self._gift(tenant_id, gift_id)
            if g.status != GIFT_GIVEN:
                raise GiftConflict("Este brinde já foi cancelado.")
            for i in items:
                await self.fifo.reverse_sale(sources=(i.sale_sources or {}).get("sources", []), reason="brinde_volta",
                                             ref=f"gift:{g.id}", user_id=getattr(user, "id", None))
            g.status = GIFT_CANCELLED
            g.cancelled_at = datetime.now().astimezone()
            g.cancelled_by_name = _who(user)
            g.cancel_reason = reason
            await self._audit(tenant_id, user, "GIFT_CANCELLED", g.id, {
                "numero": g.gift_number, "motivo": reason, "custo": float(_q(g.total_cost)),
                "pecas": sum(i.quantity for i in items)})
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        await self._sync_inventory([i.product_id for i in items], tenant_id)
        invalidate_dashboard_cache(tenant_id)
        await self._notify(tenant_id, user, f"cancelou o brinde {g.gift_number}: {reason}")
        return await self._public(await self._gift(tenant_id, gift_id))

    # ── consultas ────────────────────────────────────────────────────────────
    async def get(self, tenant_id: int, gift_id: int) -> Dict[str, Any]:
        return await self._public(await self._gift(tenant_id, gift_id))

    async def list(self, tenant_id: int, *, start: Optional[date] = None, end: Optional[date] = None,
                   limit: int = 50, skip: int = 0) -> Dict[str, Any]:
        from app.core.timezone import br_day_end_utc, br_day_start_utc
        q = select(Gift).where(Gift.tenant_id == tenant_id, Gift.is_active == True)  # noqa: E712
        if start:
            q = q.where(Gift.created_at >= br_day_start_utc(start))
        if end:
            q = q.where(Gift.created_at <= br_day_end_utc(end))
        total = (await self.db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        rows = (await self.db.execute(q.order_by(Gift.id.desc()).limit(min(max(limit, 1), 200)).offset(max(skip, 0)))).scalars().all()
        gifts = [await self._public(g) for g in rows]
        given = [g for g in gifts if g["status"] == GIFT_GIVEN]
        return {"items": gifts, "total_count": total,
                "page_cost": round(sum(g["net_cost"] for g in given), 2),
                "page_pieces": sum(i["quantity"] for g in given for i in g["items"])}


# ── quem não é administrador não vê o brinde em lugar nenhum: o valor entra nos números que já existem ─────────────────────
def is_admin_user(user: Any) -> bool:
    role = getattr(user, "role", None)
    return str(getattr(role, "value", role) or "").lower() == "admin"


def hide_gifts_in_result(res: Any, user: Any) -> Any:
    """Resultado do Mês (objeto MonthlyResultResponse): o custo dos brindes passa para "Gastos da loja"; o lucro não muda."""
    if not is_admin_user(user) and getattr(res, "gifts_total", 0):
        res.total_expenses = res.total_expenses + res.gifts_total
        res.gifts_total = Decimal("0")
        res.gifts_count = 0
    return res


def hide_gifts_in_tracking(data: Dict[str, Any], user: Any) -> Dict[str, Any]:
    """Rastreio do lote: peça dada de brinde conta como "saiu sem venda" (a conta continua fechando)."""
    if not is_admin_user(user):
        data["totals"]["removed"] += data["totals"].get("gifted", 0)
        data["totals"]["gifted"] = 0
        for r in data.get("items", []):
            r["removed"] += r.get("gifted", 0)
            r["removed_unrecorded"] += r.get("gifted", 0)
            r["gifted"] = 0
        data["totals"]["removed_unrecorded"] = sum(r["removed_unrecorded"] for r in data.get("items", []))
    return data
