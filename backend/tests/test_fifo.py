"""
Testes unitários para FIFO Service.

Testa a lógica de First In, First Out (FIFO) para vendas,
garantindo que os produtos sejam retirados das entradas mais antigas primeiro.

Cenários testados:
1. Venda de produto com estoque de uma única entrada
2. Venda usando múltiplas entradas (FIFO)
3. Tentativa de venda com estoque insuficiente
4. Verificação de ordem FIFO (mais antiga primeiro)
5. Simulação de venda sem modificar banco
6. Reversão de venda (cancelamento)
7. Verificação de disponibilidade
8. Informações de custo por produto
"""

import pytest
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entry_item import EntryItem
from app.services.fifo_service import FIFOService
from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto  # noqa: F401

D = Decimal


@pytest.fixture
async def setup_fifo_data(async_session: AsyncSession, test_user):
    """
    Dados de FIFO no modelo atual (produto + variação + EntryItem por variação).

    Whey (180 un): entrada 1 (30 dias atrás) 100 @ 85, entrada 2 (15 dias) 50 @ 90, entrada 3 (hoje) 30 @ 95.
    Creatina (20 un): entrada 3, 20 @ 50. Sem rateio de viagem, então custo posto = custo da mercadoria.
    """
    t_id, _token, cat_id = await _loja_api(async_session, test_user)
    product1, variant1 = await _produto(async_session, t_id, cat_id, "Whey Protein", "150.00")
    product2, variant2 = await _produto(async_session, t_id, cat_id, "Creatina", "80.00")
    today = date.today()
    entry1 = await _lote(async_session, t_id, [(variant1, product1, 100, "85.00")], entry_date=today - timedelta(days=30))
    entry2 = await _lote(async_session, t_id, [(variant1, product1, 50, "90.00")], entry_date=today - timedelta(days=15))
    entry3 = await _lote(async_session, t_id, [(variant1, product1, 30, "95.00"), (variant2, product2, 20, "50.00")], entry_date=today)
    await async_session.commit()

    async def _item(entry, variant):
        from sqlalchemy import select
        return (await async_session.execute(
            select(EntryItem).where(EntryItem.entry_id == entry.id, EntryItem.variant_id == variant.id))).scalar_one()

    return {
        "tenant_id": t_id,
        "category_id": cat_id,
        "product1": product1,  # Whey - Total: 180 unidades
        "product2": product2,  # Creatina - Total: 20 unidades
        "variant1": variant1,
        "variant2": variant2,
        "entry1": entry1,
        "entry2": entry2,
        "entry3": entry3,
        "entry_item_1_1": await _item(entry1, variant1),  # Whey - 100 un @ R$ 85
        "entry_item_2_1": await _item(entry2, variant1),  # Whey - 50 un @ R$ 90
        "entry_item_3_1": await _item(entry3, variant1),  # Whey - 30 un @ R$ 95
        "entry_item_3_2": await _item(entry3, variant2),  # Creatina - 20 un @ R$ 50
    }


@pytest.mark.asyncio
async def test_fifo_single_entry(async_session: AsyncSession, setup_fifo_data):
    """
    Teste 1: Venda toda de uma única entrada.
    
    Cenário:
    - Produto tem 180 unidades em estoque (3 entradas)
    - Vende 50 unidades
    - Deve usar apenas a entrada mais antiga (entry_item_1_1)
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Processar venda de 50 unidades
    sources = await fifo_service.process_sale(
        product_id=data["product1"].id,
        quantity=50,
        variant_id=data["variant1"].id,
        tenant_id=data["tenant_id"],
    )
    
    # Verificações
    assert len(sources) == 1, "Deve usar apenas 1 entrada"
    
    source = sources[0]
    assert source["entry_item_id"] == data["entry_item_1_1"].id
    assert source["quantity_taken"] == 50
    assert source["unit_cost"] == 85.00
    assert source["total_cost"] == 50 * 85.00
    assert source["entry_code"].startswith("LOTE-")
        
    # Verificar quantidade restante no banco
    await async_session.refresh(data["entry_item_1_1"])
    assert data["entry_item_1_1"].quantity_remaining == 50


@pytest.mark.asyncio
async def test_fifo_multiple_entries(async_session: AsyncSession, setup_fifo_data):
    """
    Teste 2: Venda usando múltiplas entradas (FIFO).
    
    Cenário:
    - Produto tem 180 unidades (entry1: 100, entry2: 50, entry3: 30)
    - Vende 120 unidades
    - Deve usar entry1 completo (100) + entry2 parcial (20)
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Processar venda de 120 unidades
    sources = await fifo_service.process_sale(
        product_id=data["product1"].id,
        quantity=120,
        variant_id=data["variant1"].id,
        tenant_id=data["tenant_id"],
    )
    
    # Verificações
    assert len(sources) == 2, "Deve usar 2 entradas"
    
    # Primeira fonte: entry1 completo
    source1 = sources[0]
    assert source1["entry_item_id"] == data["entry_item_1_1"].id
    assert source1["quantity_taken"] == 100
    assert source1["unit_cost"] == 85.00
    assert source1["total_cost"] == 100 * 85.00
    
    # Segunda fonte: entry2 parcial
    source2 = sources[1]
    assert source2["entry_item_id"] == data["entry_item_2_1"].id
    assert source2["quantity_taken"] == 20
    assert source2["unit_cost"] == 90.00
    assert source2["total_cost"] == 20 * 90.00
    
    # Custo total da venda
    total_cost = source1["total_cost"] + source2["total_cost"]
    assert total_cost == (100 * 85.00) + (20 * 90.00)
    
    # Verificar quantidades restantes
    await async_session.refresh(data["entry_item_1_1"])
    await async_session.refresh(data["entry_item_2_1"])
    await async_session.refresh(data["entry_item_3_1"])
    
    assert data["entry_item_1_1"].quantity_remaining == 0  # Zerado
    assert data["entry_item_2_1"].quantity_remaining == 30  # Restaram 30
    assert data["entry_item_3_1"].quantity_remaining == 30  # Não foi usado


