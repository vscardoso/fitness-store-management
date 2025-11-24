"""
Teste completo da cadeia: Trip  StockEntry  EntryItem  Inventory  FIFO  Sale

Valida todo o fluxo de negcio desde a criao de uma viagem at a venda com FIFO.
"""
import pytest
from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.trip import Trip, TripStatus
from app.models.stock_entry import StockEntry, EntryType
from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.category import Category
from app.models.inventory import Inventory
from app.models.sale import Sale, SaleStatus, PaymentMethod
from app.models.user import User

from app.services.trip_service import TripService
from app.services.stock_entry_service import StockEntryService
from app.services.inventory_service import InventoryService
from app.services.sale_service import SaleService
from app.services.fifo_service import FIFOService

from app.schemas.trip import TripCreate
from app.schemas.stock_entry import StockEntryCreate
from app.schemas.entry_item import EntryItemCreate
from app.schemas.sale import SaleCreate, SaleItemCreate, PaymentCreate


@pytest.mark.asyncio
async def test_complete_flow_trip_to_sale(db: AsyncSession, test_user: User, test_category: Category):
    """
    Teste completo do fluxo:
    1. Criar viagem
    2. Criar entrada de estoque vinculada  viagem
    3. Adicionar itens  entrada (produtos)
    4. Verificar atualizao de inventrio
    5. Realizar venda com FIFO
    6. Verificar rastreabilidade (de qual entrada saiu)
    7. Cancelar venda e reverter FIFO
    8. Verificar integridade final
    """

    # =====================
    # SETUP: Criar produtos
    # =====================
    product1 = Product(
        name="Nike Air Max",
        sku="NIKE-AIR-001",
        price=Decimal("350.00"),
        cost_price=Decimal("200.00"),
        brand="Nike",
        category_id=test_category.id,
        tenant_id=test_user.tenant_id,
        is_active=True,
        is_catalog=False,
    )
    product2 = Product(
        name="Adidas Ultraboost",
        sku="ADIDAS-ULTRA-001",
        price=Decimal("450.00"),
        cost_price=Decimal("250.00"),
        brand="Adidas",
        category_id=test_category.id,
        tenant_id=test_user.tenant_id,
        is_active=True,
        is_catalog=False,
    )

    db.add_all([product1, product2])
    await db.commit()
    await db.refresh(product1)
    await db.refresh(product2)

    print(f"\n Produtos criados: {product1.name} (ID {product1.id}), {product2.name} (ID {product2.id})")

    # =====================
    # PASSO 1: Criar viagem
    # =====================
    trip_service = TripService(db)
    trip_data = TripCreate(
        trip_code="TRIP-2025-001",
        trip_date=date(2025, 1, 15),
        destination="So Paulo - Atacado Nike",
        travel_cost_fuel=Decimal("150.00"),
        travel_cost_food=Decimal("80.00"),
        travel_cost_toll=Decimal("40.00"),
        travel_cost_hotel=Decimal("200.00"),
        travel_cost_other=Decimal("30.00"),
        status=TripStatus.PLANNED,
        notes="Compra de tnis para revenda",
    )

    trip = await trip_service.create_trip(
        trip_data=trip_data,
        user_id=test_user.id,
        tenant_id=test_user.tenant_id,
    )

    print(f" Viagem criada: {trip.trip_code} (ID {trip.id})")
    print(f"   Custo total da viagem: R$ {trip.travel_cost_total}")

    assert trip.trip_code == "TRIP-2025-001"
    assert trip.travel_cost_total == Decimal("500.00")
    assert trip.status == TripStatus.PLANNED

    # =====================
    # PASSO 2: Criar entrada de estoque (VIAGEM)
    # =====================
    entry_service = StockEntryService(db)

    entry_data = StockEntryCreate(
        entry_code="ENTRY-2025-001",
        entry_date=date(2025, 1, 15),
        entry_type=EntryType.TRIP,
        trip_id=trip.id,
        supplier_name="Nike Atacado SP",
        supplier_cnpj="12.345.678/0001-90",
        supplier_contact="(11) 98765-4321",
        invoice_number="NF-12345",
        payment_method="PIX",
        notes="Primeira compra de Nike Air Max",
    )

    # Itens da entrada
    items_data = [
        EntryItemCreate(
            product_id=product1.id,
            quantity_received=50,
            unit_cost=Decimal("200.00"),
            notes="Nike Air Max - Lote 1",
        ),
        EntryItemCreate(
            product_id=product2.id,
            quantity_received=30,
            unit_cost=Decimal("250.00"),
            notes="Adidas Ultraboost - Lote 1",
        ),
    ]

    entry = await entry_service.create_entry(
        entry_data=entry_data,
        items=items_data,
        user_id=test_user.id,
        tenant_id=test_user.tenant_id,
    )

    print(f" Entrada criada: {entry.entry_code} (ID {entry.id})")
    print(f"   Vinculada  viagem: {trip.trip_code}")
    print(f"   Custo total da entrada: R$ {entry.total_cost}")
    print(f"   Itens: {len(entry.entry_items)}")

    assert entry.entry_code == "ENTRY-2025-001"
    assert entry.trip_id == trip.id
    assert entry.entry_type == EntryType.TRIP
    assert len(entry.entry_items) == 2
    assert entry.total_cost == Decimal("17500.00")  # 50*200 + 30*250

    # =====================
    # PASSO 3: Verificar inventrio atualizado
    # =====================
    inventory_service = InventoryService(db)

    inv1 = await inventory_service.get_stock_level(product1.id, tenant_id=test_user.tenant_id)
    inv2 = await inventory_service.get_stock_level(product2.id, tenant_id=test_user.tenant_id)

    print(f" Inventrio atualizado:")
    print(f"   {product1.name}: {inv1['quantity']} unidades")
    print(f"   {product2.name}: {inv2['quantity']} unidades")

    assert inv1['quantity'] == 50
    assert inv2['quantity'] == 30

    # =====================
    # PASSO 4: Criar segunda entrada (para testar FIFO)
    # =====================
    entry_data2 = StockEntryCreate(
        entry_code="ENTRY-2025-002",
        entry_date=date(2025, 1, 20),  # 5 dias depois
        entry_type=EntryType.ONLINE,
        supplier_name="Nike Online",
        supplier_cnpj="98.765.432/0001-10",
        invoice_number="NF-67890",
        payment_method="Carto",
        notes="Segunda compra - custo diferente",
    )

    items_data2 = [
        EntryItemCreate(
            product_id=product1.id,
            quantity_received=40,
            unit_cost=Decimal("220.00"),  # Custo maior
            notes="Nike Air Max - Lote 2 (mais caro)",
        ),
    ]

    entry2 = await entry_service.create_entry(
        entry_data=entry_data2,
        items=items_data2,
        user_id=test_user.id,
        tenant_id=test_user.tenant_id,
    )

    print(f" Segunda entrada criada: {entry2.entry_code}")
    print(f"   {product1.name}: +40 unidades @ R$ 220.00")

    # Verificar estoque total
    inv1_updated = await inventory_service.get_stock_level(product1.id, tenant_id=test_user.tenant_id)
    print(f"   Estoque total de {product1.name}: {inv1_updated['quantity']} unidades")
    assert inv1_updated['quantity'] == 90  # 50 + 40

    # =====================
    # PASSO 5: Realizar venda com FIFO
    # =====================
    # Criar customer para venda
    from app.models.customer import Customer, CustomerType
    customer = Customer(
        full_name="Cliente Teste",
        email="cliente@test.com",
        phone="11999999999",
        tenant_id=test_user.tenant_id,
        customer_type=CustomerType.REGULAR,
        is_active=True,
        loyalty_points=0,
        total_purchases=0,
        total_spent=Decimal("0.00"),
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)

    sale_service = SaleService(db)

    # Vender 60 unidades do produto1
    # Deve consumir FIFO: 50 do lote1 (R$200) + 10 do lote2 (R$220)
    sale_data = SaleCreate(
        customer_id=customer.id,
        payment_method=PaymentMethod.PIX,
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        notes="Venda teste FIFO",
        items=[
            SaleItemCreate(
                product_id=product1.id,
                quantity=60,
                unit_price=Decimal("350.00"),
                discount_amount=Decimal("0.00"),
            ),
        ],
        payments=[
            PaymentCreate(
                amount=Decimal("21000.00"),  # 60 * 350
                payment_method=PaymentMethod.PIX,
                payment_reference="PIX-123456",
            ),
        ],
    )

    sale = await sale_service.create_sale(
        sale_data=sale_data,
        seller_id=test_user.id,
        tenant_id=test_user.tenant_id,
    )

    print(f"\n Venda criada: {sale.sale_number}")
    print(f"   Status: {sale.status}")
    print(f"   Total: R$ {sale.total_amount}")

    # Refresh para carregar relacionamentos
    await db.refresh(sale, ['items', 'customer'])

    assert sale.status == SaleStatus.COMPLETED.value
    assert sale.total_amount == Decimal("21000.00")
    assert len(sale.items) == 1

    # =====================
    # PASSO 6: Verificar rastreabilidade FIFO
    # =====================
    sale_item = sale.items[0]
    assert sale_item.sale_sources is not None
    assert 'sources' in sale_item.sale_sources

    sources = sale_item.sale_sources['sources']
    print(f"\n Rastreabilidade FIFO:")
    print(f"   Quantidade vendida: {sale_item.quantity}")
    print(f"   Fontes utilizadas: {len(sources)}")

    for i, source in enumerate(sources, 1):
        print(f"   Fonte {i}:")
        print(f"      Entry Code: {source['entry_code']}")
        print(f"      Entry Date: {source['entry_date']}")
        print(f"      Quantity: {source['quantity_taken']}")
        print(f"      Unit Cost: R$ {source['unit_cost']}")
        print(f"      Total Cost: R$ {source['total_cost']}")

    # Validar FIFO correto
    assert len(sources) == 2  # 2 fontes (lote1 completo + parte do lote2)

    # Fonte 1: deve ser do lote mais antigo (50 unidades)
    assert sources[0]['entry_code'] == 'ENTRY-2025-001'
    assert sources[0]['quantity_taken'] == 50
    assert sources[0]['unit_cost'] == 200.00

    # Fonte 2: deve ser do lote mais novo (10 unidades)
    assert sources[1]['entry_code'] == 'ENTRY-2025-002'
    assert sources[1]['quantity_taken'] == 10
    assert sources[1]['unit_cost'] == 220.00

    # Calcular custo mdio ponderado
    total_cost = (50 * 200) + (10 * 220)
    avg_cost = total_cost / 60
    print(f"\n   Custo mdio ponderado: R$ {avg_cost:.2f}")
    print(f"   Margem de lucro: R$ {(350 - avg_cost):.2f} por unidade")

    # =====================
    # PASSO 7: Verificar estoque restante
    # =====================
    fifo_service = FIFOService(db)
    cost_info = await fifo_service.get_product_cost_info(product1.id)

    print(f"\n Estoque restante de {product1.name}:")
    print(f"   Quantidade total: {cost_info['total_quantity']}")
    print(f"   Custo total em estoque: R$ {cost_info['total_cost']:.2f}")
    print(f"   Custo mdio unitrio: R$ {cost_info['average_unit_cost']:.2f}")
    print(f"   Fontes: {cost_info['sources_count']}")

    assert cost_info['total_quantity'] == 30  # 90 - 60
    assert cost_info['sources_count'] == 1  # Apenas lote2 restante
    assert cost_info['average_unit_cost'] == 220.00  # S tem do lote2

    # Verificar entry_items
    await db.refresh(entry.entry_items[0])
    await db.refresh(entry2.entry_items[0])

    print(f"\n Status dos lotes:")
    print(f"   Lote 1 (ENTRY-2025-001): {entry.entry_items[0].quantity_remaining}/{entry.entry_items[0].quantity_received}")
    print(f"   Lote 2 (ENTRY-2025-002): {entry2.entry_items[0].quantity_remaining}/{entry2.entry_items[0].quantity_received}")

    assert entry.entry_items[0].quantity_remaining == 0  # Esgotado
    assert entry.entry_items[0].is_depleted is True
    assert entry2.entry_items[0].quantity_remaining == 30  # 40 - 10

    # =====================
    # PASSO 8: Cancelar venda e reverter FIFO
    # =====================
    cancelled_sale = await sale_service.cancel_sale(
        sale_id=sale.id,
        reason="Teste de reverso FIFO",
        user_id=test_user.id,
        tenant_id=test_user.tenant_id,
    )

    print(f"\n Venda cancelada: {cancelled_sale.sale_number}")
    print(f"   Status: {cancelled_sale.status}")

    assert cancelled_sale.status == SaleStatus.CANCELLED.value

    # Verificar estoque revertido
    await db.refresh(entry.entry_items[0])
    await db.refresh(entry2.entry_items[0])

    print(f"\n Estoque aps cancelamento:")
    print(f"   Lote 1: {entry.entry_items[0].quantity_remaining}/{entry.entry_items[0].quantity_received}")
    print(f"   Lote 2: {entry2.entry_items[0].quantity_remaining}/{entry2.entry_items[0].quantity_received}")

    assert entry.entry_items[0].quantity_remaining == 50  # Restaurado
    assert entry2.entry_items[0].quantity_remaining == 40  # Restaurado

    # Verificar inventrio total
    inv_final = await inventory_service.get_stock_level(product1.id, tenant_id=test_user.tenant_id)
    print(f"   Inventrio total: {inv_final['quantity']}")
    assert inv_final['quantity'] == 90  # Volta ao total original

    # =====================
    # PASSO 9: Verificar analytics da viagem
    # =====================
    analytics = await trip_service.get_trip_analytics(
        trip_id=trip.id,
        tenant_id=test_user.tenant_id,
    )

    print(f"\n Analytics da viagem {trip.trip_code}:")
    print(f"   Custo de viagem: R$ {analytics['travel_cost_total']}")
    print(f"   Investimento em produtos: R$ {analytics['total_invested']}")
    print(f"   Custo total: R$ {analytics['total_cost']}")
    print(f"   Entradas: {analytics['total_entries']}")
    print(f"   Itens: {analytics['total_items']}")
    print(f"   Quantidade comprada: {analytics['total_quantity_purchased']}")
    print(f"   Quantidade vendida: {analytics['total_quantity_sold']}")
    print(f"   Quantidade restante: {analytics['quantity_remaining']}")
    print(f"   Sell-through rate: {analytics['sell_through_rate']}%")

    assert analytics['total_entries'] == 1  # Apenas ENTRY-2025-001 est vinculada  viagem
    assert analytics['total_items'] == 2  # product1 e product2
    assert analytics['total_quantity_sold'] == 0  # Venda foi cancelada

    print("\n" + "="*80)
    print(" TESTE COMPLETO PASSOU COM SUCESSO!")
    print("="*80)
    print("\nFluxo validado:")
    print("   Trip criada com custos detalhados")
    print("   StockEntry vinculada  Trip")
    print("   EntryItems criados com quantidades e custos")
    print("   Inventory atualizado automaticamente")
    print("   Venda processada com FIFO correto")
    print("   Rastreabilidade completa (sale_sources)")
    print("   Estoque consumido na ordem correta (FIFO)")
    print("   Cancelamento reverte FIFO corretamente")
    print("   Analytics da viagem calculados")
    print("="*80)


