"""
Cadeia completa: Trip > StockEntry > EntryItem > Inventory > FIFO > Sale (e cancelamento).

Modelo atual: produto com variação, EntryItem por variação, custo posto = unit_cost + extra_unit_cost
(rateio da viagem proporcional ao custo de cada item) e o FIFO grava o custo posto na venda.
Cada teste usa uma loja nova para não colidir com códigos de outros testes.
"""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer, CustomerType
from app.models.entry_item import EntryItem
from app.models.sale import PaymentMethod, SaleStatus
from app.models.stock_entry import EntryType
from app.models.trip import TripStatus
from app.models.user import User
from app.schemas.entry_item import EntryItemCreate
from app.schemas.sale import PaymentCreate, SaleCreate, SaleItemCreate
from app.schemas.stock_entry import StockEntryCreate
from app.schemas.trip import TripCreate
from app.services.fifo_service import FIFOService
from app.services.inventory_service import InventoryService
from app.services.sale_service import SaleService
from app.services.stock_entry_service import StockEntryService
from app.services.trip_service import TripService
from tests.test_lot_costs import _loja, _produto

pytestmark = pytest.mark.asyncio
D = Decimal


async def _setup(db: AsyncSession):
    """Loja nova: devolve (tenant_id, usuário, categoria)."""
    tenant_id, _token, cat_id = await _loja(db)
    user = (await db.execute(select(User).where(User.tenant_id == tenant_id))).scalars().first()
    return tenant_id, user, cat_id


