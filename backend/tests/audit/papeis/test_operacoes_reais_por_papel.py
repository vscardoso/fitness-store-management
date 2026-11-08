"""Operações REAIS (com dado de verdade) por papel: o 403 vem ANTES de qualquer efeito, e o que o papel pode fazer funciona.

A matriz com id inexistente (test_matriz_papeis) prova a porta; aqui se prova que, barrado, NADA mudou, e que os atalhos
(mesma ação por outra rota) também estão fechados.
"""
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from tests.test_financeiro import _zerar_implantacao
from tests.test_troca import _cenario, _estoque, _vender
from .conftest import quatro_papeis

pytestmark = pytest.mark.asyncio
API = "/api/v1"
HOJE = date.today().isoformat()


@pytest.fixture
async def m(async_session, test_user, test_client):
    t_id, h_admin, p, va, vb = await _cenario(async_session, test_user)
    h = await quatro_papeis(async_session, t_id, h_admin)
    await _zerar_implantacao(async_session, t_id)
    cli = (await test_client.post(f"{API}/customers/", headers=h_admin, json={"full_name": "Cliente Papéis", "phone": "34955554444"})).json()["id"]
    sale_id, item_id = await _vender(test_client, h_admin, p, va, 2, "100.00")
    return dict(c=test_client, db=async_session, t=t_id, h=h, p=p, va=va, vb=vb, cli=cli, sale=sale_id, item=item_id)


async def _status_venda(m):
    return (await m["c"].get(f"{API}/sales/{m['sale']}", headers=m["h"]["admin"])).json()["status"]


async def test_cancelar_venda_so_admin(m):
    antes = await _estoque(m["db"], m["va"].id)
    for papel in ("cashier", "seller", "manager"):
        r = await m["c"].post(f"{API}/sales/{m['sale']}/cancel?reason=quero%20cancelar", headers=m["h"][papel])
        assert r.status_code == 403, (papel, r.status_code)
    r = await m["c"].post(f"{API}/pdv/orders/{m['sale']}/refund", headers=m["h"]["manager"])
    assert r.status_code == 403
    m["db"].expire_all()
    assert "complet" in (await _status_venda(m)).lower()
    assert await _estoque(m["db"], m["va"].id) == antes
    r = await m["c"].post(f"{API}/sales/{m['sale']}/cancel?reason=cancelado%20pelo%20dono", headers=m["h"]["admin"])
    assert r.status_code == 200, r.text
    m["db"].expire_all()
    assert await _estoque(m["db"], m["va"].id) == antes + 2          # o cancelamento de verdade devolve as peças


async def test_atalho_pdv_nao_cancela_venda_concluida(m):
    antes = await _estoque(m["db"], m["va"].id)
    r = await m["c"].post(f"{API}/pdv/orders/{m['sale']}/cancel", headers=m["h"]["manager"])
    m["db"].expire_all()
    estado = await _status_venda(m)
    cancelou = "cancel" in estado.lower()
    assert not cancelou or await _estoque(m["db"], m["va"].id) == antes + 2, (
        f"gerente cancelou a venda concluída pelo PDV ({r.status_code}); status {estado}; estoque {await _estoque(m['db'], m['va'].id)} (antes {antes}, devia voltar +2)")
    assert not cancelou, f"venda concluída virou {estado} por rota de gerente (a regra do app diz: só admin cancela)"


async def test_pdv_cancel_de_outra_loja_nao_encosta_na_venda(m, async_session, loja_real):
    from tests.test_team_limit import _nova_loja
    from .conftest import bearer
    _, _, tok_b = await _nova_loja(async_session, "pro")
    r = await m["c"].post(f"{API}/pdv/orders/{m['sale']}/cancel", headers=bearer(tok_b))
    assert r.status_code < 500
    assert "complet" in (await _status_venda(m)).lower(), "a loja B cancelou a venda da loja A pelo PDV"


