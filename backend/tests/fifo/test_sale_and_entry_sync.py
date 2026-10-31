"""Venda e entrada mantêm FIFO (EntryItem.quantity_remaining) e Inventory.quantity sincronizados."""
from datetime import date
from decimal import Decimal
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.models.sale import PaymentMethod
from app.models.stock_entry import EntryType
from app.models.user import User
from app.schemas.entry_item import EntryItemCreate
from app.schemas.sale import PaymentCreate, SaleCreate, SaleItemCreate
from app.schemas.stock_entry import StockEntryCreate
from app.services.sale_service import SaleService
from app.services.stock_entry_service import StockEntryService
from tests.test_lot_costs import _loja, _produto

pytestmark = pytest.mark.asyncio


async def _bootstrap_minimum(db: AsyncSession):
    """Loja nova, vendedor (o admin dela), produto com 1 variação. Devolve (tenant_id, user, produto, variação)."""
    tenant_id, _token, cat_id = await _loja(db)
    user = (await db.execute(select(User).where(User.tenant_id == tenant_id))).scalars().first()
    prod, variant = await _produto(db, tenant_id, cat_id, "Produto FIFO", "10.00")
    await db.commit()
    return tenant_id, user, prod, variant


async def _entry_items(db, tenant_id, variant_id):
    return (await db.execute(select(EntryItem).where(
        EntryItem.variant_id == variant_id, EntryItem.tenant_id == tenant_id).order_by(EntryItem.id))).scalars().all()


async def test_sale_consumes_fifo_and_syncs_inventory(db: AsyncSession):
    tenant_id, seller, prod, variant = await _bootstrap_minimum(db)

    # Entrada com dois itens (10 a 5.00 e 5 a 6.00)
    await StockEntryService(db).create_entry(
        entry_data=StockEntryCreate(
            entry_code=f"ENTRY-TEST-SALE-{uuid.uuid4().hex[:6]}",
            entry_date=date.today(),
            entry_type=EntryType.LOCAL,
            supplier_name="Fornecedor",
        ),
        items=[
            EntryItemCreate(product_id=prod.id, variant_id=variant.id, quantity_received=10, unit_cost=Decimal("5.00")),
            EntryItemCreate(product_id=prod.id, variant_id=variant.id, quantity_received=5, unit_cost=Decimal("6.00")),
        ],
        user_id=seller.id,
        tenant_id=tenant_id,
    )

    items = await _entry_items(db, tenant_id, variant.id)
    assert sum(i.quantity_remaining for i in items) == 15

    # Venda de 12 unidades (FIFO: 10 do 1º, 2 do 2º)
    await SaleService(db).create_sale(
        sale_data=SaleCreate(
            customer_id=None,
            payment_method=PaymentMethod.CASH,
            discount_amount=Decimal("0"),
            tax_amount=Decimal("0"),
            notes="teste",
            items=[
                SaleItemCreate(product_id=prod.id, variant_id=variant.id, quantity=12, unit_price=Decimal("10.00"),
                               discount_amount=Decimal("0"))
            ],
            payments=[PaymentCreate(amount=Decimal("120.00"), payment_method=PaymentMethod.CASH, payment_reference="PIX123")],
        ),
        seller_id=seller.id,
        tenant_id=tenant_id,
    )

    items_after = await _entry_items(db, tenant_id, variant.id)
    assert items_after[0].quantity_remaining == 0
    assert items_after[1].quantity_remaining == 3
    assert sum(i.quantity_remaining for i in items_after) == 3

    # Inventário sincronizado com o FIFO
    inv = (await db.execute(select(Inventory).where(Inventory.product_id == prod.id, Inventory.tenant_id == tenant_id))).scalar_one()
    assert inv.quantity == 3


async def test_entry_increments_fifo_and_syncs_inventory(db: AsyncSession):
    tenant_id, seller, prod, variant = await _bootstrap_minimum(db)

    await StockEntryService(db).create_entry(
        entry_data=StockEntryCreate(
            entry_code=f"ENTRY-TEST-ENTRY-{uuid.uuid4().hex[:6]}",
            entry_date=date.today(),
            entry_type=EntryType.LOCAL,
            supplier_name="Fornecedor",
        ),
        items=[EntryItemCreate(product_id=prod.id, variant_id=variant.id, quantity_received=8, unit_cost=Decimal("4.50"))],
        user_id=seller.id,
        tenant_id=tenant_id,
    )

    # FIFO e inventário devem refletir 8
    items = await _entry_items(db, tenant_id, variant.id)
    assert sum(i.quantity_remaining for i in items) == 8
    inv = (await db.execute(select(Inventory).where(Inventory.product_id == prod.id, Inventory.tenant_id == tenant_id))).scalar_one()
    assert inv.quantity == 8
