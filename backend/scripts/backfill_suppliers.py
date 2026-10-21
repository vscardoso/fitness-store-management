"""
Migra fornecedores escritos como texto livre nas entradas antigas para o cadastro de fornecedores.

O que faz (idempotente, pode rodar quantas vezes quiser):
  0. Entradas de estoque inicial do sistema (tipo "initial") são ignoradas: não têm fornecedor real.
  1. Para cada entrada sem `supplier_id`: acha o fornecedor pelo nome normalizado (sem acento,
     caixa e espaços) ou pelo CNPJ; se não existir, cria o cadastro.
  2. Itens da entrada sem `supplier_id` herdam o fornecedor da entrada.
  3. Recalcula `supplier_products` (último custo, nº de compras, última compra) a partir de TODO o
     histórico de itens com fornecedor, o que alimenta o card "Fornecedores" do produto.

Uso (a partir de backend/):
    python scripts/backfill_suppliers.py              # simulação: só mostra o que faria
    python scripts/backfill_suppliers.py --apply      # grava

A base usada é a do DATABASE_URL (.env). Faça backup do arquivo .db antes de --apply.
"""
import argparse
import asyncio
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.database import async_session_maker, init_db  # noqa: E402
from app.models.entry_item import EntryItem  # noqa: E402
from app.models.stock_entry import EntryType, StockEntry  # noqa: E402
from app.models.supplier import Supplier  # noqa: E402
from app.models.supplier_product import SupplierProduct  # noqa: E402
from app.services.stock_entry_service import StockEntryService  # noqa: E402


async def main(apply: bool) -> None:
    await init_db()  # garante a coluna nova no SQLite
    async with async_session_maker() as db:
        svc = StockEntryService(db)

        suppliers_before = len((await db.execute(select(Supplier))).scalars().all())
        entries = (await db.execute(
            select(StockEntry).order_by(StockEntry.entry_date, StockEntry.id)
        )).scalars().all()

        entries_linked = 0
        items_linked = 0
        for entry in entries:
            # Estoque inicial automático do sistema não tem fornecedor real
            if entry.entry_type == EntryType.INITIAL_INVENTORY:
                continue
            if entry.supplier_id is None:
                supplier = await svc._resolve_supplier(
                    None, entry.supplier_name, entry.supplier_cnpj, entry.supplier_contact, entry.tenant_id
                )
                if supplier is not None:
                    entry.supplier_id = supplier.id
                    entries_linked += 1
            if entry.supplier_id is not None:
                items = (await db.execute(
                    select(EntryItem).where(EntryItem.entry_id == entry.id)
                )).scalars().all()
                for item in items:
                    if item.supplier_id is None:
                        item.supplier_id = entry.supplier_id
                        items_linked += 1
        await db.flush()

        # Recalcula os vínculos fornecedor x produto a partir de todo o histórico
        rows = (await db.execute(
            select(EntryItem, StockEntry)
            .join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(EntryItem.supplier_id.is_not(None), EntryItem.product_id.is_not(None))
        )).all()
        # (tenant, supplier, product) -> {entry_id: [data, qtd, custo_total]}
        groups = defaultdict(dict)
        for item, entry in rows:
            key = (entry.tenant_id, item.supplier_id, item.product_id)
            g = groups[key].setdefault(entry.id, [entry.entry_date, 0, Decimal("0")])
            g[1] += item.quantity_received
            g[2] += item.quantity_received * item.unit_cost

        links_created = links_updated = 0
        for (tenant_id, supplier_id, product_id), per_entry in groups.items():
            last_entry = max(per_entry.values(), key=lambda g: g[0])
            qty, total = last_entry[1], last_entry[2]
            last_cost = (total / qty).quantize(Decimal("0.01")) if qty else Decimal("0")
            existing = (await db.execute(
                select(SupplierProduct).where(
                    SupplierProduct.supplier_id == supplier_id,
                    SupplierProduct.product_id == product_id,
                    SupplierProduct.tenant_id == tenant_id,
                )
            )).scalar_one_or_none()
            if existing is None:
                db.add(SupplierProduct(
                    supplier_id=supplier_id, product_id=product_id, tenant_id=tenant_id,
                    last_unit_cost=last_cost, purchase_count=len(per_entry),
                    last_purchase_date=last_entry[0],
                ))
                links_created += 1
            else:
                existing.last_unit_cost = last_cost
                existing.purchase_count = len(per_entry)
                existing.last_purchase_date = last_entry[0]
                existing.is_active = True
                links_updated += 1
        await db.flush()

        suppliers_after = len((await db.execute(select(Supplier))).scalars().all())
        print(f"Entradas analisadas:            {len(entries)}")
        print(f"Entradas ligadas a fornecedor:  {entries_linked}")
        print(f"Itens ligados a fornecedor:     {items_linked}")
        print(f"Fornecedores no cadastro:       {suppliers_before} -> {suppliers_after}")
        print(f"Vinculos produto x fornecedor:  {links_created} criados, {links_updated} atualizados")

        if apply:
            await db.commit()
            print("\nGRAVADO.")
        else:
            await db.rollback()
            print("\nSIMULACAO: nada foi gravado. Rode com --apply para gravar.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="grava as alterações (sem isso é simulação)")
    asyncio.run(main(parser.parse_args().apply))
