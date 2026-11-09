"""Para onde foi cada peça de um lote: vendida, com a cliente (condicional), ou saiu sem venda (baixa, exclusão, ajuste).

Antes a tela fazia "vendido = recebido - restante", e toda peça que saiu sem venda (variação excluída, baixa da Conferência)
aparecia como vendida. Aqui a venda vem das camadas FIFO gravadas em cada item vendido (`sale_sources`), já líquidas de
devolução, de vendas válidas (concluída, parcialmente devolvida ou devolvida). O resto que saiu é "sem venda" e, quando o livro
do estoque (`entry_item_events`) tem o registro, vem com o motivo.

Conta fechada de cada lote:  recebidas = vendidas + com a cliente + saíram sem venda + brindes + em estoque.
"""
from typing import Any, Dict, Iterable, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conditional_shipment import ConditionalShipment, ConditionalShipmentItem
from app.models.entry_item import EntryItem
from app.models.entry_item_event import EntryItemEvent
from app.models.sale import Sale, SaleItem
from app.models.sale_return import ReturnItem
from app.services.money_ledger import VALID_STATUS
from app.services.stock_ledger import REASONS, REMOVAL_REASONS


def has_source_marks(sources) -> bool:
    """A devolução já gravou `quantity_returned`/`quantity_defective` nas fontes? (vendas antigas não têm)."""
    return any(("quantity_returned" in t) or ("quantity_defective" in t) for t in sources)


def legacy_returns_by_source(sources, return_items) -> list:
    """Venda ANTIGA (fontes sem marca): distribui as devoluções (ReturnItem, em ordem de id) pelas fontes, da última
    para a primeira, igual ao return_service antigo, mas acumulando o que cada fonte já devolveu.
    restock=False = peça com defeito (não volta ao estoque). Devolve [{'returned': n, 'defective': n}] por fonte."""
    out = [{"returned": 0, "defective": 0} for _ in sources]
    for r in sorted(return_items, key=lambda x: x.id):
        remaining = int(r.quantity_returned or 0)
        key = "returned" if r.restock else "defective"
        for idx in range(len(sources) - 1, -1, -1):
            if remaining <= 0:
                break
            livre = int(sources[idx]["quantity_taken"]) - out[idx]["returned"] - out[idx]["defective"]
            if livre <= 0:
                continue
            take = min(livre, remaining)
            out[idx][key] += take
            remaining -= take
    return out


