"""Financeiro: implantação da loja em andamento (tudo ou nada), saldo de cada conta calculado na hora, transferências,
contas a pagar, despesa paga por uma conta, papéis e isolamento entre lojas."""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.core.security import create_access_token, get_password_hash
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse: limpa a loja 1 depois de cada teste)
from tests.test_troca import _cenario, _vender

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"


async def _zerar_implantacao(db, t_id):
    """A loja 1 é reaproveitada entre testes: começa sempre sem financeiro implantado."""
    from app.models.store import Store
    await db.execute(update(Store).where(Store.id == t_id).values(finance_start_date=None))
    await db.commit()


async def _implantar(client, h, **extra):
    body = {"start_date": date.today().isoformat(), "cash_balance": "150.00", "card_balance": "300.00",
            "banks": [{"name": "Nubank", "balance": "1000.00", "receives_pix": True}, {"name": "Itaú", "balance": "-50.00"}],
            "payables": [{"description": "Boleto fornecedor Brás", "amount": "800.00", "due_date": (date.today() + timedelta(days=5)).isoformat()},
                         {"description": "Aluguel", "amount": "1200.00", "due_date": (date.today() - timedelta(days=2)).isoformat()}]}
    body.update(extra)
    return await client.post(f"{API}/setup", headers=h, json=body)


def _conta(d, nome):
    return next(a for a in d["accounts"] if a["name"] == nome)


async def _pagar_com(client, h, p, v, metodo, valor):
    r = await client.post("/api/v1/sales/", headers=h, json={
        "payment_method": metodo, "items": [{"product_id": p.id, "variant_id": v.id, "quantity": 1, "unit_price": valor}],
        "payments": [{"amount": valor, "payment_method": metodo}]})
    assert r.status_code in (200, 201), r.text
    return r.json()