async def test_estorno_por_erro_de_lancamento_e_so_do_admin_com_venda_real(m):
    antes = await _estoque(m["db"], m["va"].id)
    for papel in ("seller", "manager"):
        r = await m["c"].post(f"{API}/returns/{m['sale']}", headers=m["h"][papel],
                              json={"reason": "erro de lançamento", "is_correction": True, "items": [{"sale_item_id": m["item"], "quantity": 1}]})
        assert r.status_code == 403, (papel, r.status_code, r.text[:120])
        r = await m["c"].get(f"{API}/returns/eligibility/{m['sale']}?correction=true", headers=m["h"][papel])
        assert r.status_code == 403, (papel, r.status_code)
    assert (await m["c"].post(f"{API}/returns/{m['sale']}", headers=m["h"]["cashier"],
                              json={"reason": "x", "items": [{"sale_item_id": m["item"], "quantity": 1}]})).status_code == 403
    m["db"].expire_all()
    assert await _estoque(m["db"], m["va"].id) == antes, "estoque mudou mesmo com 403"
    hist = (await m["c"].get(f"{API}/returns/history/{m['sale']}", headers=m["h"]["admin"])).json()
    assert hist == []


async def test_ajuste_de_pontos_anonimizar_e_exportar(m):
    pts = lambda: m["c"].get(f"{API}/customers/{m['cli']}/loyalty", headers=m["h"]["admin"])  # noqa: E731
    antes = (await pts()).json()
    for papel in ("cashier", "seller", "manager"):
        r = await m["c"].post(f"{API}/customers/{m['cli']}/loyalty/adjust", headers=m["h"][papel], json={"points": 9999, "note": "fraude"})
        assert r.status_code == 403
        r = await m["c"].post(f"{API}/customers/{m['cli']}/anonymize", headers=m["h"][papel], json={"confirmacao": "ANONIMIZAR"})
        assert r.status_code == 403
        r = await m["c"].get(f"{API}/customers/{m['cli']}/access-log", headers=m["h"][papel])
        assert r.status_code == 403
    assert (await pts()).json() == antes
    nome = (await m["c"].get(f"{API}/customers/{m['cli']}", headers=m["h"]["admin"])).json()["full_name"]
    assert nome == "Cliente Papéis"                              # ninguém anonimizou
    for papel, ok in (("cashier", False), ("seller", False), ("manager", True), ("admin", True)):
        r = await m["c"].get(f"{API}/customers/{m['cli']}/export", headers=m["h"][papel])
        assert (r.status_code == 200) == ok, (papel, r.status_code)
    # vendedor edita cliente; caixa não; ninguém abaixo de gerente apaga
    assert (await m["c"].put(f"{API}/customers/{m['cli']}", headers=m["h"]["seller"], json={"notes": "ok"})).status_code == 200
    assert (await m["c"].put(f"{API}/customers/{m['cli']}", headers=m["h"]["cashier"], json={"notes": "nao"})).status_code == 403
    assert (await m["c"].delete(f"{API}/customers/{m['cli']}", headers=m["h"]["seller"])).status_code == 403


