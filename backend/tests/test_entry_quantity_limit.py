"""Quantidade de uma linha de entrada tem teto (1.000.000): acima disso estoura o inteiro de 32 bits do Postgres e vira 500.
Achado no estresse de 2026-11-01: o servidor aceitava 1.000.000.000.000 peças."""
import datetime
import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import async_session, auth_token, test_client  # noqa: F401

pytestmark = pytest.mark.asyncio


def _h(token):
    return {"Authorization": f"Bearer {token}"}


_CRIADAS = []   # entradas criadas pelos testes: apagadas no fim para não mexer nos totais dos outros testes (banco compartilhado)


@pytest.fixture(autouse=True)
async def _limpa_entradas(test_client: AsyncClient, auth_token: str):
    yield
    while _CRIADAS:
        await test_client.delete(f"/api/v1/stock-entries/{_CRIADAS.pop()}", headers=_h(auth_token))


async def _entrada_com_produto(client, token):
    p = await client.post("/api/v1/products/", headers=_h(token), json={
        "name": f"Legging Qz{uuid.uuid4().hex[:8]}", "sku": f"QTD-{uuid.uuid4().hex[:8].upper()}", "price": 99.9, "cost_price": 40, "category_id": 1})
    assert p.status_code == 201, p.text
    pid = p.json()["id"]
    e = await client.post("/api/v1/stock-entries/", headers=_h(token), json={
        "entry_code": f"QTD-{uuid.uuid4().hex[:6]}", "entry_date": str(datetime.date.today()), "entry_type": "local",
        "supplier_name": "Fornecedor Teste", "items": [{"product_id": pid, "quantity_received": 2, "unit_cost": 20}]})
    assert e.status_code == 201, e.text
    _CRIADAS.append(e.json()["id"])
    return pid, e.json()["id"], e.json()["entry_items"][0]["id"] if e.json().get("entry_items") else None


@pytest.mark.parametrize("qtd", [1_000_001, 10**12])
async def test_item_em_entrada_existente_recusa_quantidade_acima_do_teto(test_client: AsyncClient, auth_token: str, qtd):
    pid, entry_id, _ = await _entrada_com_produto(test_client, auth_token)
    r = await test_client.post(f"/api/v1/stock-entries/{entry_id}/items", headers=_h(auth_token),
                               json={"product_id": pid, "quantity_received": qtd, "unit_cost": 10})
    assert r.status_code == 422, r.text


async def test_nova_entrada_recusa_quantidade_acima_do_teto(test_client: AsyncClient, auth_token: str):
    pid, _, _ = await _entrada_com_produto(test_client, auth_token)
    r = await test_client.post("/api/v1/stock-entries/", headers=_h(auth_token), json={
        "entry_code": f"QTD-{uuid.uuid4().hex[:6]}", "entry_date": str(datetime.date.today()), "entry_type": "local",
        "items": [{"product_id": pid, "quantity_received": 10**12, "unit_cost": 10}]})
    assert r.status_code == 422, r.text
    assert r.status_code != 201


async def test_quantidade_no_teto_continua_valendo(test_client: AsyncClient, auth_token: str):
    pid, entry_id, _ = await _entrada_com_produto(test_client, auth_token)
    r = await test_client.post(f"/api/v1/stock-entries/{entry_id}/items", headers=_h(auth_token),
                               json={"product_id": pid, "quantity_received": 1_000_000, "unit_cost": 1})
    assert r.status_code == 200, r.text


async def test_somar_na_linha_recusa_quantidade_acima_do_teto(test_client: AsyncClient, auth_token: str):
    pid, entry_id, _ = await _entrada_com_produto(test_client, auth_token)
    e = (await test_client.get(f"/api/v1/stock-entries/{entry_id}", headers=_h(auth_token))).json()
    item_id = e["entry_items"][0]["id"]
    r = await test_client.put(f"/api/v1/stock-entries/entry-items/{item_id}", headers=_h(auth_token), json={"quantity_received": 1_000_001})
    assert r.status_code == 422, r.text
