"""Auditoria independente de VENDAS E PAGAMENTOS.

Cada teste calcula o esperado por conta propria (um "livro" simples) e compara com a API.
Cenario base (`_cenario`): produto a R$ 100,00, custo FIFO R$ 40,00, 10 pecas da variacao A e 10 da B.
"""
import itertools
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.services.money_ledger import period_totals
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _estoque

pytestmark = pytest.mark.asyncio
D = Decimal
API = "/api/v1"
_n = itertools.count(1)


def _item(p, v, qtd=1, preco="100.00", desc=None):
    i = {"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": str(preco)}
    if desc is not None:
        i["discount_amount"] = str(desc)
    return i


async def _post(client, h, items, payments, **extra):
    body = {"payment_method": payments[0]["payment_method"] if payments else "cash", "items": items, "payments": payments}
    body.update(extra)
    return await client.post(f"{API}/sales/", headers=h, json=body)


async def _cliente(db, t_id, nome="Cliente Auditoria"):
    from app.models.customer import Customer
    c = Customer(full_name=f"{nome} {next(_n)}", email=f"aud{next(_n)}@example.com", phone="34999990000", tenant_id=t_id)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c.id


async def _ledger(db, t_id):
    hoje = date.today()
    t = await period_totals(db, t_id, hoje - timedelta(days=1), hoje + timedelta(days=1))
    return t


def _delta(depois, antes):
    return (depois.revenue - antes.revenue, depois.cost - antes.cost, depois.profit - antes.profit)


# ───────────────────────── criar / ler / listar ─────────────────────────

