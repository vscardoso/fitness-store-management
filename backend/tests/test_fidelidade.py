"""Programa de fidelidade configurável por loja: pontos por reais gastos, validade, cashback no PDV (pontos viram desconto),
devolução e cancelamento, permissões e isolamento entre lojas."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select, update

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _config

pytestmark = pytest.mark.asyncio
API = "/api/v1"


@pytest.fixture(autouse=True)
async def _programa_volta_ao_padrao(async_session):
    """A loja 1 é reaproveitada: no fim, volta à regra de hoje (ligado, 1 ponto a cada R$ 10, sem validade, ponto = R$ 0,10)."""
    yield
    await async_session.rollback()
    from app.models.customer import Customer
    from app.models.loyalty import LoyaltyEntry
    from app.models.store import Store
    await async_session.execute(update(Store).where(Store.id == 1).values(
        loyalty_enabled=True, loyalty_spend_per_point=10, loyalty_point_value=Decimal("0.10"), loyalty_min_redeem=0,
        loyalty_expiry_days=None))
    await async_session.commit()


async def _config_fid(client, h, **campos):
    corpo = {"enabled": True, "spend_per_point": 10, "point_value": 0.10, "min_redeem": 0, "expiry_days": None}
    corpo.update(campos)
    r = await client.put(f"{API}/store/loyalty-settings", headers=h, json=corpo)
    assert r.status_code == 200, r.text
    return r.json()


async def _cliente(db, t_id, nome="Maria Fidelidade"):
    from app.models.customer import Customer
    from types import SimpleNamespace
    c = Customer(full_name=nome, phone="34999990001", tenant_id=t_id)
    db.add(c)
    await db.commit()
    return SimpleNamespace(id=c.id)      # só o id: o objeto expira a cada commit do servidor


async def _venda(client, h, p, v, qtd, cliente_id=None, pagamentos=None, preco="100.00"):
    total = float(preco) * qtd
    body = {"payment_method": "cash", "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": preco}],
            "payments": pagamentos or [{"amount": str(total), "payment_method": "cash"}]}
    if cliente_id:
        body["customer_id"] = cliente_id
    return await client.post(f"{API}/sales/", headers=h, json=body)


async def _saldo(client, h, cid):
    return (await client.get(f"{API}/customers/{cid}/loyalty", headers=h)).json()


async def test_configuracao_so_admin_muda_e_a_regra_vale_por_loja(test_client, async_session, test_user):
    from app.models.user import UserRole
    from tests.test_short_codes import _user
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cfg = await _config_fid(test_client, h, spend_per_point=20, point_value=0.25, min_redeem=10, expiry_days=90)
    assert cfg == {"enabled": True, "spend_per_point": 20.0, "point_value": 0.25, "min_redeem": 10.0, "expiry_days": 90}
    assert (await test_client.get(f"{API}/store/loyalty-settings", headers=h)).json() == cfg

    caixa = await _user(async_session, t_id, UserRole.CASHIER)
    gerente = await _user(async_session, t_id, UserRole.MANAGER)
    assert (await test_client.get(f"{API}/store/loyalty-settings", headers=caixa)).status_code == 200      # o PDV lê
    for h2 in (caixa, gerente):
        r = await test_client.put(f"{API}/store/loyalty-settings", headers=h2, json=cfg)
        assert r.status_code == 403
    # valores absurdos são recusados
    for ruim in ({"spend_per_point": 0}, {"point_value": -1}, {"expiry_days": 0}):
        r = await test_client.put(f"{API}/store/loyalty-settings", headers=h, json={**cfg, **ruim})
        assert r.status_code == 422, ruim


async def test_ganho_segue_a_regra_da_loja_e_programa_desligado_nao_pontua(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _cliente(async_session, t_id)

    await _config_fid(test_client, h, spend_per_point=20)               # 1 ponto a cada R$ 20
    r = await _venda(test_client, h, p, va, 3, c.id)                    # R$ 300 = 15 pontos
    assert r.status_code in (200, 201), r.text
    assert float(r.json()["loyalty_points_earned"]) == 15.0
    s = await _saldo(test_client, h, c.id)
    assert s["balance"] == 15.0 and s["value"] == 1.5 and s["entries"][0]["kind"] == "earn"

    await _config_fid(test_client, h, enabled=False)                    # loja sem programa: não ganha nada
    r = await _venda(test_client, h, p, va, 2, c.id)
    assert float(r.json()["loyalty_points_earned"]) == 0.0
    assert (await _saldo(test_client, h, c.id))["balance"] == 15.0
    # venda sem cliente nunca pontua
    await _config_fid(test_client, h)
    r = await _venda(test_client, h, p, va, 1)
    assert r.status_code in (200, 201) and float(r.json()["loyalty_points_earned"]) == 0.0


async def test_pontos_vencem_e_o_resgate_gasta_primeiro_o_que_vence_antes(test_client, async_session, test_user):
    from app.models.loyalty import LoyaltyEntry
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _cliente(async_session, t_id)
    await _config_fid(test_client, h, expiry_days=30)
    await _venda(test_client, h, p, va, 3, c.id)                         # 30 pontos, vencem em 30 dias
    e1 = (await async_session.execute(select(LoyaltyEntry).where(LoyaltyEntry.customer_id == c.id, LoyaltyEntry.kind == "earn"))).scalar_one()
    assert e1.expires_at is not None and 29 <= (e1.expires_at.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)).days <= 30

    await _config_fid(test_client, h, expiry_days=None)                  # a próxima compra não vence
    await _venda(test_client, h, p, va, 2, c.id)                         # +20 pontos sem validade
    s = await _saldo(test_client, h, c.id)
    assert s["balance"] == 50.0 and s["expiring_soon"] == 30.0 and s["next_expiry"]

    # usa R$ 4,00 (40 pontos): gasta os 30 que vencem antes e 10 dos sem validade
    r = await _venda(test_client, h, p, va, 1, c.id, pagamentos=[
        {"amount": "4.00", "payment_method": "loyalty_points"}, {"amount": "96.00", "payment_method": "cash"}])
    assert r.status_code in (200, 201), r.text
    assert float(r.json()["loyalty_points_used"]) == 40.0
    s = await _saldo(test_client, h, c.id)
    # 50 - 40 = 10 + 9,6 ganhos nos R$ 96 pagos em dinheiro (a parte paga com pontos não pontua)
    assert s["balance"] == 19.6 and s["expiring_soon"] == 0.0

    # vence o que sobrou da 1ª compra: simula passando o prazo
    await _venda(test_client, h, p, va, 1, c.id)                         # +10 sem validade
    async_session.expire_all()
    antigo = (await async_session.execute(select(LoyaltyEntry).where(LoyaltyEntry.customer_id == c.id, LoyaltyEntry.kind == "earn").order_by(LoyaltyEntry.id).limit(1))).scalar_one()
    antigo.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    antigo.remaining = Decimal("5")
    await async_session.commit()
    s = await _saldo(test_client, h, c.id)
    assert any(x["kind"] == "expire" and x["points"] == -5.0 for x in s["entries"])


async def test_resgate_no_pdv_cashback_com_as_recusas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _cliente(async_session, t_id)
    await _config_fid(test_client, h, min_redeem=20, point_value=0.10)
    await _venda(test_client, h, p, va, 5, c.id)                          # R$ 500 = 50 pontos = R$ 5,00 de cashback

    def paga_com_pontos(valor, cliente=c.id):
        return _venda(test_client, h, p, va, 1, cliente, pagamentos=[
            {"amount": str(valor), "payment_method": "loyalty_points"}, {"amount": str(100 - valor), "payment_method": "cash"}])

    # mínimo de 20 pontos (R$ 2,00): R$ 1,00 = 10 pontos é recusado
    r = await paga_com_pontos(1)
    assert r.status_code == 400 and "20 pontos" in r.json()["detail"]
    # mais do que o saldo (R$ 6,00 = 60 pontos, saldo 50)
    r = await paga_com_pontos(6)
    assert r.status_code == 400 and "tem 50 pontos" in r.json()["detail"]
    # sem cliente não dá para pagar com pontos
    r = await paga_com_pontos(3, cliente=None)
    assert r.status_code == 400 and "escolha a cliente" in r.json()["detail"]
    assert (await _saldo(test_client, h, c.id))["balance"] == 50.0          # nada foi gasto nas recusas

    # R$ 3,00 = 30 pontos: dá certo, a venda sai e o saldo desce
    r = await paga_com_pontos(3)
    assert r.status_code in (200, 201), r.text
    assert float(r.json()["loyalty_points_used"]) == 30.0
    s = await _saldo(test_client, h, c.id)
    assert s["balance"] == 29.7                                              # 50 - 30 + 9,7 (R$ 97 pagos em dinheiro)

    # programa desligado: não aceita pontos
    await _config_fid(test_client, h, enabled=False)
    r = await paga_com_pontos(3)
    assert r.status_code == 400 and "não tem programa" in r.json()["detail"]


async def test_cancelar_devolve_os_pontos_usados_e_tira_os_ganhos(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _cliente(async_session, t_id)
    await _venda(test_client, h, p, va, 5, c.id)                              # 50 pontos
    r = await _venda(test_client, h, p, va, 1, c.id, pagamentos=[
        {"amount": "5.00", "payment_method": "loyalty_points"}, {"amount": "95.00", "payment_method": "cash"}])
    sale_id = r.json()["id"]
    assert (await _saldo(test_client, h, c.id))["balance"] == 9.5               # 50 - 50 + 9,5
    r = await test_client.post(f"{API}/sales/{sale_id}/cancel?reason=teste", headers=h)
    assert r.status_code == 200, r.text
    assert (await _saldo(test_client, h, c.id))["balance"] == 50.0              # voltou ao que tinha antes da venda


async def test_devolucao_parcial_proporcional(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    c = await _cliente(async_session, t_id)
    await _venda(test_client, h, p, va, 5, c.id)                              # R$ 500 = 50 pontos
    r = await _venda(test_client, h, p, va, 2, c.id, pagamentos=[
        {"amount": "5.00", "payment_method": "loyalty_points"}, {"amount": "195.00", "payment_method": "cash"}])
    assert r.status_code in (200, 201), r.text
    sale_id = r.json()["id"]
    item_id = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()["items"][0]["id"]
    # saldo: 50 - 50 usados (R$ 5,00) + 19,5 ganhos nos R$ 195 pagos em dinheiro
    assert (await _saldo(test_client, h, c.id))["balance"] == 19.5
    # devolve 1 das 2 peças (metade do total): tira metade dos 19,5 ganhos e devolve metade dos 50 usados
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={"reason": "não serviu", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    assert (await _saldo(test_client, h, c.id))["balance"] == 19.5 - 9.75 + 25.0


async def test_isolamento_entre_lojas_e_ajuste_manual_so_admin(test_client, async_session, test_user):
    from app.models.user import UserRole
    from tests.test_short_codes import _user
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _cliente(async_session, t_id)
    r = await test_client.post(f"{API}/customers/{c.id}/loyalty/adjust", headers=h, json={"points": 25, "note": "Brinde de aniversário"})
    assert r.status_code == 200 and r.json()["balance"] == 25.0
    r = await test_client.post(f"{API}/customers/{c.id}/loyalty/adjust", headers=h, json={"points": -10, "note": "Correção"})
    assert r.json()["balance"] == 15.0
    r = await test_client.post(f"{API}/customers/{c.id}/loyalty/adjust", headers=h, json={"points": -100, "note": "Correção"})
    assert r.json()["balance"] == 0.0                                          # nunca fica negativo
    vend = await _user(async_session, t_id, UserRole.SELLER)
    assert (await test_client.post(f"{API}/customers/{c.id}/loyalty/adjust", headers=vend, json={"points": 5, "note": "x y z"})).status_code == 403
    assert (await test_client.get(f"{API}/customers/99999999/loyalty", headers=h)).status_code == 404


async def test_comprovante_mostra_saldo_de_pontos_e_pagamento_com_pontos(test_client, async_session, test_user):
    """O comprovante diz quantos pontos a cliente tem agora e quanto vale; programa desligado não mostra nada."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c = await _cliente(async_session, t_id)
    await _config_fid(test_client, h, expiry_days=20)
    await _venda(test_client, h, p, va, 5, c.id)                          # 50 pontos, vencem em 20 dias (menos de 30: o comprovante avisa)
    r = await _venda(test_client, h, p, va, 1, c.id, pagamentos=[
        {"amount": "2.00", "payment_method": "loyalty_points"}, {"amount": "98.00", "payment_method": "cash"}])
    assert r.status_code in (200, 201), r.text
    sale_id = r.json()["id"]
    d = (await test_client.get(f"{API}/sales/{sale_id}/receipt", headers=h)).json()
    assert d["receipt"]["loyalty"]["balance"] == 39.8                         # 50 - 20 usados + 9,8 ganhos
    assert "Seu saldo de pontos: 40 (vale R$ 3,98 de desconto)" in d["text"]
    assert "Pontos de fidelidade: R$ 2,00" in d["text"]                       # a parte paga com pontos aparece nos pagamentos
    assert "vencem em" in d["text"]
    from tests.test_comprovante_venda import _texto_pdf
    pdf = _texto_pdf((await test_client.get(f"{API}/sales/{sale_id}/receipt/pdf", headers=h)).content)
    assert "Saldo de pontos: 40" in pdf and "Pontos de fidelidade" in pdf
    await _config_fid(test_client, h, enabled=False)
    d = (await test_client.get(f"{API}/sales/{sale_id}/receipt", headers=h)).json()
    assert d["receipt"]["loyalty"] is None and "saldo de pontos" not in d["text"].lower()
