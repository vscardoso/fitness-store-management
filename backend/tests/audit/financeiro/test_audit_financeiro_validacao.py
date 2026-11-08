"""Validacao dos consertos: despesa com conta x mes fechado, ids invalidos, setup com lixo, transferencia x saldo."""
from datetime import date, timedelta

import pytest

from tests.test_financeiro import _conta, _implantar, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"
EXP = "/api/v1/expenses"
HOJE = date.today()
MP = (HOJE.replace(day=1) - timedelta(days=1)).replace(day=1)
DIA = MP.replace(day=10).isoformat()
DIA2 = MP.replace(day=12).isoformat()


async def _fechado(c, db, test_user):
    t_id, h, p, va, vb = await _cenario(db, test_user)
    await _zerar_implantacao(db, t_id)
    d = (await _implantar(c, h, start_date=MP.isoformat(), payables=[])).json()
    return h, d


async def _fechar(c, h):
    cont = {str(a["id"]): str(a["balance"]) for a in (await c.get(f"{API}/accounts", headers=h)).json()["accounts"]}
    r = await c.post(f"{API}/closings/{MP.year}/{MP.month}", headers=h, json={"counted": cont})
    assert r.status_code == 200, r.text


async def test_despesa_com_conta_mes_fechado_criar_editar_apagar_mover(test_client, async_session, test_user):
    c = test_client
    h, d = await _fechado(c, async_session, test_user)
    g = _conta(d, "Gaveta")["id"]
    e1 = (await c.post(EXP, headers=h, json={"amount": "5", "description": "A", "expense_date": DIA, "account_id": g})).json()["id"]
    e_hoje = (await c.post(EXP, headers=h, json={"amount": "7", "description": "B", "expense_date": HOJE.isoformat(), "account_id": g})).json()["id"]
    e_sem = (await c.post(EXP, headers=h, json={"amount": "3", "description": "Sem conta", "expense_date": DIA})).json()["id"]
    await _fechar(c, h)
    r = await c.post(EXP, headers=h, json={"amount": "5", "description": "X", "expense_date": DIA, "account_id": g})
    assert r.status_code == 409 and "fechado" in r.text
    assert (await c.put(f"{EXP}/{e1}", headers=h, json={"amount": "50"})).status_code == 409
    assert (await c.delete(f"{EXP}/{e1}", headers=h)).status_code == 409
    assert (await c.put(f"{EXP}/{e_hoje}", headers=h, json={"expense_date": DIA2})).status_code == 409      # para dentro
    assert (await c.put(f"{EXP}/{e1}", headers=h, json={"expense_date": HOJE.isoformat()})).status_code == 409  # para fora
    assert (await c.put(f"{EXP}/{e_sem}", headers=h, json={"account_id": g})).status_code == 409             # ganha conta
    assert (await c.put(f"{EXP}/{e_hoje}", headers=h, json={"amount": "8"})).status_code == 200
    # D-06
    f0 = (await c.get(f"{API}/closings/{MP.year}/{MP.month}", headers=h)).json()
    assert f0["closed"]["expenses_without_account_changed"] is False
    r = await c.post(EXP, headers=h, json={"amount": "9", "description": "Sem conta 2", "expense_date": DIA})
    assert r.status_code in (200, 201), r.text
    f1 = (await c.get(f"{API}/closings/{MP.year}/{MP.month}", headers=h)).json()
    assert f1["closed"]["expenses_without_account_changed"] is True
    assert (await c.put(f"{EXP}/{e_sem}", headers=h, json={"amount": "4"})).status_code == 200
    assert (await c.delete(f"{EXP}/{e_sem}", headers=h)).status_code in (200, 204)
    # reabrir e lancar
    assert (await c.post(f"{API}/closings/{MP.year}/{MP.month}/reopen", headers=h)).status_code == 200
    r = await c.post(EXP, headers=h, json={"amount": "5", "description": "Y", "expense_date": DIA, "account_id": g})
    assert r.status_code in (200, 201), r.text
    assert (await c.put(f"{EXP}/{e1}", headers=h, json={"amount": "6"})).status_code == 200


