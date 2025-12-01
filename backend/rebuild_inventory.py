"""Rebuild da tabela de inventário a partir dos entry_items (FIFO).

Uso:
    python rebuild_inventory.py                # Rebuild global (todos tenants)
    python rebuild_inventory.py --tenant 2     # Rebuild apenas tenant 2
    python rebuild_inventory.py --product 15   # Rebuild apenas produto 15 (todos tenants)
    python rebuild_inventory.py --tenant 2 --product 15  # Específico

Principais regras:
- Inventory é derivado da soma de quantity_remaining dos entry_items ativos.
- Cria registro de inventory se não existir.
- Não gera movimentos (ajuste silencioso). Pode-se adicionar flag futura --movements.
- Reporta divergências encontradas.
"""
from __future__ import annotations
import argparse
import asyncio
from dataclasses import dataclass
from typing import Dict, Tuple, List
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select, func, update
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite+aiosqlite:///./fitness_store.db"
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Import tardio para evitar custo de carga quando importado como módulo
from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.models.product import Product


@dataclass
class InventoryDelta:
    product_id: int
    tenant_id: int | None
    fifo_sum: int
    previous_inventory: int | None

    @property
    def changed(self) -> bool:
        if self.previous_inventory is None:
            return True  # criação
        return self.previous_inventory != self.fifo_sum

    def summary(self) -> str:
        if self.previous_inventory is None:
            return f"CRIAR product={self.product_id} tenant={self.tenant_id} qty={self.fifo_sum}"
        return f"ATUALIZAR product={self.product_id} tenant={self.tenant_id} {self.previous_inventory} -> {self.fifo_sum}"


async def collect_fifo_sums(db: AsyncSession, tenant_id: int | None, product_id: int | None) -> List[Tuple[int, int | None, int]]:
    stmt = select(
        EntryItem.product_id,
        EntryItem.tenant_id,
        func.coalesce(func.sum(EntryItem.quantity_remaining), 0).label("fifo_sum")
    ).where(EntryItem.is_active == True)
    if tenant_id is not None:
        stmt = stmt.where(EntryItem.tenant_id == tenant_id)
    if product_id is not None:
        stmt = stmt.where(EntryItem.product_id == product_id)
    stmt = stmt.group_by(EntryItem.product_id, EntryItem.tenant_id)
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1], int(r[2])) for r in rows]


async def get_existing_inventories(db: AsyncSession, tenant_id: int | None, product_id: int | None) -> Dict[Tuple[int, int | None], Inventory]:
    stmt = select(Inventory)
    if tenant_id is not None:
        stmt = stmt.where(Inventory.tenant_id == tenant_id)
    if product_id is not None:
        stmt = stmt.where(Inventory.product_id == product_id)
    inventory_list = (await db.execute(stmt)).scalars().all()
    return {(inv.product_id, inv.tenant_id): inv for inv in inventory_list}


async def rebuild(db: AsyncSession, tenant_id: int | None = None, product_id: int | None = None) -> List[InventoryDelta]:
    fifo_rows = await collect_fifo_sums(db, tenant_id, product_id)
    existing = await get_existing_inventories(db, tenant_id, product_id)

    deltas: List[InventoryDelta] = []

    for prod_id, ten_id, fifo_sum in fifo_rows:
        key = (prod_id, ten_id)
        prev = existing.get(key)
        previous_qty = prev.quantity if prev else None
        deltas.append(InventoryDelta(product_id=prod_id, tenant_id=ten_id, fifo_sum=fifo_sum, previous_inventory=previous_qty))

    # Também considerar inventories que existem mas não possuem mais entry_items ativos (devem ir a zero)
    for key, inv in existing.items():
        if not any(d.product_id == key[0] and d.tenant_id == key[1] for d in deltas):
            deltas.append(InventoryDelta(product_id=key[0], tenant_id=key[1], fifo_sum=0, previous_inventory=inv.quantity))

    # Aplicar mudanças
    for delta in deltas:
        if delta.previous_inventory is None:
            # criar
            new_inv = Inventory(product_id=delta.product_id, quantity=delta.fifo_sum)
            new_inv.tenant_id = delta.tenant_id
            db.add(new_inv)
        elif delta.changed:
            # atualizar direto sem movimento
            stmt = (
                update(Inventory)
                .where(Inventory.product_id == delta.product_id)
                .where(Inventory.tenant_id.is_(delta.tenant_id) if delta.tenant_id is None else Inventory.tenant_id == delta.tenant_id)
                .values(quantity=delta.fifo_sum)
            )
            await db.execute(stmt)

    await db.commit()
    return deltas


async def main(args):
    async with AsyncSessionLocal() as db:
        deltas = await rebuild(db, tenant_id=args.tenant, product_id=args.product)
        print("\n=== REBUILD INVENTORY RESULT ===")
        changed = 0
        for d in deltas:
            if d.changed:
                changed += 1
                print("*", d.summary())
        if changed == 0:
            print("Nenhuma alteração necessária. Inventário já alinhado ao FIFO.")
        else:
            print(f"\nTotal de ajustes: {changed}")
        print("\nInvariantes principais preservadas: quantidade derivada do FIFO sem modificar entry_items.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rebuild da tabela de inventário a partir de entry_items.")
    parser.add_argument("--tenant", type=int, help="Tenant específico", required=False)
    parser.add_argument("--product", type=int, help="Produto específico", required=False)
    args = parser.parse_args()
    asyncio.run(main(args))
