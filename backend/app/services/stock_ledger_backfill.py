"""Monta o livro do estoque dos lotes que já existiam antes dele (`scripts/ledger_backfill.py` chama isto).

Para cada lote sem nenhum registro grava, em ordem:
  1. `entrada`: o que foi recebido (saldo 0 -> recebido);
  2. `venda` / `devolucao`: as peças vendidas, líquidas de devolução (vêm de `sale_sources`, a prova mais forte que existe);
  3. as saídas SEM venda: se há movimento de estoque gravado na hora ("Baixa ao excluir variação (...): variação SKU excluída")
     que aponta para a variação, o registro leva o motivo dele; o que sobra fica como `baixa_sem_registro`.
Tudo que é refeito depois leva `reconstructed=True` e uma nota dizendo de onde veio; o que foi gravado na hora não é inventado.
O último "depois" de cada lote é o saldo de agora, então a corrente fecha por construção. Sem `apply` só conta e não grava.
"""
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entry_item import EntryItem
from app.models.entry_item_event import EntryItemEvent
from app.models.inventory import InventoryMovement
from app.models.product_variant import ProductVariant
from app.services.stock_flow_service import item_flows

_SKU = re.compile(r"variação\s+(\S+)\s+exclu", re.IGNORECASE)


async def backfill(db: AsyncSession, tenant_id: int, *, apply: bool = False) -> Dict[str, Any]:
    have = {r[0] for r in (await db.execute(
        select(EntryItemEvent.entry_item_id).where(EntryItemEvent.tenant_id == tenant_id).distinct())).all()}
    items = [i for i in (await db.execute(select(EntryItem).where(EntryItem.tenant_id == tenant_id).order_by(EntryItem.id))).scalars().all()
             if i.id not in have]
    flows = await item_flows(db, tenant_id, [i for i in items if i.is_active])
    skus = {v.id: v.sku for v in (await db.execute(select(ProductVariant).where(ProductVariant.tenant_id == tenant_id))).scalars().all()}
    # movimentos gravados na hora, por SKU da variação excluída (um movimento = 1 peça)
    moves: Dict[str, List[InventoryMovement]] = {}
    for mv in (await db.execute(select(InventoryMovement).where(InventoryMovement.tenant_id == tenant_id).order_by(InventoryMovement.id))).scalars().all():
        m = _SKU.search(mv.notes or "")
        if m:
            moves.setdefault(m.group(1), []).append(mv)

    now = datetime.now(timezone.utc)
    rows: List[Dict[str, Any]] = []
    summary = {"items": len(items), "events": 0, "sem_registro": 0, "com_registro": 0}

    def add(i: EntryItem, reason: str, before: int, after: int, note: str, when=None):
        rows.append(dict(created_at=when or now, updated_at=now, is_active=True, tenant_id=tenant_id, entry_item_id=i.id,
                         variant_id=i.variant_id, product_id=i.product_id, reason=reason, delta=after - before, before=before,
                         after=after, user_id=None, ref=None, note=note, reconstructed=True))

    for i in items:
        bal = i.quantity_received
        add(i, "entrada", 0, bal, "Saldo reconstruído a partir da entrada", getattr(i, "created_at", None))
        if not i.is_active:
            if bal != i.quantity_remaining:
                add(i, "baixa_sem_registro", bal, i.quantity_remaining, "Item excluído da entrada")
            continue
        f = flows[i.id]
        if f["sold"]:
            add(i, "venda", bal, bal - f["sold"], "Vendas (somadas das fontes FIFO), líquidas de devolução")
            bal -= f["sold"]
        if f["with_customer"]:
            add(i, "condicional_envio", bal, bal - f["with_customer"], "Peças com a cliente em condicional")
            bal -= f["with_customer"]
        pending = f["removed"]
        sku = skus.get(i.variant_id)
        pool = moves.get(sku, []) if sku else []
        while pending > 0 and pool:
            mv = pool.pop(0)
            take = min(pending, abs(int(mv.quantity_change)) or 1)
            add(i, "variacao_excluida", bal, bal - take, f"Movimento de estoque #{mv.id} gravado na hora: {(mv.notes or '')[:120]}", mv.created_at)
            bal -= take
            pending -= take
            summary["com_registro"] += take
        if pending > 0:
            add(i, "baixa_sem_registro", bal, bal - pending, "Saída sem venda e sem registro na hora; refeita pela conta recebidas - vendidas - estoque")
            bal -= pending
            summary["sem_registro"] += pending
        if bal != i.quantity_remaining:   # não deveria acontecer: a conta fecha por construção
            raise RuntimeError(f"Lote {i.id}: livro termina em {bal} e o saldo é {i.quantity_remaining}")
    summary["events"] = len(rows)
    if apply and rows:
        await db.execute(insert(EntryItemEvent.__table__), rows)
        await db.commit()
    summary["applied"] = bool(apply and rows)
    return summary
