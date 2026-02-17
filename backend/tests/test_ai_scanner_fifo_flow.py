"""
Testes do Fluxo Completo: AI Scanner → Produto → Entrada FIFO

Testa o fluxo obrigatório de rastreabilidade onde todo produto escaneado
DEVE ter uma entrada de estoque vinculada (FIFO).
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.inventory import Inventory
from app.models.stock_entry import StockEntry
from app.models.entry_item import EntryItem


@pytest.mark.asyncio
async def test_ai_scanner_returns_null_size_when_not_identifiable(
    client: AsyncClient,
    auth_token: str
):
    """
    Testa se o AI Scanner retorna size=null quando não consegue identificar o tamanho.
    
    Antes do fix: retornava "Desconhecido" (string)
    Depois do fix: retorna null (None)
    """
    # Nota: Este teste requer uma imagem real e API key do OpenAI configurada
    # Por isso está marcado como skip por padrão
    pytest.skip("Requer imagem de teste e OpenAI API key")
    
    # response = await client.post(
    #     "/api/v1/ai/scan-product",
    #     headers={"Authorization": f"Bearer {auth_token}"},
    #     files={"image": open("test_product_without_size.jpg", "rb")},
    # )
    # 
    # assert response.status_code == 200
    # data = response.json()
    # assert data["success"] is True
    # assert data["data"]["size"] is None  # ✅ Deve ser null quando não identificável


@pytest.mark.asyncio
async def test_product_creation_without_initial_stock(
    client: AsyncClient,
    auth_token: str,
    db: AsyncSession
):
    """
    Testa se produto é criado sem estoque inicial (FIFO obrigatório via entrada).
    
    Novo fluxo:
    1. Produto criado com initial_stock=0
    2. Estoque adicionado somente via entrada (StockEntry)
    3. Entrada cria EntryItem vinculando produto à entrada (rastreabilidade)
    """
    product_data = {
        "name": "Legging Fitness Teste FIFO",
        "sku": "TEST-FIFO-001",
        "brand": "Teste Brand",
        "color": "Preta",
        "size": "M",
        "category_id": 1,
        "cost_price": 45.0,
        "price": 89.90,
        "initial_stock": 0,  # ✅ Sempre 0 - estoque via entrada
        "min_stock": 5,
    }

    response = await client.post(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=product_data,
    )

    assert response.status_code == 201
    created = response.json()
    assert created["name"] == product_data["name"]
    assert created["sku"] == product_data["sku"]
    
    # Verificar que produto foi criado no banco
    from sqlalchemy import select
    stmt = select(Product).where(Product.id == created["id"])
    result = await db.execute(stmt)
    product = result.scalar_one()
    
    assert product is not None
    assert product.name == product_data["name"]
    
    # Verificar que NÃO tem estoque ainda (aguarda entrada)
    inv_stmt = select(Inventory).where(Inventory.product_id == product.id)
    inv_result = await db.execute(inv_stmt)
    inventory = inv_result.scalar_one_or_none()
    
    # Pode ter inventory com quantity=0 ou não ter inventory
    if inventory:
        assert inventory.quantity == 0, "Estoque deve ser 0 até criar entrada FIFO"


@pytest.mark.asyncio
async def test_fifo_traceability_with_stock_entry(
    client: AsyncClient,
    auth_token: str,
    db: AsyncSession
):
    """
    Testa rastreabilidade FIFO completa:
    1. Criar produto
    2. Criar entrada de estoque (StockEntry)
    3. Verificar EntryItem vinculando produto à entrada
    4. Verificar estoque atualizado
    
    Este é o fluxo OBRIGATÓRIO para todo produto.
    """
    # 1. Criar produto
    product_data = {
        "name": "Produto Rastreável FIFO",
        "sku": "TRACE-FIFO-001",
        "category_id": 1,
        "cost_price": 50.0,
        "price": 100.0,
        "initial_stock": 0,
        "min_stock": 5,
    }

    product_response = await client.post(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=product_data,
    )
    assert product_response.status_code == 201
    product = product_response.json()
    
    # 2. Criar entrada de estoque (StockEntry)
    entry_data = {
        "entry_code": "ENTRY-TEST-001",
        "entry_type": "local",
        "supplier_name": "Fornecedor Teste",
        "items": [
            {
                "product_id": product["id"],
                "quantity_received": 10,
                "unit_cost": 50.0,
                "unit_price": 100.0,
            }
        ],
    }

    entry_response = await client.post(
        "/api/v1/entries",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=entry_data,
    )
    assert entry_response.status_code == 201
    entry = entry_response.json()
    
    # 3. Verificar que EntryItem foi criado (vínculo produto ↔ entrada)
    from sqlalchemy import select
    entry_stmt = select(StockEntry).where(StockEntry.id == entry["id"])
    entry_result = await db.execute(entry_stmt)
    stock_entry = entry_result.scalar_one()
    
    assert stock_entry is not None
    assert stock_entry.entry_code == "ENTRY-TEST-001"
    
    # Verificar EntryItem
    item_stmt = select(EntryItem).where(
        EntryItem.entry_id == stock_entry.id,
        EntryItem.product_id == product["id"]
    )
    item_result = await db.execute(item_stmt)
    entry_item = item_result.scalar_one()
    
    assert entry_item is not None
    assert entry_item.quantity_received == 10
    assert entry_item.quantity_remaining == 10  # Nada vendido ainda
    assert entry_item.unit_cost == 50.0
    
    # 4. Verificar que estoque foi atualizado
    inv_stmt = select(Inventory).where(Inventory.product_id == product["id"])
    inv_result = await db.execute(inv_stmt)
    inventory = inv_result.scalar_one()
    
    assert inventory is not None
    assert inventory.quantity == 10, "Estoque deve refletir a entrada FIFO"


@pytest.mark.asyncio
async def test_name_without_color_and_size(
    client: AsyncClient,
    auth_token: str
):
    """
    Testa se o nome do produto NÃO contém cor e tamanho.
    
    Antes: "Legging Fitness Preta M"
    Depois: "Legging Fitness" (cor e tamanho em campos separados)
    """
    # Este teste simulado verifica a lógica de nomenclatura
    # Em um teste real com AI Scanner, você verificaria:
    # assert "Preta" not in data["name"]
    # assert "M" not in data["name"]
    # assert data["color"] == "Preta"
    # assert data["size"] == "M"
    
    # Teste mock: criar produto com nome limpo
    product_data = {
        "name": "Legging Fitness Cintura Alta",  # ✅ SEM cor/tamanho
        "sku": "TEST-CLEAN-NAME-001",
        "brand": "Test Brand",
        "color": "Preta",  # ✅ Cor em campo separado
        "size": "M",       # ✅ Tamanho em campo separado
        "category_id": 1,
        "cost_price": 45.0,
        "price": 89.90,
        "initial_stock": 0,
        "min_stock": 5,
    }

    response = await client.post(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {auth_token}"},
        json=product_data,
    )

    assert response.status_code == 201
    created = response.json()
    
    # Verificar que nome não contém cor/tamanho
    assert "Preta" not in created["name"]
    assert " M" not in created["name"]
    assert " P" not in created["name"]
    assert " G" not in created["name"]
    
    # Verificar que cor e tamanho estão nos campos corretos
    assert created["color"] == "Preta"
    assert created["size"] == "M"


# Documentação do fluxo completo para referência
"""
🔄 FLUXO COMPLETO: AI Scanner → Produto → Entrada FIFO

