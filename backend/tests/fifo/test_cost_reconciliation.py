"""Reconciliação de custo: o que as entradas dizem que saiu bate com o que as fontes (sale_sources) da venda dizem."""
from datetime import date
from decimal import Decimal
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory
from app.models.sale import PaymentMethod
from app.models.stock_entry import EntryType
from app.models.user import User
from app.schemas.entry_item import EntryItemCreate
from app.schemas.sale import PaymentCreate, SaleCreate, SaleItemCreate
from app.schemas.stock_entry import StockEntryCreate
from app.services.inventory_service import InventoryService
from app.services.sale_service import SaleService
from app.services.stock_entry_service import StockEntryService
from tests.test_lot_costs import _loja, _produto

pytestmark = pytest.mark.asyncio


async def _bootstrap(db: AsyncSession):
    """Loja nova, vendedor (o admin dela), categoria e produto com 1 variação. Devolve (tenant_id, user, produto, variação)."""
    tenant_id, _token, cat_id = await _loja(db)
    user = (await db.execute(select(User).where(User.tenant_id == tenant_id))).scalars().first()
    prod, variant = await _produto(db, tenant_id, cat_id, "Produto Reconcilia", "12.00")
    await db.commit()
    return tenant_id, user, prod, variant


async def test_cost_reconciliation_matches_sources_and_entries(db: AsyncSession):
    tenant_id, seller, prod, variant = await _bootstrap(db)

    # Dois lotes: 10x5.00 e 10x8.00 => custo recebido total = 130.00 (sem rateio, custo posto = custo da mercadoria)
    await StockEntryService(db).create_entry(
        entry_data=StockEntryCreate(
            entry_code=f"ENTRY-{uuid.uuid4().hex[:6]}",
            entry_date=date.today(),
            entry_type=EntryType.LOCAL,
            supplier_name="Fornecedor",
        ),
        items=[
            EntryItemCreate(product_id=prod.id, variant_id=variant.id, quantity_received=10, unit_cost=Decimal("5.00")),
            EntryItemCreate(product_id=prod.id, variant_id=variant.id, quantity_received=10, unit_cost=Decimal("8.00")),
        ],
        user_id=seller.id,
        tenant_id=tenant_id,
    )

    # Venda de 12 unidades: 10 do primeiro lote + 2 do segundo => custo vendido esperado 10*5 + 2*8 = 66
    await SaleService(db).create_sale(
        sale_data=SaleCreate(
            customer_id=None,
            payment_method=PaymentMethod.CASH,
            discount_amount=Decimal("0"),
            tax_amount=Decimal("0"),
            notes="teste",
            items=[SaleItemCreate(product_id=prod.id, variant_id=variant.id, quantity=12, unit_price=Decimal("12.00"),
                                  discount_amount=Decimal("0"))],
            payments=[PaymentCreate(amount=Decimal("144.00"), payment_method=PaymentMethod.CASH)],
        ),
        seller_id=seller.id,
        tenant_id=tenant_id,
    )

    summary = await InventoryService(db).reconcile_costs(tenant_id=tenant_id, product_id=prod.id)

    assert round(summary['custo_recebido_total'], 2) == 130.00
    assert round(summary['custo_restante'], 2) == 64.00  # 8 unidades a 8.00
    assert round(summary['custo_vendido_entry_items'], 2) == 66.00
    assert round(summary['custo_vendido_por_fontes'], 2) == 66.00
    assert abs(summary['diferenca']) < 0.01
    assert summary['unidades_vendidas_por_fontes'] == 12

    # Inventário deve estar alinhado com FIFO (8)
    inv = (await db.execute(select(Inventory).where(Inventory.product_id == prod.id, Inventory.tenant_id == tenant_id))).scalar_one()
    assert inv.quantity == 8
