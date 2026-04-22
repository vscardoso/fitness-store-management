"""
Fix online stock entry sold quantities using FIFO sale sources.

Why:
- A previous bug in correction flow could alter EntryItem quantities in a way that
  made `quantity_sold` inconsistent for ONLINE entries.
- `quantity_sold` is derived as: quantity_received - quantity_remaining.
- This script rebuilds the derived sold using real FIFO sale sources from SaleItem.sale_sources.

How it works:
- Target ONLINE StockEntry records (optionally by entry id / tenant id).
- For each active EntryItem in target entries, compute real sold from FIFO sources:
  sum(quantity_taken) where source.entry_item_id == item.id.
- Update item.quantity_received = item.quantity_remaining + real_sold.
  (This preserves remaining stock and aligns sold with real sales history.)
- Recalculate entry.total_cost and rebuild inventory from FIFO for affected products.

Usage:
  python scripts/fix_online_entry_sold_from_fifo.py --dry-run
  python scripts/fix_online_entry_sold_from_fifo.py --entry-id 72 --apply
  python scripts/fix_online_entry_sold_from_fifo.py --tenant-id 3 --apply
"""

from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict
from decimal import Decimal
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import async_session_maker
from app.models.stock_entry import StockEntry, EntryType
from app.models.sale import Sale, SaleItem, SaleStatus
from app.models.entry_item import EntryItem
from app.services.inventory_service import InventoryService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fix ONLINE entry sold metrics from FIFO sale sources")
    parser.add_argument("--entry-id", type=int, default=None, help="Fix only this stock entry id")
    parser.add_argument("--tenant-id", type=int, default=None, help="Restrict fix to tenant id")
    parser.add_argument("--apply", action="store_true", help="Apply changes (default is dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Dry-run mode (default behavior)")
    return parser.parse_args()


def extract_taken_by_entry_item(sale_sources: dict | None) -> dict[int, int]:
    """Extract quantity_taken grouped by entry_item_id from sale_sources payload."""
    out: dict[int, int] = defaultdict(int)
    if not sale_sources:
        return out

    sources = sale_sources.get("sources") if isinstance(sale_sources, dict) else None
    if not isinstance(sources, list):
        return out

    for source in sources:
        if not isinstance(source, dict):
            continue
        entry_item_id = source.get("entry_item_id")
        qty_taken = source.get("quantity_taken", 0)
        if isinstance(entry_item_id, int):
            try:
                out[entry_item_id] += int(qty_taken)
            except Exception:
                continue
    return out


async def load_target_entries(entry_id: int | None, tenant_id: int | None) -> list[StockEntry]:
    async with async_session_maker() as db:
        stmt = (
            select(StockEntry)
            .options(selectinload(StockEntry.entry_items).selectinload(EntryItem.variant))
            .where(
                StockEntry.is_active == True,
                StockEntry.entry_type == EntryType.ONLINE,
            )
        )
        if entry_id is not None:
            stmt = stmt.where(StockEntry.id == entry_id)
        if tenant_id is not None:
            stmt = stmt.where(StockEntry.tenant_id == tenant_id)

        result = await db.execute(stmt)
        return list(result.scalars().all())


async def build_real_sold_map(target_entry_ids: Iterable[int], tenant_id: int | None) -> dict[int, int]:
    """Map entry_item_id -> real sold qty using FIFO sale sources."""
    entry_ids = set(target_entry_ids)
    sold_by_item: dict[int, int] = defaultdict(int)

    async with async_session_maker() as db:
        stmt = (
            select(SaleItem)
            .join(Sale, SaleItem.sale_id == Sale.id)
            .where(
                SaleItem.is_active == True,
                Sale.is_active == True,
                Sale.status.in_([SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED]),
            )
        )
        if tenant_id is not None:
            stmt = stmt.where(SaleItem.tenant_id == tenant_id, Sale.tenant_id == tenant_id)

        result = await db.execute(stmt)
        sale_items = list(result.scalars().all())

        for sale_item in sale_items:
            taken_map = extract_taken_by_entry_item(sale_item.sale_sources)
            if not taken_map:
                continue

            # Keep only sources that belong to targeted entries.
            for entry_item_id, qty_taken in taken_map.items():
                # We do not know entry id directly here; include all first,
                # final filter is done against loaded target items.
                sold_by_item[entry_item_id] += qty_taken

    return sold_by_item


