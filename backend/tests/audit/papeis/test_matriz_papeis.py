"""Matriz de papéis nas rotas de dinheiro, escrita À MÃO a partir da regra documentada (não importada do código).

Regra: caixa < vendedor < gerente < admin. Cada linha diz o menor papel que pode chamar. Quem está abaixo recebe 403;
quem está nele ou acima NUNCA pode receber 403 (e nenhuma chamada pode dar 500).
Ids inexistentes (999999) para não mexer em dado nenhum: o que importa é a porta (403) e que não haja 500.
"""
import pytest

from tests.test_troca import _cenario
from .conftest import PAPEIS, quatro_papeis

pytestmark = pytest.mark.asyncio

C, S, M, A = "cashier", "seller", "manager", "admin"
RANK = {C: 1, S: 2, M: 3, A: 4}
X = 999999

TABELA = [
    # vendas
    ("GET", "/sales/", C), ("POST", "/sales/", C), ("GET", "/sales/daily-total", C),
    ("GET", "/sales/number/NAOEXISTE", C), ("GET", f"/sales/{X}", C),
    ("GET", f"/sales/{X}/receipt", C), ("GET", f"/sales/{X}/receipt/pdf", C),
    ("POST", f"/sales/{X}/receipt/send-whatsapp", C),
    ("POST", f"/sales/{X}/cancel", A),
    ("GET", "/sales/reports/daily", M), ("GET", "/sales/reports/period", M), ("GET", "/sales/reports/top-customers", M),
    ("GET", "/sales/reports/by-period", M), ("GET", "/sales/reports/top-products", M),
    # devoluções e trocas (vendedor para cima; reconciliação só admin)
    ("GET", f"/returns/eligibility/{X}", S), ("POST", f"/returns/{X}", S), ("GET", f"/returns/history/{X}", S),
    # caixa da gaveta: todo papel opera; histórico é do gerente
    ("GET", "/cash/reasons", C), ("GET", "/cash/current", C), ("POST", "/cash/open", C), ("POST", "/cash/movements", C),
    ("POST", "/cash/close", C), ("GET", "/cash/sessions", M), ("GET", f"/cash/sessions/{X}", M),
    # fiado: consultar e receber é do caixa; o resto é do gerente
    ("GET", "/receivables", C), ("GET", "/receivables/summary", C), ("GET", f"/receivables/{X}/payments", C),
    ("POST", "/receivables/receive", C), ("POST", "/receivables/opening", M), ("POST", f"/receivables/{X}/cancel", M),
    ("DELETE", f"/receivables/payments/{X}", M),
    # financeiro
    ("GET", "/finance/accounts", M), ("GET", "/finance/card-schedule", M), ("POST", "/finance/card-settlement", M),
    ("POST", "/finance/setup", A), ("POST", "/finance/accounts", A), ("PUT", f"/finance/accounts/{X}/pix", A),
    ("GET", "/finance/transfers", M), ("POST", "/finance/transfers", M), ("DELETE", f"/finance/transfers/{X}", M),
    ("GET", "/finance/payables", M), ("POST", "/finance/payables", M), ("POST", f"/finance/payables/{X}/pay", M),
    ("POST", f"/finance/payables/{X}/unpay", M), ("POST", f"/finance/payables/{X}/cancel", M),
    ("GET", "/finance/entries", M), ("POST", "/finance/entries", M), ("DELETE", f"/finance/entries/{X}", M),
    ("GET", "/finance/loans", M), ("GET", "/finance/closings", M), ("GET", "/finance/closings/2026/1", M),
    ("POST", "/finance/closings/2026/1", M), ("POST", "/finance/closings/2026/1/reopen", A),
    # despesas
    ("GET", "/expenses", M), ("POST", "/expenses", M), ("GET", f"/expenses/{X}", M), ("PUT", f"/expenses/{X}", M),
    ("DELETE", f"/expenses/{X}", A), ("GET", "/expenses/categories", M), ("POST", "/expenses/categories", M),
    ("PUT", f"/expenses/categories/{X}", M), ("DELETE", f"/expenses/categories/{X}", A),
    ("GET", "/expenses/resultado-mes", M), ("GET", "/expenses/resultado-periodo", M), ("GET", "/expenses/stock-losses", M),
    # relatórios e painel
    ("GET", "/reports/sales", M), ("GET", "/reports/sales/pdf", M), ("GET", "/reports/monthly", M),
    ("GET", "/reports/monthly/pdf", M), ("GET", "/reports/cash-flow", M), ("GET", "/reports/customers", M),
    ("GET", "/reports/history", M), ("GET", "/reports/stock-check", M), ("POST", "/reports/stock-check/writeoff", A),
    ("GET", "/dashboard/stats", M),
    # descontos por forma de pagamento
    ("GET", "/payment-discounts/", C), ("POST", "/payment-discounts/calculate", C), ("POST", "/payment-discounts/", A),
    ("PUT", f"/payment-discounts/{X}", A), ("DELETE", f"/payment-discounts/{X}", A),
    # clientes e fidelidade
    ("GET", "/customers/", C), ("POST", "/customers/", C), ("GET", f"/customers/{X}", C),
    ("GET", f"/customers/{X}/purchases", C), ("GET", f"/customers/{X}/loyalty", C),
    ("PUT", f"/customers/{X}", S), ("DELETE", f"/customers/{X}", M), ("GET", f"/customers/{X}/export", M),
    ("POST", f"/customers/{X}/anonymize", A), ("GET", f"/customers/{X}/access-log", A),
    ("POST", f"/customers/{X}/loyalty/adjust", A),
    ("GET", "/store/loyalty-settings", C), ("PUT", "/store/loyalty-settings", A),
    ("GET", "/store/return-settings", A), ("PUT", "/store/return-settings", A),
    # maquininha / PIX
    ("POST", f"/pdv/orders/{X}/cancel", M), ("POST", f"/pdv/orders/{X}/refund", A), ("POST", f"/pdv/orders/{X}/confirm", C),
]