@pytest.mark.asyncio
async def test_fifo_multiple_sales(db: AsyncSession, test_user: User, test_category: Category):
    """
    Teste de mltiplas vendas com FIFO complexo.
    """

    # Criar produto
    product = Product(
        name="Produto FIFO Test",
        sku="FIFO-TEST-001",
        price=Decimal("100.00"),
        category_id=test_category.id,
        tenant_id=test_user.tenant_id,
        is_active=True,
        is_catalog=False,
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)

    entry_service = StockEntryService(db)
    sale_service = SaleService(db)

    # Criar 3 entradas com custos diferentes
    entries = []
    for i in range(3):
        entry_data = StockEntryCreate(
            entry_code=f"FIFO-ENTRY-{i+1}",
            entry_date=date(2025, 1, 10 + i),
            entry_type=EntryType.LOCAL,
            supplier_name=f"Fornecedor {i+1}",
            invoice_number=f"NF-{i+1}",
        )

        items_data = [
            EntryItemCreate(
                product_id=product.id,
                quantity_received=20,
                unit_cost=Decimal(f"{100 + (i * 10)}.00"),  # 100, 110, 120
            ),
        ]

        entry = await entry_service.create_entry(
            entry_data=entry_data,
            items=items_data,
            user_id=test_user.id,
            tenant_id=test_user.tenant_id,
        )
        entries.append(entry)

    print("\n 3 entradas criadas:")
    for i, e in enumerate(entries):
        print(f"   {e.entry_code}: 20 unidades @ R$ {100 + (i * 10)}")

    # Total em estoque: 60 unidades

    # Venda 1: 15 unidades (deve consumir da entrada 1)
    sale1_data = SaleCreate(
        payment_method=PaymentMethod.PIX,
        items=[SaleItemCreate(product_id=product.id, quantity=15, unit_price=Decimal("200.00"))],
        payments=[PaymentCreate(amount=Decimal("3000.00"), payment_method=PaymentMethod.PIX)],
    )
    sale1 = await sale_service.create_sale(sale1_data, test_user.id, tenant_id=test_user.tenant_id)

    # Venda 2: 25 unidades (deve consumir 5 da entrada 1 + 20 da entrada 2)
    sale2_data = SaleCreate(
        payment_method=PaymentMethod.PIX,
        items=[SaleItemCreate(product_id=product.id, quantity=25, unit_price=Decimal("200.00"))],
        payments=[PaymentCreate(amount=Decimal("5000.00"), payment_method=PaymentMethod.PIX)],
    )
    sale2 = await sale_service.create_sale(sale2_data, test_user.id, tenant_id=test_user.tenant_id)

    print(f"\n Vendas realizadas:")
    print(f"   Venda 1: 15 unidades")
    print(f"   Venda 2: 25 unidades")
    print(f"   Total vendido: 40 unidades")

    # Verificar fontes da venda 2
    sources2 = sale2.items[0].sale_sources['sources']
    print(f"\n   Venda 2 - Fontes FIFO:")
    assert len(sources2) == 2
    assert sources2[0]['entry_code'] == 'FIFO-ENTRY-1'
    assert sources2[0]['quantity_taken'] == 5
    assert sources2[1]['entry_code'] == 'FIFO-ENTRY-2'
    assert sources2[1]['quantity_taken'] == 20

    for source in sources2:
        print(f"      {source['entry_code']}: {source['quantity_taken']} @ R$ {source['unit_cost']}")

    # Verificar estoque restante (deve ser apenas entrada 3)
    fifo_service = FIFOService(db)
    cost_info = await fifo_service.get_product_cost_info(product.id)

    print(f"\n Estoque final:")
    print(f"   Quantidade: {cost_info['total_quantity']}")
    print(f"   Custo mdio: R$ {cost_info['average_unit_cost']}")

    assert cost_info['total_quantity'] == 20  # Apenas entrada 3
    assert cost_info['average_unit_cost'] == 120.00

    print("\n Teste de mltiplas vendas FIFO passou!")


