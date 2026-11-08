"""Para onde foi cada peça de um lote: vendida, com a cliente (condicional), ou saiu sem venda (baixa, exclusão, ajuste).

Antes a tela fazia "vendido = recebido - restante", e toda peça que saiu sem venda (variação excluída, baixa da Conferência)
aparecia como vendida. Aqui a venda vem das camadas FIFO gravadas em cada item vendido (`sale_sources`), já líquidas de
devolução, de vendas válidas (concluída, parcialmente devolvida ou devolvida). O resto que saiu é "sem venda" e, quando o livro
do estoque (`entry_item_events`) tem o registro, vem com o motivo.

Conta fechada de cada lote:  recebidas = vendidas + com a cliente + saíram sem venda + em estoque.
"""
from typing import Any, Dict, Iterable, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conditional_shipment import ConditionalShipment, ConditionalShipmentItem
from app.models.entry_item import EntryItem
from app.models.entry_item_event import EntryItemEvent
from app.models.sale import Sale, SaleItem
from app.services.money_ledger import VALID_STATUS
from app.services.stock_ledger import REASONS, REMOVAL_REASONS


async def item_flows(db: AsyncSession, tenant_id: int, items: Iterable[EntryItem]) -> Dict[int, Dict[str, int]]:
    items = list(items)
    ids = {i.id for i in items}
    variant_ids = {i.variant_id for i in items if i.variant_id}
    product_ids = {i.product_id for i in items if i.product_id and not i.variant_id}
    sold: Dict[int, int] = {i: 0 for i in ids}
    if variant_ids or product_ids:
        q = (select(SaleItem.sale_sources).join(Sale, Sale.id == SaleItem.sale_id)
             .where(Sale.tenant_id == tenant_id, Sale.is_active == True, Sale.status.in_(VALID_STATUS),  # noqa: E712
                    SaleItem.is_active == True, SaleItem.sale_sources.is_not(None)))  # noqa: E712
        conds = []
        if variant_ids:
            conds.append(SaleItem.variant_id.in_(variant_ids))
        if product_ids:
            conds.append(SaleItem.product_id.in_(product_ids))
        from sqlalchemy import or_
        for (src,) in (await db.execute(q.where(or_(*conds)))).all():
            for s in (src or {}).get("sources", []):
                eid = s.get("entry_item_id")
                if eid in sold:
                    sold[eid] += int(s.get("quantity_taken", 0)) - int(s.get("quantity_returned", 0))

    # peças que estão com a cliente agora (condicional enviado e ainda sem resposta)
    with_customer: Dict[int, int] = {i: 0 for i in ids}
    cq = (select(ConditionalShipmentItem)
          .join(ConditionalShipment, ConditionalShipment.id == ConditionalShipmentItem.shipment_id)
          .where(ConditionalShipment.tenant_id == tenant_id, ConditionalShipment.is_active == True,  # noqa: E712
                 ConditionalShipment.status.in_(["SENT", "OVERDUE", "PENDING"]),
                 ConditionalShipmentItem.fifo_sources.is_not(None)))
    for ci in (await db.execute(cq)).scalars().all():
        pending = max(int(ci.quantity_pending or 0), 0)
        for s in (ci.fifo_sources or {}).get("sources", []):
            eid = s.get("entry_item_id")
            if pending <= 0:
                break
            if eid in with_customer:
                take = min(pending, int(s.get("quantity_taken", 0)))
                with_customer[eid] += take
                pending -= take

    out: Dict[int, Dict[str, int]] = {}
    for i in items:
        s = max(sold.get(i.id, 0), 0)
        w = with_customer.get(i.id, 0)
        removed = max(i.quantity_received - i.quantity_remaining - s - w, 0)
        out[i.id] = {"sold": s, "with_customer": w, "removed": removed}
    return out


async def attach_flows(db: AsyncSession, tenant_id: int, entry) -> None:
    """Põe nos itens carregados (sem gravar) as vendas reais e o que saiu sem venda; o schema da entrada lê daí."""
    active = [i for i in entry.entry_items if i.is_active]
    flows = await item_flows(db, tenant_id, active)
    for i in active:
        f = flows[i.id]
        i.__dict__["_sold_override"] = f["sold"] + f["with_customer"]
        i.__dict__["_removed_override"] = f["removed"]


async def tracking(db: AsyncSession, tenant_id: int, entry) -> Dict[str, Any]:
    """Tabela de rastreio de um lote: por peça, recebidas / vendidas / com a cliente / saíram sem venda / em estoque e o histórico."""
    active = [i for i in entry.entry_items if i.is_active]
    flows = await item_flows(db, tenant_id, active)
    ev_rows = (await db.execute(
        select(EntryItemEvent).where(EntryItemEvent.tenant_id == tenant_id, EntryItemEvent.entry_item_id.in_([i.id for i in active]))
        .order_by(EntryItemEvent.id)
    )).scalars().all() if active else []
    by_item: Dict[int, List[EntryItemEvent]] = {}
    for e in ev_rows:
        by_item.setdefault(e.entry_item_id, []).append(e)

    rows, totals = [], {"received": 0, "sold": 0, "with_customer": 0, "removed": 0, "remaining": 0}
    for i in active:
        f = flows[i.id]
        evs = by_item.get(i.id, [])
        removed_events = [e for e in evs if e.reason in REMOVAL_REASONS and e.reason != "baixa_sem_registro" and e.delta < 0]
        recorded = sum(-e.delta for e in removed_events)
        rows.append({
            "item_id": i.id, "product_name": i.product_name, "variant_label": i.variant_label, "variant_code": i.variant_code,
            "received": i.quantity_received, "sold": f["sold"], "with_customer": f["with_customer"],
            "removed": f["removed"], "removed_recorded": min(recorded, f["removed"]),
            "removed_unrecorded": max(f["removed"] - recorded, 0), "remaining": i.quantity_remaining,
            "history": [{"when": e.created_at.isoformat() if e.created_at else None, "reason": e.reason,
                         "label": REASONS.get(e.reason, e.reason), "delta": e.delta, "after": e.after,
                         "user_id": e.user_id, "note": e.note, "reconstructed": bool(e.reconstructed)} for e in evs],
        })
        totals["received"] += i.quantity_received
        totals["sold"] += f["sold"]
        totals["with_customer"] += f["with_customer"]
        totals["removed"] += f["removed"]
        totals["remaining"] += i.quantity_remaining
    t = totals
    t["closed"] = t["received"] == t["sold"] + t["with_customer"] + t["removed"] + t["remaining"]
    t["removed_unrecorded"] = sum(r["removed_unrecorded"] for r in rows)
    return {"entry_id": entry.id, "entry_code": entry.entry_code, "totals": t, "items": rows}
