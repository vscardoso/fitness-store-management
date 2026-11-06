"""Fiado: venda no fiado vira parcelas, receber (parcial, da cliente), devolução abate o que ela deve, cancelar,
fiado antigo da implantação, caixa e Financeiro contam só o dinheiro recebido."""
from datetime import date, timedelta

import pytest

from app.core.security import create_access_token, get_password_hash
from app.models.customer import Customer
from app.models.user import User, UserRole
from tests.test_caixa import _abrir, _atual
from tests.test_financeiro import _conta, _implantar, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse: limpa a loja 1 depois de cada teste)
from tests.test_stock_check import _n
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/receivables"


async def _cliente(db, t_id, nome="Cassiane Fiado"):
    c = Customer(full_name=f"{nome} {next(_n)}", email=f"fiado{next(_n)}@example.com", phone="34999990000", tenant_id=t_id)
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c.id


async def _venda(client, h, p, v, cid, payments, qtd=1, preco="100.00"):
    return await client.post("/api/v1/sales/", headers=h, json={
        "customer_id": cid, "payment_method": payments[-1]["payment_method"],
        "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": preco}], "payments": payments})


async def _aberto(client, h, cid):
    r = await client.get(f"{API}?customer_id={cid}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def test_venda_no_fiado_vira_parcelas_e_recebe_das_mais_antigas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)

    # sem cliente: recusa e não vende
    r = await _venda(test_client, h, p, va, None, [{"amount": "100.00", "payment_method": "on_account"}])
    assert r.status_code == 400 and "cliente" in r.text

    first = date.today() + timedelta(days=7)
    r = await _venda(test_client, h, p, va, cid, [{"amount": "100.00", "payment_method": "on_account", "installments": 3,
                                                    "first_due_date": first.isoformat(), "interval_days": 7}])
    assert r.status_code in (200, 201), r.text
    d = await _aberto(test_client, h, cid)
    assert [(i["amount"], i["due_date"], i["installment_number"]) for i in d["items"]] == [
        (33.33, first.isoformat(), 1), (33.33, (first + timedelta(days=7)).isoformat(), 2),
        (33.34, (first + timedelta(days=14)).isoformat(), 3)]
    assert d["summary"]["open_total"] == 100.0 and d["summary"]["overdue_total"] == 0

    # recebe 50 em dinheiro da cliente: quita a 1ª e paga parte da 2ª
    r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "50,00", "payment_method": "cash"})
    assert r.status_code == 200, r.text
    d = await _aberto(test_client, h, cid)
    assert [(i["installment_number"], i["status"], i["outstanding"]) for i in d["items"]] == [(2, "partial", 16.66), (3, "open", 33.34)]
    assert d["summary"]["open_total"] == 50.0

    # mais do que deve: recusa; forma inválida: recusa
    r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "50.01", "payment_method": "pix"})
    assert r.status_code == 400 and "passa do que está em aberto" in r.json()["detail"]
    r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "1", "payment_method": "on_account"})
    assert r.status_code == 400

    # desfazer o recebimento da 2ª volta o valor para em aberto
    pay = (await test_client.get(f"{API}/{d['items'][0]['id']}/payments", headers=h)).json()
    assert [x["amount"] for x in pay] == [16.67]
    r = await test_client.delete(f"{API}/payments/{pay[0]['id']}", headers=h)
    assert r.status_code == 200
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 66.67


async def test_caixa_e_financeiro_contam_so_o_dinheiro_recebido(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h, payables=[])).status_code == 200
    cid = await _cliente(async_session, t_id)
    await _abrir(test_client, h, "100.00")

    # entrada de 40 no PIX + 60 no fiado
    r = await _venda(test_client, h, p, va, cid, [{"amount": "40.00", "payment_method": "pix"},
                                                  {"amount": "60.00", "payment_method": "on_account"}])
    assert r.status_code in (200, 201), r.text
    fin = (await test_client.get("/api/v1/finance/accounts", headers=h)).json()
    assert _conta(fin, "Nubank")["balance"] == 1040.0 and _conta(fin, "Gaveta")["balance"] == 150.0
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 100.0   # fiado não entra na gaveta

    # recebe 25 em dinheiro e 10 no PIX
    for valor, forma in (("25", "cash"), ("10", "pix")):
        r = await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": valor, "payment_method": forma})
        assert r.status_code == 200, r.text
    s = (await _atual(test_client, h))["session"]
    assert s["expected_amount"] == 125.0 and s["receivables_cash"] == 25.0
    fin = (await test_client.get("/api/v1/finance/accounts", headers=h)).json()
    assert _conta(fin, "Gaveta")["balance"] == 175.0 and _conta(fin, "Nubank")["balance"] == 1050.0
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 25.0