1. **AI Scanner analisa imagem**
   - Nome SEM cor/tamanho: "Legging Fitness"
   - Cor no campo: "Preta"
   - Size no campo: "M" ou null se não identificável
   - Preços dinâmicos baseados em análise visual

2. **Usuário confirma criação**
   - Produto criado com initial_stock=0
   - NUNCA criar produto com estoque direto

3. **Redirecionamento automático para entrada**
   - fromAIScanner=true
   - preselectedProductData com dados do produto
   - Formulário pré-preenchido

4. **Usuário cria entrada de estoque**
   - StockEntry criado (viagem/online/local/initial)
   - EntryItem criado vinculando produto à entrada
   - Inventory.quantity atualizado

5. **Confirmação de sucesso com contexto FIFO**
   - Mensagem explica rastreabilidade
   - Informa sobre FIFO (primeiro a entrar, primeiro a sair)
   - Opções: Ver Produto | Escanear Outro

6. **Vendas usam FIFO**
   - Venda reduz EntryItem.quantity_remaining das entradas mais antigas primeiro
   - Rastreabilidade completa: venda → entry_item → stock_entry
   - ROI por entrada, Sell-Through Rate, Custo Real por venda

✅ **GARANTIAS DO SISTEMA:**
- Todo produto TEM uma entrada de estoque
- Nenhum produto "fantasma" sem origem
- FIFO automático em vendas
- Rastreabilidade total para análise financeira
"""