async def test_venda_em_dinheiro_total_estoque_livro_e_leitura(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    antes, ea = await _ledger(async_session, t_id), await _estoque(async_session, va.id)
    r = await _post(test_client, h, [_item(p, va, 3)], [{"amount": "300.00", "payment_method": "cash"}])
    assert r.status_code == 201, r.text
    s = r.json()
    assert D(str(s["total_amount"])) == 300 and D(str(s["subtotal"])) == 300 and s["status"] == "completed"
    assert len(s["payments"]) == 1 and s["payments"][0]["status"] == "confirmed"
    assert float(s["total_cost"]) == 120.0 and float(s["total_profit"]) == 180.0
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == ea - 3
    rev, cost, profit = _delta(await _ledger(async_session, t_id), antes)
    assert (rev, cost, profit) == (300, 120, 180)
    # ler
    g = await test_client.get(f"{API}/sales/{s['id']}", headers=h)
    assert g.status_code == 200 and g.json()["sale_number"] == s["sale_number"]
    # listar (todos os jeitos)
    ids = lambda rr: [x["id"] for x in rr.json()]  # noqa: E731
    assert s["id"] in ids(await test_client.get(f"{API}/sales/", headers=h))
    hoje = date.today().isoformat()
    assert s["id"] in ids(await test_client.get(f"{API}/sales/", headers=h, params={"start_date": hoje, "end_date": hoje}))
    amanha = (date.today() + timedelta(days=3)).isoformat()
    assert s["id"] not in ids(await test_client.get(f"{API}/sales/", headers=h, params={"start_date": amanha, "end_date": amanha}))
    assert ids(await test_client.get(f"{API}/sales/", headers=h, params={"sale_number": s["sale_number"]})) == [s["id"]]
    assert ids(await test_client.get(f"{API}/sales/", headers=h, params={"sale_number": "VENDA-NAOEXISTE"})) == []


async def test_desconto_no_item_e_na_venda_e_imposto(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    antes = await _ledger(async_session, t_id)
    # 2 x 100 - 10 (item) = 190; - 20 (venda) = 170; + 5 imposto = 175
    r = await _post(test_client, h, [_item(p, va, 2, desc="10.00")], [{"amount": "175.00", "payment_method": "pix"}],
                    discount_amount="20.00", tax_amount="5.00")
    assert r.status_code == 201, r.text
    s = r.json()
    assert D(str(s["total_amount"])) == 175 and D(str(s["discount_amount"])) == 20 and D(str(s["tax_amount"])) == 5
    rev, cost, profit = _delta(await _ledger(async_session, t_id), antes)
    # receita do livro = o que a cliente pagou (175); o imposto nao e receita de mercadoria?  Regra do app: total_amount.
    assert rev == 175 and cost == 80


async def test_arredondamento_em_centavos(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    # 3 x 33.333 = 99.999 -> 100.00
    r = await _post(test_client, h, [_item(p, va, 3, preco="33.333")], [{"amount": "100.00", "payment_method": "cash"}])
    assert r.status_code == 201, r.text
    assert D(str(r.json()["total_amount"])) == D("100.00")


# ───────────────────────── formas de pagamento ─────────────────────────

@pytest.mark.parametrize("forma", ["pix", "debit_card", "credit_card", "bank_transfer", "cash"])
async def test_cada_forma_de_pagamento_grava_o_pagamento(test_client, async_session, test_user, forma):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100.00", "payment_method": forma}])
    assert r.status_code == 201, (forma, r.text)
    pg = r.json()["payments"]
    assert len(pg) == 1 and pg[0]["payment_method"] == forma and D(str(pg[0]["amount"])) == 100


async def test_credito_parcelado_guarda_parcelas_e_recusa_fora_de_1_a_12(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100.00", "payment_method": "credit_card", "installments": 6}])
    assert r.status_code == 201 and r.json()["payments"][0]["installments"] == 6
    for ruim in (0, 13, -1):
        r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100.00", "payment_method": "credit_card", "installments": ruim}])
        assert r.status_code == 422, (ruim, r.status_code)


async def test_pagamento_misto_soma_e_cada_parte_fica_gravada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    antes = await _ledger(async_session, t_id)
    r = await _post(test_client, h, [_item(p, va, 2)], [
        {"amount": "50.00", "payment_method": "cash"}, {"amount": "70.00", "payment_method": "pix"},
        {"amount": "80.00", "payment_method": "credit_card", "installments": 2}])
    assert r.status_code == 201, r.text
    got = sorted((x["payment_method"], D(str(x["amount"]))) for x in r.json()["payments"])
    assert got == [("cash", 50), ("credit_card", 80), ("pix", 70)]
    assert _delta(await _ledger(async_session, t_id), antes)[0] == 200


async def test_troco_so_em_dinheiro_e_pagamento_gravado_e_o_que_ficou(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "150.00", "payment_method": "cash"}])
    assert r.status_code == 201, r.text
    assert sum(D(str(x["amount"])) for x in r.json()["payments"]) == 100        # troco nao fica gravado
    # cartao/PIX acima do total: recusa
    for forma in ("pix", "credit_card", "debit_card"):
        r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "150.00", "payment_method": forma}])
        assert r.status_code == 400 and "Troco" in r.text, (forma, r.text)
    # misto: PIX 100 + dinheiro 20 num total de 100 -> troco 20 sai do dinheiro
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100.00", "payment_method": "pix"}, {"amount": "20.00", "payment_method": "cash"}])
    assert r.status_code == 201, r.text
    assert sum(D(str(x["amount"])) for x in r.json()["payments"]) == 100


async def test_pagamento_insuficiente_e_recusado_e_nada_e_gravado(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ea, antes = await _estoque(async_session, va.id), await _ledger(async_session, t_id)
    r = await _post(test_client, h, [_item(p, va, 2)], [{"amount": "199.00", "payment_method": "cash"}])
    assert r.status_code == 400 and "insuficiente" in r.text.lower()
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == ea
    assert _delta(await _ledger(async_session, t_id), antes) == (0, 0, 0)


# ───────────────────────── fiado ─────────────────────────

async def test_fiado_exige_cliente_nao_passa_do_total_e_vira_parcelas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100.00", "payment_method": "on_account"}])
    assert r.status_code == 400 and "cliente" in r.text.lower()
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "150.00", "payment_method": "on_account"}], customer_id=cid)
    assert r.status_code == 400
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "40.00", "payment_method": "cash"},
                                                       {"amount": "60.00", "payment_method": "on_account", "installments": 3}], customer_id=cid)
    assert r.status_code == 201, r.text
    d = (await test_client.get(f"{API}/receivables?customer_id={cid}", headers=h)).json()
    assert d["summary"]["open_total"] == 60.0 and sum(i["amount"] for i in d["items"]) == 60.0 and len(d["items"]) == 3


