"""Tela de Despesas: resumo do período calculado no servidor (não soma página de lista no app), quem lançou e pedido de
aprovação pendente na despesa. A prova do resumo é uma conta feita à parte, em Python, sobre a lista de despesas."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from tests.test_financeiro_aprovacao import MOTIVO, _aprovar_todos, _loja  # noqa: F401  (fixture autouse dos administradores)
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
D = Decimal


async def _cat(client, h, nome):
    cats = (await client.get("/api/v1/expenses/categories", headers=h)).json()
    return next(c["id"] for c in cats if c["name"] == nome)


async def test_resumo_do_periodo_bate_com_a_conta_feita_a_parte(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    from app.models.stock_entry import StockEntry
    entry_id = (await async_session.execute(select(StockEntry.id).where(StockEntry.tenant_id == t_id).order_by(StockEntry.id.desc()))).scalars().first()
    hoje = date.today()
    aluguel, outros = await _cat(test_client, h, "Aluguel"), await _cat(test_client, h, "Outros")
    antes = (await test_client.get("/api/v1/expenses/summary", headers=h)).json()

    def mk(desc, valor, cat=None, **extra):
        return test_client.post("/api/v1/expenses", headers=h, json={
            "amount": valor, "description": desc, "expense_date": hoje.isoformat(), "category_id": cat, **extra})
    for r in (await mk("Aluguel", "2800.50", aluguel), await mk("Café", "31.90", outros), await mk("Sem categoria", "10.10"),
              await mk("Frete do lote", "120.00", outros, stock_entry_id=entry_id)):
        assert r.status_code in (200, 201), r.text
    # fora do período (mês passado): não entra
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "999", "description": "Antigo", "expense_date": (hoje.replace(day=1) - timedelta(days=3)).isoformat()})
    assert r.status_code in (200, 201), r.text

    s = (await test_client.get("/api/v1/expenses/summary", headers=h)).json()
    # conta à parte sobre a lista do mês
    lista = (await test_client.get("/api/v1/expenses", headers=h, params={"limit": 500})).json()
    loja = [e for e in lista if not e["stock_entry_id"]]
    lote = [e for e in lista if e["stock_entry_id"]]
    assert D(str(s["store_total"])) == sum((D(str(e["amount"])) for e in loja), D("0"))
    assert s["store_count"] == len(loja) and s["lot_count"] == len(lote)
    assert D(str(s["lot_total"])) == sum((D(str(e["amount"])) for e in lote), D("0"))
    assert D(str(s["store_total"])) - D(str(antes["store_total"])) == D("2842.50") and s["lot_count"] - antes["lot_count"] == 1
    # a quebra por categoria soma o total da loja, com "Sem categoria"
    assert sum((D(str(c["total"])) for c in s["by_category"]), D("0")) == D(str(s["store_total"]))
    assert sum(c["count"] for c in s["by_category"]) == s["store_count"]
    assert any(c["name"] == "Sem categoria" and c["category_id"] is None for c in s["by_category"])
    # o mesmo número do Resultado do Mês (fonte única do gasto da loja)
    res = (await test_client.get("/api/v1/expenses/resultado-mes", headers=h)).json()
    assert D(str(res["total_expenses"])) == D(str(s["store_total"]))
    assert (await test_client.get("/api/v1/expenses/summary", headers=h, params={"start_date": "2026-12-01", "end_date": "2026-11-01"})).status_code == 422


async def test_despesa_guarda_quem_lancou(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "12.00", "description": "Cola", "expense_date": date.today().isoformat()})
    assert r.status_code in (200, 201), r.text
    eid = r.json()["id"]
    d = (await test_client.get(f"/api/v1/expenses/{eid}", headers=h)).json()
    assert d["created_by_name"] and d["pending_approval"] is None


async def test_despesa_mostra_o_pedido_de_aprovacao_em_andamento(test_client, async_session, test_user):
    t_id, h, p, va, ids, heads, admins = await _loja(test_client, async_session, test_user)
    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "40", "description": "Material do banco", "expense_date": date.today().isoformat(), "account_id": ids["Nubank"]})
    eid = r.json()["id"]
    limpa = (await test_client.get(f"/api/v1/expenses/{eid}", headers=h)).json()
    assert limpa["pending_approval"] is None
    r = await test_client.delete(f"/api/v1/expenses/{eid}", headers=h, params={"reason": MOTIVO})
    assert r.status_code == 202, r.text
    d = (await test_client.get(f"/api/v1/expenses/{eid}", headers=h)).json()
    pa = d["pending_approval"]
    assert pa and pa["kind"] == "delete" and pa["id"] == r.json()["approval"]["id"] and pa["required_count"] >= 2
    lista = {e["id"]: e for e in (await test_client.get("/api/v1/expenses", headers=h, params={"limit": 500})).json()}
    assert lista[eid]["pending_approval"]["kind"] == "delete"
    # pedido de mudança de valor também aparece, como 'update'
    r2 = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "30", "description": "Outro do banco", "expense_date": date.today().isoformat(), "account_id": ids["Nubank"]})
    eid2 = r2.json()["id"]
    r = await test_client.put(f"/api/v1/expenses/{eid2}", headers=h, params={"reason": MOTIVO}, json={"amount": "35"})
    assert r.status_code == 202, r.text
    assert (await test_client.get(f"/api/v1/expenses/{eid2}", headers=h)).json()["pending_approval"]["kind"] == "update"
    # aprovado e aplicado: some o aviso
    await _aprovar_todos(test_client, heads, r.json()["approval"]["id"])
    assert (await test_client.get(f"/api/v1/expenses/{eid2}", headers=h)).json()["pending_approval"] is None
