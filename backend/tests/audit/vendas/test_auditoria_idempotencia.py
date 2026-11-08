"""Auditoria da idempotencia (Idempotency-Key / client_request_id), dos tetos e dos filtros novos de /sales."""
import asyncio
import itertools
from datetime import date, timedelta

import pytest

from tests.audit.vendas.test_auditoria_vendas import API, _cliente, _item, _post  # noqa: F401
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _estoque

pytestmark = pytest.mark.asyncio
_k = itertools.count(1)
CASH100 = [{"amount": "100.00", "payment_method": "cash"}]


def _key():
    return f"audit-key-{next(_k)}-{date.today().isoformat()}"


async def _post_k(client, h, items, pays, key, **extra):
    return await client.post(f"{API}/sales/", headers={**h, "Idempotency-Key": key}, json={
        "payment_method": pays[0]["payment_method"], "items": items, "payments": pays, **extra})


async def test_mesma_chave_mesmo_corpo_devolve_a_mesma_venda_sem_baixar_estoque_de_novo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    e0, k = await _estoque(async_session, va.id), _key()
    a = await _post_k(test_client, h, [_item(p, va)], CASH100, k)
    b = await _post_k(test_client, h, [_item(p, va)], CASH100, k)
    assert a.status_code == 201 and b.status_code in (200, 201), b.text
    assert a.json()["id"] == b.json()["id"] and a.json()["sale_number"] == b.json()["sale_number"]
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == e0 - 1
    hoje = date.today().isoformat()
    lista = (await test_client.get(f"{API}/sales/", headers=h, params={"start_date": hoje, "end_date": hoje})).json()
    assert [x["id"] for x in lista].count(a.json()["id"]) == 1


async def test_chave_no_corpo_equivale_ao_header_e_header_tem_prioridade(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    k = _key()
    a = await _post(test_client, h, [_item(p, va)], CASH100, client_request_id=k)
    b = await _post_k(test_client, h, [_item(p, va)], CASH100, k)
    assert a.status_code == 201 and a.json()["id"] == b.json()["id"]
    # header e corpo diferentes: vale o header
    k2, k3 = _key(), _key()
    c = await _post_k(test_client, h, [_item(p, va)], CASH100, k2, client_request_id=k3)
    d = await _post_k(test_client, h, [_item(p, va)], CASH100, k2)
    assert c.json()["id"] == d.json()["id"]


async def test_mesma_chave_com_corpo_diferente_deve_ser_recusada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    k = _key()
    a = await _post_k(test_client, h, [_item(p, va, 1)], CASH100, k)
    b = await _post_k(test_client, h, [_item(p, vb, 3)], [{"amount": "300.00", "payment_method": "pix"}], k)
    assert a.status_code == 201
    assert b.status_code in (409, 422), f"corpo diferente com a mesma chave: {b.status_code} id={b.json().get('id')} total={b.json().get('total_amount')}"


async def test_chave_vazia_ou_so_espacos_nao_deduplica(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    for k in ("", "   "):
        a = await _post_k(test_client, h, [_item(p, va)], CASH100, k)
        b = await _post_k(test_client, h, [_item(p, va)], CASH100, k)
        assert a.status_code == b.status_code == 201 and a.json()["id"] != b.json()["id"], repr(k)
    a = await _post(test_client, h, [_item(p, va)], CASH100, client_request_id="")
    b = await _post(test_client, h, [_item(p, va)], CASH100, client_request_id="")
    assert a.json()["id"] != b.json()["id"]


async def test_chave_longa_80_ok_81_recusada_e_sem_500(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ok = await _post_k(test_client, h, [_item(p, va)], CASH100, "k" * 80)
    assert ok.status_code == 201, ok.text
    assert (await _post_k(test_client, h, [_item(p, va)], CASH100, "k" * 81)).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)], CASH100, client_request_id="c" * 81)).status_code == 422
    for estranha in ("a b/c?d=e&f", "ã-ç-ü", "'; DROP TABLE sales;--"):
        try:
            r = await _post_k(test_client, h, [_item(p, va)], CASH100, estranha)
        except UnicodeEncodeError:
            continue  # header HTTP nao leva nao-ASCII; o cliente real nem envia
        assert r.status_code < 500, (estranha, r.status_code)
        r2 = await _post(test_client, h, [_item(p, va)], CASH100, client_request_id=estranha)
        assert r2.status_code < 500, (estranha, r2.status_code)