async def test_implantacao_tudo_ou_nada_e_so_uma_vez(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await test_client.get(f"{API}/accounts", headers=h)).json()["started"] is False
    # uma conta a pagar ruim recusa TUDO: nada de conta nem data de corte gravada
    r = await _implantar(test_client, h, payables=[{"description": "Ok", "amount": "10", "due_date": "2026-12-01"},
                                                    {"description": "Sem valor", "amount": "0", "due_date": "2026-12-01"}])
    assert r.status_code == 400 and "Conta 2" in r.json()["detail"]
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert d["started"] is False and d["accounts"] == []
    assert (await test_client.get(f"{API}/payables", headers=h)).json()["items"] == []
    for ruim, trecho in (({"start_date": "2999-01-01"}, "futuro"), ({"cash_balance": "-1"}, "negativo"),
                         ({"banks": [{"name": ""}]}, "nome"), ({"banks": [{"name": "A", "receives_pix": True}, {"name": "B", "receives_pix": True}]}, "UM banco")):
        r = await _implantar(test_client, h, **ruim)
        assert r.status_code == 400 and trecho in r.json()["detail"], (ruim, r.text)
    r = await _implantar(test_client, h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["started"] is True and [a["name"] for a in d["accounts"]] == ["Gaveta", "Maquininha a receber", "Nubank", "Itaú"]
    assert _conta(d, "Gaveta")["balance"] == 150.0 and _conta(d, "Itaú")["balance"] == -50.0   # banco pode estar negativo
    assert _conta(d, "Nubank")["receives_pix"] is True and d["total"] == 1400.0
    pg = (await test_client.get(f"{API}/payables", headers=h)).json()
    assert pg["open_total"] == 2000.0 and pg["overdue_total"] == 1200.0 and pg["overdue_count"] == 1
    assert all(x["origin"] == "implantacao" for x in pg["items"])
    r = await _implantar(test_client, h)
    assert r.status_code == 409 and "já foi implantado" in r.json()["detail"]


async def test_vendas_devolucoes_e_caixa_caem_na_conta_certa(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    # venda de ontem (antes do corte) não entra
    antiga, _ = await _vender(test_client, h, p, va, 1, "100.00")
    from app.models.sale import Payment
    await async_session.execute(update(Payment).where(Payment.sale_id == antiga).values(created_at=datetime.utcnow() - timedelta(days=2)))
    await async_session.commit()
    assert (await _implantar(test_client, h, banks=[{"name": "Nubank", "balance": "0"}], payables=[])).status_code == 200
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")      # +200 gaveta
    await _pagar_com(test_client, h, p, va, "pix", "80.00")                     # +80 Nubank (recebe PIX por ser o único)
    await _pagar_com(test_client, h, p, va, "credit_card", "120.00")            # +120 maquininha
    await _pagar_com(test_client, h, p, va, "debit_card", "30.00")              # +30 maquininha
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Não serviu", "refund_method": "cash", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text                                          # -100 gaveta
    r = await test_client.post("/api/v1/cash/open", headers=h, json={"opening_amount": 50})
    assert r.status_code == 201                                                  # abrir o caixa não muda a gaveta (é contagem)
    r = await test_client.post("/api/v1/cash/movements", headers=h, json={"kind": "withdrawal", "amount": 20, "reason": "sangria"})
    assert r.status_code in (200, 201), r.text                                   # -20 gaveta
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    g, n, m = _conta(d, "Gaveta"), _conta(d, "Nubank"), _conta(d, "Maquininha a receber")
    assert g["balance"] == 150.0 + 200 - 100 - 20 and g["breakdown"]["sales"] == 200.0 and g["breakdown"]["refunds"] == 100.0
    assert n["balance"] == 80.0 and n["receives_pix"] is True
    assert m["balance"] == 300.0 + 150 and m["breakdown"]["sales"] == 150.0
    await test_client.post("/api/v1/cash/close", headers=h, json={"counted_amount": 30})


async def test_transferencia_conta_a_pagar_e_despesa_tiram_da_conta(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    d = (await _implantar(test_client, h)).json()
    gaveta, maq, nu = _conta(d, "Gaveta")["id"], _conta(d, "Maquininha a receber")["id"], _conta(d, "Nubank")["id"]
    # repasse da maquininha e depósito da gaveta no banco
    r = await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": maq, "to_account_id": nu, "amount": "300"})
    assert r.status_code == 200, r.text
    r = await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": gaveta, "to_account_id": nu, "amount": "100"})
    d = r.json()
    assert _conta(d, "Maquininha a receber")["balance"] == 0.0 and _conta(d, "Gaveta")["balance"] == 50.0
    assert _conta(d, "Nubank")["balance"] == 1400.0
    for ruim, trecho in (({"from_account_id": nu, "to_account_id": nu, "amount": 1}, "diferentes"),
                         ({"from_account_id": nu, "to_account_id": gaveta, "amount": 0}, "maior que zero"),
                         ({"from_account_id": nu, "to_account_id": 999999, "amount": 1}, "não encontrada")):
        r = await test_client.post(f"{API}/transfers", headers=h, json=ruim)
        assert r.status_code in (400, 404) and trecho in r.json()["detail"], (ruim, r.text)
    # pagar o aluguel (1200) pelo Nubank
    aluguel = next(x for x in (await test_client.get(f"{API}/payables", headers=h)).json()["items"] if x["description"] == "Aluguel")
    r = await test_client.post(f"{API}/payables/{aluguel['id']}/pay", headers=h, json={"account_id": nu})
    assert r.status_code == 200 and r.json()["status"] == "paid" and r.json()["overdue"] is False
    assert (await test_client.post(f"{API}/payables/{aluguel['id']}/pay", headers=h, json={"account_id": nu})).status_code == 409
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert _conta(d, "Nubank")["balance"] == 200.0 and _conta(d, "Nubank")["breakdown"]["payables_paid"] == 1200.0
    pg = (await test_client.get(f"{API}/payables", headers=h)).json()
    assert pg["open_total"] == 800.0 and pg["overdue_count"] == 0
    # nova conta a pagar e cancelar
    r = await test_client.post(f"{API}/payables", headers=h, json={"description": "Energia", "amount": "250,50", "due_date": "2026-12-10"})
    assert r.status_code == 200 and r.json()["amount"] == 250.5
    assert (await test_client.post(f"{API}/payables/{r.json()['id']}/cancel", headers=h)).json()["status"] == "canceled"
    # despesa paga pela gaveta sai da gaveta
    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "30.00", "description": "Café", "expense_date": date.today().isoformat(), "account_id": gaveta})
    assert r.status_code in (200, 201), r.text
    assert _conta((await test_client.get(f"{API}/accounts", headers=h)).json(), "Gaveta")["balance"] == 20.0


async def test_papeis_e_conta_de_outra_loja(test_client, async_session, test_user):
    from app.models.user import User, UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)

    async def _token(papel):
        u = User(email=f"fin.{papel.value}.{t_id}.{datetime.utcnow().timestamp()}@example.com", full_name="Pessoa",
                 hashed_password=get_password_hash("Senha1234"), role=papel, is_active=True, tenant_id=t_id)
        async_session.add(u)
        await async_session.commit()
        await async_session.refresh(u)
        return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}

    vendedor, gerente = await _token(UserRole.SELLER), await _token(UserRole.MANAGER)
    assert (await test_client.get(f"{API}/accounts", headers=vendedor)).status_code == 403
    assert (await _implantar(test_client, gerente)).status_code == 403          # implantar: só admin
    assert (await _implantar(test_client, h)).status_code == 200
    assert (await test_client.get(f"{API}/payables", headers=gerente)).status_code == 200
    r = await test_client.post(f"{API}/payables", headers=gerente, json={"description": "Frete", "amount": 40, "due_date": "2026-12-01"})
    assert r.status_code == 200
    # despesa com conta inexistente ou de outra loja é recusada
    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "10", "description": "X", "expense_date": date.today().isoformat(), "account_id": 999999})
    assert r.status_code in (400, 404) and "Conta de pagamento" in r.text


