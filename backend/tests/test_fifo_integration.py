"""
FIFO Integration Tests - End-to-end workflow validation
Tests complete purchase and sale scenarios with FIFO inventory tracking
"""

import pytest
import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.category import Category
from app.models.trip import Trip
from app.models.stock_entry import StockEntry
from app.models.entry_item import EntryItem
from app.models.sale import Sale, SaleItem
from app.models.inventory import Inventory
from app.models.user import User
from app.repositories.stock_entry_repository import StockEntryRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.sale_repository import SaleRepository
from app.repositories.inventory_repository import InventoryRepository
from app.services.fifo_service import FIFOService


@pytest.mark.asyncio
async def test_fifo_real_workflow(async_session: AsyncSession):
    """
    Simula workflow completo de compra e venda seguindo FIFO
    
    Cenário:
    1. Criar produto
    2. Criar 3 entradas de estoque em datas diferentes (lotes)
    3. Fazer venda que consome parcialmente os lotes
    4. Verificar FIFO aplicado corretamente
    5. Cancelar venda e verificar reversão
    """
    
    # === SETUP: Criar usuário de teste ===
    user = User(
        full_name="Test User",
        email=f"test-{uuid.uuid4()}@test.com",
        hashed_password="test_hash",
        role="seller",
        is_active=True
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    
    # === SETUP: Criar categoria e produto ===
    category = Category(name="Roupas Fitness", slug=f"roupas-fitness-{datetime.now().timestamp()}", is_active=True)
    async_session.add(category)
    await async_session.commit()
    await async_session.refresh(category)
    
    product = Product(
        name="Legging Fitness Preta",
        sku=f"LEG-FIT-{datetime.now().timestamp()}",
        price=Decimal("150.00"),
        category_id=category.id,
        is_active=True
    )
    async_session.add(product)
    await async_session.commit()
    await async_session.refresh(product)
    
    # Criar inventário
    inventory = Inventory(product_id=product.id, quantity=0, min_stock=10)
    async_session.add(inventory)
    await async_session.commit()
    
    # Repositories
    entry_repo = StockEntryRepository()
    sale_repo = SaleRepository(async_session)
    inventory_repo = InventoryRepository(async_session)
    fifo_service = FIFOService(async_session)
    
    # === FASE 1: Criar 3 entradas de estoque ===
    
    # Entrada 1: 100 unidades a R$ 50 (01/01/2025) - Mais antiga
    entry1_data = {
        "entry_code": f"ENTRY-TEST-{int(datetime.now().timestamp() * 1000)}-1",
        "entry_date": date(2025, 1, 1),
        "entry_type": "trip",
        "supplier_name": "Fornecedor A",
        "total_cost": Decimal("5000.00"),
        "is_active": True
    }
    entry1 = await entry_repo.create(async_session, data=entry1_data)
    item1 = EntryItem(
        entry_id=entry1.id,
        product_id=product.id,
        quantity_received=100,
        unit_cost=Decimal("50.00"),
        quantity_remaining=100,
        is_active=True
    )
    async_session.add(item1)
    await async_session.commit()
    await async_session.refresh(entry1)
    await async_session.refresh(item1)
    
    # Atualizar inventário
    await inventory_repo.update(async_session, id=inventory.id, obj_in={"quantity": 100})
    
    # Entrada 2: 50 unidades a R$ 45 (01/02/2025) - Intermediária
    entry2_data = {
        "entry_code": f"ENTRY-TEST-{int(datetime.now().timestamp() * 1000)}-2",
        "entry_date": date(2025, 2, 1),
        "entry_type": "local",
        "supplier_name": "Fornecedor B",
        "total_cost": Decimal("2250.00"),
        "is_active": True
    }
    entry2 = await entry_repo.create(async_session, data=entry2_data)
    item2 = EntryItem(
        entry_id=entry2.id,
        product_id=product.id,
        quantity_received=50,
        unit_cost=Decimal("45.00"),
        quantity_remaining=50,
        is_active=True
    )
    async_session.add(item2)
    await async_session.commit()
    await async_session.refresh(entry2)
    await async_session.refresh(item2)
    
    # Atualizar inventário
    await inventory_repo.update(async_session, id=inventory.id, obj_in={"quantity": 150})
    
    # Entrada 3: 75 unidades a R$ 48 (01/03/2025) - Mais recente
    entry3_data = {
        "entry_code": f"ENTRY-TEST-{int(datetime.now().timestamp() * 1000)}-3",
        "entry_date": date(2025, 3, 1),
        "entry_type": "online",
        "supplier_name": "Fornecedor C",
        "total_cost": Decimal("3600.00"),
        "is_active": True
    }
    entry3 = await entry_repo.create(async_session, data=entry3_data)
    item3 = EntryItem(
        entry_id=entry3.id,
        product_id=product.id,
        quantity_received=75,
        unit_cost=Decimal("48.00"),
        quantity_remaining=75,
        is_active=True
    )
    async_session.add(item3)
    await async_session.commit()
    await async_session.refresh(entry3)
    await async_session.refresh(item3)
    
    # Atualizar inventário
    await inventory_repo.update(async_session, id=inventory.id, obj_in={"quantity": 225})
    
    # === FASE 2: Verificar estoque inicial ===
    inventory = await inventory_repo.get(async_session, id=inventory.id)
    assert inventory.quantity == 225, "Estoque inicial deve ser 225 unidades"
    
    # === FASE 3: Fazer venda de 120 unidades (deve usar FIFO) ===
    sale_data = {
        "sale_number": f"SALE-TEST-{int(datetime.now().timestamp() * 1000)}",
        "payment_method": "cash",
        "seller_id": user.id,
        "subtotal": Decimal("18000.00"),  # 120 * 150
        "discount_amount": Decimal("0.00"),
        "total_amount": Decimal("18000.00"),
        "status": "completed",
        "is_active": True
    }
    sale = await sale_repo.create(obj_in=sale_data)
    
    sale_item = SaleItem(
        sale_id=sale.id,
        product_id=product.id,
        quantity=120,
        unit_price=Decimal("150.00"),
        subtotal=Decimal("18000.00"),
        discount_amount=Decimal("0.00")
    )
    async_session.add(sale_item)
    await async_session.commit()
    await async_session.refresh(sale)
    await async_session.refresh(sale_item)
    
    # Aplicar FIFO (processa por produto/quantidade)
    sources = await fifo_service.process_sale(product_id=product.id, quantity=120)
    
    # === FASE 4: Verificar FIFO aplicado corretamente ===
    
    # Deve ter consumido de 2 entries (entry1 completa + parte da entry2)
    assert len(sources) == 2, "Deve ter 2 fontes FIFO (entry1 completa + entry2 parcial)"
    
    # Primeira fonte: entry1 (mais antiga) - 100 unidades
    source1 = next((s for s in sources if s["entry_item_id"] == item1.id), None)
    assert source1 is not None, "Deve ter consumido da entry1"
    assert source1["quantity_taken"] == 100, "Deve ter consumido 100 unidades da entry1"
    
    # Segunda fonte: entry2 - 20 unidades
    source2 = next((s for s in sources if s["entry_item_id"] == item2.id), None)
    assert source2 is not None, "Deve ter consumido da entry2"
    assert source2["quantity_taken"] == 20, "Deve ter consumido 20 unidades da entry2"
    
    # Entry3 não deve ter sido tocada (mais recente)
    source3 = next((s for s in sources if s["entry_item_id"] == item3.id), None)
    assert source3 is None, "Não deve ter consumido da entry3 (mais recente)"

    # Verificar estoque restante via itens de entrada (soma das quantidades restantes)
    total_remaining = item1.quantity_remaining + item2.quantity_remaining + item3.quantity_remaining
    assert total_remaining == 105, "Quantidade restante total (via entradas) deve ser 105 (225 - 120)"
    
    # Verificar quantity_remaining nas entry_items
    await async_session.refresh(item1)
    await async_session.refresh(item2)
    await async_session.refresh(item3)
    
    assert item1.quantity_remaining == 0, "Entry1 deve estar esgotada"
    assert item2.quantity_remaining == 30, "Entry2 deve ter 30 unidades restantes"
    assert item3.quantity_remaining == 75, "Entry3 deve estar intacta"
    
    # === FASE 5: Cancelar venda e verificar reversão ===
    await fifo_service.reverse_sale(sources=sources)
    
    # Verificar estoque voltou ao normal
    inventory = await inventory_repo.get(async_session, id=inventory.id)
    assert inventory.quantity == 225, "Estoque deve voltar a 225 após reversão"
    
    # Verificar entry_items voltaram ao estado original
    await async_session.refresh(item1)
    await async_session.refresh(item2)
    await async_session.refresh(item3)
    
    assert item1.quantity_remaining == 100, "Entry1 deve voltar a 100"
    assert item2.quantity_remaining == 50, "Entry2 deve voltar a 50"
    assert item3.quantity_remaining == 75, "Entry3 deve permanecer 75"


@pytest.mark.asyncio
async def test_fifo_multiple_products_same_sale(async_session: AsyncSession):
    """
    Testa FIFO com múltiplos produtos na mesma venda
    """
    
    # === SETUP: Criar usuário de teste ===
    user = User(
        full_name="Test User",
        email=f"test-{uuid.uuid4()}@test.com",
        hashed_password="test_hash",
        role="seller",
        is_active=True
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    
    # === SETUP ===
    category = Category(name="Acessórios", slug=f"acessorios-{datetime.now().timestamp()}", is_active=True)
    async_session.add(category)
    await async_session.commit()
    await async_session.refresh(category)
    
    # Produto 1
    product1 = Product(
        name="Faixa de Cabeça",
        sku=f"FXC-{datetime.now().timestamp()}",
        price=Decimal("30.00"),
        category_id=category.id,
        is_active=True
    )
    async_session.add(product1)
    
    # Produto 2
    product2 = Product(
        name="Toalha Fitness",
        sku=f"TOA-{datetime.now().timestamp()}",
        price=Decimal("40.00"),
        category_id=category.id,
        is_active=True
    )
    async_session.add(product2)
    await async_session.commit()
    await async_session.refresh(product1)
    await async_session.refresh(product2)
    
    # Inventários
    inv1 = Inventory(product_id=product1.id, quantity=0, min_stock=5)
    inv2 = Inventory(product_id=product2.id, quantity=0, min_stock=5)
    async_session.add_all([inv1, inv2])
    await async_session.commit()
    
    entry_repo = StockEntryRepository()
    inventory_repo = InventoryRepository(async_session)
    fifo_service = FIFOService(async_session)
    
    # === Criar entradas para produto1 ===
    entry1 = await entry_repo.create(async_session, data={
        "entry_code": f"ENTRY-TEST2-{int(datetime.now().timestamp() * 1000)}-1",
        "entry_date": date(2025, 1, 1),
        "entry_type": "local",
        "supplier_name": "Fornecedor X",
        "total_cost": Decimal("1500.00"),
        "is_active": True
    })
    item1_p1 = EntryItem(
        entry_id=entry1.id,
        product_id=product1.id,
        quantity_received=50,
        unit_cost=Decimal("30.00"),
        quantity_remaining=50,
        is_active=True
    )
    async_session.add(item1_p1)
    await async_session.commit()
    await inventory_repo.update(async_session, id=inv1.id, obj_in={"quantity": 50})
    
    # === Criar entradas para produto2 ===
    entry2 = await entry_repo.create(async_session, data={
        "entry_code": f"ENTRY-TEST2-{int(datetime.now().timestamp() * 1000)}-2",
        "entry_date": date(2025, 1, 1),
        "entry_type": "local",
        "supplier_name": "Fornecedor X",
        "total_cost": Decimal("2000.00"),
        "is_active": True
    })
    item1_p2 = EntryItem(
        entry_id=entry2.id,
        product_id=product2.id,
        quantity_received=50,
        unit_cost=Decimal("40.00"),
        quantity_remaining=50,
        is_active=True
    )
    async_session.add(item1_p2)
    await async_session.commit()
    await inventory_repo.update(async_session, id=inv2.id, obj_in={"quantity": 50})
    
    # === Criar venda com ambos produtos ===
    sale_repo = SaleRepository(async_session)
    sale = await sale_repo.create(obj_in={
        "sale_number": f"SALE-TEST2-{int(datetime.now().timestamp() * 1000)}",
        "payment_method": "cash",
        "seller_id": user.id,
        "subtotal": Decimal("1000.00"),  # 20*30 + 10*40
        "discount_amount": Decimal("0.00"),
        "total_amount": Decimal("1000.00"),
        "status": "completed",
        "is_active": True
    })
    
    sale_item1 = SaleItem(
        sale_id=sale.id,
        product_id=product1.id,
        quantity=20,
        unit_price=Decimal("30.00"),
        subtotal=Decimal("600.00"),
        discount_amount=Decimal("0.00")
    )
    sale_item2 = SaleItem(
        sale_id=sale.id,
        product_id=product2.id,
        quantity=10,
        unit_price=Decimal("40.00"),
        subtotal=Decimal("400.00"),
        discount_amount=Decimal("0.00")
    )
    async_session.add_all([sale_item1, sale_item2])
    await async_session.commit()
    
    # === Aplicar FIFO (processa por item) ===
    sources_p1 = await fifo_service.process_sale(product_id=product1.id, quantity=20)
    sources_p2 = await fifo_service.process_sale(product_id=product2.id, quantity=10)
    sources = list(sources_p1) + list(sources_p2)
    
    # === Verificar alocação correta ===
    assert len(sources) == 2, "Deve ter alocado 2 fontes (1 por produto)"
    
    # Verificar produto1
    source_p1 = next((s for s in sources if s["entry_item_id"] == item1_p1.id), None)
    assert source_p1 is not None
    assert source_p1["quantity_taken"] == 20
    
    # Verificar produto2
    source_p2 = next((s for s in sources if s["entry_item_id"] == item1_p2.id), None)
    assert source_p2 is not None
    assert source_p2["quantity_taken"] == 10
    
    # Verificar estoque
    # Verificar saldo restante via itens de entrada
    await async_session.refresh(item1_p1)
    await async_session.refresh(item1_p2)
    assert item1_p1.quantity_remaining == 30, "Produto1 deve ter 30 unidades restantes"
    assert item1_p2.quantity_remaining == 40, "Produto2 deve ter 40 unidades restantes"


@pytest.mark.asyncio
async def test_fifo_insufficient_stock_error(async_session: AsyncSession):
    """
    Testa erro quando não há estoque suficiente para FIFO
    """
    
    # === SETUP: Criar usuário de teste ===
    user = User(
        full_name="Test User",
        email=f"test-{uuid.uuid4()}@test.com",
        hashed_password="test_hash",
        role="seller",
        is_active=True
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    
    # === SETUP ===
    category = Category(name="Suplementos", slug=f"suplementos-{datetime.now().timestamp()}", is_active=True)
    async_session.add(category)
    await async_session.commit()
    await async_session.refresh(category)
    
    product = Product(
        name="Whey Protein",
        sku=f"WHP-{datetime.now().timestamp()}",
        price=Decimal("120.00"),
        category_id=category.id,
        is_active=True
    )
    async_session.add(product)
    await async_session.commit()
    await async_session.refresh(product)
    
    inventory = Inventory(product_id=product.id, quantity=0, min_stock=5)
    async_session.add(inventory)
    await async_session.commit()
    
    entry_repo = StockEntryRepository()
    inventory_repo = InventoryRepository(async_session)
    fifo_service = FIFOService(async_session)
    
    # Criar entrada com apenas 10 unidades
    entry = await entry_repo.create(async_session, data={
        "entry_code": f"ENTRY-TEST3-{int(datetime.now().timestamp() * 1000)}",
        "entry_date": date(2025, 1, 1),
        "entry_type": "online",
        "supplier_name": "Fornecedor Y",
        "total_cost": Decimal("1000.00"),
        "is_active": True
    })
    item = EntryItem(
        entry_id=entry.id,
        product_id=product.id,
        quantity_received=10,
        unit_cost=Decimal("100.00"),
        quantity_remaining=10,
        is_active=True
    )
    async_session.add(item)
    await async_session.commit()
    await inventory_repo.update(async_session, id=inventory.id, obj_in={"quantity": 10})
    
    # Tentar vender 50 unidades (mais do que há disponível)
    sale_repo = SaleRepository(async_session)
    sale = await sale_repo.create(obj_in={
        "sale_number": f"SALE-TEST3-{int(datetime.now().timestamp() * 1000)}",
        "payment_method": "cash",
        "seller_id": user.id,
        "subtotal": Decimal("6000.00"),
        "discount_amount": Decimal("0.00"),
        "total_amount": Decimal("6000.00"),
        "status": "completed",
        "is_active": True
    })
    
    sale_item = SaleItem(
        sale_id=sale.id,
        product_id=product.id,
        quantity=50,
        unit_price=Decimal("120.00"),
        subtotal=Decimal("6000.00"),
        discount_amount=Decimal("0.00")
    )
    async_session.add(sale_item)
    await async_session.commit()
    
    # Deve levantar erro de estoque insuficiente
    with pytest.raises(ValueError):
        await fifo_service.process_sale(product_id=product.id, quantity=50)


@pytest.mark.asyncio
async def test_fifo_cost_calculation(async_session: AsyncSession):
    """
    Testa cálculo correto do custo médio (CMV) usando FIFO
    """
    
    # === SETUP: Criar usuário de teste ===
    user = User(
        full_name="Test User",
        email=f"test-{uuid.uuid4()}@test.com",
        hashed_password="test_hash",
        role="seller",
        is_active=True
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    
    # === SETUP ===
    category = Category(name="Equipamentos", slug=f"equipamentos-{datetime.now().timestamp()}", is_active=True)
    async_session.add(category)
    await async_session.commit()
    await async_session.refresh(category)
    
    product = Product(
        name="Halteres 5kg",
        sku=f"HAL-{datetime.now().timestamp()}",
        price=Decimal("80.00"),
        category_id=category.id,
        is_active=True
    )
    async_session.add(product)
    await async_session.commit()
    await async_session.refresh(product)
    
    inventory = Inventory(product_id=product.id, quantity=0, min_stock=5)
    async_session.add(inventory)
    await async_session.commit()
    
    entry_repo = StockEntryRepository()
    inventory_repo = InventoryRepository(async_session)
    fifo_service = FIFOService(async_session)
    
    # Entrada 1: 10 unidades a R$ 40
    entry1 = await entry_repo.create(async_session, data={
        "entry_code": f"ENTRY-TEST4-{int(datetime.now().timestamp() * 1000)}-1",
        "entry_date": date(2025, 1, 1),
        "entry_type": "local",
        "supplier_name": "Fornecedor A",
        "total_cost": Decimal("400.00"),
        "is_active": True
    })
    item1 = EntryItem(
        entry_id=entry1.id,
        product_id=product.id,
        quantity_received=10,
        unit_cost=Decimal("40.00"),
        quantity_remaining=10,
        is_active=True
    )
    async_session.add(item1)
    await async_session.commit()
    await inventory_repo.update(async_session, id=inventory.id, obj_in={"quantity": 10})
    
    # Entrada 2: 10 unidades a R$ 50
    entry2 = await entry_repo.create(async_session, data={
        "entry_code": f"ENTRY-TEST4-{int(datetime.now().timestamp() * 1000)}-2",
        "entry_date": date(2025, 2, 1),
        "entry_type": "local",
        "supplier_name": "Fornecedor B",
        "total_cost": Decimal("500.00"),
        "is_active": True
    })
    item2 = EntryItem(
        entry_id=entry2.id,
        product_id=product.id,
        quantity_received=10,
        unit_cost=Decimal("50.00"),
        quantity_remaining=10,
        is_active=True
    )
    async_session.add(item2)
    await async_session.commit()
    await inventory_repo.update(async_session, id=inventory.id, obj_in={"quantity": 20})
    
    # Vender 15 unidades
    sale_repo = SaleRepository(async_session)
    sale = await sale_repo.create(obj_in={
        "sale_number": f"SALE-TEST4-{int(datetime.now().timestamp() * 1000)}",
        "payment_method": "cash",
        "seller_id": user.id,
        "subtotal": Decimal("1200.00"),  # 15 * 80
        "discount_amount": Decimal("0.00"),
        "total_amount": Decimal("1200.00"),
        "status": "completed",
        "is_active": True
    })
    
    sale_item = SaleItem(
        sale_id=sale.id,
        product_id=product.id,
        quantity=15,
        unit_price=Decimal("80.00"),
        subtotal=Decimal("1200.00"),
        discount_amount=Decimal("0.00")
    )
    async_session.add(sale_item)
    await async_session.commit()
    
    # Aplicar FIFO (processa por item)
    sources = await fifo_service.process_sale(product_id=product.id, quantity=15)
    
    # Calcular CMV (Custo da Mercadoria Vendida)
    cmv = sum(Decimal(str(src["quantity_taken"])) * Decimal(str(src["unit_cost"])) for src in sources)
    
    # CMV esperado: (10 * 40) + (5 * 50) = 400 + 250 = 650
    expected_cmv = Decimal("650.00")
    assert cmv == expected_cmv, f"CMV deve ser {expected_cmv}, mas foi {cmv}"
    
    # Lucro bruto: Receita - CMV = 1200 - 650 = 550
    gross_profit = Decimal("1200.00") - cmv
    assert gross_profit == Decimal("550.00"), "Lucro bruto deve ser R$ 550,00"
    
    # Margem: (Lucro / Receita) * 100 = (550 / 1200) * 100 ≈ 45.83%
    margin = (gross_profit / Decimal("1200.00")) * 100
    assert 45 < margin < 46, "Margem deve estar entre 45% e 46%"

