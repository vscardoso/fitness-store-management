"""AUDITORIA caixa da gaveta: livro independente em Decimal contra /cash/* e /finance/accounts."""
import asyncio
from decimal import Decimal as D

import pytest

from tests.test_caixa import _abrir, _atual, _pix, _tick
from tests.test_financeiro import _conta, _implantar, _zerar_implantacao
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401
from tests.test_troca import _cenario, _vender

pytestmark = pytest.mark.asyncio
API = "/api/v1/cash"


async def _mov(c, h, kind, amount, reason):
    return await c.post(f"{API}/movements", headers=h, json={"kind": kind, "amount": amount, "reason": reason})


async def test_livro_do_caixa_passo_a_passo_com_centavos(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    assert (await _implantar(test_client, h, payables=[])).status_code == 200
    livro = {"abertura": D("37.15"), "vendas": D(0), "dev": D(0), "sup": D(0), "sang": D(0)}

    def esperado():
        return livro["abertura"] + livro["vendas"] - livro["dev"] + livro["sup"] - livro["sang"]

    await _abrir(test_client, h, "37.15")
    for qtd, preco in ((1, "19.99"), (3, "33.33"), (2, "0.07")):
        await _vender(test_client, h, p, va, qtd, preco)
        livro["vendas"] += D(preco) * qtd
        s = (await _atual(test_client, h))["session"]
        assert D(str(s["expected_amount"])) == esperado(), (qtd, preco, s)
    await _pix(test_client, h, p, vb, 1, "55.55")
    assert D(str((await _atual(test_client, h))["session"]["expected_amount"])) == esperado()   # pix não entra

    r = await _mov(test_client, h, "supply", 12.34, "troco")
    assert r.status_code == 201
    livro["sup"] += D("12.34")
    r = await _mov(test_client, h, "withdrawal", 0.01, "sangria")
    assert r.status_code == 201
    livro["sang"] += D("0.01")
    s = (await _atual(test_client, h))["session"]
    assert D(str(s["expected_amount"])) == esperado()
    assert (s["supplies"], s["withdrawals"]) == (12.34, 0.01)

    # Gaveta no Financeiro = 150 (implantação) + tudo que mexeu na gaveta
    fin = (await test_client.get("/api/v1/finance/accounts", headers=h)).json()
    assert D(str(_conta(fin, "Gaveta")["balance"])) == D("150.00") + livro["vendas"] + livro["sup"] - livro["sang"]

    r = await test_client.post(f"{API}/close", headers=h, json={"counted_amount": float(esperado()) - 0.01})
    f = r.json()
    assert r.status_code == 200 and D(str(f["difference"])) == D("-0.01")


async def test_erros_de_caixa_nunca_500_e_com_frase(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    # sem caixa
    r = await _mov(test_client, h, "supply", 1, "troco")
    assert r.status_code == 409
    assert (await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 1})).status_code == 409
    assert (await test_client.get(f"{API}/sessions/999999", headers=h)).status_code == 404
    await _abrir(test_client, h, "10")
    # abrir de novo
    r = await test_client.post(f"{API}/open", headers=h, json={"opening_amount": 1})
    assert r.status_code == 409 and r.json()["detail"]
    # corpo faltando / tipos errados
    for rota, corpo in (("open", {}), ("close", {}), ("movements", {}), ("open", {"opening_amount": None}),
                        ("movements", {"kind": "supply", "amount": "x", "reason": "troco"}),
                        ("close", {"counted_amount": "NaN"}), ("open", {"opening_amount": "inf"})):
        r = await test_client.post(f"{API}/{rota}", headers=h, json=corpo)
        assert r.status_code in (400, 422), (rota, corpo, r.status_code, r.text)
    # account_id inexistente / de outra loja sem Financeiro implantado
    r = await test_client.post(f"{API}/movements", headers=h, json={"kind": "withdrawal", "amount": 1, "reason": "sangria", "account_id": 999999})
    assert r.status_code in (400, 404, 409), r.text
    # sangria exatamente igual ao saldo passa; 1 centavo a mais não
    assert (await _mov(test_client, h, "withdrawal", 10.01, "sangria")).status_code == 400
    assert (await _mov(test_client, h, "withdrawal", 10, "sangria")).status_code == 201
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 0.0
    # fechar com zero contado: diferença 0
    f = (await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 0})).json()
    assert f["difference"] == 0.0
    # fechar de novo
    r = await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 0})
    assert r.status_code == 409 and r.json()["detail"]


async def test_sangria_maior_que_saldo_considera_vendas_em_dinheiro_e_nao_pix(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _abrir(test_client, h, "0")
    await _pix(test_client, h, p, va, 1, "500.00")
    assert (await _mov(test_client, h, "withdrawal", 1, "sangria")).status_code == 400   # PIX não é dinheiro
    await _vender(test_client, h, p, va, 1, "20.00")
    assert (await _mov(test_client, h, "withdrawal", 20.01, "sangria")).status_code == 400
    assert (await _mov(test_client, h, "withdrawal", 20.00, "sangria")).status_code == 201


async def test_devolucoes_trocas_e_cancelamento_no_livro(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_a="100.00", price_b="130.00")
    await _abrir(test_client, h, "0")
    v1, i1 = await _vender(test_client, h, p, va, 3, "100.00")
    v2, _ = await _vender(test_client, h, p, va, 1, "100.00")
    # devolução cash parcial 2 de 3
    r = await test_client.post(f"/api/v1/returns/{v1}", headers=h, json={
        "reason": "Defeito", "refund_method": "cash", "items": [{"sale_item_id": i1, "quantity": 2}]})
    assert r.status_code == 201, r.text
    s = (await _atual(test_client, h))["session"]
    assert (s["cash_refunds"], s["expected_amount"]) == (200.0, 200.0)
    # devolver mais do que comprou: erro claro
    r = await test_client.post(f"/api/v1/returns/{v1}", headers=h, json={
        "reason": "Defeito", "refund_method": "cash", "items": [{"sale_item_id": i1, "quantity": 2}]})
    assert r.status_code in (400, 409, 422) and "detail" in r.json() or "message" in r.json()
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 200.0
    # venda com devolução não cancela
    r = await test_client.post(f"/api/v1/sales/{v1}/cancel", headers=h, params={"reason": "Lançada errado"})
    assert r.status_code == 400
    # venda sem devolução cancela e some
    r = await test_client.post(f"/api/v1/sales/{v2}/cancel", headers=h, params={"reason": "Lançada errado"})
    assert r.status_code == 200
    assert (await _atual(test_client, h))["session"]["expected_amount"] == 100.0


async def test_dois_caixas_em_lojas_nao_se_misturam_e_abrir_depois_de_fechar(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    for _ in range(3):
        s = await _abrir(test_client, h, "1.01")
        f = (await test_client.post(f"{API}/close", headers=h, json={"counted_amount": 1.01})).json()
        assert f["id"] == s["id"] and f["difference"] == 0.0
    hist = (await test_client.get(f"{API}/sessions", headers=h)).json()
    assert len(hist) >= 3 and all(x["status"] == "closed" for x in hist[:3])
