"""Caixa da loja: abertura, esperado calculado das vendas em dinheiro, devolução, suprimento/sangria, fechamento e papéis."""
import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.security import create_access_token, get_password_hash
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse: limpa a loja 1 depois de cada teste)
from tests.test_troca import _cenario, _vender

pytestmark = pytest.mark.asyncio
API = "/api/v1/cash"


async def _tick():
    await asyncio.sleep(0.05)   # o relógio do Windows é grosso: separa venda anterior, abertura e venda posterior


async def _abrir(client, h, valor="100.00", **kw):
    r = await client.post(f"{API}/open", headers=h, json={"opening_amount": valor, **kw})
    assert r.status_code == 201, r.text
    await _tick()
    return r.json()


async def _atual(client, h):
    r = await client.get(f"{API}/current", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _pix(client, h, p, v, qtd, preco):
    r = await client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "pix", "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": str(preco)}],
        "payments": [{"amount": str(float(preco) * qtd), "payment_method": "pix"}]})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def test_sem_caixa_aberto_tudo_continua_e_movimentar_ou_fechar_da_409(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    a = await _atual(test_client, h)
    assert a["open"] is False and a["session"] is None
    await _vender(test_client, h, p, va, 1, "100.00")           # o caixa é opcional: a venda passa normal
    r = await test_client.post(f"{API}/movements", headers=h, json={"kind": "supply", "amount": 10, "reason": "troco"})
    assert r.status_code == 409 and "Abra o caixa" in r.json()["detail"]
    r = await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 10})
    assert r.status_code == 409 and "Não há caixa aberto" in r.json()["detail"]


async def test_abrir_valida_valor_e_nao_deixa_dois_abertos(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    for ruim in (-1, "abc", 2_000_000):
        r = await test_client.post(f"{API}/open", headers=h, json={"opening_amount": ruim})
        assert r.status_code == 422, (ruim, r.text)
    s = await _abrir(test_client, h, "100.10", note="troco da manhã")
    assert s["status"] == "open" and s["opening_amount"] == 100.1 and s["expected_amount"] == 100.1 and s["opening_note"] == "troco da manhã"
    r = await test_client.post(f"{API}/open", headers=h, json={"opening_amount": 5})
    assert r.status_code == 409 and "Já existe um caixa aberto" in r.json()["detail"]
    assert (await _atual(test_client, h))["session"]["id"] == s["id"]
    # abrir com zero é permitido (loja que começa sem troco)
    await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 100.10})
    assert (await test_client.post(f"{API}/open", headers=h, json={"opening_amount": 0})).status_code == 201


async def test_indice_unico_barra_dois_caixas_abertos_mesmo_fora_da_api(async_session, test_user):
    from app.models.cash_register import CashSession
    for _ in range(2):
        async_session.add(CashSession(tenant_id=test_user.tenant_id, status="open", opening_amount=1, is_active=True))
    with pytest.raises(IntegrityError):
        await async_session.commit()
    await async_session.rollback()


async def test_esperado_soma_so_dinheiro_do_turno_e_mostra_as_outras_formas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _vender(test_client, h, p, va, 1, "100.00")           # ANTES de abrir: não entra
    await _tick()
    await _abrir(test_client, h, "100.10")
    await _vender(test_client, h, p, va, 1, "29.90")            # dinheiro
    await _vender(test_client, h, p, va, 2, "50.00")            # dinheiro: 100,00
    await _pix(test_client, h, p, va, 1, "80.00")               # pix: não vai para a gaveta
    s = (await _atual(test_client, h))["session"]
    assert s["cash_sales"] == 129.9 and s["expected_amount"] == 230.0     # 100,10 + 129,90, sem arredondar errado
    assert s["sales_count"] == 3 and s["other_methods"]["pix"] == {"amount": 80.0, "sales": 1}
    assert s["cash_refunds"] == 0 and s["supplies"] == 0 and s["withdrawals"] == 0


