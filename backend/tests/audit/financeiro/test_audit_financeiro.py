"""Auditoria independente do FINANCEIRO: um livro simples em Python calcula o saldo esperado de cada conta depois de uma
sequencia aleatoria (semente fixa) de operacoes e compara com GET /finance/accounts a cada passo."""
import random
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.core.security import create_access_token, get_password_hash
from tests.test_financeiro import _conta, _implantar, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (autouse)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"
HOJE = date.today()
D = Decimal


class Livro:
    """Saldo esperado por conta (Decimal), independente do app."""

    def __init__(self, gaveta, maq, nu, itau):
        self.ids = {"G": gaveta, "M": maq, "N": nu, "I": itau}
        self.bal = {"G": D("150"), "M": D("300"), "N": D("1000"), "I": D("-50")}

    def total(self):
        return sum(self.bal.values())


async def _confere(client, h, livro, passo):
    r = await client.get(f"{API}/accounts", headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    for k, nome in (("G", "Gaveta"), ("M", "Maquininha a receber"), ("N", "Nubank"), ("I", "Itaú")):
        got = D(str(_conta(d, nome)["balance"]))
        assert got == livro.bal[k], f"passo {passo}: {nome} esperado {livro.bal[k]} veio {got}"
    assert D(str(d["total"])) == livro.total(), f"passo {passo}: total"
    cs = d["card_schedule"]
    assert D(str(cs["balance"])) == livro.bal["M"], passo
    soma = D(str(cs["previous"])) + sum((D(str(i["amount"])) for i in cs["items"]), D(0))
    assert soma == livro.bal["M"], f"passo {passo}: previsao do cartao nao fecha com o saldo ({soma} x {livro.bal['M']})"


@pytest.mark.parametrize("semente", [7, 2026, 31415])
async def test_livro_sequencia_aleatoria(test_client, async_session, test_user, semente):
    rnd = random.Random(semente)
    t_id, h, p, va, vb = await _cenario(async_session, test_user, stock_b=80)
    await _zerar_implantacao(async_session, t_id)
    d = (await _implantar(test_client, h, payables=[])).json()
    L = Livro(*(_conta(d, n)["id"] for n in ("Gaveta", "Maquininha a receber", "Nubank", "Itaú")))
    await _confere(test_client, h, L, "inicio")
    vendas = []          # [sale_id, item_id, conta, valor, devolvida]
    transfers = []       # [id, de, para, recebido, taxa, viva]
    pagaveis = []        # [id, valor, conta|None]
    entradas = []        # [id, conta, delta]   (so simples)
    emprestado = D(0)
    for passo in range(38):
        op = rnd.choice(["venda", "venda", "devolucao", "transf", "transf", "despesa", "pagavel", "pagar", "desfazer",
                         "retirada", "emprestimo", "repasse", "apagar_transf", "apagar_entrada"])
        valor = D(rnd.randint(500, 9000)) / 100
        if op == "venda":
            m, k = rnd.choice([("cash", "G"), ("pix", "N"), ("credit_card", "M"), ("debit_card", "M")])
            r = await test_client.post("/api/v1/sales/", headers=h, json={
                "payment_method": m, "items": [{"product_id": p.id, "variant_id": vb.id, "quantity": 1, "unit_price": str(valor)}],
                "payments": [{"amount": str(valor), "payment_method": m}]})
            assert r.status_code in (200, 201), r.text
            b = r.json()
            vendas.append([b["id"], b["items"][0]["id"], k, valor, False])
            L.bal[k] += valor
        elif op == "devolucao":
            abertas = [v for v in vendas if not v[4]]
            if not abertas:
                continue
            v = rnd.choice(abertas)
            r = await test_client.post(f"/api/v1/returns/{v[0]}", headers=h, json={
                "reason": "Nao serviu", "refund_method": "original", "items": [{"sale_item_id": v[1], "quantity": 1}]})
            assert r.status_code == 201, r.text
            v[4] = True
            L.bal[v[2]] -= v[3]
        elif op == "transf":
            a, b_ = rnd.sample(list("GMNI"), 2)
            r = await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": L.ids[a], "to_account_id": L.ids[b_], "amount": str(valor)})
            if a in "GM" and valor > L.bal[a]:       # D-02: gaveta e maquininha nao ficam negativas
                assert r.status_code == 400 and "só tem" in r.json()["detail"], r.text
                continue
            assert r.status_code == 200, r.text
            tid = max(t["id"] for t in (await test_client.get(f"{API}/transfers", headers=h)).json())
            transfers.append([tid, a, b_, valor, D(0), True])
            L.bal[a] -= valor
            L.bal[b_] += valor
        elif op == "despesa":
            k = rnd.choice(list("GNI"))
            r = await test_client.post("/api/v1/expenses", headers=h, json={
                "amount": str(valor), "description": f"Desp {passo}", "expense_date": HOJE.isoformat(), "account_id": L.ids[k]})
            assert r.status_code in (200, 201), r.text
            L.bal[k] -= valor
        elif op == "pagavel":
            r = await test_client.post(f"{API}/payables", headers=h, json={"description": f"Conta {passo}", "amount": str(valor), "due_date": HOJE.isoformat()})
            assert r.status_code == 200, r.text
            pagaveis.append([r.json()["id"], valor, None])
        elif op == "pagar":
            abertas = [x for x in pagaveis if x[2] is None]
            if not abertas:
                continue
            x = rnd.choice(abertas)
            k = rnd.choice(list("GNI"))
            r = await test_client.post(f"{API}/payables/{x[0]}/pay", headers=h, json={"account_id": L.ids[k]})
            assert r.status_code == 200, r.text
            x[2] = k
            L.bal[k] -= x[1]
        elif op == "desfazer":
            pagas = [x for x in pagaveis if x[2] is not None]
            if not pagas:
                continue
            x = rnd.choice(pagas)
            r = await test_client.post(f"{API}/payables/{x[0]}/unpay", headers=h)
            assert r.status_code == 200, r.text
            L.bal[x[2]] += x[1]
            x[2] = None
        elif op == "retirada":
            k = rnd.choice(list("GNI"))
            r = await test_client.post(f"{API}/entries", headers=h, json={"kind": rnd.choice(["owner_withdrawal", "card_bill"]), "account_id": L.ids[k], "amount": str(valor), "person": "Socia", "description": "x"})
            assert r.status_code == 200, r.text
            entradas.append([r.json()["id"], k, -valor])
            L.bal[k] -= valor
        elif op == "emprestimo":
            k = rnd.choice(list("GNI"))
            if rnd.random() < 0.6 or emprestado == 0:
                r = await test_client.post(f"{API}/entries", headers=h, json={"kind": "loan_given", "account_id": L.ids[k], "amount": str(valor), "person": "Maria"})
                assert r.status_code == 200, r.text
                L.bal[k] -= valor
                emprestado += valor
            else:
                volta = min(valor, emprestado)
                r = await test_client.post(f"{API}/entries", headers=h, json={"kind": "loan_repaid", "account_id": L.ids[k], "amount": str(volta), "person": "MARIA"})
                assert r.status_code == 200, r.text
                L.bal[k] += volta
                emprestado -= volta
        elif op == "repasse":
            have = L.bal["M"]
            if have < 20:
                continue
            gross = (min(have, D(rnd.randint(1000, 8000)) / 100)).quantize(D("0.01"))
            taxa = (gross * D(rnd.choice([0, 0, 2, 3])) / 100).quantize(D("0.01"))
            rec = gross - taxa
            alvo = rnd.choice(["N", "I"])
            r = await test_client.post(f"{API}/card-settlement", headers=h, json={"gross": str(gross), "received": str(rec), "to_account_id": L.ids[alvo]})
            assert r.status_code == 200, r.text
            assert D(str(r.json()["fee"])) == taxa
            tid = max(t["id"] for t in (await test_client.get(f"{API}/transfers", headers=h)).json())
            transfers.append([tid, "M", alvo, rec, taxa, True])
            L.bal["M"] -= gross
            L.bal[alvo] += rec
        elif op == "apagar_transf":
            vivas = [t for t in transfers if t[5]]
            if not vivas:
                continue
            t = rnd.choice(vivas)
            r = await test_client.delete(f"{API}/transfers/{t[0]}", headers=h)
            assert r.status_code == 200, r.text
            t[5] = False
            L.bal[t[1]] += t[3] + t[4]
            L.bal[t[2]] -= t[3]
        elif op == "apagar_entrada":
            if not entradas:
                continue
            e = rnd.choice(entradas)
            r = await test_client.delete(f"{API}/entries/{e[0]}", headers=h)
            assert r.status_code == 200, r.text
            L.bal[e[1]] -= e[2]
            entradas.remove(e)
        await _confere(test_client, h, L, f"{passo}-{op}")
    lo = (await test_client.get(f"{API}/loans", headers=h)).json()
    assert D(str(lo["to_receive_total"])) == emprestado


async def _token(db, t_id, papel):
    from app.models.user import User
    u = User(email=f"aud.{papel.value}.{t_id}.{datetime.utcnow().timestamp()}@example.com", full_name="Pessoa",
             hashed_password=get_password_hash("Senha1234"), role=papel, is_active=True, tenant_id=t_id)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}


