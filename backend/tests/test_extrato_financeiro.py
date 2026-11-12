"""Extrato financeiro passo a passo (GET /finance/statement): dia a dia o que entrou e saiu de cada conta, com o saldo no começo
e no fim do dia. O extrato usa as MESMAS contas do saldo (`flows` e `balances_at`), então tem que fechar com o saldo de cada
conta em qualquer situação: venda em dinheiro e no cartão, devolução, caixa, transferência, compra com gaveta + banco,
despesa, conta a pagar, retirada de sócio e fiado recebido."""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import update

from app.core.security import create_access_token, get_password_hash
from tests.test_caixa import _abrir
from tests.test_compra_abate_conta import ENT, _corpo
from tests.test_fiado import _cliente, _venda
from tests.test_financeiro import _conta, _implantar, _pagar_com, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse: limpa a loja 1 depois de cada teste)
from tests.test_troca import _cenario, _vender

pytestmark = pytest.mark.asyncio
FIN = "/api/v1/finance"


async def _vida_financeira(client, db, user):
    """Loja 1 com o financeiro implantado hoje (gaveta 1000, maquininha 300, Nubank 1000 com PIX, Itaú -50, aluguel de 300 a pagar)
    e a sequência: venda em dinheiro, venda no cartão, devolução, caixa, transferência de R$ 750 da gaveta para o Nubank,
    compra paga com gaveta + banco, despesa, conta a pagar, retirada de sócio e fiado recebido."""
    t_id, h, p, va, vb = await _cenario(db, user)
    await _zerar_implantacao(db, t_id)
    d = (await _implantar(client, h, cash_balance="1000.00", card_balance="300.00", payables=[
        {"description": "Aluguel da loja", "amount": "300.00", "due_date": date.today().isoformat()}])).json()
    ids = {a["name"]: a["id"] for a in d["accounts"]}
    gaveta, nu = ids["Gaveta"], ids["Nubank"]

    sale_id, item_id = await _vender(client, h, p, va, 2, "100.00")                      # +200 na gaveta
    await _pagar_com(client, h, p, va, "credit_card", "120.00")                           # +120 na maquininha
    r = await client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Não serviu", "refund_method": "cash", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text                                                   # -100 da gaveta
    await _abrir(client, h, "100.00")
    r = await client.post("/api/v1/cash/movements", headers=h, json={"kind": "withdrawal", "amount": 20, "reason": "sangria"})
    assert r.status_code in (200, 201), r.text                                            # -20 da gaveta
    r = await client.post(f"{FIN}/transfers", headers=h, json={"from_account_id": gaveta, "to_account_id": nu, "amount": "750"})
    assert r.status_code == 200, r.text                                                   # gaveta -750, Nubank +750
    r = await client.post(ENT, headers=h, json=_corpo(p, va, qtd=40, custo="10.00", paid_account_id=nu, paid_with_cash=True))
    assert r.status_code == 201, r.text                                                   # R$ 400: gaveta paga o que tem, Nubank o resto
    r = await client.post("/api/v1/expenses", headers=h, json={
        "amount": "30.00", "description": "Café da equipe", "expense_date": date.today().isoformat(), "account_id": nu})
    assert r.status_code in (200, 201), r.text
    aluguel = next(x for x in (await client.get(f"{FIN}/payables", headers=h)).json()["items"] if x["description"] == "Aluguel da loja")
    r = await client.post(f"{FIN}/payables/{aluguel['id']}/pay", headers=h, json={"account_id": nu})
    assert r.status_code == 200, r.text
    r = await client.post(f"{FIN}/entries", headers=h, json={"kind": "owner_withdrawal", "account_id": nu, "amount": "100", "person": "Sócia Ana"})
    assert r.status_code == 200, r.text
    cid = await _cliente(db, t_id)
    r = await _venda(client, h, p, va, cid, [{"amount": "40.00", "payment_method": "pix"}, {"amount": "60.00", "payment_method": "on_account"}])
    assert r.status_code in (200, 201), r.text
    for valor, forma in (("25", "cash"), ("10", "pix")):
        r = await client.post("/api/v1/receivables/receive", headers=h, json={"customer_id": cid, "amount": valor, "payment_method": forma})
        assert r.status_code == 200, r.text
    return t_id, h, ids, sale_id


async def _contas(client, h):
    d = (await client.get(f"{FIN}/accounts", headers=h)).json()
    return {a["name"]: a for a in d["accounts"]}, d["total"]


