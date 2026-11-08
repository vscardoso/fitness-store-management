"""AUDITORIA fiado: parcelas, centavos, recebimento por forma, desfazer, cancelar, devolução, vencidos, erros."""
from datetime import date, timedelta
from decimal import Decimal as D

import pytest

from tests.test_caixa import _abrir, _atual
from tests.test_financeiro import _conta, _implantar, _zerar_implantacao
from tests.test_fiado import _aberto, _cliente, _venda
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/receivables"


def _fiado(valor, n=1, **kw):
    return [{"amount": valor, "payment_method": "on_account", "installments": n, **kw}]


async def _todas(c, h, cid):
    r = await c.get(f"{API}?customer_id={cid}&status=all", headers=h)
    assert r.status_code == 200, r.text
    return r.json()["items"]


@pytest.mark.parametrize("total", ["100.00", "99.99", "1234.57"])
async def test_parcelas_somam_o_total_e_sobra_na_ultima(test_client, async_session, test_user, total):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    aceitas = 0
    for n in (1, 2, 3, 5, 7, 12):
        r = await _venda(test_client, h, p, va if n % 2 else vb, cid, _fiado(total, n), preco=total)
        if D(total) / n < D("1.00") and n > 1:
            # D-03: parcela menor que R$ 1,00 e recusada com frase, nada e criado
            assert r.status_code == 400 and "parcela mínima é R$ 1,00" in r.text, (total, n, r.status_code, r.text)
            continue
        assert r.status_code in (200, 201), (n, r.text)
        aceitas += 1
    itens = await _todas(test_client, h, cid)
    por_venda = {}
    for i in itens:
        por_venda.setdefault(i["sale_id"], []).append(i)
    assert len(por_venda) == aceitas and aceitas >= 1
    for sale_id, ps in por_venda.items():
        ps.sort(key=lambda x: x["installment_number"])
        n = len(ps)
        assert sum(D(str(x["amount"])) for x in ps) == D(total), (n, ps)
        base = (D(total) / n).quantize(D("0.01"), rounding="ROUND_DOWN")
        assert all(D(str(x["amount"])) == base for x in ps[:-1])
        assert D(str(ps[-1]["amount"])) - base < D("0.01") * n          # a sobra nunca passa de n-1 centavos
        assert all(D(str(x["amount"])) > 0 for x in ps), ps             # nenhuma parcela zerada (0,05 em 12 = 0,00?)


@pytest.mark.parametrize("intervalo,dias", [(7, 7), (15, 15)])
async def test_intervalos_de_vencimento(test_client, async_session, test_user, intervalo, dias):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    first = date.today() + timedelta(days=2)
    r = await _venda(test_client, h, p, va, cid, _fiado("90.00", 4, first_due_date=first.isoformat(), interval_days=intervalo), preco="90.00")
    assert r.status_code in (200, 201), r.text
    ds = [date.fromisoformat(i["due_date"]) for i in sorted(await _todas(test_client, h, cid), key=lambda x: x["installment_number"])]
    assert ds == [first + timedelta(days=dias * k) for k in range(4)]


async def test_mensal_fim_de_mes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    r = await _venda(test_client, h, p, va, cid, _fiado("60.00", 3, interval_days=30), preco="60.00")   # primeiro = hoje + 1 mês
    assert r.status_code in (200, 201), r.text
    ds = [date.fromisoformat(i["due_date"]) for i in sorted(await _todas(test_client, h, cid), key=lambda x: x["installment_number"])]
    assert ds[0] > date.today() and ds[1] > ds[0] and ds[2] > ds[1]
    assert 27 <= (ds[1] - ds[0]).days <= 31 and 27 <= (ds[2] - ds[1]).days <= 31