async def test_fiado_com_cliente_inexistente_ou_primeiro_vencimento_no_passado(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100.00", "payment_method": "on_account"}], customer_id=99999999)
    assert r.status_code == 400 and "Cliente" in r.text
    cid = await _cliente(async_session, t_id)
    ontem = (date.today() - timedelta(days=30)).isoformat()
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100.00", "payment_method": "on_account", "first_due_date": ontem}], customer_id=cid)
    # vencimento no passado: aceitar (fiado antigo) ou recusar com frase; o que nao pode e dar 500
    assert r.status_code in (201, 400), r.text


# ───────────────────────── fidelidade ─────────────────────────

async def test_pagar_com_pontos_sem_cliente_saldo_curto_e_programa_desligado(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "5.00", "payment_method": "loyalty_points"}, {"amount": "95.00", "payment_method": "cash"}])
    assert r.status_code == 400, r.text
    cid = await _cliente(async_session, t_id)
    # cliente sem pontos
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "5.00", "payment_method": "loyalty_points"}, {"amount": "95.00", "payment_method": "cash"}], customer_id=cid)
    assert r.status_code == 400 and "ponto" in r.text.lower(), r.text


async def test_venda_com_cliente_gera_pontos_e_cancelar_devolve(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    from app.models.customer import Customer
    cid = await _cliente(async_session, t_id)
    r = await _post(test_client, h, [_item(p, va, 3)], [{"amount": "300.00", "payment_method": "cash"}], customer_id=cid)
    assert r.status_code == 201, r.text
    pontos = D(str(r.json()["loyalty_points_earned"]))
    async_session.expire_all()
    c = (await async_session.execute(select(Customer).where(Customer.id == cid))).scalar_one()
    assert D(str(c.total_spent)) == 300 and c.total_purchases == 1
    assert D(str(c.loyalty_points)) == pontos
    sid = r.json()["id"]
    r = await test_client.post(f"{API}/sales/{sid}/cancel", headers=h, params={"reason": "Cliente desistiu"})
    assert r.status_code == 200, r.text
    async_session.expire_all()
    c = (await async_session.execute(select(Customer).where(Customer.id == cid))).scalar_one()
    assert D(str(c.total_spent)) == 0, f"total gasto apos cancelar: {c.total_spent}"
    assert D(str(c.loyalty_points)) == 0, f"pontos apos cancelar: {c.loyalty_points}"
    assert c.total_purchases == 0, f"compras apos cancelar: {c.total_purchases}"


# ───────────────────────── cancelamento ─────────────────────────

async def test_cancelar_devolve_estoque_zera_receita_e_nao_cancela_duas_vezes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    antes, ea = await _ledger(async_session, t_id), await _estoque(async_session, va.id)
    r = await _post(test_client, h, [_item(p, va, 4)], [{"amount": "400.00", "payment_method": "cash"}])
    sid = r.json()["id"]
    r = await test_client.post(f"{API}/sales/{sid}/cancel", headers=h, params={"reason": "Erro"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled", r.text
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == ea
    assert _delta(await _ledger(async_session, t_id), antes) == (0, 0, 0)
    r = await test_client.post(f"{API}/sales/{sid}/cancel", headers=h, params={"reason": "De novo"})
    assert r.status_code == 400
    r404 = await test_client.post(f"{API}/sales/99999999/cancel", headers=h, params={"reason": "x"})
    assert r404.status_code == 404, f"cancelar venda inexistente: {r404.status_code} {r404.text}"
    assert (await test_client.post(f"{API}/sales/{sid}/cancel", headers=h)).status_code == 422     # motivo e obrigatorio
    # a venda continua legivel e listada como cancelada
    assert (await test_client.get(f"{API}/sales/{sid}", headers=h)).json()["status"] == "cancelled"


async def test_cancelar_so_admin(test_client, async_session, test_user):
    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User, UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    u = User(email=f"vend{next(_n)}@example.com", full_name="Vendedora", hashed_password=get_password_hash("Senha1234"),
             role=UserRole.SELLER, is_active=True, tenant_id=t_id)
    async_session.add(u)
    await async_session.commit()
    await async_session.refresh(u)
    hv = {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}
    r = await _post(test_client, hv, [_item(p, va, 1)], [{"amount": "100.00", "payment_method": "cash"}])
    assert r.status_code == 201, r.text
    r2 = await test_client.post(f"{API}/sales/{r.json()['id']}/cancel", headers=hv, params={"reason": "tentando"})
    assert r2.status_code == 403, r2.text


async def test_cancelar_venda_no_fiado_cancela_as_parcelas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100.00", "payment_method": "on_account", "installments": 2}], customer_id=cid)
    assert r.status_code == 201, r.text
    c = await test_client.post(f"{API}/sales/{r.json()['id']}/cancel", headers=h, params={"reason": "Erro"})
    assert c.status_code == 200, c.text
    d = (await test_client.get(f"{API}/receivables?customer_id={cid}", headers=h)).json()
    assert d["summary"]["open_total"] == 0


# ───────────────────────── erros de validacao: nunca 500 ─────────────────────────

async def test_corpos_invalidos_dao_4xx_e_nao_gravam_nada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ea, antes = await _estoque(async_session, va.id), await _ledger(async_session, t_id)
    ok_pay = [{"amount": "100.00", "payment_method": "cash"}]
    _, _, p2, va2, _ = await _cenario(async_session, test_user)
    casos = {
        "quantidade 0": ([_item(p, va, 0)], ok_pay, {}),
        "quantidade negativa": ([_item(p, va, -2)], ok_pay, {}),
        "preco 0": ([_item(p, va, 1, preco="0")], ok_pay, {}),
        "preco negativo": ([_item(p, va, 1, preco="-10")], ok_pay, {}),
        "desconto de item negativo": ([_item(p, va, 1, desc="-5")], ok_pay, {}),
        "desconto da venda negativo": ([_item(p, va)], ok_pay, {"discount_amount": "-5"}),
        "imposto negativo": ([_item(p, va)], ok_pay, {"tax_amount": "-5"}),
        "pagamento 0": ([_item(p, va)], [{"amount": "0", "payment_method": "cash"}], {}),
        "pagamento negativo": ([_item(p, va)], [{"amount": "-100", "payment_method": "cash"}], {}),
        "forma invalida": ([_item(p, va)], [{"amount": "100", "payment_method": "bitcoin"}], {}),
        "sem itens": ([], ok_pay, {}),
        "sem pagamentos": ([_item(p, va)], [], {}),
        "produto inexistente": ([{"product_id": 99999999, "quantity": 1, "unit_price": "10"}], ok_pay, {}),
        "variacao inexistente": ([{"product_id": p.id, "variant_id": 99999999, "quantity": 1, "unit_price": "100"}], ok_pay, {}),
        "variacao de outro produto": ([{"product_id": p.id, "variant_id": va2.id, "quantity": 1, "unit_price": "100"}], ok_pay, {}),
        "cliente inexistente": ([_item(p, va)], ok_pay, {"customer_id": 99999999}),
        "quantidade gigante": ([_item(p, va, 10 ** 12)], [{"amount": "1", "payment_method": "cash"}], {}),
        "preco gigante": ([_item(p, va, 1, preco="1e30")], [{"amount": "1", "payment_method": "cash"}], {}),
        "texto no lugar de numero": ([_item(p, va, 1, preco="abc")], ok_pay, {}),
    }
    falhas = []
    criadas = 0
    for nome, (items, pays, extra) in casos.items():
        r = await _post(test_client, h, items, pays, **extra)
        if r.status_code == 201:
            criadas += 1
        if not 400 <= r.status_code < 500:
            falhas.append(f"{nome}: esperado 4xx, veio {r.status_code} {r.text[:120]}")
        elif "Traceback" in r.text or "sqlalchemy" in r.text.lower() or "asyncpg" in r.text.lower():
            falhas.append(f"{nome}: vazou erro tecnico: {r.text[:120]}")
    assert not falhas, chr(10).join(falhas)
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == ea
    assert _delta(await _ledger(async_session, t_id), antes) == (0, 0, 0)


async def test_desconto_maior_que_a_venda_nao_gera_total_negativo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    antes = await _ledger(async_session, t_id)
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "10.00", "payment_method": "cash"}], discount_amount="500.00")
    assert r.status_code == 400, f"venda com total negativo foi aceita: {r.status_code} total={r.json().get('total_amount')}"
    r = await _post(test_client, h, [_item(p, va, 1, desc="500.00")], [{"amount": "10.00", "payment_method": "cash"}])
    assert r.status_code == 400, f"desconto de item maior que o item foi aceito: {r.status_code} total={r.json().get('total_amount')}"
    assert _delta(await _ledger(async_session, t_id), antes) == (0, 0, 0)


