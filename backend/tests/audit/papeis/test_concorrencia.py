"""Várias pessoas ao mesmo tempo nas rotas de dinheiro (asyncio.gather, uma sessão de banco POR requisição).

Invariantes: nunca 500; o dinheiro/estoque nunca passa do real; a mesma peça/parcela/conta não é devolvida, recebida ou paga duas vezes.

ATENÇÃO (SQLite x Postgres): as travas do app são do Postgres (`pg_advisory_xact_lock` em `stock_lock.py` e `SELECT ... FOR UPDATE`
em caixa, fiado e financeiro); no SQLite elas são NO-OP. Por isso, quando uma invariante de dinheiro/estoque quebra no SQLite o teste
vira XFAIL com a explicação ("sem trava no SQLite") e só o Postgres (tests/pg) confirma ou refuta. A regra "nunca 500" vale nos dois.
"""
import asyncio
from collections import Counter
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from tests.test_financeiro import _zerar_implantacao
from tests.test_troca import _cenario, _estoque, _vender
from .conftest import eh_sqlite, quatro_papeis

pytestmark = pytest.mark.asyncio
API = "/api/v1"
HOJE = date.today().isoformat()


def inv(db, cond, msg):
    """Invariante de dinheiro/estoque: no SQLite (sem trava) vira XFAIL explicado; no Postgres falha de verdade."""
    if cond:
        return
    if eh_sqlite(db):
        pytest.xfail(f"SEM TRAVA NO SQLITE (confirmar no Postgres): {msg}")
    pytest.fail(msg)


def sem500(rs, nome):
    ruins = [f"{r.status_code} {r.text[:160]}" for r in rs if r.status_code >= 500]
    assert ruins == [], f"{nome}: erro 500 sob concorrência: {ruins}"


def contagem(rs):
    return Counter(r.status_code for r in rs)


async def _gather(client, chamadas):
    return await asyncio.gather(*[client.request(m, f"{API}{p}", headers=h, json=j) for m, p, h, j in chamadas])


@pytest.fixture
async def mundo(async_session, test_user, sessao_por_requisicao):
    t_id, h_admin, p, va, vb = await _cenario(async_session, test_user)
    h = await quatro_papeis(async_session, t_id, h_admin)
    await _zerar_implantacao(async_session, t_id)
    return dict(c=sessao_por_requisicao, db=async_session, t=t_id, h=h, p=p, va=va, vb=vb)