async def run_fix(entry_id: int | None, tenant_id: int | None, apply: bool) -> None:
    entries = await load_target_entries(entry_id, tenant_id)
    if not entries:
        print("No ONLINE entries found for the given filters.")
        return

    target_item_ids = [item.id for entry in entries for item in entry.entry_items if item.is_active]
    sold_map = await build_real_sold_map([e.id for e in entries], tenant_id)

    changes = []
    for entry in entries:
        for item in entry.entry_items:
            if not item.is_active:
                continue
            real_sold = max(0, int(sold_map.get(item.id, 0)))
            current_sold = int(item.quantity_sold)
            new_received = int(item.quantity_remaining) + real_sold

            if new_received != int(item.quantity_received):
                changes.append(
                    {
                        "entry_id": entry.id,
                        "entry_code": entry.entry_code,
                        "item_id": item.id,
                        "product_id": item.product_id,
                        "variant_id": item.variant_id,
                        "qty_received_old": int(item.quantity_received),
                        "qty_received_new": new_received,
                        "qty_remaining": int(item.quantity_remaining),
                        "sold_current": current_sold,
                        "sold_real": real_sold,
                    }
                )

    if not changes:
        print("No inconsistencies found. Nothing to change.")
        return

    print(f"Found {len(changes)} item(s) to fix.")
    for c in changes:
        print(
            f"- entry {c['entry_id']} ({c['entry_code']}) item {c['item_id']}: "
            f"received {c['qty_received_old']} -> {c['qty_received_new']} | "
            f"remaining {c['qty_remaining']} | sold current {c['sold_current']} -> real {c['sold_real']}"
        )

    if not apply:
        print("\nDry-run only. Re-run with --apply to persist changes.")
        return

    # Apply phase
    async with async_session_maker() as db:
        # Reload entries in this session to persist changes.
        stmt = (
            select(StockEntry)
            .options(selectinload(StockEntry.entry_items))
            .where(
                StockEntry.is_active == True,
                StockEntry.entry_type == EntryType.ONLINE,
            )
        )
        if entry_id is not None:
            stmt = stmt.where(StockEntry.id == entry_id)
        if tenant_id is not None:
            stmt = stmt.where(StockEntry.tenant_id == tenant_id)

        result = await db.execute(stmt)
        db_entries = list(result.scalars().all())

        by_item = {c["item_id"]: c for c in changes}
        affected_product_ids: set[int] = set()

        for entry in db_entries:
            for item in entry.entry_items:
                change = by_item.get(item.id)
                if not change:
                    continue

                item.quantity_received = change["qty_received_new"]
                existing_notes = item.notes or ""
                marker = "[FIX ONLINE SOLD FIFO]"
                if marker not in existing_notes:
                    item.notes = f"{existing_notes}\n{marker}".strip()

                # Recompute entry total cost after item changes.
                entry.total_cost = sum(
                    Decimal(str(i.quantity_received)) * i.unit_cost
                    for i in entry.entry_items
                    if i.is_active
                )

                if item.product_id is not None:
                    affected_product_ids.add(int(item.product_id))
                elif item.variant and item.variant.product_id is not None:
                    affected_product_ids.add(int(item.variant.product_id))

        await db.flush()

        inv_service = InventoryService(db)
        for pid in affected_product_ids:
            await inv_service.rebuild_product_from_fifo(pid, tenant_id=tenant_id)

        await db.commit()
        print(f"\nApplied fixes to {len(changes)} item(s).")


async def main() -> None:
    args = parse_args()
    apply = bool(args.apply and not args.dry_run)
    await run_fix(entry_id=args.entry_id, tenant_id=args.tenant_id, apply=apply)


if __name__ == "__main__":
    asyncio.run(main())
