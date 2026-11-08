"""Isolamento entre lojas nas rotas de dinheiro: a loja B (qualquer papel) nunca lê, altera, apaga nem usa dado da loja A.

Loja A = loja 1 (test_user é o admin). Loja B = loja nova com um usuário de cada papel. O override de loja do conftest é
retirado (`loja_real`): vale a loja do usuário logado, como em produção.
Esperado de B: 403/404 (ou 400/409/422) em tudo, NUNCA 2xx nem 500, e o estado de A idêntico no fim.
"""
import json
from datetime import date, timedelta

import pytest
from sqlalchemy import desc, select

from tests.test_financeiro import _zerar_implantacao
from tests.test_lot_costs import _viagem
from tests.test_team_limit import _nova_loja
from tests.test_troca import _cenario
from .conftest import bearer, novo_usuario, quatro_papeis

pytestmark = pytest.mark.asyncio
API = "/api/v1"
HOJE = date.today().isoformat()
SEGREDO_CLIENTE = "Cliente Segredo da Loja A"
SEGREDO_DESPESA = "Despesa Segredo da Loja A"
SEGREDO_CONTA = "Boleto Segredo da Loja A"


def _vazio_de_nao_achado(caminho, r):
    """Três GETs respondem 200 'vazio' (e não 404) para id de outra loja: não vaza nada, só é inconsistente."""
    j = r.json()
    if caminho.startswith("/returns/eligibility/"):
        return j.get("is_eligible") is False and not j.get("sale_number") and "não encontrada" in (j.get("reason") or "")
    if caminho.startswith("/returns/history/") or caminho.endswith("/payments"):
        return j == []
    return False