@pytest.mark.asyncio
async def test_insufficient_stock_error(db: AsyncSession, test_user: User, test_category: Category):
    """
    Testa erro quando no h estoque suficiente.
    """

    product = Product(
        name="Low Stock Product",
        sku="LOW-STOCK-001",
        price=Decimal("50.00"),
        category_id=test_category.id,
        tenant_id=test_user.tenant_id,
        is_active=True,
        is_catalog=False,
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)

    # Criar entrada com apenas 5 unidades
    entry_service = StockEntryService(db)
    entry_data = StockEntryCreate(
        entry_code="LOW-ENTRY-001",
        entry_date=date.today(),
        entry_type=EntryType.LOCAL,
        supplier_name="Fornecedor",
        invoice_number="NF-001",
    )
    items_data = [
        EntryItemCreate(
            product_id=product.id,
            quantity_received=5,
            unit_cost=Decimal("20.00"),
        ),
    ]
    await entry_service.create_entry(entry_data, items_data, test_user.id, tenant_id=test_user.tenant_id)

    # Tentar vender 10 unidades (deve falhar)
    sale_service = SaleService(db)
    sale_data = SaleCreate(
        payment_method=PaymentMethod.CASH,
        items=[SaleItemCreate(product_id=product.id, quantity=10, unit_price=Decimal("50.00"))],
        payments=[PaymentCreate(amount=Decimal("500.00"), payment_method=PaymentMethod.CASH)],
    )

    with pytest.raises(ValueError, match="Estoque insuficiente"):
        await sale_service.create_sale(sale_data, test_user.id, tenant_id=test_user.tenant_id)

    print(" Erro de estoque insuficiente capturado corretamente")