async def _extrato(client, h, **params):
    r = await client.get(f"{FIN}/statement", headers=h, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _linha(dia, kind):
    return [ln for ln in dia["lines"] if ln["kind"] == kind]


async def test_extrato_fecha_com_o_saldo_de_cada_conta_depois_de_toda_a_sequencia(test_client, async_session, test_user):
    t_id, h, ids, _ = await _vida_financeira(test_client, async_session, test_user)
    contas, total = await _contas(test_client, h)
    for nome, conta in contas.items():
        ex = await _extrato(test_client, h, account_id=conta["id"])
        rec = ex["reconciliation"]
        assert rec["difference"] == 0.0, (nome, rec)
        assert rec["balance_now"] == conta["balance"] and rec["closing_of_latest_day"] == conta["balance"], (nome, rec)
        if ex["days"]:
            assert ex["days"][0]["closing"] == conta["balance"], nome
    ex = await _extrato(test_client, h)                                  # todas as contas
    assert ex["account"] is None and ex["reconciliation"]["difference"] == 0.0
    assert ex["days"][0]["closing"] == total and ex["reconciliation"]["balance_now"] == total

    # o que o extrato diz de cada conta, em palavras
    gaveta = (await _extrato(test_client, h, account_id=ids["Gaveta"]))["days"][0]
    tipos = {ln["kind"] for ln in gaveta["lines"]}
    assert {"sales", "refunds", "cash_register", "transfer_out", "purchases", "receivables"} <= tipos
    venda = _linha(gaveta, "sales")[0]
    assert venda["amount"] == 200.0 and venda["label"].startswith("Vendas em dinheiro") and venda["count"] == 1
    assert _linha(gaveta, "refunds")[0]["amount"] == -100.0
    assert _linha(gaveta, "cash_register")[0]["amount"] == -20.0
    assert _linha(gaveta, "cash_register")[0]["items"][0]["amount"] == -20.0
    compra = _linha(gaveta, "purchases")[0]
    assert compra["amount"] == -330.0 and compra["items"][0]["amount"] == -330.0       # a gaveta pagou o que tinha: 1000+200-100-20-750
    nu = (await _extrato(test_client, h, account_id=ids["Nubank"]))["days"][0]
    assert _linha(nu, "purchases")[0]["amount"] == -70.0                                # e o Nubank pagou o resto
    assert _linha(nu, "expenses")[0]["items"][0]["label"] == "Café da equipe"
    assert _linha(nu, "payables")[0]["items"][0]["label"] == "Aluguel da loja"
    retirada = _linha(nu, "other_out")[0]
    assert retirada["amount"] == -100.0 and "Sócia Ana" in retirada["items"][0]["label"]
    maq = (await _extrato(test_client, h, account_id=ids["Maquininha a receber"]))["days"][0]
    assert _linha(maq, "sales")[0]["amount"] == 120.0 and "cartão" in _linha(maq, "sales")[0]["label"]
    # a soma das linhas é sempre o resultado do dia
    for conta in contas.values():
        for dia in (await _extrato(test_client, h, account_id=conta["id"]))["days"]:
            assert round(sum(ln["amount"] for ln in dia["lines"]), 2) == dia["net"]
            assert round(dia["opening"] + dia["net"], 2) == dia["closing"]


async def test_a_cadeia_de_dias_fecha_e_a_transferencia_de_750_aparece_nas_duas_pontas(test_client, async_session, test_user):
    from app.models.finance import AccountTransfer
    from app.models.sale import Payment
    from app.models.store import Store
    from app.models.stock_entry import StockEntry
    t_id, h, ids, sale_id = await _vida_financeira(test_client, async_session, test_user)
    hoje = date.today()
    # espalha a vida da loja por vários dias: venda em dinheiro há 2 dias, transferência e compra ontem
    await async_session.execute(update(Payment).where(Payment.sale_id == sale_id).values(created_at=datetime.utcnow() - timedelta(days=2)))
    await async_session.execute(update(AccountTransfer).where(AccountTransfer.tenant_id == t_id).values(occurred_on=hoje - timedelta(days=1)))
    await async_session.execute(update(StockEntry).where(StockEntry.tenant_id == t_id, StockEntry.paid_account_id.is_not(None))
                                .values(entry_date=hoje - timedelta(days=1)))
    await async_session.execute(update(Store).where(Store.id == t_id).values(finance_start_date=hoje - timedelta(days=3)))
    await async_session.commit()

    contas, total = await _contas(test_client, h)
    ex = await _extrato(test_client, h, days=14)
    dias = ex["days"]                                                         # do mais novo para o mais antigo
    assert [d["date"] for d in dias] == sorted((d["date"] for d in dias), reverse=True) and len(dias) >= 3
    assert ex["reconciliation"]["difference"] == 0.0 and dias[0]["closing"] == total
    for d in dias:
        assert round(d["opening"] + d["net"], 2) == d["closing"], d["date"]            # abertura + resultado = fechamento
    for novo, antigo in zip(dias, dias[1:]):
        assert novo["opening"] == antigo["closing"], (novo["date"], antigo["date"])      # a cadeia não tem buraco
    assert dias[-1]["opening"] == 2250.0                                       # 1000 + 300 + 1000 - 50 na implantação

    # a mesma conta em cada conta separada
    for conta in contas.values():
        e = await _extrato(test_client, h, account_id=conta["id"], days=14)
        assert e["reconciliation"]["difference"] == 0.0
        for novo, antigo in zip(e["days"], e["days"][1:]):
            assert novo["opening"] == antigo["closing"]

    # os R$ 750: saem da gaveta e entram no Nubank, no mesmo dia, com o mesmo valor
    ontem = (hoje - timedelta(days=1)).isoformat()
    g = next(d for d in (await _extrato(test_client, h, account_id=ids["Gaveta"], days=14))["days"] if d["date"] == ontem)
    saiu = _linha(g, "transfer_out")
    assert len(saiu) == 1 and saiu[0]["amount"] == -750.0 and "Nubank" in saiu[0]["label"]
    n = next(d for d in (await _extrato(test_client, h, account_id=ids["Nubank"], days=14))["days"] if d["date"] == ontem)
    entrou = _linha(n, "transfer_in")
    assert len(entrou) == 1 and entrou[0]["amount"] == 750.0 and "Gaveta" in entrou[0]["label"]
    assert entrou[0]["items"][0]["ref"] == saiu[0]["items"][0]["ref"]          # é a MESMA transferência nas duas pontas
    # todas as contas: a transferência aparece na gaveta e no Nubank e não muda o total do dia
    todas = next(d for d in dias if d["date"] == ontem)
    por_conta = {ln["label"]: ln for ln in todas["lines"]}
    assert any(it["amount"] == -750.0 for it in por_conta["Gaveta"]["items"])
    assert any(it["amount"] == 750.0 for it in por_conta["Nubank"]["items"])


async def test_paginacao_nao_repete_nem_pula_dia(test_client, async_session, test_user):
    from app.models.finance import AccountTransfer
    from app.models.sale import Payment
    from app.models.store import Store
    t_id, h, ids, sale_id = await _vida_financeira(test_client, async_session, test_user)
    hoje = date.today()
    await async_session.execute(update(Payment).where(Payment.sale_id == sale_id).values(created_at=datetime.utcnow() - timedelta(days=2)))
    await async_session.execute(update(AccountTransfer).where(AccountTransfer.tenant_id == t_id).values(occurred_on=hoje - timedelta(days=1)))
    await async_session.execute(update(Store).where(Store.id == t_id).values(finance_start_date=hoje - timedelta(days=3)))
    await async_session.commit()
    completo = [d["date"] for d in (await _extrato(test_client, h, days=14))["days"]]
    assert len(completo) >= 3

    vistos, before, paginas = [], None, 0
    while True:
        ex = await _extrato(test_client, h, days=1, **({"before": before} if before else {}))
        vistos += [d["date"] for d in ex["days"]]
        paginas += 1
        assert paginas <= 10
        if ex["next_before"] is None:
            break
        assert before is None or ex["next_before"] < before                      # sempre anda para trás
        before = ex["next_before"]
    assert len(vistos) == len(set(vistos))                                       # nenhum dia repetido
    assert vistos == completo                                                    # nenhum dia pulado, mesma ordem
    # páginas de 2 dias dão o mesmo
    vistos2, before = [], None
    for _ in range(10):
        ex = await _extrato(test_client, h, days=2, **({"before": before} if before else {}))
        vistos2 += [d["date"] for d in ex["days"]]
        if ex["next_before"] is None:
            break
        before = ex["next_before"]
    assert vistos2 == completo
    # só a primeira página chega até hoje: a conferência com o saldo de agora vale só nela
    antiga = await _extrato(test_client, h, before=(hoje - timedelta(days=1)).isoformat(), days=7)
    assert antiga["reconciliation"]["difference"] is None
    assert all(d["date"] < (hoje - timedelta(days=1)).isoformat() for d in antiga["days"])


async def test_extrato_papeis_parametros_e_loja_sem_implantacao(test_client, async_session, test_user):
    from app.models.user import User, UserRole
    t_id, h, ids, _ = await _vida_financeira(test_client, async_session, test_user)

    async def _token(papel):
        u = User(email=f"ext.{papel.value}.{t_id}.{datetime.utcnow().timestamp()}@example.com", full_name="Pessoa",
                 hashed_password=get_password_hash("Senha1234"), role=papel, is_active=True, tenant_id=t_id)
        async_session.add(u)
        await async_session.commit()
        await async_session.refresh(u)
        return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}

    for papel in (UserRole.SELLER, UserRole.CASHIER):
        assert (await test_client.get(f"{FIN}/statement", headers=await _token(papel))).status_code == 403
    gerente = await _token(UserRole.MANAGER)
    assert (await test_client.get(f"{FIN}/statement", headers=gerente)).status_code == 200
    for ruim in ({"days": 0}, {"days": 15}, {"before": "ontem"}, {"account_id": 999999}):
        r = await test_client.get(f"{FIN}/statement", headers=h, params=ruim)
        assert r.status_code in (400, 404, 422), (ruim, r.text)
    assert (await test_client.get(f"{FIN}/statement", headers=h, params={"account_id": 999999})).status_code == 404
    assert (await test_client.get(f"{FIN}/statement", headers=h, params={"days": 15})).status_code == 400
    # depois do corte não há nada para mostrar e o extrato não quebra
    vazio = await _extrato(test_client, h, before=(date.today() - timedelta(days=5)).isoformat())
    assert vazio["days"] == [] and vazio["next_before"] is None
    await _zerar_implantacao(async_session, t_id)
    sem = await _extrato(test_client, h)
    assert sem["started"] is False and sem["days"] == []