async def test_estoque_insuficiente_nao_vende_e_nao_mexe_em_nada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ea, antes = await _estoque(async_session, va.id), await _ledger(async_session, t_id)
    r = await _post(test_client, h, [_item(p, va, ea + 1)], [{"amount": str(100 * (ea + 1)), "payment_method": "cash"}])
    assert r.status_code == 400 and "insuficiente" in r.text.lower(), r.text
    # a ultima peca vende, a seguinte nao
    r = await _post(test_client, h, [_item(p, va, ea)], [{"amount": str(100 * ea), "payment_method": "cash"}])
    assert r.status_code == 201, r.text
    r = await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100", "payment_method": "cash"}])
    assert r.status_code == 400
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 0


async def test_mesma_peca_em_duas_linhas_somando_mais_que_o_estoque(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)       # 10 em estoque
    ea, antes = await _estoque(async_session, va.id), await _ledger(async_session, t_id)
    r = await _post(test_client, h, [_item(p, va, 6), _item(p, va, 6)], [{"amount": "1200.00", "payment_method": "cash"}])
    assert r.status_code == 400, f"vendeu 12 de 10: {r.status_code} {r.text[:200]}"
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == ea, "estoque mudou apos venda recusada"
    assert _delta(await _ledger(async_session, t_id), antes) == (0, 0, 0)