async def test_chave_em_venda_cancelada_nao_baixa_estoque_nem_cria_venda_nova(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    e0, k = await _estoque(async_session, va.id), _key()
    a = await _post_k(test_client, h, [_item(p, va)], CASH100, k)
    sid = a.json()["id"]
    assert (await test_client.post(f"{API}/sales/{sid}/cancel", headers=h, params={"reason": "erro"})).status_code == 200
    b = await _post_k(test_client, h, [_item(p, va)], CASH100, k)
    assert b.status_code in (200, 201, 409), b.text
    if b.status_code in (200, 201):
        # repeticao devolve a MESMA venda, que segue cancelada: o app precisa mostrar isso, nao "venda feita"
        assert b.json()["id"] == sid and b.json()["status"] == "cancelled"
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == e0


async def test_mesma_chave_em_lojas_diferentes_sao_vendas_diferentes(test_client, async_session, test_user):
    from app.models.category import Category
    from tests.test_isolamento_fornecedores import _h, _sem_override
    from tests.test_lot_costs import _lote, _produto
    from tests.test_team_limit import _nova_loja
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    k = _key()
    a = await _post_k(test_client, h, [_item(p, va)], CASH100, k)
    assert a.status_code == 201
    _sem_override()
    loja_b, _, tok_b = await _nova_loja(async_session, "pro")
    cat = Category(name="Cat B", slug=f"cat-b-{loja_b}", tenant_id=loja_b)
    async_session.add(cat)
    await async_session.flush()
    pb, vb_ = await _produto(async_session, loja_b, cat.id, "Peca B", "100.00")
    await _lote(async_session, loja_b, [(vb_, pb, 5, 40)])
    await async_session.commit()
    r = await _post_k(test_client, _h(tok_b), [_item(pb, vb_)], CASH100, k)
    assert r.status_code == 201, r.text
    assert r.json()["id"] != a.json()["id"], "chave da loja A devolveu a venda da loja A para a loja B"
    # e a loja B nao pode reaproveitar a chave da A para receber a venda dela
    r2 = await _post_k(test_client, _h(tok_b), [_item(p, va)], CASH100, _key())
    assert r2.status_code == 400
    from sqlalchemy import delete
    from app.models.base import BaseModel
    for t in reversed(BaseModel.metadata.sorted_tables):
        if "tenant_id" in t.c and "id" in t.c:
            await async_session.execute(delete(t).where(t.c.tenant_id == loja_b))
    await async_session.commit()


@pytest.mark.skip(reason="o test_client compartilha UMA sessao: pedidos simultaneos dao 'concurrent operations' mesmo com chaves diferentes; cobrir em tests/pg")
async def test_duas_requisicoes_simultaneas_com_a_mesma_chave_criam_uma_venda(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    e0, k = await _estoque(async_session, va.id), _key()
    rs = await asyncio.gather(*[_post_k(test_client, h, [_item(p, va)], CASH100, k) for _ in range(4)])
    ids = {r.json().get("id") for r in rs if r.status_code in (200, 201)}
    assert all(r.status_code < 500 for r in rs), [r.status_code for r in rs]
    assert len(ids) == 1, [(r.status_code, r.text[:80]) for r in rs]
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == e0 - 1


# ───────────────────────── tetos, total zero e filtros novos ─────────────────────────

async def test_tetos_de_valor_quantidade_e_linhas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    ok_p = CASH100
    assert (await _post(test_client, h, [_item(p, va, 10001)], ok_p)).status_code == 422
    assert (await _post(test_client, h, [_item(p, va, 1, preco="1000000.01")], ok_p)).status_code == 422
    assert (await _post(test_client, h, [_item(p, va, 1, desc="1000000.01")], ok_p)).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)], [{"amount": "1000000.01", "payment_method": "cash"}])).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)], ok_p, discount_amount="1000000.01")).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)], ok_p, tax_amount="1000000.01")).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)] * 201, ok_p)).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)], ok_p * 201)).status_code == 422
    r = await _post(test_client, h, [_item(p, va, 1, preco="NaN")], ok_p)
    assert r.status_code == 422
    r = await _post(test_client, h, [_item(p, va, 1, preco="Infinity")], ok_p)
    assert r.status_code == 422
    assert (await _post(test_client, h, [], ok_p)).status_code == 422
    assert (await _post(test_client, h, [_item(p, va)], [])).status_code in (400, 422)