@pytest.fixture
async def papeis(async_session, test_user, test_client):
    t_id, h_admin, *_ = await _cenario(async_session, test_user)
    return await quatro_papeis(async_session, t_id, h_admin)


async def test_matriz_de_papeis_nas_rotas_de_dinheiro(test_client, papeis):
    erros, c500 = [], []
    for metodo, caminho, minimo in TABELA:
        for papel in PAPEIS:
            r = await test_client.request(metodo, f"/api/v1{caminho}", headers=papeis[papel],
                                          json={} if metodo in ("POST", "PUT", "PATCH") else None)
            deve_negar = RANK[papel] < RANK[minimo]
            if (r.status_code == 403) != deve_negar:
                erros.append(f"{papel:8} {metodo:6} {caminho} -> {r.status_code} (minimo {minimo}) {r.text[:90]}")
            if r.status_code >= 500:
                c500.append(f"{papel} {metodo} {caminho} -> {r.status_code} {r.text[:120]}")
    assert erros == [], "\n".join(erros)
    assert c500 == [], "\n".join(c500)


async def test_estorno_por_erro_de_lancamento_e_so_do_admin(test_client, async_session, test_user, papeis):
    """`correction=true` na elegibilidade e `is_correction` na devolução: 403 para todos menos admin."""
    for papel in (C, S, M):
        r = await test_client.get(f"/api/v1/returns/eligibility/{X}?correction=true", headers=papeis[papel])
        assert r.status_code in (403, 404) and (papel == C or r.status_code != 200), (papel, r.status_code)
        r = await test_client.post(f"/api/v1/returns/{X}", headers=papeis[papel],
                                   json={"reason": "erro", "is_correction": True, "items": []})
        if papel == C:
            assert r.status_code == 403
        else:
            assert r.status_code in (403, 404, 422), (papel, r.status_code, r.text[:150])