async def test_erros_de_criacao_da_venda_no_fiado_sem_500(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    ontem = (date.today() - timedelta(days=1)).isoformat()
    casos = {
        "sem cliente": (None, _fiado("100.00")),
        "13 parcelas": (cid, _fiado("100.00", 13)),
        "0 parcelas": (cid, _fiado("100.00", 0)),
        "intervalo 10": (cid, _fiado("100.00", 2, interval_days=10)),
        "vencimento passado": (cid, _fiado("100.00", 2, first_due_date=ontem)),
        "cliente de outra loja": (999999, _fiado("100.00")),
        "data lixo": (cid, _fiado("100.00", 2, first_due_date="amanhã")),
    }
    for nome, (c, pay) in casos.items():
        r = await _venda(test_client, h, p, va, c, pay)
        assert r.status_code in (400, 404, 422), (nome, r.status_code, r.text)
    # nada foi vendido: estoque de A segue 10 e nenhuma parcela existe
    assert await _todas(test_client, h, cid) == []
    from tests.test_troca import _estoque
    assert await _estoque(async_session, va.id) == 10


async def test_recebimento_parcial_total_e_ordem_das_parcelas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    r = await _venda(test_client, h, p, va, cid, _fiado("100.00", 3), preco="100.00")
    assert r.status_code in (200, 201)
    recebido = D(0)
    for v in ("0.01", "33.32", "0.01", "10.00"):
        r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": v, "payment_method": "pix"})
        assert r.status_code == 200, r.text
        recebido += D(v)
        s = (await _aberto(test_client, h, cid))["summary"]
        assert D(str(s["open_total"])) == D("100.00") - recebido
    its = sorted(await _todas(test_client, h, cid), key=lambda x: x["installment_number"])
    # 43.34 recebidos: 1ª quitada (33.33), 2ª com 10.01 pagos, 3ª intacta
    assert [i["status"] for i in its] == ["paid", "partial", "open"]
    # paga o resto: tudo quitado, e mais um centavo é recusado
    r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "56.66", "payment_method": "cash"})
    assert r.status_code == 200
    assert {i["status"] for i in await _todas(test_client, h, cid)} == {"paid"}
    r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "0.01", "payment_method": "cash"})
    assert r.status_code == 409 and r.json()["detail"]


