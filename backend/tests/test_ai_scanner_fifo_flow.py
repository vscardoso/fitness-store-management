"""
Fluxo depois do Scanner IA: Produto (sem estoque) > Entrada FIFO.

Todo produto criado nasce SEM estoque; o estoque só entra por uma StockEntry, que cria o EntryItem
(rastreabilidade) e atualiza Inventory.quantity.

O teste antigo `test_ai_scanner_returns_null_size_when_not_identifiable` foi apagado: era só um
`pytest.skip` com a chamada real comentada (exigia imagem e chave do provedor de IA). O limite de uso e a
permissão do `POST /ai/scan-product` já são cobertos por tests/test_limites_de_tentativas.py e tests/test_permissions.py.
"""
from datetime import date

import pytest
from sqlalchemy import select

from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.models.product import Product
from app.models.stock_entry import StockEntry
from tests.test_lot_costs import _limpa_loja_1, _loja_api  # noqa: F401

pytestmark = pytest.mark.asyncio


def _produto_payload(cat_id, **extra):
    return {
        "name": "Legging Fitness Teste FIFO",
        "sku": "TEST-FIFO-001",
        "brand": "Teste Brand",
        "color": "Preta",
        "size": "M",
        "category_id": cat_id,
        "cost_price": 45.0,
        "price": 89.90,
        "initial_stock": 0,  # sempre 0: estoque só por entrada
        "min_stock": 5,
        **extra,
    }


async def test_product_creation_without_initial_stock(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    payload = _produto_payload(cat, sku="TEST-FIFO-CRIA-001")

    response = await test_client.post("/api/v1/products", headers=h, json=payload)

    assert response.status_code == 201, response.text
    created = response.json()
    assert created["name"] == payload["name"]
    assert created["sku"] == payload["sku"]

    product = (await async_session.execute(select(Product).where(Product.id == created["id"]))).scalar_one()
    assert product.name == payload["name"]

    # Nada de estoque até existir uma entrada: sem EntryItem e, se houver Inventory, com quantidade 0
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.product_id == product.id))).scalars().all()
    assert itens == []
    inventory = (await async_session.execute(select(Inventory).where(Inventory.product_id == product.id))).scalar_one_or_none()
    if inventory:
        assert inventory.quantity == 0, "Estoque deve ser 0 até criar entrada FIFO"


async def test_fifo_traceability_with_stock_entry(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}

    # 1. produto sem estoque
    r = await test_client.post("/api/v1/products", headers=h, json=_produto_payload(
        cat, name="Produto Rastreável FIFO", sku="TRACE-FIFO-001", cost_price=50.0, price=100.0))
    assert r.status_code == 201, r.text
    product = r.json()
    variant_id = product["variants"][0]["id"]

    # 2. entrada de estoque
    r = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        "entry_code": "ENTRY-TEST-001",
        "entry_date": date.today().isoformat(),
        "entry_type": "local",
        "supplier_name": "Fornecedor Teste",
        "items": [{"product_id": product["id"], "variant_id": variant_id, "quantity_received": 10, "unit_cost": "50.00"}],
    })
    assert r.status_code == 201, r.text
    entry = r.json()

    # 3. EntryItem liga produto e entrada
    async_session.expire_all()
    stock_entry = (await async_session.execute(select(StockEntry).where(StockEntry.id == entry["id"]))).scalar_one()
    assert stock_entry.entry_code == "ENTRY-TEST-001"
    entry_item = (await async_session.execute(select(EntryItem).where(
        EntryItem.entry_id == stock_entry.id, EntryItem.product_id == product["id"]))).scalar_one()
    assert entry_item.variant_id == variant_id
    assert entry_item.quantity_received == 10
    assert entry_item.quantity_remaining == 10  # nada vendido ainda
    assert entry_item.unit_cost == 50

    # 4. estoque do produto reflete a entrada
    inventory = (await async_session.execute(select(Inventory).where(Inventory.product_id == product["id"]))).scalar_one()
    assert inventory.quantity == 10, "Estoque deve refletir a entrada FIFO"


async def test_name_without_color_and_size(test_client, async_session, test_user):
    """Nome sem cor e tamanho; cor e tamanho ficam em campos separados."""
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}

    response = await test_client.post("/api/v1/products", headers=h, json=_produto_payload(
        cat, name="Legging Fitness Cintura Alta", sku="TEST-CLEAN-NAME-001"))

    assert response.status_code == 201, response.text
    created = response.json()
    assert "Preta" not in created["name"]
    assert " M" not in created["name"]
    assert " P" not in created["name"]
    assert " G" not in created["name"]
    assert created["color"] == "Preta"
    assert created["size"] == "M"