async def test_despesa_recorrente_lote_e_conta_paga_em_mes_fechado(test_client, async_session, test_user):
    from sqlalchemy import select
    from app.models.expense import Expense
    c = test_client
    h, d = await _fechado(c, async_session, test_user)
    g, n = _conta(d, "Gaveta")["id"], _conta(d, "Nubank")["id"]
    pid = (await c.post(f"{API}/payables", headers=h, json={"description": "Aluguel", "amount": 100, "due_date": DIA, "counts_as_expense": True})).json()["id"]
    assert (await c.post(f"{API}/payables/{pid}/pay", headers=h, json={"account_id": n, "paid_on": DIA})).status_code == 200
    rec = await c.post(EXP, headers=h, json={"amount": "20", "description": "Rec", "expense_date": DIA, "account_id": g,
                                             "is_recurring": True, "recurrence_day": 10})
    assert rec.status_code in (200, 201), rec.text
    await _fechar(c, h)
    r = await c.post(EXP, headers=h, json={"amount": "20", "description": "Rec2", "expense_date": DIA, "account_id": g,
                                           "is_recurring": True, "recurrence_day": 10})
    assert r.status_code == 409, r.text
    assert (await c.put(f"{EXP}/{rec.json()['id']}", headers=h, json={"amount": "21"})).status_code == 409
    ex = (await async_session.execute(select(Expense).where(Expense.payable_id == pid, Expense.is_active == True))).scalars().one()  # noqa: E712
    assert (await c.delete(f"{EXP}/{ex.id}", headers=h)).status_code in (400, 409)
    assert (await c.put(f"{EXP}/{ex.id}", headers=h, json={"expense_date": HOJE.isoformat()})).status_code in (400, 409)
    assert (await c.post(f"{API}/payables/{pid}/unpay", headers=h)).status_code == 409
    r = await c.post(EXP, headers=h, json={"amount": "5", "description": "Lote", "expense_date": DIA, "account_id": g, "stock_entry_id": 999999})
    assert r.status_code in (400, 404, 409), r.text
    assert (await c.post(f"{API}/closings/{MP.year}/{MP.month}/reopen", headers=h)).status_code == 200
    assert (await c.post(f"{API}/payables/{pid}/unpay", headers=h)).status_code == 200


async def test_ids_invalidos_e_setup_com_lixo_dao_400(test_client, async_session, test_user):
    c = test_client
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    for extra in ({"cash_balance": "NaN"}, {"banks": [1]}, {"banks": [None]}, {"card_balance": "-Infinity"},
                  {"payables": [5]}, {"payables": [{"description": "a", "amount": 5, "due_date": "2026-12-01", "supplier_id": "abc"}]}):
        r = await _implantar(c, h, **extra)
        assert r.status_code == 400, (extra, r.status_code, r.text[:120])
    d = (await _implantar(c, h, payables=[])).json()
    g, n = _conta(d, "Gaveta")["id"], _conta(d, "Nubank")["id"]
    pid = (await c.post(f"{API}/payables", headers=h, json={"description": "ok", "amount": 5, "due_date": "2026-12-01"})).json()["id"]
    for ruim in ("abc", [], {}, True, -1, 0, 99999999999, "1e3", "  "):
        r = await c.post(f"{API}/transfers", headers=h, json={"from_account_id": ruim, "to_account_id": n, "amount": 1})
        assert r.status_code in (400, 404), ("transf", ruim, r.status_code)
        r = await c.post(f"{API}/transfers", headers=h, json={"from_account_id": g, "to_account_id": ruim, "amount": 1})
        assert r.status_code in (400, 404), ("transf2", ruim, r.status_code)
        if ruim:   # valor vazio ("", [], {}, 0) em to_account_id = "usar o banco do PIX" (padrao, por desenho)
            r = await c.post(f"{API}/card-settlement", headers=h, json={"gross": 10, "received": 10, "to_account_id": ruim})
            assert r.status_code in (400, 404), ("repasse", ruim, r.status_code)
        r = await c.post(f"{API}/payables/{pid}/pay", headers=h, json={"account_id": ruim})
        assert r.status_code in (400, 404), ("pagar", ruim, r.status_code)
        r = await c.post(f"{API}/entries", headers=h, json={"kind": "other_out", "account_id": ruim, "amount": 1, "description": "x"})
        assert r.status_code in (400, 404), ("entrada", ruim, r.status_code)
    r = await c.post(f"{API}/transfers", headers=h, json={"from_account_id": str(g), "to_account_id": str(n), "amount": 1})
    assert r.status_code == 200


async def test_transferencia_x_saldo_bordas(test_client, async_session, test_user):
    c = test_client
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    d = (await _implantar(c, h, payables=[])).json()       # gaveta 150, maquininha 300, nubank 1000, itau -50
    g, m, n, i = (_conta(d, x)["id"] for x in ("Gaveta", "Maquininha a receber", "Nubank", "Itaú"))

    async def tr(a, b, v):
        return await c.post(f"{API}/transfers", headers=h, json={"from_account_id": a, "to_account_id": b, "amount": v})

    r = await tr(g, n, "150.01")
    assert r.status_code == 400 and "só tem R$ 150,00" in r.json()["detail"], r.text
    r = await tr(g, n, "150.00")
    assert r.status_code == 200 and "warning" not in r.json()
    assert _conta(r.json(), "Gaveta")["balance"] == 0.0
    r = await tr(g, n, "0.01")
    assert r.status_code == 400 and "R$ 0,00" in r.json()["detail"]
    assert (await tr(n, g, "0.01")).status_code == 200
    r = await tr(m, n, "300.01")
    assert r.status_code == 400 and "R$ 300,00" in r.json()["detail"]
    assert (await tr(m, n, "300.00")).status_code == 200
    assert (await tr(m, n, "0.01")).status_code == 400
    r = await tr(i, n, "10")
    assert r.status_code == 200 and "negativa" in r.json().get("warning", "")
    d = (await c.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Itaú")["balance"] == -60.0
    assert len((await c.get(f"{API}/transfers", headers=h)).json()) == 4