@pytest.mark.asyncio
async def test_fifo_insufficient_stock(async_session: AsyncSession, setup_fifo_data):
    """
    Teste 3: Tentativa de venda com estoque insuficiente.
    
    Cenário:
    - Produto tem 180 unidades em estoque
    - Tenta vender 200 unidades
    - Deve dar erro ValueError
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Tentar vender mais do que tem em estoque
    with pytest.raises(ValueError) as exc_info:
        await fifo_service.process_sale(
            product_id=data["product1"].id,
            quantity=200,
            variant_id=data["variant1"].id,
            tenant_id=data["tenant_id"],
        )
    
    # Verificar mensagem de erro
    assert "Insufficient stock" in str(exc_info.value)
    assert "Requested: 200" in str(exc_info.value)
    assert "Available: 180" in str(exc_info.value)
    
    # Garantir que nada foi modificado no banco
    await async_session.refresh(data["entry_item_1_1"])
    await async_session.refresh(data["entry_item_2_1"])
    await async_session.refresh(data["entry_item_3_1"])
    
    assert data["entry_item_1_1"].quantity_remaining == 100
    assert data["entry_item_2_1"].quantity_remaining == 50
    assert data["entry_item_3_1"].quantity_remaining == 30


@pytest.mark.asyncio
async def test_fifo_respects_order(async_session: AsyncSession, setup_fifo_data):
    """
    Teste 4: Verificação de ordem FIFO (mais antiga primeiro).
    
    Cenário:
    - Produto tem 3 entradas com datas diferentes
    - Vende quantidade suficiente para usar todas as 3 entradas
    - Deve usar na ordem: entry1 -> entry2 -> entry3
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Processar venda de 180 unidades (usa todas as entradas)
    sources = await fifo_service.process_sale(
        product_id=data["product1"].id,
        quantity=180,
        variant_id=data["variant1"].id,
        tenant_id=data["tenant_id"],
    )
    
    # Verificações
    assert len(sources) == 3, "Deve usar todas as 3 entradas"
    
    # Verificar ordem FIFO
    assert sources[0]["entry_item_id"] == data["entry_item_1_1"].id  # Mais antiga
    assert sources[1]["entry_item_id"] == data["entry_item_2_1"].id  # Intermediária
    assert sources[2]["entry_item_id"] == data["entry_item_3_1"].id  # Mais recente
    
    # Verificar quantidades
    assert sources[0]["quantity_taken"] == 100
    assert sources[1]["quantity_taken"] == 50
    assert sources[2]["quantity_taken"] == 30
    
    # Verificar códigos de entrada (LOTE-n, em ordem crescente de criação)
    assert sources[0]["entry_code"].startswith("LOTE-")
    assert sources[1]["entry_code"].startswith("LOTE-")
    assert sources[2]["entry_code"].startswith("LOTE-")
    
    # Verificar que todas as entradas foram zeradas
    await async_session.refresh(data["entry_item_1_1"])
    await async_session.refresh(data["entry_item_2_1"])
    await async_session.refresh(data["entry_item_3_1"])
    
    assert data["entry_item_1_1"].quantity_remaining == 0
    assert data["entry_item_2_1"].quantity_remaining == 0
    assert data["entry_item_3_1"].quantity_remaining == 0


