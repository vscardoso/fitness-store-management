"""Fase 2 (retiradas de sócio, empréstimos, fatura do cartão: mexem na conta e NÃO entram no resultado do mês) e
fase 3 (Fechamento do mês: começo + entrou - saiu = deveria ter; contado - deveria ter = quebra; fotografia e ajuste)."""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import update

from app.core.security import create_access_token, get_password_hash
from tests.test_financeiro import _conta, _implantar, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _vender

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"

HOJE = date.today()
MES_PASSADO_FIM = HOJE.replace(day=1) - timedelta(days=1)
MES_PASSADO = MES_PASSADO_FIM.replace(day=1)
Y, M = MES_PASSADO.year, MES_PASSADO.month


async def _token(db, t_id, papel):
    from app.models.user import User
    u = User(email=f"fech.{papel.value}.{t_id}.{datetime.utcnow().timestamp()}@example.com", full_name="Pessoa",
             hashed_password=get_password_hash("Senha1234"), role=papel, is_active=True, tenant_id=t_id)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


async def _resultado_despesas(client, h):
    r = await client.get(f"/api/v1/expenses/resultado-mes?year={HOJE.year}&month={HOJE.month}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()["total_expenses"]


async def test_retirada_emprestimo_e_fatura_mexem_na_conta_e_nao_sao_despesa(test_client, async_session, test_user):
    from app.models.user import UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    d = (await _implantar(test_client, h, payables=[])).json()
    gaveta, nu = _conta(d, "Gaveta")["id"], _conta(d, "Nubank")["id"]
    despesas_antes = await _resultado_despesas(test_client, h)

    async def lancar(**body):
        return await test_client.post(f"{API}/entries", headers=h, json=body)

    r = await lancar(kind="owner_withdrawal", account_id=nu, amount="400", person="Sócia Ana")
    assert r.status_code == 200, r.text
    assert r.json()["direction"] == "out" and r.json()["kind_label"] == "Retirada de sócio"
    assert (await lancar(kind="card_bill", account_id=nu, amount="250,50", description="Fatura outubro")).status_code == 200
    assert (await lancar(kind="owner_contribution", account_id=gaveta, amount="50", person="Sócia Ana")).status_code == 200
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    n = _conta(d, "Nubank")
    assert n["balance"] == 1000.0 - 400 - 250.5 and n["breakdown"]["other_out"] == 650.5
    assert _conta(d, "Gaveta")["balance"] == 200.0 and _conta(d, "Gaveta")["breakdown"]["other_in"] == 50.0
    # não é gasto da loja: o resultado do mês não muda
    assert await _resultado_despesas(test_client, h) == despesas_antes

    # empréstimo: o recebido de volta nunca passa do que a pessoa deve (nome sem acento/caixa é a mesma pessoa)
    assert (await lancar(kind="loan_given", account_id=gaveta, amount="200", person="Maria José")).status_code == 200
    r = await lancar(kind="loan_repaid", account_id=gaveta, amount="250", person="maria jose")
    assert r.status_code == 400 and "200,00" in r.json()["detail"]
    assert (await lancar(kind="loan_repaid", account_id=gaveta, amount="150", person="MARIA JOSÉ")).status_code == 200
    r = await lancar(kind="loan_repaid", account_id=gaveta, amount="100", person="Outra Pessoa")
    assert r.status_code == 400
    assert (await lancar(kind="loan_taken", account_id=nu, amount="1000", person="Banco X")).status_code == 200
    assert (await lancar(kind="loan_paid", account_id=nu, amount="300", person="Banco X")).status_code == 200
    lo = (await test_client.get(f"{API}/loans", headers=h)).json()
    assert lo["to_receive_total"] == 50.0 and lo["to_pay_total"] == 700.0
    maria = next(x for x in lo["people"] if x["person"] == "Maria José")
    assert maria["given"] == 200.0 and maria["repaid"] == 150.0 and maria["to_receive"] == 50.0

    # recusas: tipo inválido, sem pessoa, sem descrição, valor zero, data futura, antes da implantação, conta inexistente
    for body, code, trecho in (
        ({"kind": "closing_adjustment", "account_id": nu, "amount": 1}, 400, "tipo"),
        ({"kind": "expense", "account_id": nu, "amount": 1}, 400, "tipo"),
        ({"kind": "loan_given", "account_id": nu, "amount": 1}, 400, "empréstimo"),
        ({"kind": "owner_withdrawal", "account_id": nu, "amount": 1}, 400, "sócio"),
        ({"kind": "other_out", "account_id": nu, "amount": 1}, 400, "o que foi"),
        ({"kind": "other_out", "account_id": nu, "amount": 0, "description": "x"}, 400, "maior que zero"),
        ({"kind": "other_out", "account_id": nu, "amount": -5, "description": "x"}, 400, "negativo"),
        ({"kind": "other_out", "account_id": nu, "amount": 1, "description": "x", "occurred_on": "2999-01-01"}, 400, "futuro"),
        ({"kind": "other_out", "account_id": nu, "amount": 1, "description": "x", "occurred_on": "2001-01-01"}, 400, "implantação"),
        ({"kind": "other_out", "account_id": 999999, "amount": 1, "description": "x"}, 404, "não encontrada"),
        ({"kind": "other_out", "account_id": "abc", "amount": 1, "description": "x"}, 400, "conta"),
    ):
        r = await lancar(**body)
        assert r.status_code == code and trecho in r.json()["detail"], (body, r.text)

    # apagar: volta o saldo; empréstimo com pagamento não se apaga antes do pagamento
    itens = (await test_client.get(f"{API}/entries", headers=h)).json()
    dado = next(x for x in itens if x["kind"] == "loan_given")
    r = await test_client.delete(f"{API}/entries/{dado['id']}", headers=h)
    assert r.status_code == 409 and "pagamento" in r.json()["detail"]
    fatura = next(x for x in itens if x["kind"] == "card_bill")
    assert (await test_client.delete(f"{API}/entries/{fatura['id']}", headers=h)).status_code == 200
    assert (await test_client.delete(f"{API}/entries/{fatura['id']}", headers=h)).status_code == 404
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Nubank")["balance"] == 1000.0 - 400 + 1000 - 300

    # papéis: vendedor e caixa não veem nem lançam; gerente sim
    vendedor, caixa, gerente = (await _token(async_session, t_id, UserRole.SELLER),
                                await _token(async_session, t_id, UserRole.CASHIER),
                                await _token(async_session, t_id, UserRole.MANAGER))
    for hh in (vendedor, caixa):
        assert (await test_client.get(f"{API}/entries", headers=hh)).status_code == 403
        assert (await test_client.post(f"{API}/entries", headers=hh, json={"kind": "owner_withdrawal", "account_id": nu,
                                                                         "amount": 1, "person": "X"})).status_code == 403
        assert (await test_client.get(f"{API}/loans", headers=hh)).status_code == 403
        assert (await test_client.get(f"{API}/closings", headers=hh)).status_code == 403
    assert (await test_client.post(f"{API}/entries", headers=gerente, json={"kind": "owner_withdrawal", "account_id": nu,
                                                                          "amount": 1, "person": "X"})).status_code == 200


async def _venda_em(client, db, h, p, v, dia: date, valor="100.00"):
    from app.models.sale import Payment, Sale
    sale_id, _item = await _vender(client, h, p, v, 1, valor)
    quando = datetime(dia.year, dia.month, dia.day, 15, 0)   # 12h no Brasil
    await db.execute(update(Payment).where(Payment.sale_id == sale_id).values(created_at=quando))
    await db.execute(update(Sale).where(Sale.id == sale_id).values(created_at=quando))
    await db.commit()
    return sale_id


async def test_fechamento_do_mes_confere_fecha_ajusta_e_reabre(test_client, async_session, test_user):
    from app.models.user import UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    d = (await _implantar(test_client, h, start_date=MES_PASSADO.isoformat(), payables=[])).json()
    gaveta, maq, nu, itau = (_conta(d, n)["id"] for n in ("Gaveta", "Maquininha a receber", "Nubank", "Itaú"))
    dia10 = MES_PASSADO.replace(day=10)
    await _venda_em(test_client, async_session, h, p, va, dia10)                       # +100 gaveta
    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "30", "description": "Café", "expense_date": MES_PASSADO.replace(day=15).isoformat(), "account_id": gaveta})
    assert r.status_code in (200, 201), r.text                                            # -30 gaveta
    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "12", "description": "Sem conta", "expense_date": MES_PASSADO.replace(day=16).isoformat()})
    assert r.status_code in (200, 201), r.text                                            # não sai de conta nenhuma
    r = await test_client.post(f"{API}/entries", headers=h, json={
        "kind": "owner_withdrawal", "account_id": nu, "amount": "100", "person": "Sócia",
        "occurred_on": MES_PASSADO.replace(day=20).isoformat()})
    assert r.status_code == 200, r.text                                                   # -100 Nubank
    r = await test_client.post(f"{API}/transfers", headers=h, json={
        "from_account_id": maq, "to_account_id": nu, "amount": "300", "occurred_on": MES_PASSADO.replace(day=21).isoformat()})
    assert r.status_code == 200, r.text                                                   # entre contas: total igual

    lista = (await test_client.get(f"{API}/closings", headers=h)).json()
    assert lista["started"] and [(x["year"], x["month"]) for x in lista["months"]][-1] == (Y, M)
    f = (await test_client.get(f"{API}/closings/{Y}/{M}", headers=h)).json()
    assert f["closed"] is None and f["month_finished"] is True
    assert f["start_total"] == 1400.0
    assert f["entered"]["sales"] == [{"label": "Dinheiro", "method": "cash", "amount": 100.0}]
    assert f["left"]["expenses"] == [{"label": "Sem categoria", "amount": 30.0}]
    assert f["left"]["other"] == [{"kind": "owner_withdrawal", "label": "Retirada de sócio", "amount": 100.0}]
    assert f["left"]["expenses_without_account"] == {"count": 1, "amount": 12.0}
    assert f["expected_total"] == 1400.0 + 100 - 30 - 100 and f["check_ok"] is True
    acc = {a["name"]: a for a in f["accounts"]}
    assert acc["Gaveta"]["expected"] == 220.0 and acc["Nubank"]["expected"] == 1200.0 and acc["Maquininha a receber"]["expected"] == 0.0
    assert f["stock"]["pieces"] == 19 and f["stock"]["cost_value"] == 19 * 40.0 and f["result"]["revenue"] == 100.0 and f["result"]["expenses"] == 42.0

    contado = {str(gaveta): "200", str(maq): "0", str(nu): "1200", str(itau): "-50"}
    # recusas antes de fechar
    for body, code, trecho in (
        ({"counted": {str(gaveta): "200"}}, 400, "Informe quanto tem"),
        ({"counted": {**contado, "999999": "1"}}, 400, "não existe"),
        ({"counted": {**contado, str(gaveta): "100"}}, 400, "observação"),            # quebra de 120 sem explicar
        ({"counted": {**contado, str(gaveta): "-1"}}, 400, "negativo"),               # gaveta não fica negativa
        ({"counted": "x"}, 400, "Informe"),
    ):
        r = await test_client.post(f"{API}/closings/{Y}/{M}", headers=h, json=body)
        assert r.status_code == code and trecho in r.json()["detail"], (body, r.text)
    r = await test_client.post(f"{API}/closings/{HOJE.year}/{HOJE.month}", headers=h, json={"counted": contado})
    assert r.status_code == 400 and "não terminou" in r.json()["detail"]
    antes = MES_PASSADO - timedelta(days=1)
    r = await test_client.get(f"{API}/closings/{antes.year}/{antes.month}", headers=h)
    assert r.status_code == 400 and "antes da implantação" in r.json()["detail"]
    fut = HOJE.replace(day=28) + timedelta(days=10)
    assert (await test_client.get(f"{API}/closings/{fut.year}/{fut.month}", headers=h)).status_code == 400
    assert (await test_client.get(f"{API}/closings/{Y}/13", headers=h)).status_code == 400

    # fechar com quebra de 20 na gaveta
    r = await test_client.post(f"{API}/closings/{Y}/{M}", headers=h, json={"counted": contado, "notes": "faltou troco"})
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["closed"]["difference"] == -20.0 and c["closed"]["counted_total"] == 1350.0 and c["closed"]["notes"] == "faltou troco"
    assert c["closed"]["changed_since_close"] == 0.0 and c["closed"]["is_latest"] is True
    assert {a["name"]: a["difference"] for a in c["accounts"]}["Gaveta"] == -20.0
    # o contado virou o saldo: gaveta 200 agora e no começo do mês seguinte
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Gaveta")["balance"] == 200.0 and _conta(d, "Gaveta")["breakdown"]["closing_adjustments"] == -20.0
    atual = (await test_client.get(f"{API}/closings/{HOJE.year}/{HOJE.month}", headers=h)).json()
    assert {a["name"]: a["start"] for a in atual["accounts"]}["Gaveta"] == 200.0
    assert (await test_client.get(f"{API}/closings", headers=h)).json()["months"][-1]["closed"] is True

    # mês fechado: não fecha de novo, não recebe lançamento, transferência nem pagamento; ajuste não se apaga
    assert (await test_client.post(f"{API}/closings/{Y}/{M}", headers=h, json={"counted": contado})).status_code == 409
    for rota, body in ((f"{API}/entries", {"kind": "owner_withdrawal", "account_id": nu, "amount": 1, "person": "S",
                                           "occurred_on": dia10.isoformat()}),
                       (f"{API}/transfers", {"from_account_id": gaveta, "to_account_id": nu, "amount": 1,
                                             "occurred_on": dia10.isoformat()})):
        r = await test_client.post(rota, headers=h, json=body)
        assert r.status_code == 409 and "já foi fechado" in r.json()["detail"], (rota, r.text)
    retirada = next(x for x in (await test_client.get(f"{API}/entries", headers=h)).json() if x["kind"] == "owner_withdrawal")
    assert (await test_client.delete(f"{API}/entries/{retirada['id']}", headers=h)).status_code == 409
    ajuste = next(x for x in (await test_client.get(f"{API}/entries", headers=h)).json() if x["kind"] == "closing_adjustment")
    r = await test_client.delete(f"{API}/entries/{ajuste['id']}", headers=h)
    assert r.status_code == 409 and "reabra" in r.json()["detail"]
    t = next(x for x in (await test_client.get(f"{API}/transfers", headers=h)).json() if x["amount"] == 300.0)
    assert (await test_client.delete(f"{API}/transfers/{t['id']}", headers=h)).status_code == 409

    # venda lançada depois, com data do mês fechado: aparece como mudança, a fotografia não muda
    await _venda_em(test_client, async_session, h, p, va, dia10, "50.00")
    c = (await test_client.get(f"{API}/closings/{Y}/{M}", headers=h)).json()
    assert c["closed"]["changed_since_close"] == 50.0 and c["expected_total"] == 1370.0

    # reabrir: só admin; desfaz os ajustes
    gerente = await _token(async_session, t_id, UserRole.MANAGER)
    assert (await test_client.get(f"{API}/closings/{Y}/{M}", headers=gerente)).status_code == 200
    assert (await test_client.post(f"{API}/closings/{Y}/{M}/reopen", headers=gerente)).status_code == 403
    r = await test_client.post(f"{API}/closings/{Y}/{M}/reopen", headers=h)
    assert r.status_code == 200 and r.json()["closed"] is None and r.json()["expected_total"] == 1420.0
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Gaveta")["balance"] == 270.0 and _conta(d, "Gaveta")["breakdown"]["closing_adjustments"] == 0.0
    assert (await test_client.post(f"{API}/closings/{Y}/{M}/reopen", headers=h)).status_code == 404
    # sem quebra: fecha sem observação e não grava ajuste
    contado[str(gaveta)] = "270"
    r = await test_client.post(f"{API}/closings/{Y}/{M}", headers=gerente, json={"counted": contado})
    assert r.status_code == 200 and r.json()["closed"]["difference"] == 0.0
    assert not [x for x in (await test_client.get(f"{API}/entries", headers=h)).json() if x["kind"] == "closing_adjustment"]