async def test_fiado_caixa_recebe_mas_nao_desfaz_nem_cancela(m):
    c, h = m["c"], m["h"]
    r = await c.post(f"{API}/sales/", headers=h["cashier"], json={
        "customer_id": m["cli"], "payment_method": "on_account",
        "items": [{"product_id": m["p"].id, "variant_id": m["va"].id, "quantity": 1, "unit_price": "100.00"}],
        "payments": [{"amount": "100.00", "payment_method": "on_account", "installments": 2,
                      "first_due_date": (date.today() + timedelta(days=5)).isoformat(), "interval_days": 7}]})
    assert r.status_code in (200, 201), r.text
    assert (await c.post(f"{API}/receivables/receive", headers=h["cashier"],
                         json={"customer_id": m["cli"], "amount": "20", "payment_method": "cash"})).status_code == 200
    d = (await c.get(f"{API}/receivables?customer_id={m['cli']}", headers=h["cashier"])).json()
    rec = d["items"][0]["id"]
    pid = (await c.get(f"{API}/receivables/{rec}/payments", headers=h["cashier"])).json()[0]["id"]
    for papel in ("cashier", "seller"):
        assert (await c.delete(f"{API}/receivables/payments/{pid}", headers=h[papel])).status_code == 403
        assert (await c.post(f"{API}/receivables/{rec}/cancel", headers=h[papel])).status_code == 403
        assert (await c.post(f"{API}/receivables/opening", headers=h[papel],
                             json={"customer_id": m["cli"], "amount": "5", "due_date": HOJE})).status_code == 403
    assert (await c.get(f"{API}/receivables?customer_id={m['cli']}", headers=h["admin"])).json()["summary"] == d["summary"]
    # a venda do fiado não pode ser cancelada com parcela recebida (e só admin cancela)
    assert (await c.post(f"{API}/sales/{r.json()['id']}/cancel?reason=teste%20de%20papel", headers=h["manager"])).status_code == 403
    r2 = await c.post(f"{API}/sales/{r.json()['id']}/cancel?reason=teste%20de%20papel", headers=h["admin"])
    assert r2.status_code == 400, r2.text            # já houve recebimento: usar Devolução
    # gerente desfaz o recebimento
    assert (await c.delete(f"{API}/receivables/payments/{pid}", headers=h["manager"])).status_code == 200


async def test_caixa_da_gaveta_por_papel(m):
    c, h = m["c"], m["h"]
    r = await c.post(f"{API}/cash/open", headers=h["cashier"], json={"opening_amount": "100"})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    for papel in ("cashier", "seller"):
        assert (await c.get(f"{API}/cash/sessions", headers=h[papel])).status_code == 403
        assert (await c.get(f"{API}/cash/sessions/{sid}", headers=h[papel])).status_code == 403
    assert (await c.get(f"{API}/cash/sessions/{sid}", headers=h["manager"])).status_code == 200
    # qualquer papel vê o caixa aberto e movimenta; o vendedor fecha o que o caixa abriu
    assert (await c.get(f"{API}/cash/current", headers=h["seller"])).json()["open"] is True
    assert (await c.post(f"{API}/cash/movements", headers=h["seller"], json={"kind": "supply", "amount": 10, "reason": "troco"})).status_code in (200, 201)
    assert (await c.post(f"{API}/cash/close", headers=h["seller"], json={"counted_amount": 110})).status_code == 200


async def test_despesas_e_financeiro_por_papel(m):
    c, h = m["c"], m["h"]
    r = await c.post(f"{API}/expenses", headers=h["manager"], json={"amount": "25", "description": "Papel Teste", "expense_date": HOJE})
    assert r.status_code in (200, 201), r.text
    eid = r.json()["id"]
    for papel in ("cashier", "seller"):
        for metodo, caminho, corpo in [("GET", "/expenses", None), ("PUT", f"/expenses/{eid}", {"amount": "1"}), ("DELETE", f"/expenses/{eid}", None),
                                       ("GET", "/finance/accounts", None), ("GET", "/reports/monthly", None), ("GET", "/dashboard/stats", None)]:
            assert (await c.request(metodo, f"{API}{caminho}", headers=h[papel], json=corpo)).status_code == 403, (papel, metodo, caminho)
    assert (await c.delete(f"{API}/expenses/{eid}", headers=h["manager"])).status_code == 403      # apagar é do admin
    assert (await c.get(f"{API}/expenses/{eid}", headers=h["admin"])).json()["amount"] in (25, 25.0, "25.00", "25")
    assert (await c.delete(f"{API}/expenses/{eid}", headers=h["admin"])).status_code in (200, 204)
    # implantar o financeiro: só admin; gerente não consegue nem com corpo válido
    corpo = {"start_date": HOJE, "cash_balance": "10", "banks": [{"name": "Banco X", "balance": "10"}]}
    assert (await c.post(f"{API}/finance/setup", headers=h["manager"], json=corpo)).status_code == 403
    assert (await c.get(f"{API}/finance/accounts", headers=h["admin"])).json()["started"] is False
    assert (await c.post(f"{API}/finance/setup", headers=h["admin"], json=corpo)).status_code == 200
    # trocar o banco do PIX e criar conta: só admin
    contas = {a["name"]: a["id"] for a in (await c.get(f"{API}/finance/accounts", headers=h["admin"])).json()["accounts"]}
    assert (await c.put(f"{API}/finance/accounts/{contas['Banco X']}/pix", headers=h["manager"])).status_code == 403
    assert (await c.post(f"{API}/finance/accounts", headers=h["manager"], json={"name": "Outro", "balance": "1"})).status_code == 403
    # gerente faz o dia a dia: transferir, lançar retirada, conta a pagar
    assert (await c.post(f"{API}/finance/transfers", headers=h["manager"], json={
        "from_account_id": contas["Gaveta"], "to_account_id": contas["Banco X"], "amount": "5"})).status_code == 200