async def _cliente(m, nome="Cliente Concorrente"):
    r = await m["c"].post(f"{API}/customers/", headers=m["h"]["admin"], json={"full_name": nome, "phone": "34911112222"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def _fiado(m, cid, valor="100.00"):
    r = await m["c"].post(f"{API}/sales/", headers=m["h"]["admin"], json={
        "customer_id": cid, "payment_method": "on_account",
        "items": [{"product_id": m["p"].id, "variant_id": m["va"].id, "quantity": 1, "unit_price": valor}],
        "payments": [{"amount": valor, "payment_method": "on_account", "installments": 1,
                      "first_due_date": (date.today() + timedelta(days=7)).isoformat(), "interval_days": 7}]})
    assert r.status_code in (200, 201), r.text


async def _em_aberto(m, cid):
    return (await m["c"].get(f"{API}/receivables?customer_id={cid}", headers=m["h"]["admin"])).json()["summary"]["open_total"]


# ── devolução ────────────────────────────────────────────────────────────────────────────────────────────────────────

async def test_duas_devolucoes_da_mesma_peca(mundo):
    m = mundo
    sale_id, item_id = await _vender(m["c"], m["h"]["admin"], m["p"], m["va"], 1, "100.00")
    antes = await _estoque(m["db"], m["va"].id)
    corpo = {"reason": "Tamanho", "items": [{"sale_item_id": item_id, "quantity": 1}]}
    rs = await _gather(m["c"], [("POST", f"/returns/{sale_id}", m["h"][papel], corpo) for papel in ("seller", "manager", "admin", "seller")])
    sem500(rs, "devolução")
    m["db"].expire_all()
    ok = contagem(rs)[201]
    estoque = await _estoque(m["db"], m["va"].id)
    inv(m["db"], ok == 1, f"{ok} devoluções aceitas para 1 peça vendida (códigos {dict(contagem(rs))})")
    inv(m["db"], estoque == antes + 1, f"estoque {estoque}, esperado {antes + 1}: peça devolvida mais de uma vez")
    hist = (await m["c"].get(f"{API}/returns/history/{sale_id}", headers=m["h"]["admin"])).json()
    inv(m["db"], len(hist) == 1, f"{len(hist)} devoluções gravadas para a mesma peça")


async def test_devolucoes_parciais_simultaneas_nunca_passam_do_vendido(mundo):
    m = mundo
    sale_id, item_id = await _vender(m["c"], m["h"]["admin"], m["p"], m["va"], 3, "100.00")
    antes = await _estoque(m["db"], m["va"].id)
    corpo = {"reason": "Parcial", "items": [{"sale_item_id": item_id, "quantity": 1}]}
    rs = await _gather(m["c"], [("POST", f"/returns/{sale_id}", m["h"]["seller"], corpo)] * 6)
    sem500(rs, "devolução parcial")
    m["db"].expire_all()
    ok = contagem(rs)[201]
    estoque = await _estoque(m["db"], m["va"].id)
    inv(m["db"], ok <= 3, f"{ok} devoluções de 1 peça aceitas para 3 vendidas")
    inv(m["db"], estoque == antes + ok and estoque <= antes + 3, f"estoque {estoque} (antes {antes}, devoluções aceitas {ok})")
    hist = (await m["c"].get(f"{API}/returns/history/{sale_id}", headers=m["h"]["admin"])).json()
    total = sum(float(h["total_refund"]) for h in hist)
    inv(m["db"], total <= 300.0 + 1e-6, f"estornou R$ {total} de uma venda de R$ 300")


# ── cancelamento ──────────────────────────────────────────────────────────────────────────────────────────────────────

async def test_cancelamentos_simultaneos_da_mesma_venda(mundo):
    m = mundo
    sale_id, _ = await _vender(m["c"], m["h"]["admin"], m["p"], m["va"], 2, "100.00")
    antes = await _estoque(m["db"], m["va"].id)       # já sem as 2 vendidas
    rs = await _gather(m["c"], [("POST", f"/sales/{sale_id}/cancel?reason=teste%20de%20concorrencia", m["h"]["admin"], None)] * 4)
    sem500(rs, "cancelamento")
    m["db"].expire_all()
    estoque = await _estoque(m["db"], m["va"].id)
    inv(m["db"], contagem(rs)[200] == 1, f"cancelamentos aceitos: {dict(contagem(rs))}")
    inv(m["db"], estoque == antes + 2, f"estoque {estoque}, esperado {antes + 2}: peças devolvidas ao estoque mais de uma vez")


async def test_cancelar_e_devolver_ao_mesmo_tempo(mundo):
    m = mundo
    sale_id, item_id = await _vender(m["c"], m["h"]["admin"], m["p"], m["va"], 2, "100.00")
    total_antes = await _estoque(m["db"], m["va"].id) + 2     # estoque que existia antes da venda
    rs = await _gather(m["c"], [
        ("POST", f"/sales/{sale_id}/cancel?reason=teste%20de%20concorrencia", m["h"]["admin"], None),
        ("POST", f"/returns/{sale_id}", m["h"]["seller"], {"reason": "x", "items": [{"sale_item_id": item_id, "quantity": 2}]}),
        ("POST", f"/returns/{sale_id}", m["h"]["manager"], {"reason": "x", "items": [{"sale_item_id": item_id, "quantity": 2}]}),
    ])
    sem500(rs, "cancelar+devolver")
    m["db"].expire_all()
    estoque = await _estoque(m["db"], m["va"].id)
    inv(m["db"], estoque <= total_antes, f"estoque {estoque} > {total_antes}: peça inventada (cancelou E devolveu); códigos {dict(contagem(rs))}")


# ── fiado ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

async def test_cinco_recebimentos_do_mesmo_fiado_ao_mesmo_tempo(mundo):
    m = mundo
    cid = await _cliente(m)
    await _fiado(m, cid, "100.00")
    corpo = {"customer_id": cid, "amount": "100", "payment_method": "cash"}
    rs = await _gather(m["c"], [("POST", "/receivables/receive", m["h"][p], corpo) for p in ("cashier", "seller", "manager", "admin", "cashier")])
    sem500(rs, "receber fiado")
    aberto = await _em_aberto(m, cid)
    inv(m["db"], contagem(rs)[200] == 1, f"{contagem(rs)[200]} recebimentos de R$ 100 aceitos para R$ 100 devidos")
    inv(m["db"], aberto == 0, f"em aberto {aberto}, esperado 0")
    from app.models.receivable import ReceivablePayment
    m["db"].expire_all()
    soma = (await m["db"].execute(select(func.coalesce(func.sum(ReceivablePayment.amount), 0)).where(
        ReceivablePayment.tenant_id == m["t"], ReceivablePayment.is_active == True))).scalar()  # noqa: E712
    inv(m["db"], float(soma) <= 100.0 + 1e-6, f"recebeu R$ {soma} de R$ 100 devidos")


async def test_recebimentos_de_30_em_divida_de_100_nunca_passam_de_100(mundo):
    m = mundo
    cid = await _cliente(m, "Cliente Parcelas")
    await _fiado(m, cid, "100.00")
    corpo = {"customer_id": cid, "amount": "30", "payment_method": "pix"}
    rs = await _gather(m["c"], [("POST", "/receivables/receive", m["h"]["cashier"], corpo)] * 10)
    sem500(rs, "receber fiado em partes")
    ok = contagem(rs)[200]
    aberto = await _em_aberto(m, cid)
    inv(m["db"], ok <= 3, f"{ok} recebimentos de R$ 30 aceitos (máx 3 para R$ 100)")
    inv(m["db"], aberto >= 0 and abs(aberto - (100 - 30 * ok)) < 0.01, f"em aberto {aberto}, esperado {100 - 30 * ok}")


async def test_desfazer_o_mesmo_recebimento_ao_mesmo_tempo(mundo):
    m = mundo
    cid = await _cliente(m, "Cliente Desfaz")
    await _fiado(m, cid, "100.00")
    r = await m["c"].post(f"{API}/receivables/receive", headers=m["h"]["admin"], json={"customer_id": cid, "amount": "40", "payment_method": "cash"})
    assert r.status_code == 200, r.text
    rec = (await m["c"].get(f"{API}/receivables?customer_id={cid}", headers=m["h"]["admin"])).json()["items"][0]["id"]
    pid = (await m["c"].get(f"{API}/receivables/{rec}/payments", headers=m["h"]["admin"])).json()[0]["id"]
    rs = await _gather(m["c"], [("DELETE", f"/receivables/payments/{pid}", m["h"][p], None) for p in ("manager", "admin", "manager")])
    sem500(rs, "desfazer recebimento")
    aberto = await _em_aberto(m, cid)
    inv(m["db"], contagem(rs)[200] == 1 and aberto == 100.0, f"códigos {dict(contagem(rs))}, em aberto {aberto} (esperado 100: desfeito UMA vez)")


# ── caixa da gaveta ───────────────────────────────────────────────────────────────────────────────────────────────────

async def test_abrir_o_caixa_varias_vezes_ao_mesmo_tempo(mundo):
    m = mundo
    rs = await _gather(m["c"], [("POST", "/cash/open", m["h"][p], {"opening_amount": "100.00"}) for p in ("cashier", "seller", "manager", "admin")])
    sem500(rs, "abrir caixa")
    assert contagem(rs)[201] == 1 and contagem(rs)[409] == 3, dict(contagem(rs))   # o índice único parcial vale também no SQLite
    await m["c"].post(f"{API}/cash/close", headers=m["h"]["admin"], json={"counted_amount": 100})


async def test_duas_sangrias_acima_do_saldo(mundo):
    m = mundo
    r = await m["c"].post(f"{API}/cash/open", headers=m["h"]["admin"], json={"opening_amount": "100.00"})
    assert r.status_code == 201, r.text
    corpo = {"kind": "withdrawal", "amount": 80, "reason": "sangria"}
    rs = await _gather(m["c"], [("POST", "/cash/movements", m["h"][p], corpo) for p in ("cashier", "seller", "admin", "manager")])
    sem500(rs, "sangria")
    atual = (await m["c"].get(f"{API}/cash/current", headers=m["h"]["admin"])).json()["session"]
    inv(m["db"], contagem(rs)[200] + contagem(rs)[201] == 1, f"sangrias de R$ 80 aceitas em caixa de R$ 100: {dict(contagem(rs))}")
    inv(m["db"], atual["expected_amount"] >= 0, f"esperado na gaveta ficou {atual['expected_amount']} (negativo)")
    await m["c"].post(f"{API}/cash/close", headers=m["h"]["admin"], json={"counted_amount": 20})


async def test_fechar_o_caixa_varias_vezes_ao_mesmo_tempo(mundo):
    m = mundo
    await m["c"].post(f"{API}/cash/open", headers=m["h"]["admin"], json={"opening_amount": "50.00"})
    rs = await _gather(m["c"], [("POST", "/cash/close", m["h"][p], {"counted_amount": 50}) for p in ("cashier", "seller", "admin")])
    sem500(rs, "fechar caixa")
    inv(m["db"], contagem(rs)[200] == 1, f"fechamentos aceitos: {dict(contagem(rs))}")


async def test_venda_em_dinheiro_durante_a_sangria_nao_quebra_o_esperado(mundo):
    """Vendas e sangrias ao mesmo tempo: o esperado é recalculado dos pagamentos (nunca copiado), então tem que fechar a conta."""
    m = mundo
    await m["c"].post(f"{API}/cash/open", headers=m["h"]["admin"], json={"opening_amount": "100.00"})
    vendas = [("POST", "/sales/", m["h"]["cashier"], {"payment_method": "cash",
              "items": [{"product_id": m["p"].id, "variant_id": m["va"].id, "quantity": 1, "unit_price": "50.00"}],
              "payments": [{"amount": "50.00", "payment_method": "cash"}]}) for _ in range(4)]
    sangrias = [("POST", "/cash/movements", m["h"]["seller"], {"kind": "withdrawal", "amount": 30, "reason": "sangria"}) for _ in range(2)]
    rs = await _gather(m["c"], vendas + sangrias)
    sem500(rs, "venda+sangria")
    s = (await m["c"].get(f"{API}/cash/current", headers=m["h"]["admin"])).json()["session"]
    vend = sum(1 for r in rs[:4] if r.status_code in (200, 201))
    sang = sum(1 for r in rs[4:] if r.status_code in (200, 201))
    esperado = 100 + 50 * vend - 30 * sang
    inv(m["db"], abs(s["expected_amount"] - esperado) < 0.01, f"esperado {s['expected_amount']}, conta feita {esperado} ({vend} vendas, {sang} sangrias)")
    await m["c"].post(f"{API}/cash/close", headers=m["h"]["admin"], json={"counted_amount": max(esperado, 0)})


# ── financeiro ────────────────────────────────────────────────────────────────────────────────────────────────────────

async def _implantar(m, mes_passado=False):
    ini = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1) if mes_passado else date.today()
    r = await m["c"].post(f"{API}/finance/setup", headers=m["h"]["admin"], json={
        "start_date": ini.isoformat(), "cash_balance": "100", "banks": [{"name": "Banco", "balance": "500", "receives_pix": True}],
        "payables": [{"description": "Conta concorrente", "amount": "200", "due_date": (date.today() + timedelta(days=3)).isoformat()}]})
    assert r.status_code == 200, r.text
    return {a["name"]: a["id"] for a in r.json()["accounts"]}, ini


async def test_pagar_a_mesma_conta_ao_mesmo_tempo(mundo):
    m = mundo
    contas, _ = await _implantar(m)
    pid = (await m["c"].get(f"{API}/finance/payables", headers=m["h"]["admin"])).json()["items"][0]["id"]
    rs = await _gather(m["c"], [("POST", f"/finance/payables/{pid}/pay", m["h"][p], {"account_id": contas[c]})
                                 for p, c in (("manager", "Banco"), ("admin", "Gaveta"), ("manager", "Banco"), ("admin", "Gaveta"))])
    sem500(rs, "pagar conta")
    fin = (await m["c"].get(f"{API}/finance/accounts", headers=m["h"]["admin"])).json()
    saldos = {a["name"]: a["balance"] for a in fin["accounts"]}
    debitado = (100 - saldos["Gaveta"]) + (500 - saldos["Banco"])
    inv(m["db"], contagem(rs)[200] == 1, f"pagamentos aceitos: {dict(contagem(rs))}")
    inv(m["db"], abs(debitado - 200) < 0.01, f"saiu R$ {debitado} das contas por uma conta de R$ 200 (saldos {saldos})")


async def test_desfazer_pagamento_ao_mesmo_tempo(mundo):
    m = mundo
    contas, _ = await _implantar(m)
    pid = (await m["c"].get(f"{API}/finance/payables", headers=m["h"]["admin"])).json()["items"][0]["id"]
    assert (await m["c"].post(f"{API}/finance/payables/{pid}/pay", headers=m["h"]["admin"], json={"account_id": contas["Banco"]})).status_code == 200
    rs = await _gather(m["c"], [("POST", f"/finance/payables/{pid}/unpay", m["h"]["manager"], None)] * 3)
    sem500(rs, "desfazer pagamento")
    fin = (await m["c"].get(f"{API}/finance/accounts", headers=m["h"]["admin"])).json()
    banco = {a["name"]: a["balance"] for a in fin["accounts"]}["Banco"]
    inv(m["db"], contagem(rs)[200] == 1 and banco == 500.0, f"códigos {dict(contagem(rs))}, banco {banco} (esperado 500)")


async def test_fechar_o_mesmo_mes_ao_mesmo_tempo(mundo):
    m = mundo
    contas, ini = await _implantar(m, mes_passado=True)
    contado = {str(contas["Gaveta"]): "100", str(contas["Maquininha a receber"]): "0", str(contas["Banco"]): "500"}
    rs = await _gather(m["c"], [("POST", f"/finance/closings/{ini.year}/{ini.month}", m["h"][p], {"counted": contado}) for p in ("manager", "admin", "manager")])
    sem500(rs, "fechar mês")
    inv(m["db"], contagem(rs)[200] == 1, f"fechamentos aceitos: {dict(contagem(rs))}")
    from app.models.finance import AccountEntry
    n = (await m["db"].execute(select(func.count(AccountEntry.id)).where(AccountEntry.tenant_id == m["t"]))).scalar()
    inv(m["db"], n == 0, f"{n} lançamentos de ajuste criados com contado = esperado (deveria ser 0)")


async def test_lancar_a_mesma_despesa_e_transferir_ao_mesmo_tempo_nao_da_500(mundo):
    m = mundo
    contas, _ = await _implantar(m)
    chamadas = [("POST", "/expenses", m["h"]["manager"], {"amount": "10", "description": f"Despesa {i}", "expense_date": HOJE,
                                                           "account_id": contas["Gaveta"]}) for i in range(5)]
    chamadas += [("POST", "/finance/transfers", m["h"]["manager"], {"from_account_id": contas["Gaveta"], "to_account_id": contas["Banco"],
                                                                      "amount": "5"}) for _ in range(5)]
    rs = await _gather(m["c"], chamadas)
    sem500(rs, "despesas+transferências")
    fin = (await m["c"].get(f"{API}/finance/accounts", headers=m["h"]["admin"])).json()
    saldos = {a["name"]: a["balance"] for a in fin["accounts"]}
    ok_d = sum(1 for r in rs[:5] if r.status_code in (200, 201))
    ok_t = sum(1 for r in rs[5:] if r.status_code == 200)
    inv(m["db"], abs(saldos["Gaveta"] - (100 - 10 * ok_d - 5 * ok_t)) < 0.01 and abs(saldos["Banco"] - (500 + 5 * ok_t)) < 0.01,
        f"saldos {saldos} não batem com {ok_d} despesas e {ok_t} transferências")


# ── estoque e pontos ─────────────────────────────────────────────────────────────────────────────────────────────────

async def test_duas_vendas_da_ultima_peca(async_session, test_user, sessao_por_requisicao):
    t_id, h_admin, p, va, vb = await _cenario(async_session, test_user, stock_b=1)
    h = await quatro_papeis(async_session, t_id, h_admin)
    corpo = {"payment_method": "cash", "items": [{"product_id": p.id, "variant_id": vb.id, "quantity": 1, "unit_price": "100.00"}],
             "payments": [{"amount": "100.00", "payment_method": "cash"}]}
    rs = await _gather(sessao_por_requisicao, [("POST", "/sales/", h[papel], corpo) for papel in ("cashier", "seller", "manager", "admin")])
    sem500(rs, "última peça")
    async_session.expire_all()
    ok = sum(1 for r in rs if r.status_code in (200, 201))
    resto = await _estoque(async_session, vb.id)
    inv(async_session, ok == 1 and resto == 0, f"{ok} vendas aceitas para 1 peça em estoque (resta {resto}); códigos {dict(contagem(rs))}")


async def test_pontos_gastos_duas_vezes_ao_mesmo_tempo(mundo):
    """Cliente com 100 pontos (valem R$ 10); duas vendas simultâneas pagando R$ 8 com pontos: só uma pode passar."""
    m = mundo
    cid = await _cliente(m, "Cliente Pontos")
    r = await m["c"].post(f"{API}/customers/{cid}/loyalty/adjust", headers=m["h"]["admin"], json={"points": 100, "note": "saldo de teste"})
    assert r.status_code == 200, r.text
    corpo = {"customer_id": cid, "payment_method": "cash",
             "items": [{"product_id": m["p"].id, "variant_id": m["va"].id, "quantity": 1, "unit_price": "50.00"}],
             "payments": [{"amount": "8.00", "payment_method": "loyalty_points"}, {"amount": "42.00", "payment_method": "cash"}]}
    rs = await _gather(m["c"], [("POST", "/sales/", m["h"]["cashier"], corpo)] * 4)
    sem500(rs, "pontos")
    ok = sum(1 for r in rs if r.status_code in (200, 201))
    if ok == 0:
        pytest.skip(f"venda com pontos não aceita neste ambiente: {rs[0].text[:160]}")
    saldo = (await m["c"].get(f"{API}/customers/{cid}/loyalty", headers=m["h"]["admin"])).json()
    pts = saldo.get("balance", saldo.get("points", saldo.get("loyalty_points")))
    inv(m["db"], ok == 1 and (pts is None or pts >= 0), f"{ok} vendas pagas com 80 pontos de um saldo de 100 (saldo agora {pts}); {saldo}")