async def test_receber_de_uma_parcela_especifica_e_excesso(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    await _venda(test_client, h, p, va, cid, _fiado("100.00", 2), preco="100.00")
    its = sorted((await _aberto(test_client, h, cid))["items"], key=lambda x: x["installment_number"])
    r = await test_client.post(f"{API}/receive", headers=h, json={"receivable_id": its[1]["id"], "amount": "50.01", "payment_method": "cash"})
    assert r.status_code == 400 and "passa do que" in r.json()["detail"]
    r = await test_client.post(f"{API}/receive", headers=h, json={"receivable_id": its[1]["id"], "amount": "50.00", "payment_method": "cash"})
    assert r.status_code == 200 and r.json()["receivables"] == [its[1]["id"]]
    assert [i["installment_number"] for i in (await _aberto(test_client, h, cid))["items"]] == [1]


async def test_erros_de_recebimento_sem_500(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    await _venda(test_client, h, p, va, cid, _fiado("100.00", 2), preco="100.00")
    base = {"customer_id": cid, "payment_method": "cash"}
    ruins = [
        {**base, "amount": "0"}, {**base, "amount": "-5"}, {**base, "amount": "abc"}, {**base, "amount": None},
        {**base, "amount": "1e308"}, {**base, "amount": "20000000"}, {"amount": "5", "payment_method": "cash"},
        {**base, "amount": "5", "payment_method": "loyalty_points"}, {**base, "amount": "5", "payment_method": ""},
        {**base, "amount": "5", "received_on": "2999-01-01"}, {**base, "amount": "5", "received_on": "lixo"},
        {"customer_id": 999999, "amount": "5", "payment_method": "cash"},
        {"receivable_id": 999999, "amount": "5", "payment_method": "cash"},
        {"customer_id": "abc", "amount": "5", "payment_method": "cash"},
        {"receivable_id": "abc", "amount": "5", "payment_method": "cash"},
        {"customer_id": [1], "amount": "5", "payment_method": "cash"},
    ]
    quebrou = []
    for corpo in ruins:
        try:
            r = await test_client.post(f"{API}/receive", headers=h, json=corpo)
            if not 400 <= r.status_code < 500:
                quebrou.append((corpo, r.status_code))
        except Exception as e:      # o cliente de teste propaga a exceção que em produção vira 500
            quebrou.append((corpo, f"500 {type(e).__name__}"))
    assert not quebrou, quebrou
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 100.0     # nada mudou
    # desfazer inexistente, e consultar parcela inexistente
    assert (await test_client.delete(f"{API}/payments/999999", headers=h)).status_code == 404
    assert (await test_client.get(f"{API}/999999/payments", headers=h)).status_code in (404, 200)


async def test_receber_o_mesmo_valor_quitando_parcela_e_desfazer_em_ordem_qualquer(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    await _venda(test_client, h, p, va, cid, _fiado("100.00", 2), preco="100.00")
    ids = []
    for v in ("30", "40", "30"):
        r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": v, "payment_method": "pix"})
        assert r.status_code == 200
    its = sorted(await _todas(test_client, h, cid), key=lambda x: x["installment_number"])
    pags = []
    for i in its:
        pags += (await test_client.get(f"{API}/{i['id']}/payments", headers=h)).json()
    assert sum(D(str(x["amount"])) for x in pags) == D("100")
    for pg in pags:           # desfaz tudo em qualquer ordem
        assert (await test_client.delete(f"{API}/payments/{pg['id']}", headers=h)).status_code == 200
    s = (await _aberto(test_client, h, cid))["summary"]
    assert s["open_total"] == 100.0
    # desfazer duas vezes: 404, não estoura
    assert (await test_client.delete(f"{API}/payments/{pags[0]['id']}", headers=h)).status_code == 404


async def test_fiado_antigo_cancelar_desfazer_e_erros(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    hoje = date.today()
    ok = {"customer_id": cid, "amount": "10.00", "due_date": hoje.isoformat()}
    for ruim in ({**ok, "amount": "0"}, {**ok, "amount": "-1"}, {**ok, "amount": "x"}, {**ok, "due_date": "x"},
                 {**ok, "customer_id": 999999}, {**ok, "customer_id": None}, {**ok, "customer_id": "abc"},
                 {"customer_id": cid, "installments": [{"amount": "1", "due_date": hoje.isoformat()}] * 25},
                 {"customer_id": cid, "installments": [{"amount": "1"}]}):
        r = await test_client.post(f"{API}/opening", headers=h, json=ruim)
        assert 400 <= r.status_code < 500, (ruim, r.status_code, r.text[:200])
    assert await _todas(test_client, h, cid) == []
    r = await test_client.post(f"{API}/opening", headers=h, json=ok)
    assert r.status_code == 200
    rid = (await _aberto(test_client, h, cid))["items"][0]["id"]
    # com recebimento: cancelar recusa; desfaz o recebimento; cancela; cancelar de novo e desfazer pagamento de cancelada
    await test_client.post(f"{API}/receive", headers=h, json={"receivable_id": rid, "amount": "4", "payment_method": "cash"})
    assert (await test_client.post(f"{API}/{rid}/cancel", headers=h)).status_code == 409
    pg = (await test_client.get(f"{API}/{rid}/payments", headers=h)).json()[0]
    assert (await test_client.delete(f"{API}/payments/{pg['id']}", headers=h)).status_code == 200
    assert (await test_client.post(f"{API}/{rid}/cancel", headers=h)).status_code == 200
    r = await test_client.post(f"{API}/{rid}/cancel", headers=h)
    assert r.status_code in (200, 400, 409), r.status_code                      # cancelar duas vezes não pode dar 500
    assert (await test_client.post(f"{API}/999999/cancel", headers=h)).status_code == 404
    r = await test_client.post(f"{API}/receive", headers=h, json={"receivable_id": rid, "amount": "1", "payment_method": "cash"})
    assert r.status_code == 409                                                  # cancelada não recebe
    # parcela de venda não cancela por aqui
    await _venda(test_client, h, p, va, cid, _fiado("50.00", 1), preco="50.00")
    sid = (await _aberto(test_client, h, cid))["items"][0]["id"]
    assert (await test_client.post(f"{API}/{sid}/cancel", headers=h)).status_code == 409


async def test_recebimento_por_forma_vai_para_a_conta_certa_e_caixa(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h, payables=[])).status_code == 200
    cid = await _cliente(async_session, t_id)
    await _abrir(test_client, h, "0")
    await _venda(test_client, h, p, va, cid, _fiado("500.00", 5), preco="500.00")
    antes = (await test_client.get("/api/v1/finance/accounts", headers=h)).json()
    base = {n: D(str(_conta(antes, n)["balance"])) for n in ("Gaveta", "Nubank", "Itaú", "Maquininha a receber")}
    mov = {"cash": D("10.01"), "pix": D("20.02"), "bank_transfer": D("30.03"), "debit_card": D("40.04"), "credit_card": D("50.05")}
    for forma, v in mov.items():
        r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": str(v), "payment_method": forma})
        assert r.status_code == 200, (forma, r.text)
    dep = (await test_client.get("/api/v1/finance/accounts", headers=h)).json()
    atual = {n: D(str(_conta(dep, n)["balance"])) for n in base}
    assert atual["Gaveta"] - base["Gaveta"] == D("10.01")
    assert atual["Maquininha a receber"] - base["Maquininha a receber"] == D("90.09")      # débito + crédito
    assert atual["Nubank"] - base["Nubank"] + atual["Itaú"] - base["Itaú"] == D("50.05")   # pix + transferência no banco do PIX
    assert atual["Nubank"] - base["Nubank"] == D("50.05")
    s = (await _atual(test_client, h))["session"]
    assert (s["receivables_cash"], s["expected_amount"]) == (10.01, 10.01)
    # total geral conservado: nada some nem duplica
    assert sum(atual.values()) - sum(base.values()) == sum(mov.values())


async def test_devolucao_parcial_abate_ultimas_parcelas_e_nao_devolve_dinheiro_nao_pago(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h, payables=[])).status_code == 200
    cid = await _cliente(async_session, t_id)
    await _abrir(test_client, h, "0")
    r = await _venda(test_client, h, p, va, cid, _fiado("300.00", 3), qtd=3, preco="100.00")
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    # cliente paga a 1ª parcela (100) e devolve 1 peça: a dívida cai de 200 para 100; nada sai em dinheiro
    await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "100", "payment_method": "cash"})
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={"reason": "Defeito", "refund_method": "cash",
                                                                               "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 100.0
    s = (await _atual(test_client, h))["session"]
    assert s["cash_refunds"] == 0.0 and s["expected_amount"] == 100.0, s
    # devolve as outras 2: abate os 100 em aberto e 100 voltam (o que ela pagou)
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={"reason": "Defeito", "refund_method": "cash",
                                                                               "items": [{"sale_item_id": item_id, "quantity": 2}]})
    assert r.status_code == 201, r.text
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 0
    # loja só devolveu o que recebeu: gaveta = 0 depois (100 entrou, 100 saiu)
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 0.0
    fin = (await test_client.get("/api/v1/finance/accounts", headers=h)).json()
    assert D(str(_conta(fin, "Gaveta")["balance"])) == D("150.00")
    # desfazer o recebimento depois da devolução não pode deixar parcela negativa nem 500
    its = await _todas(test_client, h, cid)
    for i in its:
        for pg in (await test_client.get(f"{API}/{i['id']}/payments", headers=h)).json():
            r = await test_client.delete(f"{API}/payments/{pg['id']}", headers=h)
            assert r.status_code in (200, 409), r.text


