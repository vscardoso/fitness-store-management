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
from app.models.sale import PaymentMethod
from app.models.stock_entry import EntryType

from app.schemas.stock_entry import StockEntryCreate
from app.schemas.entry_item import EntryItemCreate
from app.schemas.sale import SaleCreate, SaleItemCreate, PaymentCreate

from app.services.stock_entry_service import StockEntryService
from app.services.sale_service import SaleService
from app.services.inventory_service import InventoryService


async def _bootstrap(db: AsyncSession):
    u = uuid.uuid4().hex[:8]
    store = Store(name=f"Tenant {u}", slug=f"tenant-{u}")
    db.add(store)
    await db.flush()

    user = User(email=f"seller_{u}@test.com", hashed_password="x", full_name="Vendedor", role=UserRole.SELLER)
    user.tenant_id = store.id
    db.add(user)
    await db.flush()

    cat = Category(name="Geral", slug=f"geral-{u}")
    cat.tenant_id = store.id
    db.add(cat)
    await db.flush()

    prod = Product(
        name=f"Produto {u}",
        sku=f"SKU-{u}",
        barcode=f"BC-{u}",
        price=Decimal("12.00"),
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
async def test_cost_reconciliation_matches_sources_and_entries(db: AsyncSession):
    store, seller, prod = await _bootstrap(db)

    se = StockEntryService(db)
    # Dois lotes: 10x5.00 e 10x8.00 => custo recebido total = 130.00
    await se.create_entry(
        entry_data=StockEntryCreate(
            entry_code=f"ENTRY-{uuid.uuid4().hex[:6]}",
            entry_date=date.today(),
            entry_type=EntryType.LOCAL,
            supplier_name="Fornecedor",
        ),
        items=[
            EntryItemCreate(product_id=prod.id, quantity_received=10, unit_cost=Decimal("5.00")),
            EntryItemCreate(product_id=prod.id, quantity_received=10, unit_cost=Decimal("8.00")),
        ],
        user_id=seller.id,
        tenant_id=store.id,
    )

    # Venda 12 unidades: 10 do primeiro lote + 2 do segundo => custo vendido esperado 10*5 + 2*8 = 66
    ss = SaleService(db)
    await ss.create_sale(
        sale_data=SaleCreate(
            customer_id=None,
            payment_method=PaymentMethod.CASH,
            discount_amount=Decimal("0"),
            tax_amount=Decimal("0"),
            notes="teste",
            items=[SaleItemCreate(product_id=prod.id, quantity=12, unit_price=Decimal("12.00"), discount_amount=Decimal("0"))],
            payments=[PaymentCreate(amount=Decimal("144.00"), payment_method=PaymentMethod.CASH)],
        ),
        seller_id=seller.id,
        tenant_id=store.id,
    )

    inv_svc = InventoryService(db)
    summary = await inv_svc.reconcile_costs(tenant_id=store.id, product_id=prod.id)

    assert round(summary['custo_recebido_total'], 2) == 130.00
    assert round(summary['custo_restante'], 2) == 64.00  # 8 unidades a 8.00
    # Vendido por entry_items = 66.00
    assert round(summary['custo_vendido_entry_items'], 2) == 66.00
    # Vendido por fontes também deve ser 66.00
    assert round(summary['custo_vendido_por_fontes'], 2) == 66.00
    # Diferença ~ 0
    assert abs(summary['diferenca']) < 0.01

    # Inventário deve estar alinhado com FIFO (8)
    inv = (await db.execute(select(Inventory).where(Inventory.product_id == prod.id, Inventory.tenant_id == store.id))).scalar_one()
    assert inv.quantity == 8