async def test_erros_nunca_500(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    c = test_client
    achados = []

    async def ruim(url, body=None, met="post"):
        try:
            r = await (c.post(url, headers=h, json=body) if met == "post" else c.put(url, headers=h, json=body))
            code, txt = r.status_code, r.text[:160]
        except Exception as e:      # excecao nao tratada = 500 de verdade
            code, txt = 500, f"{type(e).__name__}: {e}"
        if code not in (400, 404, 409, 422):
            achados.append((url, body, code, txt))

    for url, body in ((f"{API}/transfers", {"from_account_id": 1, "to_account_id": 2, "amount": 1}),
                      (f"{API}/card-settlement", {"gross": 1, "received": 1}),
                      (f"{API}/payables/1/pay", {"account_id": 1}),
                      (f"{API}/entries", {"kind": "other_out", "account_id": 1, "amount": 1, "description": "x"})):
        await ruim(url, body)
    hoje = HOJE.isoformat()
    for corpo in ({"start_date": "abc"}, {"cash_balance": "abc"}, {"cash_balance": "NaN"}, {"cash_balance": "Infinity"},
                  {"banks": "x"}, {"banks": [1]}, {"banks": [None]}, {"payables": "x"}, {"payables": [None]},
                  {"payables": [{"description": "a", "amount": "5", "due_date": "lixo"}]},
                  {"payables": [{"description": "a", "amount": "5", "due_date": "2026-12-01", "supplier_id": 99999}]},
                  {"banks": [{"name": "A"}, {"name": "a"}]}, {"cash_balance": "1e30"}, {"card_balance": -1},
                  {"banks": [{"name": "X", "balance": "abc"}]}):
        await ruim(f"{API}/setup", {"start_date": hoje, **corpo})
    assert (await c.get(f"{API}/accounts", headers=h)).json()["started"] is False
    d = (await _implantar(c, h, payables=[])).json()
    g, m, n, i = (_conta(d, x)["id"] for x in ("Gaveta", "Maquininha a receber", "Nubank", "Itaú"))
    for body in ({"from_account_id": "abc", "to_account_id": n, "amount": 1}, {"from_account_id": None, "to_account_id": n, "amount": 1},
                 {"from_account_id": g, "to_account_id": n, "amount": -5}, {"from_account_id": g, "to_account_id": n, "amount": "abc"},
                 {"from_account_id": g, "to_account_id": n, "amount": 1, "occurred_on": "2999-01-01"},
                 {"from_account_id": g, "to_account_id": n, "amount": 1, "occurred_on": "2000-01-01"},
                 {"from_account_id": g, "to_account_id": n, "amount": 1, "occurred_on": "xx"},
                 {"from_account_id": g, "to_account_id": n, "amount": 99999999999}, {"from_account_id": [], "to_account_id": n, "amount": 1}):
        await ruim(f"{API}/transfers", body)
    for body in ({"gross": 10, "received": 10, "to_account_id": "abc"}, {"gross": 10, "received": 10, "to_account_id": g},
                 {"gross": 10, "received": 10, "to_account_id": 999999}, {"gross": 10, "received": 10, "occurred_on": "2999-01-01"},
                 {"gross": "abc", "received": 1}, {"gross": 10, "received": -1}, {"gross": 500, "received": 500}):
        await ruim(f"{API}/card-settlement", body)
    for body in ({"description": "x", "amount": 0, "due_date": "2026-12-01"}, {"description": "x", "amount": -1, "due_date": "2026-12-01"},
                 {"description": "", "amount": 5, "due_date": "2026-12-01"}, {"description": "x", "amount": 5, "due_date": "nope"},
                 {"description": "x", "amount": 5}, {"description": "x", "amount": 5, "due_date": "2026-12-01", "expense_category_id": 999999, "counts_as_expense": True},
                 {"description": "x", "amount": 5, "due_date": "2026-12-01", "supplier_id": 999999}):
        await ruim(f"{API}/payables", body)
    pid = (await c.post(f"{API}/payables", headers=h, json={"description": "ok", "amount": 5, "due_date": "2026-12-01"})).json()["id"]
    for body in ({}, {"account_id": "abc"}, {"account_id": 999999}, {"account_id": g, "paid_on": "2999-01-01"},
                 {"account_id": g, "paid_on": "2000-01-01"}, {"account_id": g, "paid_on": "xx"}):
        await ruim(f"{API}/payables/{pid}/pay", body)
    await ruim(f"{API}/payables/999999/pay", {"account_id": g})
    await ruim(f"{API}/payables/999999/unpay", {})
    await ruim(f"{API}/payables/999999/cancel", {})
    await ruim(f"{API}/payables/{pid}/unpay", {})
    assert (await c.post(f"{API}/payables/{pid}/cancel", headers=h)).status_code == 200
    await ruim(f"{API}/payables/{pid}/cancel", {})
    await ruim(f"{API}/payables/{pid}/pay", {"account_id": g})
    for body in ({"kind": "x", "account_id": g, "amount": 1}, {"account_id": g, "amount": 1}, {"kind": "other_out", "account_id": g, "amount": 1},
                 {"kind": "loan_paid", "account_id": g, "amount": 1, "person": "Ninguem"}, {"kind": "other_in", "account_id": g, "amount": "abc", "description": "x"},
                 {"kind": "other_in", "account_id": None, "amount": 1, "description": "x"}):
        await ruim(f"{API}/entries", body)
    for url in (f"{API}/entries/999999", f"{API}/transfers/999999"):
        assert (await c.delete(url, headers=h)).status_code == 404
    for body in ({"name": ""}, {"name": "Nubank"}, {"name": "nubank"}, {"name": "Z", "balance": "abc"}):
        await ruim(f"{API}/accounts", body)
    assert (await c.put(f"{API}/accounts/{g}/pix", headers=h)).status_code == 400
    assert (await c.put(f"{API}/accounts/999999/pix", headers=h)).status_code == 404
    for y, mm in ((0, 1), (10000, 1), (2026, 0), (-1, 5), (2026, 99)):
        try:
            r = await c.get(f"{API}/closings/{y}/{mm}", headers=h)
            code = r.status_code
        except Exception:
            code = 500
        if code not in (400, 404, 422):
            achados.append((f"closings/{y}/{mm}", None, code, ""))
    assert not achados, "respostas 500 ou inesperadas:\n" + "\n".join(map(str, achados))


@pytest.fixture
def _tenant_de_verdade():
    """O conftest forca a loja 1 em toda rota; aqui vale a loja do usuario logado."""
    from app.api.deps import get_current_tenant_id
    from app.main import app
    guardado = app.dependency_overrides.pop(get_current_tenant_id, None)
    yield
    if guardado is not None:
        app.dependency_overrides[get_current_tenant_id] = guardado


async def test_isolamento_outra_loja(test_client, async_session, _tenant_de_verdade):
    from app.api.deps import get_current_tenant_id
    from app.main import app
    from tests.test_team_limit import _nova_loja
    app.dependency_overrides.pop(get_current_tenant_id, None)
    _, _, ta = await _nova_loja(async_session, "pro")
    _, _, tb = await _nova_loja(async_session, "pro")
    a, b = {"Authorization": f"Bearer {ta}"}, {"Authorization": f"Bearer {tb}"}
    da = (await _implantar(test_client, a)).json()
    db_ = (await _implantar(test_client, b, payables=[])).json()
    ga, na, ma = (_conta(da, x)["id"] for x in ("Gaveta", "Nubank", "Maquininha a receber"))
    gb, nb = _conta(db_, "Gaveta")["id"], _conta(db_, "Nubank")["id"]
    pid = (await test_client.get(f"{API}/payables", headers=a)).json()["items"][0]["id"]
    assert (await test_client.get(f"{API}/payables", headers=b)).json()["items"] == []
    t = (await test_client.post(f"{API}/transfers", headers=a, json={"from_account_id": ga, "to_account_id": na, "amount": 5})).status_code
    assert t == 200
    tid = (await test_client.get(f"{API}/transfers", headers=a)).json()[0]["id"]
    assert (await test_client.get(f"{API}/transfers", headers=b)).json() == []
    for body in ({"from_account_id": ga, "to_account_id": gb, "amount": 1}, {"from_account_id": gb, "to_account_id": na, "amount": 1}):
        r = await test_client.post(f"{API}/transfers", headers=b, json=body)
        assert r.status_code == 404, r.text
    assert (await test_client.post(f"{API}/payables/{pid}/pay", headers=b, json={"account_id": gb})).status_code == 404
    assert (await test_client.post(f"{API}/payables/{pid}/cancel", headers=b)).status_code == 404
    assert (await test_client.post(f"{API}/payables/{pid}/unpay", headers=b)).status_code == 404
    assert (await test_client.post(f"{API}/payables", headers=b, json={"description": "x", "amount": 1, "due_date": "2026-12-01", "supplier_id": 1})).status_code in (400, 404)
    assert (await test_client.put(f"{API}/accounts/{na}/pix", headers=b)).status_code == 404
    assert (await test_client.delete(f"{API}/transfers/{tid}", headers=b)).status_code == 404
    r = await test_client.post(f"{API}/entries", headers=b, json={"kind": "other_out", "account_id": ga, "amount": 1, "description": "x"})
    assert r.status_code == 404
    r = await test_client.post(f"{API}/card-settlement", headers=b, json={"gross": 1, "received": 1, "to_account_id": na})
    assert r.status_code == 404
    r = await test_client.post("/api/v1/expenses", headers=b, json={"amount": "1", "description": "X", "expense_date": HOJE.isoformat(), "account_id": ga})
    assert r.status_code in (400, 404)
    # a loja A continua intacta (so a transferencia dela)
    d = (await test_client.get(f"{API}/accounts", headers=a)).json()
    assert _conta(d, "Gaveta")["balance"] == 145.0 and _conta(d, "Nubank")["balance"] == 1005.0
    assert next(x for x in (await test_client.get(f"{API}/payables", headers=a)).json()["items"] if x["id"] == pid)["status"] == "open"
    d = (await test_client.get(f"{API}/accounts", headers=b)).json()
    assert _conta(d, "Gaveta")["balance"] == 150.0 and d["total"] == 1400.0


async def test_mes_fechado_e_datas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    mp_fim = HOJE.replace(day=1) - timedelta(days=1)
    mp = mp_fim.replace(day=1)
    d = (await _implantar(test_client, h, start_date=mp.isoformat(), payables=[])).json()
    g, m, n, i = (_conta(d, x)["id"] for x in ("Gaveta", "Maquininha a receber", "Nubank", "Itaú"))
    dia = mp.replace(day=10).isoformat()
    pid = (await test_client.post(f"{API}/payables", headers=h, json={"description": "A", "amount": 10, "due_date": dia})).json()["id"]
    assert (await test_client.post(f"{API}/payables/{pid}/pay", headers=h, json={"account_id": n, "paid_on": dia})).status_code == 200
    pid2 = (await test_client.post(f"{API}/payables", headers=h, json={"description": "B", "amount": 10, "due_date": dia})).json()["id"]
    cont = {str(a["id"]): str(a["balance"]) for a in (await test_client.get(f"{API}/accounts", headers=h)).json()["accounts"]}
    r = await test_client.post(f"{API}/closings/{mp.year}/{mp.month}", headers=h, json={"counted": cont})
    assert r.status_code == 200, r.text
    r = await test_client.post(f"{API}/payables/{pid2}/pay", headers=h, json={"account_id": n, "paid_on": dia})
    assert r.status_code == 409 and "fechado" in r.json()["detail"]
    r = await test_client.post(f"{API}/payables/{pid}/unpay", headers=h)
    assert r.status_code == 409 and "fechado" in r.json()["detail"]
    r = await test_client.post(f"{API}/card-settlement", headers=h, json={"gross": 10, "received": 10, "occurred_on": dia})
    assert r.status_code == 409
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "5", "description": "Cafe antigo", "expense_date": dia, "account_id": g})
    assert r.status_code in (400, 409), f"despesa com conta em mes fechado deveria ser recusada: {r.status_code} {r.text[:150]}"
    antes = (mp - timedelta(days=1)).isoformat()
    for url, body in ((f"{API}/transfers", {"from_account_id": g, "to_account_id": n, "amount": 1, "occurred_on": antes}),
                      (f"{API}/payables/{pid2}/pay", {"account_id": n, "paid_on": antes})):
        r = await test_client.post(url, headers=h, json=body)
        assert r.status_code == 400 and "antes" in r.json()["detail"]
    assert (await test_client.post(f"{API}/closings/{mp.year}/{mp.month}/reopen", headers=h)).status_code == 200
    assert (await test_client.post(f"{API}/payables/{pid2}/pay", headers=h, json={"account_id": n, "paid_on": dia})).status_code == 200