async def test_cancelar_venda_com_recebimento_desfeito_e_vencidos_vendedor(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    r = await _venda(test_client, h, p, va, cid, _fiado("100.00", 2), preco="100.00")
    sale_id = r.json()["id"]
    await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "10", "payment_method": "cash"})
    assert (await test_client.post(f"/api/v1/sales/{sale_id}/cancel", headers=h, params={"reason": "Lançada errado"})).status_code == 400
    pg = (await test_client.get(f"{API}/{(await _aberto(test_client, h, cid))['items'][0]['id']}/payments", headers=h)).json()[0]
    await test_client.delete(f"{API}/payments/{pg['id']}", headers=h)
    r = await test_client.post(f"/api/v1/sales/{sale_id}/cancel", headers=h, params={"reason": "Lançada errado"})
    assert r.status_code == 200, r.text
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 0
    from tests.test_troca import _estoque
    assert await _estoque(async_session, va.id) == 10


async def test_cliente_com_varios_fiados_ordem_global_por_vencimento_e_vencidos(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    outro = await _cliente(async_session, t_id, "Outra Cliente")
    hoje = date.today()
    await test_client.post(f"{API}/opening", headers=h, json={"customer_id": cid, "installments": [
        {"amount": "40", "due_date": (hoje - timedelta(days=10)).isoformat()}]})
    await _venda(test_client, h, p, va, cid, _fiado("60.00", 2, first_due_date=(hoje + timedelta(days=1)).isoformat(), interval_days=7), preco="60.00")
    await _venda(test_client, h, p, vb, outro, _fiado("25.00", 1), preco="25.00")
    s = (await _aberto(test_client, h, cid))["summary"]
    assert (s["open_total"], s["overdue_total"]) == (100.0, 40.0)
    # recebe 50: quita os 40 vencidos e 10 da próxima; a outra cliente intacta
    r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "50", "payment_method": "pix"})
    assert r.status_code == 200
    s = (await _aberto(test_client, h, cid))["summary"]
    assert (s["open_total"], s["overdue_total"]) == (50.0, 0.0)
    assert (await _aberto(test_client, h, outro))["summary"]["open_total"] == 25.0
    # recebe da cliente A mais que ela deve, mesmo existindo dívida da B: recusa
    r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "50.01", "payment_method": "pix"})
    assert r.status_code == 400
    ov = (await test_client.get(f"{API}?status=overdue", headers=h)).json()
    assert all(i["overdue"] for i in ov["items"])
    sm = (await test_client.get(f"{API}/summary", headers=h)).json()
    assert sm["open_total"] >= 75.0