async def test_complete_flow_trip_to_sale(db: AsyncSession):
    tenant_id, user, cat_id = await _setup(db)
    product1, variant1 = await _produto(db, tenant_id, cat_id, "Nike Air Max", "350.00")
    product2, variant2 = await _produto(db, tenant_id, cat_id, "Adidas Ultraboost", "450.00")
    await db.commit()

    # PASSO 1: viagem (custo total 500)
    trip = await TripService(db).create_trip(
        trip_data=TripCreate(
            trip_code="TRIP-2025-001",
            trip_date=date(2025, 1, 15),
            destination="Sao Paulo - Atacado Nike",
            travel_cost_fuel=D("150.00"),
            travel_cost_food=D("80.00"),
            travel_cost_toll=D("40.00"),
            travel_cost_hotel=D("200.00"),
            travel_cost_other=D("30.00"),
            status=TripStatus.PLANNED,
            notes="Compra de tenis para revenda",
        ),
        user_id=user.id,
        tenant_id=tenant_id,
    )
    assert trip.trip_code == "TRIP-2025-001"
    assert trip.travel_cost_total == D("500.00")
    assert trip.status == TripStatus.PLANNED

    # PASSO 2: entrada da viagem. Mercadoria 50x100 + 20x250 = 10.000, então a viagem de 500 rateia 5%
    # proporcional ao custo de cada item: produto 1 recebe 250 (5,00 por peça), produto 2 recebe 250 (12,50 por peça).
    entry_service = StockEntryService(db)
    entry = await entry_service.create_entry(
        entry_data=StockEntryCreate(
            entry_code="ENTRY-2025-001",
            entry_date=date(2025, 1, 15),
            entry_type=EntryType.TRIP,
            trip_id=trip.id,
            supplier_name="Nike Atacado SP",
            supplier_cnpj="12.345.678/0001-90",
            supplier_contact="(11) 98765-4321",
            invoice_number="NF-12345",
            payment_method="PIX",
            notes="Primeira compra",
        ),
        items=[
            EntryItemCreate(product_id=product1.id, variant_id=variant1.id, quantity_received=50, unit_cost=D("100.00")),
            EntryItemCreate(product_id=product2.id, variant_id=variant2.id, quantity_received=20, unit_cost=D("250.00")),
        ],
        user_id=user.id,
        tenant_id=tenant_id,
    )
    assert entry.entry_code == "ENTRY-2025-001"
    assert entry.trip_id == trip.id
    assert entry.entry_type == EntryType.TRIP
    assert len(entry.entry_items) == 2
    assert entry.total_cost == D("10000.00")  # mercadoria; o rateio da viagem fica em extra_unit_cost
    lote1 = next(i for i in entry.entry_items if i.variant_id == variant1.id)
    lote2p = next(i for i in entry.entry_items if i.variant_id == variant2.id)
    assert lote1.extra_unit_cost == D("5.00") and lote1.landed_unit_cost == D("105.00")
    assert lote2p.extra_unit_cost == D("12.50") and lote2p.landed_unit_cost == D("262.50")

    # PASSO 3: inventário
    inventory_service = InventoryService(db)
    inv1 = await inventory_service.get_stock_level(product1.id, tenant_id=tenant_id)
    inv2 = await inventory_service.get_stock_level(product2.id, tenant_id=tenant_id)
    assert inv1['quantity'] == 50
    assert inv2['quantity'] == 20

    # PASSO 4: segunda entrada (sem viagem, custo diferente) para testar FIFO
    entry2 = await entry_service.create_entry(
        entry_data=StockEntryCreate(
            entry_code="ENTRY-2025-002",
            entry_date=date(2025, 1, 20),
            entry_type=EntryType.ONLINE,
            supplier_name="Nike Online",
            supplier_cnpj="98.765.432/0001-10",
            invoice_number="NF-67890",
            payment_method="Cartao",
        ),
        items=[EntryItemCreate(product_id=product1.id, variant_id=variant1.id, quantity_received=40, unit_cost=D("220.00"))],
        user_id=user.id,
        tenant_id=tenant_id,
    )
    inv1_updated = await inventory_service.get_stock_level(product1.id, tenant_id=tenant_id)
    assert inv1_updated['quantity'] == 90  # 50 + 40

    # PASSO 5: venda de 60 unidades do produto 1: 50 do lote 1 (custo posto 105) + 10 do lote 2 (220)
    customer = Customer(
        full_name="Cliente Teste", email="cliente.fifo@test.com", phone="11999999999", tenant_id=tenant_id,
        customer_type=CustomerType.REGULAR, is_active=True, loyalty_points=0, total_purchases=0, total_spent=D("0.00"),
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)

    sale_service = SaleService(db)
    sale = await sale_service.create_sale(
        sale_data=SaleCreate(
            customer_id=customer.id,
            payment_method=PaymentMethod.PIX,
            discount_amount=D("0.00"),
            tax_amount=D("0.00"),
            notes="Venda teste FIFO",
            items=[SaleItemCreate(product_id=product1.id, variant_id=variant1.id, quantity=60,
                                  unit_price=D("350.00"), discount_amount=D("0.00"))],
            payments=[PaymentCreate(amount=D("21000.00"), payment_method=PaymentMethod.PIX, payment_reference="PIX-123456")],
        ),
        seller_id=user.id,
        tenant_id=tenant_id,
    )
    await db.refresh(sale, ['items', 'customer'])
    assert sale.status == SaleStatus.COMPLETED.value
    assert sale.total_amount == D("21000.00")
    assert len(sale.items) == 1

    # PASSO 6: rastreabilidade FIFO
    sale_item = sale.items[0]
    assert sale_item.sale_sources is not None and 'sources' in sale_item.sale_sources
    sources = sale_item.sale_sources['sources']
    assert len(sources) == 2
    assert sources[0]['entry_code'] == 'ENTRY-2025-001'
    assert sources[0]['quantity_taken'] == 50
    assert sources[0]['merchandise_unit_cost'] == 100.00
    assert sources[0]['extra_unit_cost'] == 5.00
    assert sources[0]['unit_cost'] == 105.00  # custo posto
    assert sources[1]['entry_code'] == 'ENTRY-2025-002'
    assert sources[1]['quantity_taken'] == 10
    assert sources[1]['unit_cost'] == 220.00

    # PASSO 7: estoque restante
    cost_info = await FIFOService(db).get_product_cost_info(product1.id, variant_id=variant1.id, tenant_id=tenant_id)
    assert cost_info['total_quantity'] == 30  # 90 - 60
    assert cost_info['sources_count'] == 1  # só o lote 2
    assert cost_info['average_unit_cost'] == 220.00

    item_lote1 = lote1
    item_lote2 = entry2.entry_items[0]
    await db.refresh(item_lote1)
    await db.refresh(item_lote2)
    assert item_lote1.quantity_remaining == 0
    assert item_lote1.is_depleted is True
    assert item_lote2.quantity_remaining == 30  # 40 - 10

    # PASSO 8: cancelar a venda reverte o FIFO
    cancelled = await sale_service.cancel_sale(
        sale_id=sale.id, reason="Teste de reverso FIFO", user_id=user.id, tenant_id=tenant_id,
    )
    assert cancelled.status == SaleStatus.CANCELLED.value
    await db.refresh(item_lote1)
    await db.refresh(item_lote2)
    assert item_lote1.quantity_remaining == 50
    assert item_lote2.quantity_remaining == 40
    inv_final = await inventory_service.get_stock_level(product1.id, tenant_id=tenant_id)
    assert inv_final['quantity'] == 90

    # PASSO 9: analytics da viagem
    analytics = await TripService(db).get_trip_analytics(trip_id=trip.id, tenant_id=tenant_id)
    assert analytics['total_entries'] == 1  # só ENTRY-2025-001 está ligada à viagem
    assert analytics['total_items'] == 2
    assert analytics['total_quantity_sold'] == 0  # venda cancelada


