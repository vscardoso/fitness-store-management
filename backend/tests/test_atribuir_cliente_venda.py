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


async def test_atribui_cliente_soma_total_e_gera_pontos(test_client, async_session, test_user):
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
    assert r.json()["points_earned"] == pytest.approx(20.0)                           # 1 ponto a cada R$ 10
    assert float(dep["loyalty_points"]) - float(antes["loyalty_points"]) == pytest.approx(20.0)

    # cancelar depois estorna o total do cliente (volta ao que era)
    c = await test_client.post(f"/api/v1/sales/{sid}/cancel?reason=teste", headers=h)
    assert c.status_code == 200, c.text
    fim = await _cli(test_client, h, cid)
    assert float(fim["total_spent"]) == pytest.approx(float(antes["total_spent"]))
    assert fim["total_purchases"] == antes["total_purchases"]
    assert float(fim["loyalty_points"]) == pytest.approx(float(antes["loyalty_points"]))   # pontos estornados


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


async def test_fiado_sem_cliente_e_recusado_na_criacao(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "on_account",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 1, "unit_price": "100.00"}],
        "payments": [{"amount": "100.00", "payment_method": "on_account"}]})
    assert r.status_code == 400, r.text
    assert "fiado" in r.text.lower() and "cliente" in r.text.lower()


async def _venda_com(test_client, h, p, v, cid=None, qtd=1):
    body = {"payment_method": "cash",
            "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": "100.00"}],
            "payments": [{"amount": str(100 * qtd), "payment_method": "cash"}]}
    if cid:
        body["customer_id"] = cid
    r = await test_client.post("/api/v1/sales/", headers=h, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"], r.json()["sale_number"]


async def test_busca_do_historico_por_numero_parcial_cliente_vendedor_e_peca(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(test_client, h, "Marinalva Souza")
    s1, n1 = await _venda_com(test_client, h, p, va, cid)
    s2, n2 = await _venda_com(test_client, h, p, va)

    async def ids(q):
        r = await test_client.get("/api/v1/sales/", headers=h, params={"q": q})
        assert r.status_code == 200, r.text
        return {x["id"] for x in r.json()}

    assert s1 in await ids(n1[-6:])                       # pedaço do número
    assert s1 in await ids(n1.lower())                    # sem diferenciar caixa
    assert await ids("marinalva") == {s1}                 # nome da cliente (pedaço, sem caixa)
    assert await ids("souza marin") == {s1}               # várias palavras, em qualquer ordem
    assert {s1, s2} <= await ids("legging")               # nome da peça
    assert await ids("zzzxxx") == set()                   # nada
    assert await ids("%") == set() and await ids("_") == set()   # nunca vira curinga


async def test_busca_ignora_acento_e_maiuscula(test_client, async_session, test_user):
    """Caso real (loja 2, 25/11/2026): buscar "Tenis" não achava venda de "Tênis" cujo código não tinha TENIS; faltava 1 venda."""
    from sqlalchemy import select
    from app.models.product import Product
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    prod = (await async_session.execute(select(Product).where(Product.id == p.id))).scalar_one()
    prod.name = "Tênis Corrida Açaí"
    await async_session.commit()
    cid = await _cliente(test_client, h, "José Conceição")
    s1, _ = await _venda_com(test_client, h, p, va, cid)

    async def ids(q):
        r = await test_client.get("/api/v1/sales/", headers=h, params={"q": q})
        assert r.status_code == 200, r.text
        return {s["id"] for s in r.json()}

    for q in ("Tenis", "TENIS", "tênis", "Tênis", "acai", "AÇAÍ", "jose", "José", "conceicao", "Conceição", "tenis acai"):
        assert s1 in await ids(q), q
    assert s1 not in await ids("sapato")
    assert s1 not in await ids("%")      # o texto digitado continua sem virar curinga