async def test_caixa_e_gaveta_contam_o_fiado_pela_mesma_data_do_recebimento(test_client, async_session, test_user):
    """D-04: Caixa e Financeiro usam `received_on`. Recebimento retroativo dentro do turno entra nos dois;
    o de uma data antes do turno nao entra no esperado do caixa (e entra na gaveta, que conta desde a implantacao)."""
    from datetime import datetime
    from sqlalchemy import update
    from app.models.cash_register import CashSession

    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    inicio = (date.today() - timedelta(days=10)).isoformat()
    assert (await _implantar(test_client, h, payables=[], start_date=inicio)).status_code == 200
    cid = await _cliente(async_session, t_id)
    await _abrir(test_client, h, "0")
    await _venda(test_client, h, p, va, cid, _fiado("500.00", 5), preco="500.00")
    # o turno comecou ha 3 dias
    await async_session.execute(update(CashSession).where(CashSession.tenant_id == t_id, CashSession.status == "open")
                                .values(opened_at=datetime.utcnow() - timedelta(days=3)))
    await async_session.commit()
    antes = D(str(_conta((await test_client.get("/api/v1/finance/accounts", headers=h)).json(), "Gaveta")["balance"]))
    exp0 = D(str((await _atual(test_client, h))["session"]["expected_amount"]))

    ontem = (date.today() - timedelta(days=1)).isoformat()
    r = await test_client.post(f"{API}/receive", headers=h, json={
        "customer_id": cid, "amount": "100", "payment_method": "cash", "received_on": ontem})
    assert r.status_code == 200, r.text
    d1 = D(str(_conta((await test_client.get("/api/v1/finance/accounts", headers=h)).json(), "Gaveta")["balance"])) - antes
    e1 = D(str((await _atual(test_client, h))["session"]["expected_amount"])) - exp0
    assert d1 == e1 == D("100.00"), (d1, e1)

    # antes de o turno abrir (ha 6 dias): a gaveta conta (a implantacao e anterior), o esperado do turno nao
    antigo = (date.today() - timedelta(days=6)).isoformat()
    r = await test_client.post(f"{API}/receive", headers=h, json={
        "customer_id": cid, "amount": "50", "payment_method": "cash", "received_on": antigo})
    assert r.status_code == 200, r.text
    d2 = D(str(_conta((await test_client.get("/api/v1/finance/accounts", headers=h)).json(), "Gaveta")["balance"])) - antes
    e2 = D(str((await _atual(test_client, h))["session"]["expected_amount"])) - exp0
    assert d2 == D("150.00") and e2 == D("100.00"), (d2, e2)
