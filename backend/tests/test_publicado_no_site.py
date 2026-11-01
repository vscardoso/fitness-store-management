"""`is_catalog` é só "publicado no site" (decisão da lojista): receber estoque não o desliga e ele não esconde o produto
da busca, da categoria, da lista de reposição nem das entradas."""
import datetime
import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import async_session, auth_token, test_client  # noqa: F401

pytestmark = pytest.mark.asyncio


def _h(token):
    return {"Authorization": f"Bearer {token}"}


async def _produto(client, token, nome=None, **extra):
    nome = nome or f"Legging Zq{uuid.uuid4().hex[:8]}"
    r = await client.post("/api/v1/products/", headers=_h(token), json={
        "name": nome, "sku": f"PUB-{uuid.uuid4().hex[:8].upper()}", "price": 99.9, "cost_price": 40, "category_id": 1, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def _produto_na_lista(client, token, pid):
    r = await client.get("/api/v1/products/", headers=_h(token), params={"limit": 1000})
    assert r.status_code == 200
    return next((p for p in r.json() if p["id"] == pid), None)


def _entrada(codigo, itens):
    return {"entry_code": codigo, "entry_date": str(datetime.date.today()), "entry_type": "local",
            "supplier_name": "Fornecedor Teste", "items": itens}


async def test_produto_novo_nasce_nao_publicado(test_client: AsyncClient, auth_token: str):
    """Decisão do Victor (01/11/2026): produto novo nasce fora do site; a lojista publica quando quiser."""
    p = await _produto(test_client, auth_token)
    assert (await _produto_na_lista(test_client, auth_token, p["id"]))["is_catalog"] is False


async def test_entrada_nova_nao_desliga_a_publicacao(test_client: AsyncClient, auth_token: str):
    p = await _produto(test_client, auth_token, is_catalog=True)
    assert (await _produto_na_lista(test_client, auth_token, p["id"]))["is_catalog"] is True
    r = await test_client.post("/api/v1/stock-entries/", headers=_h(auth_token),
                               json=_entrada(f"PUB-{uuid.uuid4().hex[:6]}", [{"product_id": p["id"], "quantity_received": 4, "unit_cost": 20}]))
    assert r.status_code == 201, r.text
    depois = await _produto_na_lista(test_client, auth_token, p["id"])
    assert depois["is_catalog"] is True and depois["current_stock"] == 4   # antes virava False sozinho


async def test_item_em_entrada_existente_nao_desliga_a_publicacao_e_vale_para_despublicado(test_client: AsyncClient, auth_token: str):
    base = await _produto(test_client, auth_token)
    e = await test_client.post("/api/v1/stock-entries/", headers=_h(auth_token),
                               json=_entrada(f"PUB-{uuid.uuid4().hex[:6]}", [{"product_id": base["id"], "quantity_received": 1, "unit_cost": 20}]))
    entry_id = e.json()["id"]
    publicado = await _produto(test_client, auth_token, is_catalog=True)      # publicado, nunca teve entrada
    interno = await _produto(test_client, auth_token, is_catalog=False)       # não publicado
    for prod in (publicado, interno):
        r = await test_client.post(f"/api/v1/stock-entries/{entry_id}/items", headers=_h(auth_token),
                                   json={"product_id": prod["id"], "quantity_received": 2, "unit_cost": 30})
        assert r.status_code == 200, r.text
    assert (await _produto_na_lista(test_client, auth_token, publicado["id"]))["is_catalog"] is True
    assert (await _produto_na_lista(test_client, auth_token, interno["id"]))["is_catalog"] is False


async def test_busca_e_categoria_acham_produto_publicado(test_client: AsyncClient, auth_token: str):
    termo = f"Zqpub{uuid.uuid4().hex[:8]}"
    p = await _produto(test_client, auth_token, nome=f"Top {termo}", is_catalog=True)
    r = await test_client.get("/api/v1/products/", headers=_h(auth_token), params={"search": termo})
    assert p["id"] in {x["id"] for x in r.json()}
    r = await test_client.get("/api/v1/products/", headers=_h(auth_token), params={"category_id": 1, "limit": 1000})
    assert p["id"] in {x["id"] for x in r.json()}


async def test_excluir_a_unica_entrada_de_produto_publicado_desativa_o_produto_como_antes(test_client: AsyncClient, auth_token: str):
    p = await _produto(test_client, auth_token, is_catalog=True)
    e = await test_client.post("/api/v1/stock-entries/", headers=_h(auth_token),
                               json=_entrada(f"PUB-{uuid.uuid4().hex[:6]}", [{"product_id": p["id"], "quantity_received": 3, "unit_cost": 20}]))
    assert e.status_code == 201
    r = await test_client.delete(f"/api/v1/stock-entries/{e.json()['id']}", headers=_h(auth_token))
    assert r.status_code == 200, r.text
    assert await _produto_na_lista(test_client, auth_token, p["id"]) is None   # saiu da loja, como antes