async def item_flows(db: AsyncSession, tenant_id: int, items: Iterable[EntryItem]) -> Dict[int, Dict[str, int]]:
    items = list(items)
    ids = {i.id for i in items}
    variant_ids = {i.variant_id for i in items if i.variant_id}
    product_ids = {i.product_id for i in items if i.product_id and not i.variant_id}
    sold: Dict[int, int] = {i: 0 for i in ids}
    if variant_ids or product_ids:
        q = (select(SaleItem.id, SaleItem.sale_sources).join(Sale, Sale.id == SaleItem.sale_id)
             .where(Sale.tenant_id == tenant_id, Sale.is_active == True, Sale.status.in_(VALID_STATUS),  # noqa: E712
                    SaleItem.is_active == True, SaleItem.sale_sources.is_not(None)))  # noqa: E712
        conds = []
        if variant_ids:
            conds.append(SaleItem.variant_id.in_(variant_ids))
        if product_ids:
            conds.append(SaleItem.product_id.in_(product_ids))
        from sqlalchemy import or_
        rows = (await db.execute(q.where(or_(*conds)))).all()
        # vendas antigas (fontes sem marca): as devoluções vêm de ReturnItem
        old_ids = [sid for sid, src in rows if (src or {}).get("sources") and not has_source_marks(src["sources"])]
        rets_by_item: Dict[int, list] = {}
        if old_ids:
            for r in (await db.execute(select(ReturnItem).where(
                    ReturnItem.sale_item_id.in_(old_ids), ReturnItem.is_active == True))).scalars().all():  # noqa: E712
                rets_by_item.setdefault(r.sale_item_id, []).append(r)
        for sid, src in rows:
            sources = (src or {}).get("sources", [])
            legacy = legacy_returns_by_source(sources, rets_by_item[sid]) if sid in rets_by_item else None
            for idx, s in enumerate(sources):
                eid = s.get("entry_item_id")
                if eid in sold:
                    back = legacy[idx]["returned"] if legacy is not None else int(s.get("quantity_returned", 0))
                    sold[eid] += int(s.get("quantity_taken", 0)) - back

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

    # peças dadas de brinde (cancelado fica de fora): saem do estoque sem venda, mas têm dono e tela próprios
    gifted: Dict[int, int] = {i: 0 for i in ids}
    from app.models.gift import GIFT_CANCELLED, Gift, GiftItem
    for src in (await db.execute(select(GiftItem.sale_sources).join(Gift, Gift.id == GiftItem.gift_id).where(
            Gift.tenant_id == tenant_id, Gift.is_active == True, Gift.status != GIFT_CANCELLED,  # noqa: E712
            GiftItem.is_active == True, GiftItem.sale_sources.is_not(None)))).scalars().all():  # noqa: E712
        for s in (src or {}).get("sources", []):
            eid = s.get("entry_item_id")
            if eid in gifted:
                gifted[eid] += int(s.get("quantity_taken", 0))
    out: Dict[int, Dict[str, int]] = {}
    for i in items:
        s = max(sold.get(i.id, 0), 0)
        w = with_customer.get(i.id, 0)
        g = max(gifted.get(i.id, 0), 0)
        removed = max(i.quantity_received - i.quantity_remaining - s - w - g, 0)
        out[i.id] = {"sold": s, "with_customer": w, "removed": removed, "gifted": g}
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

    rows, totals = [], {"received": 0, "sold": 0, "with_customer": 0, "removed": 0, "gifted": 0, "remaining": 0}
    for i in active:
        f = flows[i.id]
        evs = by_item.get(i.id, [])
        removed_events = [e for e in evs if e.reason in REMOVAL_REASONS and e.reason != "baixa_sem_registro" and e.delta < 0]
        recorded = sum(-e.delta for e in removed_events)
        rows.append({
            "item_id": i.id, "product_name": i.product_name, "variant_label": i.variant_label, "variant_code": i.variant_code,
            "received": i.quantity_received, "sold": f["sold"], "with_customer": f["with_customer"], "gifted": f["gifted"],
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
        totals["gifted"] += f["gifted"]
        totals["remaining"] += i.quantity_remaining
    t = totals
    t["closed"] = t["received"] == t["sold"] + t["with_customer"] + t["removed"] + t["gifted"] + t["remaining"]
    t["removed_unrecorded"] = sum(r["removed_unrecorded"] for r in rows)
    return {"entry_id": entry.id, "entry_code": entry.entry_code, "totals": t, "items": rows}


async def attach_flows_many(db: AsyncSession, tenant_id: int, entries) -> None:
    """Igual a `attach_flows` para uma lista de entradas (a lista de Entradas mostra a taxa de venda de cada uma)."""
    from sqlalchemy import inspect as sa_inspect
    items = []
    for e in entries:
        if "entry_items" in sa_inspect(e).unloaded:   # relação não carregada: não força carga na lista
            continue
        items.extend(i for i in e.entry_items if i.is_active)
    if not items:
        return
    flows = await item_flows(db, tenant_id, items)
    for i in items:
        f = flows[i.id]
        i.__dict__["_sold_override"] = f["sold"] + f["with_customer"]
        i.__dict__["_removed_override"] = f["removed"]


REMOVAL_FILTER_REASONS = sorted(REMOVAL_REASONS)


def _money(v) -> str:
    from decimal import Decimal, ROUND_HALF_UP
    return str(Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


async def removals(
    db: AsyncSession, tenant_id: int, *, start_date=None, end_date=None, reason: str | None = None,
    entry_id: int | None = None, limit: int = 50, skip: int = 0,
) -> Dict[str, Any]:
    """Tudo que saiu do estoque SEM ser venda (baixa, exclusão, ajuste), de todas as entradas da loja, vindo do livro
    `entry_item_events` (delta < 0, motivos de REMOVAL_REASONS). Totais valem para o filtro inteiro, não só para a página.
    Custo = custo posto (mercadoria + rateio) x peças. `baixa_sem_registro` volta sem data (a do backfill engana)."""
    from sqlalchemy import case, func
    from sqlalchemy.orm import selectinload
    from app.core.timezone import br_day_end_utc, br_day_start_utc
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import StockEntry
    from app.models.user import User

    E = EntryItemEvent
    conds = [E.tenant_id == tenant_id, E.reason.in_(REMOVAL_REASONS), E.delta < 0, EntryItem.tenant_id == tenant_id]
    if reason:
        conds.append(E.reason == reason)
    if entry_id is not None:
        conds.append(EntryItem.entry_id == entry_id)
    if start_date:
        conds += [E.reason != "baixa_sem_registro", E.created_at >= br_day_start_utc(start_date)]
    if end_date:
        conds += [E.reason != "baixa_sem_registro", E.created_at < br_day_end_utc(end_date)]
    base = select(E.id).join(EntryItem, EntryItem.id == E.entry_item_id).where(*conds)

    # totais do filtro inteiro
    pieces_expr = -E.delta
    agg = (await db.execute(
        select(E.reason, func.coalesce(func.sum(pieces_expr), 0),
               func.coalesce(func.sum(pieces_expr * (EntryItem.unit_cost + func.coalesce(EntryItem.extra_unit_cost, 0))), 0),
               func.count(E.id))
        .join(EntryItem, EntryItem.id == E.entry_item_id).where(*conds).group_by(E.reason))).all()
    by_reason = {r: {"label": REASONS.get(r, r), "pieces": int(p)} for r, p, _c, _n in agg}
    total_count = sum(int(n) for *_x, n in agg)

    when_null = case((E.reason == "baixa_sem_registro", 1), else_=0)
    page = (await db.execute(
        select(E, EntryItem).join(EntryItem, EntryItem.id == E.entry_item_id).where(*conds)
        .order_by(when_null, E.created_at.desc(), E.id.desc()).limit(limit).offset(skip))).all()

    item_ids = {it.id for _e, it in page}
    items_full = {}
    if item_ids:
        items_full = {i.id: i for i in (await db.execute(
            select(EntryItem).where(EntryItem.id.in_(item_ids))
            .options(selectinload(EntryItem.variant).selectinload(ProductVariant.product), selectinload(EntryItem.product))
        )).scalars().all()}
    entry_ids = {it.entry_id for _e, it in page}
    codes = dict((await db.execute(select(StockEntry.id, StockEntry.entry_code).where(StockEntry.id.in_(entry_ids)))).all()) if entry_ids else {}
    user_ids = {e.user_id for e, _i in page if e.user_id}
    users = dict((await db.execute(
        select(User.id, User.full_name).where(User.id.in_(user_ids), User.tenant_id == tenant_id))).all()) if user_ids else {}

    out = []
    for e, it in page:
        full = items_full.get(it.id, it)
        qty = -int(e.delta)
        unit = it.unit_cost + (it.extra_unit_cost or 0)
        out.append({
            "id": e.id,
            "when": None if e.reason == "baixa_sem_registro" or not e.created_at else e.created_at.isoformat(),
            "reason": e.reason,
            "label": REASONS.get(e.reason, e.reason),
            "quantity": qty,
            "product_id": full.variant.product_id if full.variant else full.product_id,
            "product_name": full.product_name,
            "variant_label": full.variant_label,
            "variant_code": full.variant_code,
            "entry_id": it.entry_id,
            "entry_code": codes.get(it.entry_id),
            "unit_cost": _money(unit),
            "cost_total": _money(unit * qty),
            "user_name": users.get(e.user_id),
            "note": e.note,
            "reconstructed": bool(e.reconstructed),
        })
    pieces = sum(v["pieces"] for v in by_reason.values())
    from decimal import Decimal
    cost = sum((Decimal(str(c)) for _r, _p, c, _n in agg), Decimal('0'))
    return {"totals": {"pieces": pieces, "cost": _money(cost), "by_reason": by_reason},
            "total_count": total_count, "items": out}