async def test_extrato_de_uma_loja_nunca_mostra_a_outra(test_client, async_session):
    from app.api.deps import get_current_tenant_id
    from app.main import app
    from tests.test_team_limit import _nova_loja
    app.dependency_overrides.pop(get_current_tenant_id, None)   # o test_client põe o override ao ser criado: aqui vale a loja do usuário
    _, _, ta = await _nova_loja(async_session, "pro")
    _, _, tb = await _nova_loja(async_session, "pro")
    a, b = {"Authorization": f"Bearer {ta}"}, {"Authorization": f"Bearer {tb}"}
    contas = {}
    for h in (a, b):
        r = await test_client.post(f"{FIN}/setup", headers=h, json={
            "start_date": date.today().isoformat(), "cash_balance": "100", "banks": [{"name": "Banco", "balance": "500"}]})
        assert r.status_code == 200, r.text
        contas[id(h)] = {x["name"]: x["id"] for x in r.json()["accounts"]}
    ca, cb = contas[id(a)], contas[id(b)]
    r = await test_client.post(f"{FIN}/entries", headers=a, json={
        "kind": "owner_withdrawal", "account_id": ca["Banco"], "amount": "77", "person": "Sócia Segredo A"})
    assert r.status_code == 200, r.text
    ex_a = await _extrato(test_client, a, account_id=ca["Banco"])
    assert "Sócia Segredo A" in str(ex_a) and ex_a["reconciliation"]["difference"] == 0.0
    # B não enxerga a conta de A nem o que A lançou
    assert (await test_client.get(f"{FIN}/statement", headers=b, params={"account_id": ca["Banco"]})).status_code == 404
    assert "Sócia Segredo A" not in str(await _extrato(test_client, b))
    assert "Sócia Segredo A" not in str(await _extrato(test_client, b, account_id=cb["Banco"]))


