"""
Custo por lote: rateio das despesas do lote e dos descontos entre as peças.

Regra (a mesma explicada ao lojista):
- o custo do lote = despesas ligadas ao lote (frete, pedágio...) - descontos;
- desconto GERAL (stock_entries.discount_amount) vale para todos os itens; desconto de UM fornecedor
  (entry_supplier_discounts) vale só para os itens daquele fornecedor, proporcional ao custo de cada um;
- dentro do lote, o custo é dividido entre os itens proporcional ao custo de mercadoria de cada um;
- cada unidade guarda a sua parte em entry_items.extra_unit_cost; o custo posto no estoque é
  unit_cost + extra_unit_cost, e é ele que o FIFO grava na venda (CMV), o valor do estoque e o lucro usam.

Despesa geral (sem lote) nunca entra aqui: vai para o resultado do mês.
Peças já vendidas mantêm o custo que tinham na venda; só o saldo em estoque é recalculado.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entry_item import EntryItem
from app.models.entry_supplier_discount import EntrySupplierDiscount
from app.models.expense import Expense
from app.models.stock_entry import StockEntry

ZERO = Decimal("0")
FOUR = Decimal("0.0001")


def _q4(value: Decimal) -> Decimal:
    return value.quantize(FOUR, rounding=ROUND_HALF_UP)


async def _entry_base_totals(db: AsyncSession, entry_ids: list[int]) -> dict[int, Decimal]:
    """Custo de mercadoria (quantidade recebida x custo unitário) dos itens ativos de cada entrada."""
    if not entry_ids:
        return {}
    rows = (await db.execute(
        select(EntryItem.entry_id, func.coalesce(func.sum(EntryItem.quantity_received * EntryItem.unit_cost), 0))
        .where(EntryItem.entry_id.in_(entry_ids), EntryItem.is_active == True)  # noqa: E712
        .group_by(EntryItem.entry_id)
    )).all()
    return {r[0]: Decimal(str(r[1])) for r in rows}


async def supplier_discounts_by_entry(db: AsyncSession, entry_ids: list[int]) -> dict[int, dict[int, Decimal]]:
    """{entry_id: {supplier_id: valor}} dos descontos por fornecedor."""
    if not entry_ids:
        return {}
    rows = (await db.execute(
        select(EntrySupplierDiscount).where(
            EntrySupplierDiscount.entry_id.in_(entry_ids), EntrySupplierDiscount.is_active == True  # noqa: E712
        )
    )).scalars().all()
    out: dict[int, dict[int, Decimal]] = {}
    for r in rows:
        out.setdefault(r.entry_id, {})[r.supplier_id] = Decimal(str(r.amount or 0))
    return out


async def entry_total_discount(db: AsyncSession, entry: StockEntry) -> Decimal:
    """Desconto total da entrada: geral + soma dos descontos por fornecedor."""
    d = await supplier_discounts_by_entry(db, [entry.id])
    return Decimal(str(entry.discount_amount or 0)) + sum(d.get(entry.id, {}).values(), ZERO)


async def entry_own_costs(db: AsyncSession, entry_id: int) -> Decimal:
    """Soma das despesas ligadas diretamente ao lote."""
    total = (await db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0))
        .where(Expense.stock_entry_id == entry_id, Expense.is_active == True)  # noqa: E712
    )).scalar() or 0
    return Decimal(str(total))


async def recompute_entries(
    db: AsyncSession, entry_ids: Iterable[int], *, tenant_id: Optional[int] = None, dry_run: bool = False
) -> dict[int, dict]:
    """
    Recalcula o rateio dos lotes informados. Só mexe em extra_unit_cost; não faz commit. Com `dry_run=True` só calcula
    (não grava), para os relatórios mostrarem de onde vem o custo de cada peça.
    Cada lote devolve também "items": {item_id: (frete_por_peca, desconto_por_peca)} com extra = frete - desconto.
    Devolve {entry_id: {"base": mercadoria, "own": despesas do lote, "extra": total}}.
    """
    ids = {int(i) for i in entry_ids if i is not None}
    if not ids:
        return {}

    stmt = select(StockEntry).where(StockEntry.id.in_(ids))
    if tenant_id is not None:
        stmt = stmt.where(StockEntry.tenant_id == tenant_id)
    entries = {e.id: e for e in (await db.execute(stmt)).scalars().all()}

    if not entries:
        return {}

    base = await _entry_base_totals(db, list(entries))
    sup_discounts = await supplier_discounts_by_entry(db, list(entries))

    result: dict[int, dict] = {}
    for entry in entries.values():
        entry_base = base.get(entry.id, ZERO)
        own = await entry_own_costs(db, entry.id) if entry.is_active else ZERO
        # Desconto do fornecedor abate o custo das peças; nunca passa da mercadoria (custo não fica negativo)
        general = min(Decimal(str(entry.discount_amount or 0)), entry_base) if entry.is_active else ZERO
        freight_gross = own   # despesas do lote (sempre >= 0)

        items = (await db.execute(
            select(EntryItem).where(EntryItem.entry_id == entry.id, EntryItem.is_active == True)  # noqa: E712
        )).scalars().all()
        total_units = sum(i.quantity_received for i in items)

        # Desconto de cada fornecedor: só nos itens dele (item sem fornecedor próprio usa o da entrada)
        def _sup(i, entry=entry):
            return i.supplier_id or entry.supplier_id

        base_by_sup: dict = {}
        for i in items:
            base_by_sup[_sup(i)] = base_by_sup.get(_sup(i), ZERO) + Decimal(i.quantity_received) * i.unit_cost
        sup_disc: dict = {}
        if entry.is_active:
            for sid, amount in sup_discounts.get(entry.id, {}).items():
                base_s = base_by_sup.get(sid, ZERO)
                # o desconto geral já tirou a parte proporcional das peças dele: o dele só vai até o que sobrou
                general_share = general * base_s / entry_base if entry_base > 0 else ZERO
                sup_disc[sid] = max(ZERO, min(amount, base_s - general_share))
        sup_total = sum(sup_disc.values(), ZERO)
        discount = general + sup_total
        extra_total = freight_gross - discount

        breakdown: dict[int, tuple[Decimal, Decimal]] = {}
        for item in items:
            # frete: proporcional ao custo de cada item (ou igual por peça se a mercadoria custa zero)
            if entry_base > 0:
                freight_raw = item.unit_cost * freight_gross / entry_base
                disc_raw = item.unit_cost * general / entry_base
            elif total_units > 0:
                freight_raw = freight_gross / Decimal(total_units)
                disc_raw = ZERO
            else:
                freight_raw = disc_raw = ZERO
            sid = _sup(item)
            if sup_disc.get(sid) and base_by_sup.get(sid, ZERO) > 0:
                disc_raw += item.unit_cost * sup_disc[sid] / base_by_sup[sid]
            freight_unit, discount_unit = _q4(freight_raw), _q4(disc_raw)
            new_extra = freight_unit - discount_unit      # extra = frete - desconto, exato (sem outro arredondamento)
            breakdown[item.id] = (freight_unit, discount_unit)
            if not dry_run and Decimal(str(item.extra_unit_cost or 0)) != new_extra:
                item.extra_unit_cost = new_extra
        result[entry.id] = {
            "base": entry_base,
            "own": own,
            "discount": discount,
            "extra": extra_total,
            "items": breakdown,
            "general_applied": general,
            "supplier_applied": dict(sup_disc),   # {fornecedor: desconto realmente aplicado}
        }
    if not dry_run:
        await db.flush()
    return result