async def test_descontos_e_configuracoes_da_loja_so_admin(m):
    c, h = m["c"], m["h"]
    antes = (await c.get(f"{API}/store/loyalty-settings", headers=h["admin"])).json()
    for papel in ("cashier", "seller", "manager"):
        r = await c.put(f"{API}/store/loyalty-settings", headers=h[papel], json={"enabled": False, "reais_per_point": 1})
        assert r.status_code == 403
        r = await c.put(f"{API}/store/return-settings", headers=h[papel], json={"return_window_days": 90, "allow_money_refund": True})
        assert r.status_code == 403
        r = await c.post(f"{API}/payment-discounts/", headers=h[papel], json={"payment_method": "pix", "discount_percentage": 90})
        assert r.status_code == 403
    assert (await c.get(f"{API}/store/loyalty-settings", headers=h["cashier"])).json() == antes
    # o caixa LÊ a regra do programa (o PDV precisa) mas não vê o prazo de troca nem as configurações da loja
    assert (await c.get(f"{API}/store/return-settings", headers=h["cashier"])).status_code == 403


async def test_pdv_refund_admin_nao_marca_venda_manual_como_reembolsada(m):
    """Família do BUG-P5: o estorno do PDV não pode marcar REFUNDED sem devolver o estoque."""
    antes = await _estoque(m["db"], m["va"].id)
    r = await m["c"].post(f"{API}/pdv/orders/{m['sale']}/refund", headers=m["h"]["admin"])
    assert r.status_code == 400, r.text
    assert "Devolução" in r.text
    m["db"].expire_all()
    assert "complet" in (await _status_venda(m)).lower()
    assert await _estoque(m["db"], m["va"].id) == antes
    r = await m["c"].post(f"{API}/pdv/orders/999999/refund", headers=m["h"]["admin"])
    assert r.status_code == 400


async def test_fidelidade_put_vazio_recusado_e_parcial_so_muda_o_enviado(m):
    h = m["h"]["admin"]
    base = (await m["c"].put(f"{API}/store/loyalty-settings", headers=h, json={
        "enabled": True, "spend_per_point": 5, "point_value": 0.2, "min_redeem": 10, "expiry_days": 90})).json()
    assert base["enabled"] is True
    r = await m["c"].put(f"{API}/store/loyalty-settings", headers=h, json={})
    assert r.status_code == 422, r.text
    r = await m["c"].put(f"{API}/store/loyalty-settings", headers=h, json={"enabled": None})
    assert r.status_code == 422, r.text
    assert (await m["c"].get(f"{API}/store/loyalty-settings", headers=h)).json() == base
    r = await m["c"].put(f"{API}/store/loyalty-settings", headers=h, json={"point_value": 0.5})
    assert r.status_code == 200, r.text
    assert r.json() == {**base, "point_value": 0.5}
    r = await m["c"].put(f"{API}/store/loyalty-settings", headers=h, json={"expiry_days": None})
    assert r.json()["expiry_days"] is None and r.json()["enabled"] is True