async def test_venda_cancelada_sai_do_caixa(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _abrir(test_client, h, "50.00")
    sale_id, _ = await _vender(test_client, h, p, va, 1, "70.00")
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 120.0
    r = await test_client.post(f"/api/v1/sales/{sale_id}/cancel", headers=h, params={"reason": "Lançada errado"})
    assert r.status_code == 200, r.text
    s = (await _atual(test_client, h))["session"]
    assert s["cash_sales"] == 0 and s["expected_amount"] == 50.0 and s["sales_count"] == 0


async def test_devolucao_em_dinheiro_e_em_credito_da_loja(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _abrir(test_client, h, "0")
    sale_id, item_id = await _vender(test_client, h, p, va, 3, "100.00")           # +300 em dinheiro
    sale2, item2 = await _vender(test_client, h, p, va, 1, "100.00")               # +100
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Não serviu", "refund_method": "cash", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    s = (await _atual(test_client, h))["session"]
    assert s["cash_refunds"] == 100.0 and s["expected_amount"] == 300.0            # 400 - 100
    # "original" numa venda toda em dinheiro devolve em dinheiro; crédito da loja não mexe na gaveta
    r = await test_client.post(f"/api/v1/returns/{sale2}", headers=h, json={
        "reason": "Defeito", "refund_method": "store_credit", "items": [{"sale_item_id": item2, "quantity": 1}]})
    assert r.status_code == 201, r.text
    assert (await _atual(test_client, h))["session"]["cash_refunds"] == 100.0
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Mais uma", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    s = (await _atual(test_client, h))["session"]
    assert s["cash_refunds"] == 200.0 and s["expected_amount"] == 200.0


async def test_troca_em_que_cliente_paga_a_diferenca_em_dinheiro_entra_no_caixa(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_a="100.00", price_b="130.00")
    sale_id, item_id = await _vender(test_client, h, p, va, 1, "100.00")
    await _tick()
    await _abrir(test_client, h, "20.00")
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Quer outra", "settlement_method": "cash",
        "items": [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}]})
    assert r.status_code == 201, r.text
    assert float(r.json()["net_amount"]) == 30.0
    s = (await _atual(test_client, h))["session"]
    assert s["cash_sales"] == 30.0 and s["cash_refunds"] == 0 and s["expected_amount"] == 50.0


async def test_suprimento_e_sangria_mexem_no_esperado_e_sangria_nao_passa_do_que_tem(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _abrir(test_client, h, "100.00")
    r = await test_client.post(f"{API}/movements", headers=h, json={"kind": "supply", "amount": 50, "reason": "troco", "note": "moedas"})
    assert r.status_code == 201 and r.json()["expected_amount"] == 150.0 and r.json()["supplies"] == 50.0
    assert r.json()["movements"][0]["reason_label"] == "Reforço de troco"
    r = await test_client.post(f"{API}/movements", headers=h, json={"kind": "withdrawal", "amount": 120, "reason": "sangria"})
    assert r.status_code == 201 and r.json()["expected_amount"] == 30.0 and r.json()["withdrawals"] == 120.0
    r = await test_client.post(f"{API}/movements", headers=h, json={"kind": "withdrawal", "amount": 30.01, "reason": "pagamento"})
    assert r.status_code == 400 and "Não há esse dinheiro no caixa" in r.json()["detail"] and "30,00" in r.json()["detail"]
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 30.0        # recusada não mexeu
    for corpo in ({"kind": "supply", "amount": 5, "reason": "sangria"},      # motivo de outro tipo
                  {"kind": "withdrawal", "amount": 5, "reason": "troco"},
                  {"kind": "x", "amount": 5, "reason": "troco"}):
        assert (await test_client.post(f"{API}/movements", headers=h, json=corpo)).status_code in (400, 422), corpo
    for ruim in (0, -5, 5_000_000):
        assert (await test_client.post(f"{API}/movements", headers=h, json={"kind": "supply", "amount": ruim, "reason": "troco"})).status_code == 422
    assert (await test_client.post(f"{API}/movements", headers=h, json={"kind": "withdrawal", "amount": 30, "reason": "sangria"})).status_code == 201
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 0.0


async def test_fechar_guarda_a_fotografia_e_nao_muda_depois(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _abrir(test_client, h, "100.00")
    await _vender(test_client, h, p, va, 2, "40.00")
    await _pix(test_client, h, p, va, 1, "25.00")
    await test_client.post(f"{API}/movements", headers=h, json={"kind": "withdrawal", "amount": 30, "reason": "pagamento", "note": "motoboy"})
    r = await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 145.50, "note": "faltou troco"})
    assert r.status_code == 200, r.text
    f = r.json()
    assert f["status"] == "closed" and f["expected_amount"] == 150.0 and f["counted_amount"] == 145.5 and f["difference"] == -4.5
    assert (f["cash_sales"], f["withdrawals"], f["sales_count"]) == (80.0, 30.0, 2)
    assert f["other_methods"]["pix"]["amount"] == 25.0 and f["closing_note"] == "faltou troco" and f["closed_at"]
    assert (await _atual(test_client, h))["open"] is False
    assert (await _atual(test_client, h))["last_closed"]["difference"] == -4.5

    await _tick()
    await _vender(test_client, h, p, va, 1, "99.00")             # venda depois de fechar: não muda o caixa fechado
    d = (await test_client.get(f"{API}/sessions/{f['id']}", headers=h)).json()
    assert d["expected_amount"] == 150.0 and d["cash_sales"] == 80.0 and d["difference"] == -4.5
    assert (await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 1})).status_code == 409
    nova = await _abrir(test_client, h, "145.50")                # pode abrir o próximo com o que sobrou
    assert nova["id"] != f["id"] and nova["cash_sales"] == 0     # a venda de 99 foi antes da nova abertura