def _texto_pdf(conteudo: bytes) -> str:
    """Texto do PDF pelo pdftotext do poppler, lendo de ARQUIVO (no Windows ele não lê o PDF pela entrada padrão)."""
    import os
    import shutil
    import subprocess
    import tempfile

    if not shutil.which("pdftotext"):
        return ""
    fd, caminho = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(conteudo)
        return subprocess.run(["pdftotext", "-enc", "UTF-8", "-layout", caminho, "-"], capture_output=True).stdout.decode("utf-8", errors="replace")
    finally:
        os.remove(caminho)


async def test_extrato_completo_em_pdf_traz_os_dias_os_750_e_a_conferencia(test_client, async_session, test_user):
    """GET /finance/statement/pdf: o PDF do extrato COMPLETO (todas as contas, ou de uma conta) lê-se como o extrato da tela."""
    t_id, h, ids, _sale = await _vida_financeira(test_client, async_session, test_user)
    r = await test_client.get(f"{FIN}/statement/pdf", headers=h)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
    assert "extrato-" in r.headers["content-disposition"]
    txt = _texto_pdf(r.content)
    if txt:
        assert "Extrato financeiro" in txt and "Começou o dia com" in txt and "Terminou o dia com" in txt
        assert "750,00" in txt                                   # a transferência da gaveta para o Nubank
        assert txt.count("Gaveta para Nubank") == 1              # entre contas: aparece UMA vez, de uma conta para a outra
        assert "Entrou" in txt and "Saiu" in txt and "O que foi" in txt
        assert "Bate com o saldo da conta" in txt                # a conferência do fim do extrato
        assert "NÃO BATE" not in txt
    # só uma conta: o nome dela vai no arquivo e no título
    r = await test_client.get(f"{FIN}/statement/pdf", headers=h, params={"account_id": ids["Nubank"]})
    assert r.status_code == 200 and "nubank" in r.headers["content-disposition"].lower()
    txt = _texto_pdf(r.content)
    if txt:
        assert "Nubank" in txt and "750,00" in txt


