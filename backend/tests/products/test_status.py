from decimal import Decimal
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.models.store import Store
from app.models.category import Category
from app.models.product import Product
from app.models.entry_item import EntryItem
from app.models.stock_entry import StockEntry, EntryType
from app.services.inventory_service import InventoryService
from app.services.product_service import ProductService


@pytest.mark.asyncio
async def test_products_status_flags(db: AsyncSession):
    u = uuid.uuid4().hex[:8]

    # Tenant e categoria
    store = Store(name=f"Tenant Status {u}", slug=f"tenant-status-{u}")
    db.add(store); await db.flush()
    cat = Category(name="Geral", slug=f"geral-status-{u}"); cat.tenant_id = store.id
    db.add(cat); await db.flush()

    # Produtos: A (never_stocked), B (in_stock), C (depleted)
    prod_a = Product(name="A", sku=f"A-{u}", barcode=f"A-{u}", price=Decimal("10.00"), category_id=cat.id, is_catalog=False, is_active=True); prod_a.tenant_id = store.id
    prod_b = Product(name="B", sku=f"B-{u}", barcode=f"B-{u}", price=Decimal("10.00"), category_id=cat.id, is_catalog=False, is_active=True); prod_b.tenant_id = store.id
    prod_c = Product(name="C", sku=f"C-{u}", barcode=f"C-{u}", price=Decimal("10.00"), category_id=cat.id, is_catalog=False, is_active=True); prod_c.tenant_id = store.id
    db.add_all([prod_a, prod_b, prod_c]); await db.flush()

    # Entradas: B com restante > 0, C com restante == 0
    entry_b = StockEntry(entry_code=f"ENTRY-B-{u}", entry_date=__import__("datetime").date.today(), entry_type=EntryType.LOCAL, supplier_name="Fornecedor", total_cost=Decimal("0.00")); entry_b.tenant_id = store.id
    db.add(entry_b); await db.flush()
    item_b = EntryItem(entry_id=entry_b.id, product_id=prod_b.id, quantity_received=5, quantity_remaining=5, unit_cost=Decimal("2.00")); item_b.tenant_id = store.id

    entry_c = StockEntry(entry_code=f"ENTRY-C-{u}", entry_date=__import__("datetime").date.today(), entry_type=EntryType.LOCAL, supplier_name="Fornecedor", total_cost=Decimal("0.00")); entry_c.tenant_id = store.id
    db.add(entry_c); await db.flush()
    item_c = EntryItem(entry_id=entry_c.id, product_id=prod_c.id, quantity_received=3, quantity_remaining=0, unit_cost=Decimal("2.00")); item_c.tenant_id = store.id
    db.add_all([item_b, item_c]); await db.flush()

    inv_service = InventoryService(db); await inv_service.rebuild_all_from_fifo(tenant_id=store.id)
    prod_service = ProductService(db); statuses = await prod_service.get_products_status(tenant_id=store.id)
    by_sku = {s.sku: s for s in statuses}
    assert by_sku[f"A-{u}"].never_stocked and not by_sku[f"A-{u}"].in_stock and not by_sku[f"A-{u}"].depleted
    assert by_sku[f"B-{u}"].in_stock and not by_sku[f"B-{u}"].never_stocked and not by_sku[f"B-{u}"].depleted
    assert by_sku[f"C-{u}"].depleted and not by_sku[f"C-{u}"].in_stock and not by_sku[f"C-{u}"].never_stocked


@pytest.mark.asyncio
async def test_products_status_include_catalog_and_soft_delete(db: AsyncSession):
    u = uuid.uuid4().hex[:8]
    store = Store(name=f"Tenant Status Cat {u}", slug=f"tenant-status-cat-{u}"); db.add(store); await db.flush()
    cat = Category(name="Geral", slug=f"geral-status-cat-{u}"); cat.tenant_id = store.id; db.add(cat); await db.flush()

    prod_catalog = Product(name="Template", sku=f"T-{u}", barcode=f"T-{u}", price=Decimal("20.00"), category_id=cat.id, is_catalog=True, is_active=True); prod_catalog.tenant_id = store.id
    prod_active = Product(name="Ativo", sku=f"AT-{u}", barcode=f"AT-{u}", price=Decimal("30.00"), category_id=cat.id, is_catalog=False, is_active=True); prod_active.tenant_id = store.id
    prod_delete = Product(name="Del", sku=f"DEL-{u}", barcode=f"DEL-{u}", price=Decimal("40.00"), category_id=cat.id, is_catalog=False, is_active=True); prod_delete.tenant_id = store.id
    db.add_all([prod_catalog, prod_active, prod_delete]); await db.flush()

    entry = StockEntry(entry_code=f"ENTRY-{u}", entry_date=__import__("datetime").date.today(), entry_type=EntryType.LOCAL, supplier_name="Fornecedor", total_cost=Decimal("0.00")); entry.tenant_id = store.id
    db.add(entry); await db.flush()
    item_active = EntryItem(entry_id=entry.id, product_id=prod_active.id, quantity_received=2, quantity_remaining=2, unit_cost=Decimal("5.00")); item_active.tenant_id = store.id
    item_delete = EntryItem(entry_id=entry.id, product_id=prod_delete.id, quantity_received=1, quantity_remaining=1, unit_cost=Decimal("6.00")); item_delete.tenant_id = store.id
    db.add_all([item_active, item_delete]); await db.flush()

    prod_delete.is_active = False; await db.flush()

    inv_service = InventoryService(db); await inv_service.rebuild_all_from_fifo(tenant_id=store.id)
    service = ProductService(db)
    statuses_no_catalog = await service.get_products_status(tenant_id=store.id, include_catalog=False)
    skus_no_catalog = {s.sku for s in statuses_no_catalog}
    assert f"T-{u}" not in skus_no_catalog  # catalog excluded
    assert f"DEL-{u}" not in skus_no_catalog  # soft-deleted excluded
    assert f"AT-{u}" in skus_no_catalog

    statuses_with_catalog = await service.get_products_status(tenant_id=store.id, include_catalog=True)
    skus_with_catalog = {s.sku for s in statuses_with_catalog}
    assert f"T-{u}" in skus_with_catalog  # catalog included
    assert f"AT-{u}" in skus_with_catalog
    assert f"DEL-{u}" not in skus_with_catalog