async def test_devolucao_abate_o_que_ela_deve_e_so_o_resto_e_dinheiro(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h, payables=[])).status_code == 200
    cid = await _cliente(async_session, t_id)
    await _abrir(test_client, h, "100.00")
    r = await _venda(test_client, h, p, va, cid, [{"amount": "50.00", "payment_method": "cash"},
                                                  {"amount": "150.00", "payment_method": "on_account", "installments": 2}], qtd=2)
    assert r.status_code in (200, 201), r.text
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 150.0

    # devolve 1 peça (100): ela devia 150 -> passa a dever 50; nenhum dinheiro sai da gaveta
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Não serviu", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    d = await _aberto(test_client, h, cid)
    assert d["summary"]["open_total"] == 50.0
    assert [(i["installment_number"], i["outstanding"]) for i in d["items"]] == [(1, 50.0)]   # abateu da última para a 1ª
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 150.0
    fin = (await test_client.get("/api/v1/finance/accounts", headers=h)).json()
    assert _conta(fin, "Gaveta")["balance"] == 200.0

    # devolve a outra (100): abate os 50 que faltam e os outros 50 voltam em dinheiro (a parte que ela pagou)
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Não serviu", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 0
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 100.0
    all_ = (await test_client.get(f"{API}?customer_id={cid}&status=all", headers=h)).json()["items"]
    assert {i["status"] for i in all_} == {"canceled"}


async def test_cancelar_venda_no_fiado(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    r = await _venda(test_client, h, p, va, cid, [{"amount": "100.00", "payment_method": "on_account", "installments": 2}])
    sale_id = r.json()["id"]
    r = await test_client.post(f"/api/v1/sales/{sale_id}/cancel?reason=Lançada errado", headers=h)
    assert r.status_code == 200, r.text
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 0

    # com parcela recebida não cancela (usar devolução) e nada muda
    r = await _venda(test_client, h, p, va, cid, [{"amount": "100.00", "payment_method": "on_account", "installments": 2}])
    sale_id = r.json()["id"]
    await test_client.post(f"{API}/receive", headers=h, json={"customer_id": cid, "amount": "10", "payment_method": "pix"})
    r = await test_client.post(f"/api/v1/sales/{sale_id}/cancel?reason=Lançada errado", headers=h)
    assert r.status_code == 400 and "Devolução" in r.text
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 90.0


async def test_fiado_antigo_da_implantacao_e_papeis(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    cid = await _cliente(async_session, t_id)
    hoje = date.today()
    r = await test_client.post(f"{API}/opening", headers=h, json={
        "customer_id": cid, "description": "Planilha de outubro",
        "installments": [{"amount": "214,85", "due_date": (hoje - timedelta(days=3)).isoformat()},
                         {"amount": "214,85", "due_date": (hoje + timedelta(days=4)).isoformat()}]})
    assert r.status_code == 200 and r.json()["total"] == 429.7, r.text
    s = (await _aberto(test_client, h, cid))["summary"]
    assert (s["open_total"], s["overdue_total"], s["due_this_week"]) == (429.7, 214.85, 214.85)
    assert (await test_client.get(f"{API}?status=overdue&customer_id={cid}", headers=h)).json()["items"][0]["overdue"] is True

    # linha ruim recusa tudo
    r = await test_client.post(f"{API}/opening", headers=h, json={"customer_id": cid, "installments": [
        {"amount": "10", "due_date": hoje.isoformat()}, {"amount": "0", "due_date": hoje.isoformat()}]})
    assert r.status_code == 400 and "Parcela 2" in r.json()["detail"]
    assert (await _aberto(test_client, h, cid))["summary"]["installments"] == 2

    # vendedora consulta e não lança fiado antigo; caixa recebe
    async def _token(papel):
        u = User(email=f"fiado.{papel.value}{next(_n)}@example.com", full_name=f"Pessoa {papel.value}",
                 hashed_password=get_password_hash("Senha1234"), role=papel, is_active=True, tenant_id=t_id)
        async_session.add(u)
        await async_session.commit()
        await async_session.refresh(u)
        return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}
    vend, caixa = await _token(UserRole.SELLER), await _token(UserRole.CASHIER)
    assert (await test_client.get(f"{API}?customer_id={cid}", headers=vend)).status_code == 200
    r = await test_client.post(f"{API}/opening", headers=vend, json={"customer_id": cid, "amount": "1", "due_date": hoje.isoformat()})
    assert r.status_code == 403
    r = await test_client.post(f"{API}/receive", headers=caixa, json={"customer_id": cid, "amount": "214.85", "payment_method": "cash"})
    assert r.status_code == 200, r.text
    first = (await _aberto(test_client, h, cid))["items"][0]
    assert first["installment_number"] == 2

    # cancelar fiado antigo: só sem recebimento
    r = await test_client.post(f"{API}/{first['id']}/cancel", headers=h)
    assert r.status_code == 200
    assert (await _aberto(test_client, h, cid))["summary"]["open_total"] == 0
