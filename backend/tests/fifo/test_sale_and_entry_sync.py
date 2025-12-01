import pytest
from decimal import Decimal
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.models.store import Store
from app.models.user import User, UserRole
from app.models.product import Product
from app.models.category import Category
from app.models.inventory import Inventory
from app.models.entry_item import EntryItem
from app.models.sale import PaymentMethod
from app.models.stock_entry import EntryType

from app.schemas.stock_entry import StockEntryCreate
from app.schemas.entry_item import EntryItemCreate
from app.schemas.sale import SaleCreate, SaleItemCreate, PaymentCreate

from app.services.stock_entry_service import StockEntryService
from app.services.sale_service import SaleService


async def _bootstrap_minimum(db: AsyncSession):
    unique = uuid.uuid4().hex[:8]
    # Store (tenant)
    store = Store(name=f"Tenant Teste {unique}", slug=f"tenant-teste-{unique}")
    db.add(store)
    await db.flush()

    # User (seller)
    user = User(email=f"seller_{unique}@test.com", hashed_password="x", full_name="Vendedor Teste", role=UserRole.SELLER)
    user.tenant_id = store.id
    db.add(user)
    await db.flush()

    # Category
    cat = Category(name="Geral", slug=f"geral-{unique}")
    cat.tenant_id = store.id
    db.add(cat)
    await db.flush()

    # Product
    prod = Product(
        name="Produto FIFO",
        sku="PF-001",
        barcode="pf001",
        price=Decimal("10.00"),
        category_id=cat.id,
        is_catalog=False,
        is_active=True,
    )
    prod.tenant_id = store.id
    db.add(prod)
    await db.flush()

    await db.commit()
    return store, user, prod


@pytest.mark.asyncio
async def test_sale_consumes_fifo_and_syncs_inventory(db: AsyncSession):
    store, seller, prod = await _bootstrap_minimum(db)

    # Criar entrada com dois lotes
    se = StockEntryService(db)
    entry = await se.create_entry(
        entry_data=StockEntryCreate(
            entry_code=f"ENTRY-TEST-SALE-{uuid.uuid4().hex[:6]}",
            entry_date=date.today(),
            entry_type=EntryType.LOCAL,
            supplier_name="Fornecedor",
        ),
        items=[
            EntryItemCreate(product_id=prod.id, quantity_received=10, unit_cost=Decimal("5.00")),
            EntryItemCreate(product_id=prod.id, quantity_received=5, unit_cost=Decimal("6.00")),
        ],
        user_id=seller.id,
        tenant_id=store.id,
    )

    # Soma FIFO inicial
    items = (await db.execute(select(EntryItem).where(EntryItem.product_id == prod.id, EntryItem.tenant_id == store.id))).scalars().all()
    assert sum(i.quantity_remaining for i in items) == 15

    # Realizar venda de 12 unidades (FIFO: 10 do 1º, 2 do 2º)
    ss = SaleService(db)
    sale = await ss.create_sale(
        sale_data=SaleCreate(
            customer_id=None,
            payment_method=PaymentMethod.CASH,
            discount_amount=Decimal("0"),
            tax_amount=Decimal("0"),
            notes="teste",
            items=[
                SaleItemCreate(product_id=prod.id, quantity=12, unit_price=Decimal("10.00"), discount_amount=Decimal("0"))
            ],
            payments=[
                PaymentCreate(amount=Decimal("120.00"), payment_method=PaymentMethod.CASH, payment_reference="PIX123")
            ],
        ),
        seller_id=seller.id,
        tenant_id=store.id,
    )

    # Verificar FIFO após venda
    items_after = (await db.execute(select(EntryItem).where(EntryItem.product_id == prod.id, EntryItem.tenant_id == store.id).order_by(EntryItem.id))).scalars().all()
    assert items_after[0].quantity_remaining == 0
    assert items_after[1].quantity_remaining == 3
    assert sum(i.quantity_remaining for i in items_after) == 3

    # Verificar inventário sincronizado automaticamente (rebuild incremental)
    inv = (await db.execute(select(Inventory).where(Inventory.product_id == prod.id, Inventory.tenant_id == store.id))).scalar_one()
    assert inv.quantity == 3


@pytest.mark.asyncio
async def test_entry_increments_fifo_and_syncs_inventory(db: AsyncSession):
    store, seller, prod = await _bootstrap_minimum(db)

    # Criar entrada com um lote
    se = StockEntryService(db)
    entry = await se.create_entry(
        entry_data=StockEntryCreate(
            entry_code=f"ENTRY-TEST-ENTRY-{uuid.uuid4().hex[:6]}",
            entry_date=date.today(),
            entry_type=EntryType.LOCAL,
            supplier_name="Fornecedor",
        ),
        items=[
            EntryItemCreate(product_id=prod.id, quantity_received=8, unit_cost=Decimal("4.50")),
        ],
        user_id=seller.id,
        tenant_id=store.id,
    )

    # FIFO e inventário devem refletir 8
    items = (await db.execute(select(EntryItem).where(EntryItem.product_id == prod.id, EntryItem.tenant_id == store.id))).scalars().all()
    assert sum(i.quantity_remaining for i in items) == 8
    inv = (await db.execute(select(Inventory).where(Inventory.product_id == prod.id, Inventory.tenant_id == store.id))).scalar_one()
    assert inv.quantity == 8