async def test_desfazer_pagamento_e_apagar_transferencia_voltam_o_saldo(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    d = (await _implantar(test_client, h)).json()
    gaveta, maq, nu = _conta(d, "Gaveta")["id"], _conta(d, "Maquininha a receber")["id"], _conta(d, "Nubank")["id"]
    # transferência com valor errado: apagar devolve as duas contas
    r = await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": maq, "to_account_id": nu, "amount": "3000"})
    assert _conta(r.json(), "Nubank")["balance"] == 4000.0
    lista = (await test_client.get(f"{API}/transfers", headers=h)).json()
    assert len(lista) == 1 and lista[0]["amount"] == 3000.0
    r = await test_client.delete(f"{API}/transfers/{lista[0]['id']}", headers=h)
    assert r.status_code == 200 and _conta(r.json(), "Nubank")["balance"] == 1000.0 and _conta(r.json(), "Maquininha a receber")["balance"] == 300.0
    assert (await test_client.get(f"{API}/transfers", headers=h)).json() == []
    assert (await test_client.delete(f"{API}/transfers/{lista[0]['id']}", headers=h)).status_code == 404
    # pagou pela conta errada: desfazer volta para em aberto e o dinheiro para a gaveta; paga de novo pelo banco
    boleto = next(x for x in (await test_client.get(f"{API}/payables", headers=h)).json()["items"] if x["description"] == "Boleto fornecedor Brás")
    await test_client.post(f"{API}/payables/{boleto['id']}/pay", headers=h, json={"account_id": gaveta})
    assert _conta((await test_client.get(f"{API}/accounts", headers=h)).json(), "Gaveta")["balance"] == -650.0
    r = await test_client.post(f"{API}/payables/{boleto['id']}/unpay", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "open" and r.json()["paid_account_id"] is None
    assert _conta((await test_client.get(f"{API}/accounts", headers=h)).json(), "Gaveta")["balance"] == 150.0
    assert (await test_client.post(f"{API}/payables/{boleto['id']}/unpay", headers=h)).status_code == 409   # já em aberto
    await test_client.post(f"{API}/payables/{boleto['id']}/pay", headers=h, json={"account_id": nu})
    assert _conta((await test_client.get(f"{API}/accounts", headers=h)).json(), "Nubank")["balance"] == 200.0
