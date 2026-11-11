"""Brinde dado DENTRO da venda (admin ou gerente). A venda e o brinde saem juntos ou não saem; o brinde vai a R$ 0,00 no
comprovante e o custo (FIFO) vira a linha "Brindes" do Resultado do Mês, sem entrar no custo das vendidas."""
import pytest
from sqlalchemy import select

from tests.test_brinde import _auditoria, _resultado
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_short_codes import _user
from tests.test_troca import _cenario, _estoque

pytestmark = pytest.mark.asyncio
API = "/api/v1"


def _corpo(p, va, vb, qtd_brinde=1, **extra):
    c = {"payment_method": "cash", "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 1, "unit_price": "100.00"}],
         "payments": [{"amount": "100.00", "payment_method": "cash"}],
         "gifts": [{"variant_id": vb.id, "quantity": qtd_brinde}]}
    c.update(extra)
    return c


async def _gifts(db, sale_id):
    from app.models.gift import Gift
    db.expire_all()
    return (await db.execute(select(Gift).where(Gift.related_sale_id == sale_id))).scalars().all()


async def test_venda_com_brinde_baixa_as_duas_pecas_e_o_custo_vira_brindes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    uid = test_user.id
    r = await test_client.post(f"{API}/sales/", headers=h, json=_corpo(p, va, vb))
    assert r.status_code == 201, r.text
    s = r.json()
    assert float(s["total_amount"]) == 100.0 and len(s["items"]) == 1            # o brinde NÃO é item cobrado
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 9 and await _estoque(async_session, vb.id) == 9
    (g,) = await _gifts(async_session, s["id"])
    assert g.status == "given" and g.reason_type == "with_sale" and float(g.total_cost) == 40.0
    res = await _resultado(test_client, h)
    assert float(res["revenue"]) == 100.0 and float(res["cmv"]) == 40.0           # custo só da peça vendida
    assert float(res["gifts_total"]) == 40.0 and res["gifts_count"] == 1
    assert float(res["net_profit"]) == 100 - 40 - 40
    (reg,) = await _auditoria(async_session, t_id, "GIFT_CREATED")
    assert reg[1]["venda_id"] == s["id"] and reg[1]["custo"] == 40.0 and reg[0].user_id == uid