async def test_extrato_pdf_so_gerente_e_loja_sem_implantacao_nao_quebra(test_client, async_session, test_user):
    from app.models.user import User, UserRole

    t_id, h, ids, _ = await _vida_financeira(test_client, async_session, test_user)

    async def _token(papel):
        u = User(email=f"extpdf.{papel.value}.{t_id}.{datetime.utcnow().timestamp()}@example.com", full_name="Pessoa",
                 hashed_password=get_password_hash("Senha1234"), role=papel, is_active=True, tenant_id=t_id)
        async_session.add(u)
        await async_session.commit()
        await async_session.refresh(u)
        return {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}

    for papel in (UserRole.SELLER, UserRole.CASHIER):
        assert (await test_client.get(f"{FIN}/statement/pdf", headers=await _token(papel))).status_code == 403
    assert (await test_client.get(f"{FIN}/statement/pdf", headers=await _token(UserRole.MANAGER))).status_code == 200
    assert (await test_client.get(f"{FIN}/statement/pdf", headers=h, params={"account_id": 999999})).status_code == 404
    await _zerar_implantacao(async_session, t_id)
    r = await test_client.get(f"{FIN}/statement/pdf", headers=h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")        # sem implantação: PDF avisa em vez de quebrar


async def test_extrato_detalha_cada_venda_cada_fiado_e_diz_onde_entrou(test_client, async_session, test_user):
    """Vendas, fiado recebido e vendas no fiado aparecem UMA POR UMA (hora, venda, cliente, forma, peças), e o resumo do dia diz
    quanto entrou de cada forma e em que conta."""
    t_id, h, ids, _sale = await _vida_financeira(test_client, async_session, test_user)
    ext = await _extrato(test_client, h)
    dia = next(d for d in ext["days"] if d["date"] == date.today().isoformat())
    # resumo por forma: dinheiro na Gaveta, PIX no Nubank, cartão na Maquininha, fiado não entrou
    por = {m["method"]: m for m in dia["by_method"]}
    assert por["on_account"]["account"].startswith("A receber do cliente") and por["on_account"]["amount"] == 60.0
    assert por["pix"]["account"] == "Nubank" and por["cash"]["account"] == "Gaveta" and por["credit_card"]["amount"] == 120.0
    # a venda no fiado aparece uma por uma, com o número da venda
    assert len(dia["fiado_launched"]) == 1 and "Venda #" in dia["fiado_launched"][0]["label"] and dia["fiado_launched"][0]["amount"] == 60.0
    # extrato de uma conta: cada venda em dinheiro vira um item, e a soma dos itens é a linha
    gaveta = await _extrato(test_client, h, account_id=ids["Gaveta"])
    dg = next(d for d in gaveta["days"] if d["date"] == date.today().isoformat())
    vendas = next(ln for ln in dg["lines"] if ln["kind"] == "sales")
    assert vendas["items"] and all("Venda #" in it["label"] for it in vendas["items"])
    assert round(sum(it["amount"] for it in vendas["items"]), 2) == round(vendas["amount"], 2)
    # fiado recebido: um item por recebimento, com o nome do cliente e a forma
    nu = await _extrato(test_client, h, account_id=ids["Nubank"])
    dn = next(d for d in nu["days"] if d["date"] == date.today().isoformat())
    rec = next(ln for ln in dn["lines"] if ln["kind"] == "receivables")
    assert len(rec["items"]) == 1 and "PIX" in rec["items"][0]["label"] and rec["items"][0]["amount"] == 10.0
    # devolução em dinheiro: um item, na Gaveta
    dev = next(ln for ln in dg["lines"] if ln["kind"] == "refunds")
    assert dev["items"] and "Devolução da venda #" in dev["items"][0]["label"]