async def test_fifo_multiple_sales(db: AsyncSession):
    tenant_id, user, cat_id = await _setup(db)
    product, variant = await _produto(db, tenant_id, cat_id, "Produto FIFO Test", "100.00")
    await db.commit()

    entry_service = StockEntryService(db)
    sale_service = SaleService(db)

    # 3 entradas de 20 peças, custos 100, 110, 120 (sem rateio)
    for i in range(3):
        await entry_service.create_entry(
            entry_data=StockEntryCreate(
                entry_code=f"FIFO-ENTRY-{i+1}",
                entry_date=date(2025, 1, 10 + i),
                entry_type=EntryType.LOCAL,
                supplier_name=f"Fornecedor {i+1}",
                invoice_number=f"NF-{i+1}",
            ),
            items=[EntryItemCreate(product_id=product.id, variant_id=variant.id, quantity_received=20,
                                   unit_cost=D(f"{100 + (i * 10)}.00"))],
            user_id=user.id,
            tenant_id=tenant_id,
        )

    # Venda 1: 15 unidades (só entrada 1)
    sale1 = await sale_service.create_sale(
        SaleCreate(
            payment_method=PaymentMethod.PIX,
            items=[SaleItemCreate(product_id=product.id, variant_id=variant.id, quantity=15, unit_price=D("200.00"))],
            payments=[PaymentCreate(amount=D("3000.00"), payment_method=PaymentMethod.PIX)],
        ), user.id, tenant_id=tenant_id)
    sources1 = sale1.items[0].sale_sources['sources']
    assert [(s['entry_code'], s['quantity_taken']) for s in sources1] == [('FIFO-ENTRY-1', 15)]

    # Venda 2: 25 unidades (5 da entrada 1 + 20 da entrada 2)
    sale2 = await sale_service.create_sale(
        SaleCreate(
            payment_method=PaymentMethod.PIX,
            items=[SaleItemCreate(product_id=product.id, variant_id=variant.id, quantity=25, unit_price=D("200.00"))],
            payments=[PaymentCreate(amount=D("5000.00"), payment_method=PaymentMethod.PIX)],
        ), user.id, tenant_id=tenant_id)
    sources2 = sale2.items[0].sale_sources['sources']
    assert [(s['entry_code'], s['quantity_taken'], s['unit_cost']) for s in sources2] == [
        ('FIFO-ENTRY-1', 5, 100.0), ('FIFO-ENTRY-2', 20, 110.0)]

    # Restou só a entrada 3
    cost_info = await FIFOService(db).get_product_cost_info(product.id, variant_id=variant.id, tenant_id=tenant_id)
    assert cost_info['total_quantity'] == 20
    assert cost_info['average_unit_cost'] == 120.00


async def test_insufficient_stock_error(db: AsyncSession):
    tenant_id, user, cat_id = await _setup(db)
    product, variant = await _produto(db, tenant_id, cat_id, "Low Stock Product", "50.00")
    await db.commit()
    variant_id = variant.id  # a falha da venda faz rollback e expira os objetos

    await StockEntryService(db).create_entry(
        StockEntryCreate(entry_code="LOW-ENTRY-001", entry_date=date.today(), entry_type=EntryType.LOCAL,
                         supplier_name="Fornecedor", invoice_number="NF-001"),
        [EntryItemCreate(product_id=product.id, variant_id=variant.id, quantity_received=5, unit_cost=D("20.00"))],
        user.id, tenant_id=tenant_id)

    with pytest.raises(ValueError, match="Estoque insuficiente"):
        await SaleService(db).create_sale(
            SaleCreate(
                payment_method=PaymentMethod.CASH,
                items=[SaleItemCreate(product_id=product.id, variant_id=variant.id, quantity=10, unit_price=D("50.00"))],
                payments=[PaymentCreate(amount=D("500.00"), payment_method=PaymentMethod.CASH)],
            ), user.id, tenant_id=tenant_id)

    # nada baixou
    itens = (await db.execute(select(EntryItem).where(EntryItem.variant_id == variant_id))).scalars().all()
    assert sum(i.quantity_remaining for i in itens) == 5