async def test_sobra_e_fechamento_exato(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _abrir(test_client, h, "10.00")
    f = (await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 12.34})).json()
    assert f["difference"] == 2.34 and f["expected_amount"] == 10.0
    await _abrir(test_client, h, "10.00")
    assert (await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 10})).json()["difference"] == 0.0
    r = await test_client.post(f"{API}/close", headers=h, json={"counted_amount": -1})
    assert r.status_code == 422


async def test_historico_papeis_e_isolamento_entre_lojas(test_client, async_session, test_user):
    from app.models.user import User, UserRole
    from tests.test_team_limit import _nova_loja
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    s1 = await _abrir(test_client, h, "10.00")
    await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 10})
    hist = (await test_client.get(f"{API}/sessions", headers=h)).json()
    assert [x["id"] for x in hist][0] == s1["id"] and hist[0]["difference"] == 0.0 and hist[0]["status"] == "closed"

    def _user(papel):
        u = User(email=f"caixa.{papel.value}.{id(papel)}.{asyncio.get_event_loop().time()}@example.com", full_name=f"Pessoa {papel.value}",
                 hashed_password=get_password_hash("Senha1234"), role=papel, is_active=True, tenant_id=t_id)
        return u

    for papel, ve_historico in ((UserRole.CASHIER, False), (UserRole.SELLER, False), (UserRole.MANAGER, True)):
        u = _user(papel)
        async_session.add(u)
        await async_session.commit()
        await async_session.refresh(u)
        hp = {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}
        # todo papel abre, movimenta e fecha o caixa
        assert (await test_client.post(f"{API}/open", headers=hp, json={"opening_amount": 5})).status_code == 201, papel
        assert (await test_client.post(f"{API}/movements", headers=hp, json={"kind": "supply", "amount": 1, "reason": "aporte"})).status_code == 201
        assert (await test_client.get(f"{API}/current", headers=hp)).json()["session"]["opened_by"] == f"Pessoa {papel.value}"
        assert (await test_client.post(f"{API}/close", headers=hp, json={"counted_amount": 6})).status_code == 200
        # mas o histórico é de gerente para cima
        assert (await test_client.get(f"{API}/sessions", headers=hp)).status_code == (200 if ve_historico else 403), papel
        assert (await test_client.get(f"{API}/sessions/{s1['id']}", headers=hp)).status_code == (200 if ve_historico else 403)

    assert (await test_client.get(f"{API}/current")).status_code in (401, 403)   # sem login não entra


async def test_outra_loja_nao_enxerga_nem_bloqueia_o_caixa(async_session, test_user):
    from app.models.cash_register import CashSession
    from app.services.cash_register_service import CashNotFound, CashRegisterService
    from tests.test_team_limit import _nova_loja
    outra, admin_outra, _tok = await _nova_loja(async_session, "pro")
    svc = CashRegisterService(async_session)
    await svc.open(outra, admin_outra, "50", None)                      # a outra loja abre o caixa dela
    mine = await svc.open(test_user.tenant_id, test_user, "10", None)   # e isso não impede a loja 1 de abrir o seu
    assert mine["opening_amount"] == 10.0
    alheio = (await async_session.execute(select(CashSession.id).where(CashSession.tenant_id == outra))).scalar()
    with pytest.raises(CashNotFound):
        await svc.detail(test_user.tenant_id, alheio)                   # nem ler o caixa de outra loja
    assert (await svc.current(outra))["session"]["opening_amount"] == 50.0
    assert (await svc.current(test_user.tenant_id))["session"]["opening_amount"] == 10.0
    await svc.close(outra, admin_outra, "50", None)
    assert (await svc.current(test_user.tenant_id))["open"] is True       # fechar o dela não fechou o nosso


async def test_devolucao_de_venda_paga_metade_em_dinheiro_devolve_so_a_parte_do_dinheiro(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _abrir(test_client, h, "0")
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 1, "unit_price": "100.00"}],
        "payments": [{"amount": "40.00", "payment_method": "cash"}, {"amount": "60.00", "payment_method": "pix"}]})
    assert r.status_code in (200, 201), r.text
    sale_id, item_id = r.json()["id"], r.json()["items"][0]["id"]
    s = (await _atual(test_client, h))["session"]
    assert s["cash_sales"] == 40.0 and s["other_methods"]["pix"]["amount"] == 60.0 and s["expected_amount"] == 40.0
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Desistiu", "items": [{"sale_item_id": item_id, "quantity": 1}]})        # refund_method padrão: original
    assert r.status_code == 201, r.text
    s = (await _atual(test_client, h))["session"]
    assert s["cash_refunds"] == 40.0 and s["expected_amount"] == 0.0                        # os 60 voltam no PIX, fora da gaveta