async def test_projecao_do_fiado_e_papeis(test_client, async_session, test_user):
    from app.models.user import UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    await _implantar(test_client, h)
    d = (await test_client.get(f"{API}/accounts", headers=h)).json()
    pj = d["projection"]
    assert pj["money_now"] == d["total"] == 1400.0
    assert pj["payables_open"] == 2000.0
    assert round(pj["after_paying_everything"], 2) == round(pj["money_now"] + pj["fiado_open"] - pj["payables_open"], 2)
    assert round(pj["if_overdue_received"], 2) == round(pj["money_now"] + pj["fiado_overdue"], 2)
    cli = await test_client.post("/api/v1/customers/", headers=h, json={"full_name": "Cliente Fiado Aud", "phone": "34999990000"})
    assert cli.status_code in (200, 201), cli.text
    r = await test_client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "on_account", "customer_id": cli.json()["id"],
        "items": [{"product_id": p.id, "variant_id": vb.id, "quantity": 1, "unit_price": "100.00"}],
        "payments": [{"amount": "100.00", "payment_method": "on_account", "installments": 2, "interval_days": 7,
                      "first_due_date": (HOJE + timedelta(days=7)).isoformat()}]})
    assert r.status_code in (200, 201), r.text
    d2 = (await test_client.get(f"{API}/accounts", headers=h)).json()
    assert d2["total"] == 1400.0                         # fiado nao e dinheiro
    assert d2["projection"]["fiado_open"] == 100.0
    assert d2["projection"]["after_paying_everything"] == 1400.0 + 100 - 2000.0
    gerente = await _token(async_session, t_id, UserRole.MANAGER)
    caixa = await _token(async_session, t_id, UserRole.CASHIER)
    assert (await test_client.get(f"{API}/accounts", headers=caixa)).status_code == 403
    assert (await test_client.post(f"{API}/transfers", headers=caixa, json={"from_account_id": 1, "to_account_id": 2, "amount": 1})).status_code == 403
    assert (await test_client.post(f"{API}/card-settlement", headers=caixa, json={"gross": 1, "received": 1})).status_code == 403
    assert (await test_client.post(f"{API}/closings/2026/1/reopen", headers=gerente)).status_code == 403


