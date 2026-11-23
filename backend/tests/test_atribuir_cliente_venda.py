"""Atribuir cliente depois a uma venda que ficou sem cliente (PATCH /sales/{id}/customer)."""
import pytest

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _vender

pytestmark = pytest.mark.asyncio


async def _cliente(client, h, nome="Cliente Depois"):
    r = await client.post("/api/v1/customers/", headers=h, json={"full_name": nome, "phone": "34988880001"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _cli(client, h, cid):
    r = await client.get(f"/api/v1/customers/{cid}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def test_atribui_cliente_soma_total_e_nao_gera_pontos(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid, _ = await _vender(test_client, h, p, va, 2, "100.00")
    cid = await _cliente(test_client, h)
    antes = await _cli(test_client, h, cid)

    r = await test_client.patch(f"/api/v1/sales/{sid}/customer", headers=h, json={"customer_id": cid})
    assert r.status_code == 200, r.text
    assert r.json()["customer_id"] == cid

    v = (await test_client.get(f"/api/v1/sales/{sid}", headers=h)).json()
    assert v["customer_id"] == cid and v["customer_name"] == "Cliente Depois"
    dep = await _cli(test_client, h, cid)
    assert float(dep["total_spent"]) - float(antes["total_spent"]) == pytest.approx(200.0)
    assert dep["total_purchases"] == antes["total_purchases"] + 1
    assert float(dep.get("loyalty_points", 0) or 0) == float(antes.get("loyalty_points", 0) or 0)   # sem pontos retroativos

    # cancelar depois estorna o total do cliente (volta ao que era)
    c = await test_client.post(f"/api/v1/sales/{sid}/cancel?reason=teste", headers=h)
    assert c.status_code == 200, c.text
    fim = await _cli(test_client, h, cid)
    assert float(fim["total_spent"]) == pytest.approx(float(antes["total_spent"]))
    assert fim["total_purchases"] == antes["total_purchases"]


async def test_recusa_venda_que_ja_tem_cliente_cancelada_ou_cliente_inexistente(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h, "Primeira")
    outra = await _cliente(test_client, h, "Segunda")

    sid, _ = await _vender(test_client, h, p, va, 1, "100.00")
    assert (await test_client.patch(f"/api/v1/sales/{sid}/customer", headers=h, json={"customer_id": 999999})).status_code == 404
    assert (await test_client.patch(f"/api/v1/sales/{sid}/customer", headers=h, json={"customer_id": cid})).status_code == 200
    r = await test_client.patch(f"/api/v1/sales/{sid}/customer", headers=h, json={"customer_id": outra})
    assert r.status_code == 400 and "já tem cliente" in r.json()["detail"]          # não troca cliente

    sid2, _ = await _vender(test_client, h, p, va, 1, "100.00")
    assert (await test_client.post(f"/api/v1/sales/{sid2}/cancel?reason=teste", headers=h)).status_code == 200
    r = await test_client.patch(f"/api/v1/sales/{sid2}/customer", headers=h, json={"customer_id": cid})
    assert r.status_code == 400 and "concluída" in r.json()["detail"]
    assert (await test_client.patch("/api/v1/sales/9999999/customer", headers=h, json={"customer_id": cid})).status_code == 404