@pytest.mark.asyncio
async def test_simulate_sale(async_session: AsyncSession, setup_fifo_data):
    """
    Teste 5: Simulação de venda sem modificar banco.
    
    Cenário:
    - Simula venda de 75 unidades
    - Verifica custos calculados
    - Garante que banco não foi modificado
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Simular venda
    simulation = await fifo_service.simulate_sale(
        product_id=data["product1"].id,
        quantity=75,
        variant_id=data["variant1"].id,
        tenant_id=data["tenant_id"],
    )
    
    # Verificações
    assert simulation["feasible"] is True
    assert len(simulation["sources"]) == 1
    
    # Deve usar apenas entry1 (75 de 100 disponíveis)
    source = simulation["sources"][0]
    assert source["entry_item_id"] == data["entry_item_1_1"].id
    assert source["quantity_taken"] == 75
    
    # Verificar custos
    expected_total = 75 * 85.00
    expected_avg = 85.00
    assert simulation["total_cost"] == expected_total
    assert simulation["average_unit_cost"] == expected_avg
    
    # Garantir que banco NÃO foi modificado
    await async_session.refresh(data["entry_item_1_1"])
    assert data["entry_item_1_1"].quantity_remaining == 100  # Não mudou!


@pytest.mark.asyncio
async def test_reverse_sale(async_session: AsyncSession, setup_fifo_data):
    """
    Teste 6: Reversão de venda (cancelamento).
    
    Cenário:
    - Processa venda de 60 unidades
    - Reverte a venda
    - Verifica que quantidades foram restauradas
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Processar venda
    sources = await fifo_service.process_sale(
        product_id=data["product1"].id,
        quantity=60,
        variant_id=data["variant1"].id,
        tenant_id=data["tenant_id"],
    )
    
    # Verificar que venda foi processada
    await async_session.refresh(data["entry_item_1_1"])
    assert data["entry_item_1_1"].quantity_remaining == 40  # 100 - 60
    
    # Reverter venda
    success = await fifo_service.reverse_sale(sources)
    assert success is True
    
    # Verificar que quantidade foi restaurada
    await async_session.refresh(data["entry_item_1_1"])
    assert data["entry_item_1_1"].quantity_remaining == 100  # Restaurado!


@pytest.mark.asyncio
async def test_check_availability(async_session: AsyncSession, setup_fifo_data):
    """
    Teste 7: Verificação de disponibilidade.
    
    Cenário:
    - Verifica disponibilidade de diferentes quantidades
    - Testa cenários de disponível e indisponível
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Verificar disponibilidade: DISPONÍVEL
    availability = await fifo_service.check_availability(
        product_id=data["product1"].id,
        quantity=100,
        variant_id=data["variant1"].id,
        tenant_id=data["tenant_id"],
    )
    
    assert availability["available"] is True
    assert availability["total_available"] == 180
    assert availability["requested"] == 100
    assert availability["shortage"] == 0
    assert availability["sources_count"] == 3
    
    # Verificar disponibilidade: INDISPONÍVEL
    availability = await fifo_service.check_availability(
        product_id=data["product1"].id,
        quantity=200,
        variant_id=data["variant1"].id,
        tenant_id=data["tenant_id"],
    )
    
    assert availability["available"] is False
    assert availability["total_available"] == 180
    assert availability["requested"] == 200
    assert availability["shortage"] == 20


@pytest.mark.asyncio
async def test_get_product_cost_info(async_session: AsyncSession, setup_fifo_data):
    """
    Teste 8: Informações de custo por produto.
    
    Cenário:
    - Obtém informações de custo do produto
    - Verifica custos médios e totais
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Obter informações de custo
    cost_info = await fifo_service.get_product_cost_info(
        product_id=data["product1"].id,
        variant_id=data["variant1"].id,
        tenant_id=data["tenant_id"],
    )
    
    # Verificações
    assert cost_info["total_quantity"] == 180
    assert cost_info["sources_count"] == 3
    
    # Custo total: (100 * 85) + (50 * 90) + (30 * 95)
    expected_total = (100 * 85.00) + (50 * 90.00) + (30 * 95.00)
    assert cost_info["total_cost"] == expected_total
    
    # Custo médio: total / quantidade
    expected_avg = expected_total / 180
    assert abs(cost_info["average_unit_cost"] - expected_avg) < 0.01
    
    # Custos unitários (primeiro = mais antigo, último = mais novo)
    assert cost_info["oldest_unit_cost"] == 85.00
    assert cost_info["newest_unit_cost"] == 95.00


@pytest.mark.asyncio
async def test_fifo_zero_quantity_error(async_session: AsyncSession, setup_fifo_data):
    """
    Teste adicional: Erro ao tentar vender quantidade zero ou negativa.
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Tentar vender 0 unidades
    with pytest.raises(ValueError) as exc_info:
        await fifo_service.process_sale(
            product_id=data["product1"].id,
            quantity=0,
            variant_id=data["variant1"].id,
            tenant_id=data["tenant_id"],
        )
    
    assert "must be greater than 0" in str(exc_info.value)


@pytest.mark.asyncio
async def test_fifo_no_stock_error(async_session: AsyncSession, setup_fifo_data):
    """
    Teste adicional: Erro ao tentar vender produto sem estoque.
    """
    data = setup_fifo_data
    fifo_service = FIFOService(async_session)
    
    # Criar produto sem estoque
    product_no_stock, variant_no_stock = await _produto(
        async_session, data["tenant_id"], data["category_id"], "Produto Sem Estoque", "100.00")
    await async_session.commit()

    # Tentar vender produto sem estoque (por variação e pelo caminho legado por produto)
    for kwargs in ({"variant_id": variant_no_stock.id}, {}):
        with pytest.raises(ValueError) as exc_info:
            await fifo_service.process_sale(
                product_id=product_no_stock.id,
                quantity=10,
                tenant_id=data["tenant_id"],
                **kwargs,
            )
        assert "Sem estoque disponível" in str(exc_info.value)
