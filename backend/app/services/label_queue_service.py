"""
Fila de etiquetas e histórico de impressão (ver `app/models/label_queue.py`).

- Entrar na fila: de uma entrada (só o que ainda não foi impresso nem está na fila) ou peça avulsa.
- Gerar o PDF não muda nada. "Salvar impressão" (`confirm_print`) grava o que saiu, tira da fila e anda a folha.
- A posição em que a folha parou vem da última impressão confirmada do mesmo papel e tamanho (vale em qualquer aparelho).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.entry_item import EntryItem
from app.models.label_queue import LabelPrintJob, LabelQueueItem
from app.models.product_variant import ProductVariant
from app.models.stock_entry import StockEntry
from app.services.label_pdf_service import a4_grid, sheet_grid
from app.services.short_code_service import format_short_code, format_variant_code

MAX_QUEUE = 3000


class QueueError(ValueError):
    pass


def per_sheet(layout: str, width_mm: float, height_mm: float) -> int:
    if layout == "roll":
        return 1
    cols, rows = (sheet_grid(width_mm, height_mm) if layout == "sheet" else a4_grid(width_mm, height_mm))
    return max(1, cols * rows)


def _user_name(user: Any) -> Optional[str]:
    return getattr(user, "full_name", None) or getattr(user, "email", None)


async def _variants(db: AsyncSession, tenant_id: int, ids) -> Dict[int, ProductVariant]:
    rows = (await db.execute(
        select(ProductVariant).options(selectinload(ProductVariant.product))
        .where(ProductVariant.id.in_(set(ids)), ProductVariant.tenant_id == tenant_id)
    )).scalars().all()
    return {v.id: v for v in rows}


async def _pending(db: AsyncSession, tenant_id: int, lock: bool = False) -> List[LabelQueueItem]:
    q = (select(LabelQueueItem).where(LabelQueueItem.tenant_id == tenant_id, LabelQueueItem.is_active == True)  # noqa: E712
         .order_by(LabelQueueItem.id))
    if lock:
        q = q.with_for_update()   # dois "Imprimi" ao mesmo tempo não tiram a mesma etiqueta duas vezes
    return list((await db.execute(q)).scalars().all())


async def _jobs(db: AsyncSession, tenant_id: int) -> List[LabelPrintJob]:
    return list((await db.execute(
        select(LabelPrintJob).where(LabelPrintJob.tenant_id == tenant_id, LabelPrintJob.is_active == True)  # noqa: E712
        .order_by(LabelPrintJob.id)
    )).scalars().all())


def _printed_by_entry(jobs: List[LabelPrintJob], entry_id: int) -> Dict[int, int]:
    out: Dict[int, int] = {}
    for j in jobs:
        for it in j.items or []:
            if it.get("entry_id") == entry_id:
                out[it["variant_id"]] = out.get(it["variant_id"], 0) + int(it["quantity"])
    return out


async def list_queue(db: AsyncSession, tenant_id: int) -> Dict[str, Any]:
    rows = await _pending(db, tenant_id)
    variants = await _variants(db, tenant_id, [r.variant_id for r in rows])
    entry_ids = {r.entry_id for r in rows if r.entry_id}
    codes: Dict[int, str] = {}
    if entry_ids:
        codes = dict((await db.execute(select(StockEntry.id, StockEntry.entry_code).where(StockEntry.id.in_(entry_ids)))).all())
    items = []
    for r in rows:
        v = variants.get(r.variant_id)
        if v is None:
            continue
        items.append({
            "id": r.id, "variant_id": r.variant_id, "quantity": r.quantity, "entry_id": r.entry_id, "entry_code": codes.get(r.entry_id),
            "product_name": v.product.name if v.product else "", "color": v.color, "size": v.size,
            "price": float(v.price or 0),
            "code": format_variant_code(v.product_code, v.variant_number) or format_short_code(v.short_code),
            "added_by_name": r.added_by_name,
        })
    return {"items": items, "total": sum(i["quantity"] for i in items)}


async def add_items(db: AsyncSession, tenant_id: int, user: Any, items: List[Dict[str, int]], entry_id: Optional[int] = None) -> int:
    """Põe na fila (soma na linha da mesma variação e entrada). Devolve quantas etiquetas entraram."""
    wanted = [(int(i["variant_id"]), int(i["quantity"])) for i in items if int(i["quantity"]) > 0]
    if not wanted:
        raise QueueError("Nenhuma etiqueta para pôr na fila.")
    variants = await _variants(db, tenant_id, [v for v, _ in wanted])
    for vid, _ in wanted:
        v = variants.get(vid)
        if v is None:
            raise QueueError("Peça não encontrada nesta loja.")
        if not v.sku:
            raise QueueError("Peça de catálogo sem SKU não tem etiqueta: cadastre a peça antes.")
    if entry_id is not None:
        found = (await db.execute(select(StockEntry.id).where(StockEntry.id == entry_id, StockEntry.tenant_id == tenant_id))).scalar_one_or_none()
        if found is None:
            raise QueueError("Entrada não encontrada nesta loja.")
    rows = await _pending(db, tenant_id)
    if sum(r.quantity for r in rows) + sum(q for _, q in wanted) > MAX_QUEUE:
        raise QueueError(f"A fila aceita no máximo {MAX_QUEUE} etiquetas. Imprima e salve as que já estão nela.")
    existing = {(r.variant_id, r.entry_id): r for r in rows}
    added = 0
    for vid, qty in wanted:
        row = existing.get((vid, entry_id))
        if row is None:
            row = LabelQueueItem(tenant_id=tenant_id, variant_id=vid, entry_id=entry_id, quantity=qty, added_by_name=_user_name(user))
            db.add(row)
            existing[(vid, entry_id)] = row
        else:
            row.quantity += qty
        added += qty
    await db.flush()
    return added


async def entry_progress(db: AsyncSession, tenant_id: int, entry_id: int) -> Dict[str, Any]:
    entry = (await db.execute(select(StockEntry).where(StockEntry.id == entry_id, StockEntry.tenant_id == tenant_id))).scalar_one_or_none()
    if entry is None:
        raise QueueError("Entrada não encontrada nesta loja.")
    received: Dict[int, int] = {}
    for vid, qty in (await db.execute(
        select(EntryItem.variant_id, EntryItem.quantity_received).where(
            EntryItem.entry_id == entry_id, EntryItem.tenant_id == tenant_id, EntryItem.is_active == True,  # noqa: E712
            EntryItem.variant_id.is_not(None))
    )).all():
        received[vid] = received.get(vid, 0) + int(qty or 0)
    printed = _printed_by_entry(await _jobs(db, tenant_id), entry_id)
    queued: Dict[int, int] = {}
    for r in await _pending(db, tenant_id):
        if r.entry_id == entry_id:
            queued[r.variant_id] = queued.get(r.variant_id, 0) + r.quantity
    lines = []
    for vid, rec in received.items():
        p, q = printed.get(vid, 0), queued.get(vid, 0)
        lines.append({"variant_id": vid, "received": rec, "printed": p, "queued": q, "missing": max(0, rec - p - q)})

    def tot(k: str) -> int:
        return sum(line[k] for line in lines)

    return {"entry_code": entry.entry_code, "received": tot("received"), "printed": tot("printed"), "queued": tot("queued"),
            "missing": tot("missing"), "lines": lines}


async def add_entry_missing(db: AsyncSession, tenant_id: int, user: Any, entry_id: int) -> Dict[str, Any]:
    """Põe na fila só o que a entrada ainda não imprimiu nem tem na fila (chamar duas vezes não dobra)."""
    prog = await entry_progress(db, tenant_id, entry_id)
    todo = [{"variant_id": ln["variant_id"], "quantity": ln["missing"]} for ln in prog["lines"] if ln["missing"] > 0]
    if not todo:
        return {"added": 0, "progress": prog}
    added = await add_items(db, tenant_id, user, todo, entry_id=entry_id)
    return {"added": added, "progress": await entry_progress(db, tenant_id, entry_id)}


async def set_quantity(db: AsyncSession, tenant_id: int, item_id: int, quantity: int) -> None:
    row = (await db.execute(select(LabelQueueItem).where(
        LabelQueueItem.id == item_id, LabelQueueItem.tenant_id == tenant_id, LabelQueueItem.is_active == True))).scalar_one_or_none()  # noqa: E712
    if row is None:
        raise QueueError("Item da fila não encontrado.")
    if quantity <= 0:
        row.is_active = False
    else:
        row.quantity = quantity
    await db.flush()


async def print_state(db: AsyncSession, tenant_id: int, layout: str, width_mm: float, height_mm: float) -> Dict[str, Any]:
    """Onde a próxima impressão começa e o que já está na folha atual (para mostrar a folha inteira no app)."""
    n = per_sheet(layout, width_mm, height_mm)
    nxt, last = 1, None
    sheet: List[Dict[str, Any]] = []
    if layout != "roll":
        mine = [j for j in await _jobs(db, tenant_id) if j.layout == layout and j.width_mm == width_mm and j.height_mm == height_mm]
        occupied: Dict[int, Dict[str, int]] = {}
        for j in mine:
            if j.start_position == 1:
                occupied = {}
            pos = j.start_position
            for it in j.items or []:
                for _ in range(int(it["quantity"])):
                    if pos > n:
                        pos, occupied = 1, {}
                    occupied[pos] = {"variant_id": it["variant_id"]}
                    pos += 1
        if mine:
            last = mine[-1]
            nxt = last.next_position if 1 <= last.next_position <= n else 1
        if nxt == 1:
            occupied = {}
        variants = await _variants(db, tenant_id, [o["variant_id"] for o in occupied.values()]) if occupied else {}
        for position, o in sorted(occupied.items()):
            v = variants.get(o["variant_id"])
            sheet.append({
                "position": position,
                "code": (format_variant_code(v.product_code, v.variant_number) or format_short_code(v.short_code)) if v else None,
                "name": v.product.name if v and v.product else None,
                "color": v.color if v else None, "size": v.size if v else None,
            })
    return {"next_position": nxt, "per_sheet": n, "sheet": sheet,
            "last": {"id": last.id, "at": last.created_at.isoformat(), "by": last.printed_by_name, "total": last.total} if last else None}


async def confirm_print(db: AsyncSession, tenant_id: int, user: Any, layout: str, width_mm: float, height_mm: float,
                        start_position: int, items: List[Dict[str, int]], from_queue: bool, entry_id: Optional[int]) -> Dict[str, Any]:
    wanted = [(int(i["variant_id"]), int(i["quantity"])) for i in items if int(i["quantity"]) > 0]
    if not wanted:
        raise QueueError("Nenhuma etiqueta para salvar.")
    variants = await _variants(db, tenant_id, [v for v, _ in wanted])
    if any(v not in variants for v, _ in wanted):
        raise QueueError("Peça não encontrada nesta loja.")
    n = per_sheet(layout, width_mm, height_mm)
    if not 1 <= start_position <= n:
        raise QueueError(f"A posição inicial deve ser de 1 a {n}.")
    total = sum(q for _, q in wanted)
    job_items: List[Dict[str, Any]] = []
    if from_queue:
        rows = await _pending(db, tenant_id, lock=True)
        for vid, qty in wanted:
            left = qty
            for r in rows:
                if left == 0:
                    break
                if r.variant_id != vid or not r.is_active:
                    continue
                take = min(left, r.quantity)
                job_items.append({"variant_id": vid, "quantity": take, "entry_id": r.entry_id})
                r.quantity -= take
                if r.quantity == 0:
                    r.is_active = False
                left -= take
            if left:
                job_items.append({"variant_id": vid, "quantity": left, "entry_id": None})   # passou do que estava na fila
    else:
        job_items = [{"variant_id": vid, "quantity": q, "entry_id": entry_id} for vid, q in wanted]
    used = (start_position - 1 + total) % n
    next_position = 1 if (layout == "roll" or used == 0) else used + 1
    job = LabelPrintJob(tenant_id=tenant_id, layout=layout, width_mm=width_mm, height_mm=height_mm, start_position=start_position,
                        next_position=next_position, total=total, items=job_items,
                        printed_by_id=getattr(user, "id", None), printed_by_name=_user_name(user))
    db.add(job)
    await db.flush()
    return {"id": job.id, "total": total, "next_position": next_position, "per_sheet": n}


async def undo_print(db: AsyncSession, tenant_id: int, user: Any, job_id: int) -> Dict[str, Any]:
    """Não saiu: desfaz a ÚLTIMA impressão salva; as etiquetas voltam para a fila e a folha volta onde estava."""
    jobs = await _jobs(db, tenant_id)
    if not jobs or jobs[-1].id != job_id:
        raise QueueError("Só a última impressão salva pode ser desfeita.")
    job = jobs[-1]
    job.is_active = False
    rows = await _pending(db, tenant_id)
    existing = {(r.variant_id, r.entry_id): r for r in rows}
    for it in job.items:
        key = (it["variant_id"], it.get("entry_id"))
        if key in existing:
            existing[key].quantity += int(it["quantity"])
        else:
            row = LabelQueueItem(tenant_id=tenant_id, variant_id=it["variant_id"], entry_id=it.get("entry_id"),
                                 quantity=int(it["quantity"]), added_by_name=_user_name(user))
            db.add(row)
            existing[key] = row
    await db.flush()
    return {"returned": job.total}