@pytest.fixture
async def duas_lojas(async_session, test_user, test_client, loja_real):
    # ── loja A (a loja 1) ────────────────────────────────────────────────────────────────────────────────────────
    t_a, h_a, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_a)
    ha = await quatro_papeis(async_session, t_a, h_a)
    r = await test_client.post(f"{API}/customers/", headers=h_a, json={"full_name": SEGREDO_CLIENTE, "phone": "34977776666",
                                                                      "email": "segredo.a@example.com"})
    assert r.status_code in (200, 201), r.text
    cli = r.json()["id"]
    r = await test_client.post(f"{API}/finance/setup", headers=h_a, json={
        "start_date": HOJE, "cash_balance": "500.00", "card_balance": "100.00",
        "banks": [{"name": "Banco A", "balance": "1000.00", "receives_pix": True}],
        "payables": [{"description": SEGREDO_CONTA, "amount": "300.00", "due_date": (date.today() + timedelta(days=3)).isoformat()}]})
    assert r.status_code == 200, r.text
    contas = {a["name"]: a["id"] for a in r.json()["accounts"]}
    pay_a = (await test_client.get(f"{API}/finance/payables", headers=h_a)).json()["items"][0]["id"]
    r = await test_client.post(f"{API}/cash/open", headers=h_a, json={"opening_amount": "50.00"})
    assert r.status_code == 201, r.text
    cash_a = r.json()["id"]

    r = await test_client.post(f"{API}/sales/", headers=h_a, json={
        "customer_id": cli, "payment_method": "cash",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 3, "unit_price": "100.00"}],
        "payments": [{"amount": "300.00", "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    venda = r.json()
    r = await test_client.post(f"{API}/sales/", headers=h_a, json={
        "customer_id": cli, "payment_method": "on_account",
        "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 1, "unit_price": "100.00"}],
        "payments": [{"amount": "100.00", "payment_method": "on_account", "installments": 2,
                      "first_due_date": (date.today() + timedelta(days=5)).isoformat(), "interval_days": 7}]})
    assert r.status_code in (200, 201), r.text
    fiado_venda = r.json()
    rec = (await test_client.get(f"{API}/receivables?customer_id={cli}", headers=h_a)).json()["items"]
    assert len(rec) == 2, rec
    r = await test_client.post(f"{API}/receivables/receive", headers=h_a, json={"customer_id": cli, "amount": "10", "payment_method": "cash"})
    assert r.status_code == 200, r.text
    rec_pay = (await test_client.get(f"{API}/receivables/{rec[0]['id']}/payments", headers=h_a)).json()[0]["id"]

    r = await test_client.post(f"{API}/returns/{venda['id']}", headers=h_a, json={
        "reason": "Tamanho", "items": [{"sale_item_id": venda["items"][0]["id"], "quantity": 1}]})
    assert r.status_code == 201, r.text
    r = await test_client.post(f"{API}/finance/transfers", headers=h_a, json={
        "from_account_id": contas["Gaveta"], "to_account_id": contas["Banco A"], "amount": "20"})
    assert r.status_code == 200, r.text
    transf_a = (await test_client.get(f"{API}/finance/transfers", headers=h_a)).json()[0]["id"]
    r = await test_client.post(f"{API}/finance/entries", headers=h_a, json={
        "kind": "loan_given", "account_id": contas["Banco A"], "amount": "30", "person": "Pessoa Segredo A"})
    assert r.status_code == 200, r.text
    entry_a = r.json()["id"]
    r = await test_client.post(f"{API}/expenses/categories", headers=h_a, json={"name": "Categoria Segredo A"})
    assert r.status_code in (200, 201), r.text
    cat_a = r.json()["id"]
    r = await test_client.post(f"{API}/expenses", headers=h_a, json={
        "amount": "40.00", "description": SEGREDO_DESPESA, "expense_date": HOJE, "account_id": contas["Gaveta"], "category_id": cat_a})
    assert r.status_code in (200, 201), r.text
    exp_a = r.json()["id"]
    from app.models.stock_entry import StockEntry
    entrada_a = (await async_session.execute(select(StockEntry.id).where(StockEntry.tenant_id == t_a).order_by(desc(StockEntry.id)).limit(1))).scalar()
    viagem_a = (await _viagem(async_session, t_a, fuel=10)).id
    await async_session.commit()

    # ── loja B ───────────────────────────────────────────────────────────────────────────────────────────────────
    t_b, admin_b, token_b = await _nova_loja(async_session, "pro")
    hb = {"admin": bearer(token_b)}
    for papel in ("manager", "seller", "cashier"):
        hb[papel] = (await novo_usuario(async_session, t_b, papel))[1]
    r = await test_client.post(f"{API}/finance/setup", headers=hb["admin"], json={
        "start_date": HOJE, "cash_balance": "10", "banks": [{"name": "Banco B", "balance": "10"}]})
    assert r.status_code == 200, r.text
    contas_b = {a["name"]: a["id"] for a in r.json()["accounts"]}
    return dict(t_a=t_a, t_b=t_b, ha=ha, hb=hb, p=p, va=va, vb=vb, cli=cli, contas=contas, contas_b=contas_b, pay_a=pay_a,
                cash_a=cash_a, venda=venda, fiado_venda=fiado_venda, rec=rec, rec_pay=rec_pay, transf_a=transf_a,
                entry_a=entry_a, cat_a=cat_a, exp_a=exp_a, entrada_a=entrada_a, viagem_a=viagem_a)


async def _foto_de_A(client, m):
    """Tudo que o B poderia estragar, lido pelo admin de A."""
    h = m["ha"]["admin"]
    g = lambda path: client.get(f"{API}{path}", headers=h)  # noqa: E731
    fin = (await g("/finance/accounts")).json()
    pays = (await g("/finance/payables")).json()["items"]
    rec = (await g(f"/receivables?customer_id={m['cli']}")).json()
    return json.dumps({
        "venda": (await g(f"/sales/{m['venda']['id']}")).json()["status"],
        "fiado_venda": (await g(f"/sales/{m['fiado_venda']['id']}")).json()["status"],
        "cliente": (await g(f"/customers/{m['cli']}")).json()["full_name"],
        "saldos": sorted((a["name"], a["balance"]) for a in fin["accounts"]),
        "pagar": sorted((p["id"], p["status"]) for p in pays),
        "fiado": rec["summary"], "parcelas": sorted((i["id"], i["status"], i["outstanding"]) for i in rec["items"]),
        "transf": [t["id"] for t in (await g("/finance/transfers")).json()],
        "entradas": (await g("/finance/entries")).json(),
        "despesa": (await g(f"/expenses/{m['exp_a']}")).json()["description"],
        "caixa": (await g("/cash/current")).json()["session"]["expected_amount"],
        "pontos": (await g(f"/customers/{m['cli']}/loyalty")).json(),
    }, sort_keys=True, default=str)


async def test_B_nao_le_nem_mexe_em_nada_da_loja_A(test_client, async_session, duas_lojas):
    m = duas_lojas
    antes = await _foto_de_A(test_client, m)
    A = m["ha"]["admin"]
    sale_id, sale_num = m["venda"]["id"], m["venda"]["sale_number"]
    item_id = m["venda"]["items"][0]["id"]
    cli, rec0, contas = m["cli"], m["rec"][0]["id"], m["contas"]
    contas_b = m["contas_b"]

    # (método, caminho, corpo)  -- todas feitas por TODOS os papéis de B; as que o papel não alcança dão 403, as outras 4xx
    ataques = [
        ("GET", f"/sales/{sale_id}", None), ("GET", f"/sales/number/{sale_num}", None),
        ("GET", f"/sales/{sale_id}/receipt", None), ("GET", f"/sales/{sale_id}/receipt/pdf", None),
        ("POST", f"/sales/{sale_id}/receipt/send-whatsapp", {}),
        ("POST", f"/sales/{sale_id}/cancel", {}),
        ("GET", f"/returns/eligibility/{sale_id}", None), ("GET", f"/returns/history/{sale_id}", None),
        ("POST", f"/returns/{sale_id}", {"reason": "invasao", "items": [{"sale_item_id": item_id, "quantity": 1}]}),
        ("POST", f"/returns/{sale_id}", {"reason": "invasao", "is_correction": True, "items": [{"sale_item_id": item_id, "quantity": 1}]}),
        ("GET", f"/returns/eligibility/{sale_id}?correction=true", None),
        ("GET", f"/customers/{cli}", None), ("GET", f"/customers/{cli}/purchases", None), ("GET", f"/customers/{cli}/export", None),
        ("GET", f"/customers/{cli}/loyalty", None), ("GET", f"/customers/{cli}/access-log", None),
        ("PUT", f"/customers/{cli}", {"full_name": "HACKEADO"}), ("DELETE", f"/customers/{cli}", None),
        ("POST", f"/customers/{cli}/anonymize", {"confirmacao": "ANONIMIZAR"}),
        ("POST", f"/customers/{cli}/loyalty/adjust", {"points": 500, "note": "invasao"}),
        ("GET", f"/receivables/{rec0}/payments", None),
        ("POST", "/receivables/receive", {"customer_id": cli, "amount": "5", "payment_method": "cash"}),
        ("POST", "/receivables/receive", {"receivable_id": rec0, "amount": "5", "payment_method": "pix"}),
        ("POST", f"/receivables/{rec0}/cancel", {}), ("DELETE", f"/receivables/payments/{m['rec_pay']}", None),
        ("POST", "/receivables/opening", {"customer_id": cli, "amount": "99", "due_date": HOJE}),
        ("POST", "/finance/transfers", {"from_account_id": contas["Gaveta"], "to_account_id": contas["Banco A"], "amount": "1"}),
        ("POST", "/finance/transfers", {"from_account_id": contas_b["Gaveta"], "to_account_id": contas["Banco A"], "amount": "1"}),
        ("POST", "/finance/transfers", {"from_account_id": contas["Gaveta"], "to_account_id": contas_b["Banco B"], "amount": "1"}),
        ("DELETE", f"/finance/transfers/{m['transf_a']}", None),
        ("POST", f"/finance/payables/{m['pay_a']}/pay", {"account_id": contas_b["Banco B"]}),
        ("POST", f"/finance/payables/{m['pay_a']}/pay", {"account_id": contas["Banco A"]}),
        ("POST", f"/finance/payables/{m['pay_a']}/unpay", {}), ("POST", f"/finance/payables/{m['pay_a']}/cancel", {}),
        ("DELETE", f"/finance/entries/{m['entry_a']}", None),
        ("POST", "/finance/entries", {"kind": "owner_withdrawal", "account_id": contas["Banco A"], "amount": "1", "person": "Invasor"}),
        ("PUT", f"/finance/accounts/{contas['Banco A']}/pix", {}),
        ("POST", "/finance/card-settlement", {"gross": "1", "received": "1", "to_account_id": contas["Banco A"]}),
        ("GET", f"/expenses/{m['exp_a']}", None), ("PUT", f"/expenses/{m['exp_a']}", {"description": "HACKEADO", "amount": "1"}),
        ("DELETE", f"/expenses/{m['exp_a']}", None),
        ("PUT", f"/expenses/categories/{m['cat_a']}", {"name": "HACKEADA"}), ("DELETE", f"/expenses/categories/{m['cat_a']}", None),
        ("POST", "/expenses", {"amount": "1", "description": "x", "expense_date": HOJE, "account_id": contas["Gaveta"]}),
        ("POST", "/expenses", {"amount": "1", "description": "x", "expense_date": HOJE, "category_id": m["cat_a"]}),
        ("POST", "/expenses", {"amount": "999", "description": "x", "expense_date": HOJE, "stock_entry_id": m["entrada_a"]}),
        ("POST", "/expenses", {"amount": "999", "description": "x", "expense_date": HOJE, "trip_id": m["viagem_a"]}),
        ("POST", "/finance/payables", {"description": "x", "amount": "10", "due_date": HOJE, "expense_category_id": m["cat_a"]}),
        ("GET", f"/cash/sessions/{m['cash_a']}", None),
        ("POST", "/sales/", {"customer_id": cli, "payment_method": "cash",
                              "items": [{"product_id": m["p"].id, "variant_id": m["va"].id, "quantity": 1, "unit_price": "1.00"}],
                              "payments": [{"amount": "1.00", "payment_method": "cash"}]}),
        ("POST", "/sales/", {"payment_method": "cash", "items": [{"product_id": m["p"].id, "variant_id": m["va"].id, "quantity": 1, "unit_price": "1.00"}],
                              "payments": [{"amount": "1.00", "payment_method": "cash"}]}),
        ("POST", "/sales/", {"customer_id": cli, "payment_method": "on_account",
                              "items": [{"product_id": 999998, "quantity": 1, "unit_price": "1.00"}],
                              "payments": [{"amount": "1.00", "payment_method": "on_account"}]}),
        ("POST", "/payment-discounts/calculate", {"payment_method": "cash", "amount": 100}),
    ]
    vazados, c500, sucessos = [], [], []
    for papel, h in m["hb"].items():
        for metodo, caminho, corpo in ataques:
            r = await test_client.request(metodo, f"{API}{caminho}", headers=h, json=corpo)
            if r.status_code >= 500:
                c500.append(f"B/{papel} {metodo} {caminho} -> {r.status_code} {r.text[:100]}")
            elif r.status_code < 300 and "calculate" not in caminho and not _vazio_de_nao_achado(caminho, r):
                sucessos.append(f"B/{papel} {metodo} {caminho} -> {r.status_code} {r.text[:140]}")
            if SEGREDO_CLIENTE in r.text or "segredo.a@" in r.text:
                vazados.append(f"B/{papel} {metodo} {caminho}")
    assert c500 == [], "\n".join(c500)
    assert sucessos == [], "B conseguiu fazer algo na loja A:\n" + "\n".join(sucessos)
    assert vazados == [], vazados
    async_session.expire_all()
    assert await _foto_de_A(test_client, m) == antes, "o estado da loja A mudou depois dos ataques de B"
    # o caixa e o estoque de A não foram tocados pelas vendas de B (as tentativas falharam)
    from app.models.entry_item import EntryItem
    rest = (await async_session.execute(select(EntryItem.quantity_remaining).where(EntryItem.variant_id == m["va"].id))).scalars().all()
    assert sum(rest) == 10 - 3 - 1 + 1, rest   # 10 - venda 3 - fiado 1 + 1 devolvida


async def test_listagens_de_B_nao_mostram_nada_de_A_mesmo_forjando_cabecalhos(test_client, duas_lojas):
    m = duas_lojas
    segredos = [SEGREDO_CLIENTE, SEGREDO_DESPESA, SEGREDO_CONTA, "Categoria Segredo A", "Pessoa Segredo A", "Banco A",
                m["venda"]["sale_number"], m["fiado_venda"]["sale_number"], "segredo.a@example.com"]
    rotas = ["/sales/", "/sales/daily-total", "/customers/", "/receivables", "/receivables/summary", "/expenses",
             "/expenses/categories", "/expenses/resultado-mes", "/expenses/stock-losses", "/finance/accounts", "/finance/transfers",
             "/finance/payables", "/finance/entries", "/finance/loans", "/finance/closings", "/cash/sessions", "/cash/current",
             "/reports/sales?period=this_month", "/reports/monthly", "/reports/cash-flow", "/reports/customers", "/reports/history",
             "/dashboard/stats", "/sales/reports/by-period", "/sales/reports/top-customers", "/sales/reports/top-products",
             "/products/", "/products/grouped", "/reports/stock-check", "/looks/", "/payment-discounts/"]
    forjados = [{}, {"X-Tenant-Id": str(m["t_a"])}, {"X-Store-Slug": "test"}, {"X-Tenant-Id": str(m["t_a"]), "X-Store-Slug": "test"}]
    vazou, c500 = [], []
    for papel in ("admin", "manager"):
        for extra in forjados:
            h = {**m["hb"][papel], **extra}
            for rota in rotas:
                r = await test_client.get(f"{API}{rota}", headers=h)
                if r.status_code >= 500:
                    c500.append(f"{papel} {extra} {rota} -> {r.status_code}")
                for s in segredos:
                    if s in r.text:
                        vazou.append(f"{papel} {extra} {rota} mostra {s!r}")
    assert c500 == [], "\n".join(c500)
    assert vazou == [], "\n".join(vazou)


async def test_B_usa_o_proprio_caixa_e_o_proprio_fiado_sem_encostar_em_A(test_client, async_session, duas_lojas):
    """O caminho feliz de B continua funcionando (o isolamento não pode ser só 'tudo dá erro')."""
    m = duas_lojas
    antes = await _foto_de_A(test_client, m)
    hb = m["hb"]["admin"]
    r = await test_client.post(f"{API}/cash/movements", headers=hb, json={"kind": "supply", "amount": 10, "reason": "troco"})
    assert r.status_code == 409          # B não tem caixa aberto: não "pega carona" no caixa aberto de A
    r = await test_client.post(f"{API}/cash/open", headers=hb, json={"opening_amount": "20.00"})
    assert r.status_code == 201, r.text  # B abre o seu mesmo com o de A aberto
    r = await test_client.post(f"{API}/cash/movements", headers=hb, json={"kind": "withdrawal", "amount": 15, "reason": "sangria"})
    assert r.status_code in (200, 201), r.text
    r = await test_client.post(f"{API}/cash/close", headers=hb, json={"counted_amount": 5})
    assert r.status_code == 200, r.text
    r = await test_client.post(f"{API}/receivables/receive", headers=hb, json={"customer_id": m["cli"], "amount": "1", "payment_method": "cash"})
    assert r.status_code in (400, 404, 409), r.text
    async_session.expire_all()
    assert await _foto_de_A(test_client, m) == antes
