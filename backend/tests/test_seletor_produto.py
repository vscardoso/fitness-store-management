"""Seletor único de produto: a lista agrupada acha o produto por nome, marca, SKU e pelo código da etiqueta."""
import uuid

import pytest
from httpx import AsyncClient

from app.api.v1.endpoints.products_grouped import parse_label_code
from tests.conftest import async_session, auth_token, test_client  # noqa: F401

pytestmark = pytest.mark.asyncio


def test_le_o_codigo_da_etiqueta_em_todos_os_formatos():
    assert parse_label_code("#123") == (123, None)
    assert parse_label_code("123") == (123, None)
    assert parse_label_code("#123-1") == (123, 1)
    assert parse_label_code("PV#123-12") == (123, 12)
    assert parse_label_code("pv#0123") == (123, None)
    assert parse_label_code(" # 12 - 3 ") == (12, 3)
    for nao in ("legging", "12a", "", "#", "1-2-3", "PV#"):
        assert parse_label_code(nao) is None


async def _produto(client, token):
    marca = f"Zqmarca{uuid.uuid4().hex[:6]}"
    nome = f"Legging Zq{uuid.uuid4().hex[:8]}"
    sku = f"ZQ{uuid.uuid4().hex[:6].upper()}"
    r = await client.post("/api/v1/product-variants/with-product", headers={"Authorization": f"Bearer {token}"}, json={
        "name": nome, "brand": marca, "category_id": 1, "base_price": 99.9,
        "variants": [{"sku": f"{sku}-P", "color": "Preto", "size": "P", "price": 99.9, "cost_price": 40},
                     {"sku": f"{sku}-M", "color": "Preto", "size": "M", "price": 99.9, "cost_price": 40}]})
    assert r.status_code == 201, r.text
    return r.json()["id"], nome, marca, sku


async def _busca(client, token, termo):
    r = await client.get("/api/v1/products/grouped", headers={"Authorization": f"Bearer {token}"}, params={"search": termo, "limit": 500})
    assert r.status_code == 200, r.text
    return r.json()


async def test_acha_por_nome_marca_sku_e_codigo(test_client: AsyncClient, auth_token: str):
    pid, nome, marca, sku = await _produto(test_client, auth_token)
    outro_pid, *_ = await _produto(test_client, auth_token)
    ids = lambda lst: {g["id"] for g in lst}
    assert pid in ids(await _busca(test_client, auth_token, nome))
    assert pid in ids(await _busca(test_client, auth_token, marca))
    assert pid in ids(await _busca(test_client, auth_token, f"{sku}-M".lower()))     # SKU sem diferenciar caixa
    produto = next(g for g in await _busca(test_client, auth_token, nome) if g["id"] == pid)
    codigos = sorted(v["display_code"] for v in produto["variants"])
    numero = codigos[0].split("-")[0].lstrip("#")
    for termo in (f"#{numero}", numero, f"PV#{numero}-1", f"#{int(numero)}-2"):
        achados = await _busca(test_client, auth_token, termo)
        assert pid in ids(achados), termo
        assert outro_pid not in ids(achados) or termo == numero, termo   # "123" também pode bater em nome/SKU
    # variação que não existe não acha o produto pelo código
    assert pid not in ids(await _busca(test_client, auth_token, f"#{numero}-99"))