async def test_despesa_com_conta_em_mes_fechado_nao_pode_ser_editada_nem_apagada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    mp = (HOJE.replace(day=1) - timedelta(days=1)).replace(day=1)
    d = (await _implantar(test_client, h, start_date=mp.isoformat(), payables=[])).json()
    g = _conta(d, "Gaveta")["id"]
    dia = mp.replace(day=10).isoformat()
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "5", "description": "Cafe", "expense_date": dia, "account_id": g})
    assert r.status_code in (200, 201), r.text
    eid = r.json()["id"]
    cont = {str(a["id"]): str(a["balance"]) for a in (await test_client.get(f"{API}/accounts", headers=h)).json()["accounts"]}
    assert (await test_client.post(f"{API}/closings/{mp.year}/{mp.month}", headers=h, json={"counted": cont})).status_code == 200
    r = await test_client.put(f"/api/v1/expenses/{eid}", headers=h, json={"amount": "500"})
    assert r.status_code in (400, 409), f"editar despesa de mes fechado: {r.status_code}"
    r = await test_client.delete(f"/api/v1/expenses/{eid}", headers=h)
    assert r.status_code in (400, 409), f"apagar despesa de mes fechado: {r.status_code}"


async def test_transferencia_acima_do_saldo_da_gaveta_e_recusada(test_client, async_session, test_user):
    """D-02: gaveta e maquininha recusam (400, "A conta X so tem R$ Y"); banco pode ficar negativo, com aviso (`warning`)."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    d = (await _implantar(test_client, h, payables=[])).json()
    g, n = _conta(d, "Gaveta")["id"], _conta(d, "Nubank")["id"]
    r = await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": g, "to_account_id": n, "amount": 99999})
    assert r.status_code == 400, f"transferencia da gaveta (R$150) de R$99.999 foi aceita: {r.status_code}"
    assert "A conta Gaveta só tem R$ 150,00" in r.json()["detail"]
    m = _conta(d, "Maquininha a receber")["id"]
    r = await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": m, "to_account_id": n, "amount": 99999})
    assert r.status_code == 400 and "só tem" in r.json()["detail"]
    # banco pode ficar negativo, mas a resposta traz o aviso
    r = await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": n, "to_account_id": g, "amount": 99999})
    assert r.status_code == 200, r.text
    assert "negativa" in r.json()["warning"]
    # dentro do saldo: sem aviso
    r = await test_client.post(f"{API}/transfers", headers=h, json={"from_account_id": g, "to_account_id": n, "amount": 10})
    assert r.status_code == 200 and "warning" not in r.json()


async def test_despesa_sem_conta_em_mes_fechado_e_permitida_e_aparece_como_mudanca(test_client, async_session, test_user):
    """D-06: despesa COM conta em mes fechado = 409 (criar, editar, mudar a data, apagar); SEM conta = permitida
    (nao mexe no dinheiro das contas) e o fechamento avisa em `expenses_without_account_changed`."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    mp = (HOJE.replace(day=1) - timedelta(days=1)).replace(day=1)
    d = (await _implantar(test_client, h, start_date=mp.isoformat(), payables=[])).json()
    g = _conta(d, "Gaveta")["id"]
    dia = mp.replace(day=10).isoformat()
    # despesa com conta ANTES de fechar, para testar editar/apagar depois
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "5", "description": "Antes", "expense_date": dia, "account_id": g})
    assert r.status_code in (200, 201), r.text
    eid = r.json()["id"]
    cont = {str(a["id"]): str(a["balance"]) for a in (await test_client.get(f"{API}/accounts", headers=h)).json()["accounts"]}
    assert (await test_client.post(f"{API}/closings/{mp.year}/{mp.month}", headers=h, json={"counted": cont})).status_code == 200
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "5", "description": "X", "expense_date": dia, "account_id": g})
    assert r.status_code == 409 and "fechado" in r.json()["detail"]
    r = await test_client.put(f"/api/v1/expenses/{eid}", headers=h, json={"amount": "500"})
    assert r.status_code == 409
    # mudar a data para fora do mes fechado tambem e recusado (sai de la)
    r = await test_client.put(f"/api/v1/expenses/{eid}", headers=h, json={"expense_date": HOJE.isoformat()})
    assert r.status_code == 409
    assert (await test_client.delete(f"/api/v1/expenses/{eid}", headers=h)).status_code == 409
    # despesa de hoje com conta: mover para dentro do mes fechado = 409
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "7", "description": "Hoje", "expense_date": HOJE.isoformat(), "account_id": g})
    assert r.status_code in (200, 201), r.text
    r = await test_client.put(f"/api/v1/expenses/{r.json()['id']}", headers=h, json={"expense_date": dia})
    assert r.status_code == 409
    # SEM conta: permitida; o fechamento avisa
    antes = (await test_client.get(f"{API}/closings/{mp.year}/{mp.month}", headers=h)).json()["closed"]
    assert antes["expenses_without_account_changed"] is False
    r = await test_client.post("/api/v1/expenses", headers=h, json={"amount": "9", "description": "Aluguel esquecido", "expense_date": dia})
    assert r.status_code in (200, 201), r.text
    depois = (await test_client.get(f"{API}/closings/{mp.year}/{mp.month}", headers=h)).json()["closed"]
    assert depois["expenses_without_account_changed"] is True
    assert depois["changed_since_close"] == 0.0        # o dinheiro das contas nao mudou