async def test_comprovante_mostra_o_brinde_a_zero_e_nunca_o_custo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = (await test_client.post(f"{API}/sales/", headers=h, json=_corpo(p, va, vb))).json()["id"]
    info = (await test_client.get(f"{API}/sales/{sid}/receipt", headers=h)).json()
    t = info["text"]
    nome = info["receipt"]["items"][0]["name"]
    assert f"1x {nome} (Azul / M) - R$ 0,00 (brinde)" in t, t
    assert "*Total: R$ 100,00*" in t and "40,00" not in t
    assert info["receipt"]["gifts"] == [{"name": nome, "variant": "Azul / M", "quantity": 1}]
    assert info["receipt"]["pieces"] == 1
    r = await test_client.get(f"{API}/sales/{sid}/receipt/pdf", headers=h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    # venda sem brinde: comprovante igual ao de sempre
    sid2 = (await test_client.post(f"{API}/sales/", headers=h, json=_corpo(p, va, vb, gifts=[]))).json()["id"]
    t2 = (await test_client.get(f"{API}/sales/{sid2}/receipt", headers=h)).json()
    assert t2["receipt"]["gifts"] == [] and "(brinde)" not in t2["text"]


async def test_brinde_sem_estoque_recusa_tudo_e_a_venda_nao_sai(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, stock_b=0)
    r = await test_client.post(f"{API}/sales/", headers=h, json=_corpo(p, va, vb))
    assert r.status_code == 400 and "Sem estoque" in r.text, r.text
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 10                              # a peça vendida não saiu
    from app.models.sale import Sale
    assert (await async_session.execute(select(Sale).where(Sale.tenant_id == t_id))).scalars().all() == []
    res = await _resultado(test_client, h)
    assert res["gifts_count"] == 0 and res["sales_count"] == 0


async def test_brinde_maior_que_o_estoque_da_mesma_peca_vendida(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    # vende 8 e dá 3 da mesma variação (tem 10): não cabe, nada é gravado
    c = _corpo(p, va, va, qtd_brinde=3)
    c["items"][0]["quantity"] = 8
    c["payments"][0]["amount"] = "800.00"
    r = await test_client.post(f"{API}/sales/", headers=h, json=c)
    assert r.status_code == 400 and "Sem estoque" in r.text, r.text
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 10
    # vende 8 e dá 2: cabe (10)
    c["gifts"][0]["quantity"] = 2
    assert (await test_client.post(f"{API}/sales/", headers=h, json=c)).status_code == 201
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 0


async def test_gerente_pode_vendedor_e_caixa_nao(test_client, async_session, test_user):
    from app.models.user import UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    for papel in (UserRole.SELLER, UserRole.CASHIER):
        hh = await _user(async_session, t_id, papel)
        r = await test_client.post(f"{API}/sales/", headers=hh, json=_corpo(p, va, vb))
        assert r.status_code == 403 and "administrador ou gerente" in r.text, papel
        # venda comum do mesmo papel continua funcionando
        assert (await test_client.post(f"{API}/sales/", headers=hh, json=_corpo(p, va, vb, gifts=[]))).status_code == 201, papel
    async_session.expire_all()
    assert await _estoque(async_session, vb.id) == 10                              # nenhum brinde saiu
    hg = await _user(async_session, t_id, UserRole.MANAGER)
    r = await test_client.post(f"{API}/sales/", headers=hg, json=_corpo(p, va, vb))
    assert r.status_code == 201, r.text
    async_session.expire_all()
    assert await _estoque(async_session, vb.id) == 9


async def test_repetir_o_pedido_com_a_mesma_chave_nao_da_dois_brindes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    hk = {**h, "Idempotency-Key": "brinde-venda-1"}
    r1 = await test_client.post(f"{API}/sales/", headers=hk, json=_corpo(p, va, vb))
    r2 = await test_client.post(f"{API}/sales/", headers=hk, json=_corpo(p, va, vb))
    assert r1.status_code == 201 and r2.status_code in (200, 201) and r1.json()["id"] == r2.json()["id"]
    async_session.expire_all()
    assert await _estoque(async_session, vb.id) == 9 and len(await _gifts(async_session, r1.json()["id"])) == 1
    # mesma chave com brinde diferente = pedido diferente (409), nada baixa
    r3 = await test_client.post(f"{API}/sales/", headers=hk, json=_corpo(p, va, vb, qtd_brinde=2))
    assert r3.status_code == 409, r3.text
    async_session.expire_all()
    assert await _estoque(async_session, vb.id) == 9


async def test_cliente_da_venda_fica_no_brinde_e_sem_cliente_tem_nome(test_client, async_session, test_user):
    from app.models.customer import Customer
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cli = Customer(full_name="Cliente Fiel", phone="34999990000", tenant_id=t_id, loyalty_points=0, total_spent=0)
    async_session.add(cli)
    await async_session.commit()
    cid = cli.id
    s1 = (await test_client.post(f"{API}/sales/", headers=h, json=_corpo(p, va, vb, customer_id=cid))).json()
    s2 = (await test_client.post(f"{API}/sales/", headers=h, json=_corpo(p, va, vb))).json()
    (g1,) = await _gifts(async_session, s1["id"])
    c1 = g1.customer_id
    (g2,) = await _gifts(async_session, s2["id"])
    c2, nome2 = g2.customer_id, g2.recipient_name
    assert c1 == cid and c2 is None and nome2.startswith("Cliente da venda VENDA-")
    lista = (await test_client.get(f"{API}/gifts/", headers=h)).json()
    assert lista["total_count"] == 2 and lista["page_cost"] == 80.0