async def test_fechamento_sem_implantacao_e_reabrir_so_o_ultimo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await test_client.get(f"{API}/closings", headers=h)).json() == {"started": False, "months": []}
    r = await test_client.get(f"{API}/closings/{Y}/{M}", headers=h)
    assert r.status_code == 409 and "Implante" in r.json()["detail"]
    assert (await test_client.post(f"{API}/entries", headers=h, json={"kind": "owner_withdrawal", "account_id": 1,
                                                                    "amount": 1, "person": "X"})).status_code == 409
    # dois meses: fechar o mais antigo depois do mais novo é recusado; reabrir o antigo também
    inicio = (MES_PASSADO - timedelta(days=1)).replace(day=1)
    d = (await _implantar(test_client, h, start_date=inicio.isoformat(), payables=[])).json()
    contado = {str(a["id"]): str(a["balance"]) for a in d["accounts"]}
    r = await test_client.post(f"{API}/closings/{Y}/{M}", headers=h, json={"counted": contado})
    assert r.status_code == 200, r.text
    r = await test_client.post(f"{API}/closings/{inicio.year}/{inicio.month}", headers=h, json={"counted": contado})
    assert r.status_code == 409 and "depois deste" in r.json()["detail"]
    assert (await test_client.post(f"{API}/closings/{Y}/{M}/reopen", headers=h)).status_code == 200
    r = await test_client.post(f"{API}/closings/{inicio.year}/{inicio.month}", headers=h, json={"counted": contado})
    assert r.status_code == 200
    r = await test_client.post(f"{API}/closings/{Y}/{M}", headers=h, json={"counted": contado})
    assert r.status_code == 200
    r = await test_client.post(f"{API}/closings/{inicio.year}/{inicio.month}/reopen", headers=h)
    assert r.status_code == 409 and "último mês" in r.json()["detail"]
    meses = (await test_client.get(f"{API}/closings", headers=h)).json()["months"]
    assert [m["closed"] for m in meses][-2:] == [True, True]