async def test_total_zero_sem_pagamento(test_client, async_session, test_user):
    """Item de R$ 100 com desconto de R$ 100 e sem pagamento: venda de R$ 0 (brinde). Aceita ou recusa, mas sem 500."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await _post(test_client, h, [_item(p, va, 1, desc="100.00")], [])
    assert r.status_code < 500, r.text


@pytest.mark.xfail(reason="BUG: venda de total R$ 0,00 (desconto = valor do item) e aceita e conta como venda; decidir se brinde e permitido", strict=False)
async def test_venda_de_total_zero_deveria_ser_recusada_ou_explicita(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await _post(test_client, h, [_item(p, va, 1, desc="100.00")], [])
    assert r.status_code in (400, 422)


async def test_filtros_combinados_status_periodo_e_datas_invertidas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    c1 = await _cliente(async_session, t_id)
    s1 = (await _post(test_client, h, [_item(p, va)], CASH100, customer_id=c1)).json()["id"]
    s2 = (await _post(test_client, h, [_item(p, va)], CASH100, customer_id=c1)).json()["id"]
    await test_client.post(f"{API}/sales/{s2}/cancel", headers=h, params={"reason": "x"})
    ids = lambda r: [x["id"] for x in r.json()]  # noqa: E731
    assert ids(await test_client.get(f"{API}/sales/", headers=h, params={"customer_id": c1, "status": "completed"})) == [s1]
    assert ids(await test_client.get(f"{API}/sales/", headers=h, params={"customer_id": c1, "status": "cancelled"})) == [s2]
    assert (await test_client.get(f"{API}/sales/", headers=h, params={"status": "lixo"})).status_code == 422
    hoje, ontem = date.today(), date.today() - timedelta(days=1)
    assert (await test_client.get(f"{API}/sales/", headers=h, params={"start_date": hoje.isoformat(), "end_date": ontem.isoformat()})).status_code == 422
    # paginacao com filtro: o mais novo vem primeiro, skip/limit valem
    pg = await test_client.get(f"{API}/sales/", headers=h, params={"customer_id": c1, "limit": 1, "skip": 1})
    assert ids(pg) == [s1]
    assert ids(await test_client.get(f"{API}/sales/", headers=h, params={"customer_id": c1, "limit": 1}))[0] == s2


async def test_numero_da_venda_exato_acha_a_venda_certa(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    a = (await _post(test_client, h, [_item(p, va)], CASH100)).json()
    b = (await _post(test_client, h, [_item(p, va)], CASH100)).json()
    for x in (a, b):
        r = await test_client.get(f"{API}/sales/", headers=h, params={"sale_number": x["sale_number"]})
        assert [y["id"] for y in r.json()] == [x["id"]]
    r = await test_client.get(f"{API}/sales/", headers=h, params={"sale_number": a["sale_number"].lower()})
    assert [y["id"] for y in r.json()] == [a["id"]]          # caixa nao importa (aceitavel)


async def test_numero_parcial_ou_curinga_nao_deveria_devolver_outras_vendas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    a = (await _post(test_client, h, [_item(p, va)], CASH100)).json()
    (await _post(test_client, h, [_item(p, va)], CASH100)).json()
    r = await test_client.get(f"{API}/sales/", headers=h, params={"sale_number": "%"})
    assert r.json() == [], "sale_number='%' devolveu vendas (curinga)"
    r = await test_client.get(f"{API}/sales/", headers=h, params={"sale_number": a["sale_number"][:-1]})
    assert r.json() == [], "numero incompleto devolveu venda(s)"