async def test_venda_duplicada_enviada_duas_vezes_gera_duas_vendas_distintas(test_client, async_session, test_user):
    """Sem chave de idempotencia o comportamento continua: duplo clique = 2 vendas (numero e sempre unico)."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    corpo = ([_item(p, va, 1)], [{"amount": "100.00", "payment_method": "cash"}])
    a, b = await _post(test_client, h, *corpo), await _post(test_client, h, *corpo)
    assert a.status_code == b.status_code == 201
    assert a.json()["sale_number"] != b.json()["sale_number"]


async def test_idempotency_key_mesma_chave_devolve_a_mesma_venda_sem_baixar_de_novo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ea = await _estoque(async_session, va.id)
    antes = await _ledger(async_session, t_id)
    corpo = ([_item(p, va, 1)], [{"amount": "100.00", "payment_method": "cash"}])
    hk = {**h, "Idempotency-Key": "clique-duplo-1"}
    a = await test_client.post(f"{API}/sales/", headers=hk, json={"payment_method": "cash", "items": corpo[0], "payments": corpo[1]})
    b = await test_client.post(f"{API}/sales/", headers=hk, json={"payment_method": "cash", "items": corpo[0], "payments": corpo[1]})
    assert a.status_code == b.status_code == 201, (a.text, b.text)
    assert a.json()["id"] == b.json()["id"] and a.json()["sale_number"] == b.json()["sale_number"]
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == ea - 1
    assert _delta(await _ledger(async_session, t_id), antes)[0] == 100
    # corpo: client_request_id vale igual; chave diferente = outra venda
    c = await _post(test_client, h, *corpo, client_request_id="clique-duplo-1")
    d = await test_client.post(f"{API}/sales/", headers={**h, "Idempotency-Key": "outra"},
                               json={"payment_method": "cash", "items": corpo[0], "payments": corpo[1]})
    assert c.json()["id"] == a.json()["id"]
    assert d.status_code == 201 and d.json()["id"] != a.json()["id"]


async def test_idempotency_key_chave_velha_de_24h_e_liberada(test_client, async_session, test_user):
    from datetime import datetime, timedelta
    from sqlalchemy import update
    from app.models.sale import Sale
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    corpo = {"payment_method": "cash", "items": [_item(p, va, 1)], "payments": [{"amount": "100", "payment_method": "cash"}]}
    hk = {**h, "Idempotency-Key": "velha-1"}
    a = (await test_client.post(f"{API}/sales/", headers=hk, json=corpo)).json()
    await async_session.execute(update(Sale).where(Sale.id == a["id"]).values(created_at=datetime.utcnow() - timedelta(hours=25)))
    await async_session.commit()
    b = await test_client.post(f"{API}/sales/", headers=hk, json=corpo)
    assert b.status_code == 201 and b.json()["id"] != a["id"]


async def test_venda_sem_itens_e_pagamentos_vazios_e_tetos(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ok = [{"amount": "100", "payment_method": "cash"}]
    assert (await _post(test_client, h, [], ok)).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)], [])).status_code == 422
    r = await _post(test_client, h, [_item(p, va, 1, preco="1000000.01")], [{"amount": "1", "payment_method": "cash"}])
    assert r.status_code == 422 and "alto demais" in r.text
    assert (await _post(test_client, h, [_item(p, va, 10001)], ok)).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)] * 201, ok)).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)], [{"amount": "1000000.01", "payment_method": "cash"}])).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)], ok, tax_amount="1000000.01")).status_code == 422


async def test_listagem_filtros_combinam_e_periodo_invalido(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c1 = await _cliente(async_session, t_id)
    s1 = (await _post(test_client, h, [_item(p, va)], [{"amount": "100", "payment_method": "cash"}], customer_id=c1)).json()
    ids = lambda rr: [x["id"] for x in rr.json()]  # noqa: E731
    hoje = date.today().isoformat()
    g = lambda **k: test_client.get(f"{API}/sales/", headers=h, params=k)  # noqa: E731
    assert s1["id"] in ids(await g(customer_id=c1, seller_id=s1["seller_id"], status="completed", start_date=hoje, end_date=hoje))
    assert ids(await g(customer_id=c1, status="cancelled")) == []
    assert ids(await g(customer_id=c1, limit=1, skip=1)) == []
    assert (await g(start_date="2026-12-31", end_date="2026-01-01")).status_code == 422


async def test_cancelar_inexistente_e_404_com_acento(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await test_client.post(f"{API}/sales/99999999/cancel", headers=h, params={"reason": "x"})
    assert r.status_code == 404 and "não encontrada" in r.text


async def test_sem_login_e_recusado(test_client):
    assert (await test_client.post(f"{API}/sales/", json={})).status_code in (401, 403)
    assert (await test_client.get(f"{API}/sales/")).status_code in (401, 403)
    assert (await test_client.get(f"{API}/sales/1")).status_code in (401, 403)


# ───────────────────────── listagem / filtros / paginacao ─────────────────────────

async def test_listagem_paginacao_e_filtros(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c1, c2 = await _cliente(async_session, t_id), await _cliente(async_session, t_id)
    s1 = (await _post(test_client, h, [_item(p, va)], [{"amount": "100", "payment_method": "cash"}], customer_id=c1)).json()["id"]
    s2 = (await _post(test_client, h, [_item(p, va)], [{"amount": "100", "payment_method": "pix"}], customer_id=c2)).json()["id"]
    ids = lambda rr: [x["id"] for x in rr.json()]  # noqa: E731
    assert ids(await test_client.get(f"{API}/sales/", headers=h, params={"customer_id": c1})) == [s1]
    assert ids(await test_client.get(f"{API}/sales/", headers=h, params={"customer_id": c2})) == [s2]
    r = await test_client.get(f"{API}/sales/", headers=h, params={"limit": 1})
    assert r.status_code == 200 and len(r.json()) == 1
    assert (await test_client.get(f"{API}/sales/", headers=h, params={"limit": 101})).status_code == 422
    assert (await test_client.get(f"{API}/sales/", headers=h, params={"limit": 0})).status_code == 422
    assert (await test_client.get(f"{API}/sales/", headers=h, params={"skip": -1})).status_code == 422
    assert (await test_client.get(f"{API}/sales/", headers=h, params={"start_date": "lixo"})).status_code == 422
    # cliente + vendedor juntos: os dois filtros precisam valer
    seller = (await test_client.get(f"{API}/sales/{s1}", headers=h)).json()["seller_id"]
    got = ids(await test_client.get(f"{API}/sales/", headers=h, params={"customer_id": c1, "seller_id": seller + 999}))
    assert got == [], f"filtro de vendedor ignorado quando vem junto com cliente: {got}"


async def test_start_date_sozinho_nao_pode_ser_ignorado(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = (await _post(test_client, h, [_item(p, va)], [{"amount": "100", "payment_method": "cash"}])).json()["id"]
    amanha = (date.today() + timedelta(days=5)).isoformat()
    r = await test_client.get(f"{API}/sales/", headers=h, params={"start_date": amanha})
    got = [x["id"] for x in r.json()] if r.status_code == 200 else []
    assert sid not in got, "start_date sozinho no futuro foi ignorado (devolveu vendas de hoje)"
    r = await test_client.get(f"{API}/sales/", headers=h, params={"end_date": (date.today() - timedelta(days=5)).isoformat()})
    got = [x["id"] for x in r.json()] if r.status_code == 200 else []
    assert sid not in got, "end_date sozinho no passado foi ignorado (devolveu vendas de hoje)"


async def test_valores_extremos_e_observacao_longa_nunca_dao_500(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    falhas = []
    for preco in ("99999999.99", "100000000", "1e15", "9999999999999999.99"):
        r = await _post(test_client, h, [_item(p, va, 1, preco=preco)], [{"amount": preco, "payment_method": "cash"}])
        if r.status_code >= 500:
            falhas.append(f"preco {preco}: {r.status_code}")
    r = await _post(test_client, h, [_item(p, va)], [{"amount": "100", "payment_method": "cash"}], notes="x" * 20000)
    if r.status_code >= 500:
        falhas.append(f"observacao de 20000 letras: {r.status_code}")
    r = await _post(test_client, h, [_item(p, va)], [{"amount": "100", "payment_method": "cash", "payment_reference": "r" * 5000}])
    if r.status_code >= 500:
        falhas.append(f"referencia de 5000 letras: {r.status_code}")
    assert not falhas, chr(10).join(falhas)


async def test_periodo_inclui_o_dia_final_e_venda_cancelada_aparece_na_lista(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = (await _post(test_client, h, [_item(p, va)], [{"amount": "100", "payment_method": "cash"}])).json()["id"]
    await test_client.post(f"{API}/sales/{sid}/cancel", headers=h, params={"reason": "teste"})
    hoje = date.today().isoformat()
    r = await test_client.get(f"{API}/sales/", headers=h, params={"start_date": hoje, "end_date": hoje})
    mine = [x for x in r.json() if x["id"] == sid]
    assert mine and mine[0]["status"] == "cancelled"


# ───────────────────────── relatorios batem com o livro ─────────────────────────

async def test_telas_de_dinheiro_batem_com_o_livro(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    antes_led = await _ledger(async_session, t_id)
    base = (await test_client.get(f"{API}/dashboard/sales/monthly", headers=h, params={"period": "this_month"})).json()
    # livro: 2 vendas validas (200 + 140), 1 cancelada (100) que nao conta
    await _post(test_client, h, [_item(p, va, 2)], [{"amount": "200", "payment_method": "cash"}])
    await _post(test_client, h, [_item(p, va, 2)], [{"amount": "140", "payment_method": "pix"}], discount_amount="60")
    x = (await _post(test_client, h, [_item(p, va, 1)], [{"amount": "100", "payment_method": "cash"}])).json()["id"]
    await test_client.post(f"{API}/sales/{x}/cancel", headers=h, params={"reason": "erro"})
    rev, cost, profit = _delta(await _ledger(async_session, t_id), antes_led)
    assert (rev, cost, profit) == (340, 160, 180)
    depois = (await test_client.get(f"{API}/dashboard/sales/monthly", headers=h, params={"period": "this_month"})).json()
    assert round(depois["total"] - base["total"], 2) == 340.0, (base["total"], depois["total"])
    assert depois["count"] - base["count"] == 2
    assert round(depois["profit"] - base["profit"], 2) == 180.0
    st = (await test_client.get(f"{API}/dashboard/stats", headers=h)).json()
    assert st is not None
    top = (await test_client.get(f"{API}/sales/reports/top-products", headers=h, params={"period": "this_month", "limit": 50})).json()
    linha = next(x for x in top["products"] if x["product_id"] == p.id)
    assert linha["total_revenue"] == 340 and linha["total_profit"] == 180, linha
    rp = await test_client.get(f"{API}/sales/reports/period", headers=h, params={"start_date": date.today().isoformat(), "end_date": date.today().isoformat()})
    assert rp.status_code == 200, rp.text
    bp = await test_client.get(f"{API}/sales/reports/by-period", headers=h, params={"start_date": date.today().isoformat(), "end_date": date.today().isoformat()})
    assert bp.status_code == 200, bp.text
    daily = await test_client.get(f"{API}/sales/daily-total", headers=h)
    assert daily.status_code in (200, 404), daily.text


# ───────────────────────── isolamento entre lojas ─────────────────────────

async def test_outra_loja_nao_ve_nem_cancela_nem_vende_produto_alheio(test_client, async_session, test_user):
    from tests.test_isolamento_fornecedores import _h, _sem_override
    from tests.test_team_limit import _nova_loja
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sid = (await _post(test_client, h, [_item(p, va)], [{"amount": "100", "payment_method": "cash"}])).json()["id"]
    cid_a = await _cliente(async_session, t_id)
    _sem_override()
    _, _, tok_b = await _nova_loja(async_session, "pro")
    hb = _h(tok_b)
    assert (await test_client.get(f"{API}/sales/{sid}", headers=hb)).status_code == 404
    assert (await test_client.get(f"{API}/sales/{sid}/receipt", headers=hb)).status_code == 404
    assert (await test_client.post(f"{API}/sales/{sid}/cancel", headers=hb, params={"reason": "invasao"})).status_code in (400, 403, 404)
    assert sid not in [x["id"] for x in (await test_client.get(f"{API}/sales/", headers=hb)).json()]
    r = await _post(test_client, hb, [_item(p, va)], [{"amount": "100", "payment_method": "cash"}])
    assert r.status_code == 400, f"loja B vendeu produto da loja A: {r.status_code}"
    r = await _post(test_client, hb, [_item(p, va)], [{"amount": "100", "payment_method": "cash"}], customer_id=cid_a)
    assert r.status_code == 400
    # a venda continua intacta na loja A (o token de A resolve a loja real do usuario)
    g = await test_client.get(f"{API}/sales/{sid}", headers=h)
    assert g.status_code == 200 and g.json()["status"] == "completed"
