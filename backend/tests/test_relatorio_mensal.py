"""Relatório mensal da loja (financeiro e analítico): os números são os MESMOS das outras telas, o mês futuro é recusado,
o PDF abre e traz as seções, e os pontos de atenção aparecem em palavras."""
from datetime import date

import pytest

from app.services.monthly_report_service import attention_points, change_percent, previous_month
from tests.test_estorno_consistencia import _venda
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_short_codes import _pdf_text
from tests.test_troca import _cenario, _config

pytestmark = pytest.mark.asyncio
API = "/api/v1"


def test_contas_puras():
    assert previous_month(2026, 1) == (2025, 12) and previous_month(2026, 11) == (2026, 10)
    assert change_percent(150, 100) == 50.0 and change_percent(50, 100) == -50.0
    assert change_percent(10, 0) is None            # sem mês anterior não há porcentagem


async def test_relatorio_mensal_bate_com_resultado_vendas_e_devolucao(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    # o banco de teste é compartilhado: test_financeiro deixa a loja 1 com o Financeiro implantado; aqui ela começa SEM implantação
    from sqlalchemy import update
    from app.models.store import Store
    await async_session.execute(update(Store).where(Store.id == t_id).values(finance_start_date=None))
    await async_session.commit()
    hoje = date.today()
    sale_id, item_id = await _venda(test_client, h, p, va, 3)          # R$ 300
    await _venda(test_client, h, p, vb, 1)                              # R$ 100
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "não serviu", "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text                                 # devolve R$ 100: receita líquida R$ 300

    rel = (await test_client.get(f"{API}/reports/monthly", params={"year": hoje.year, "month": hoje.month}, headers=h)).json()
    cur = rel["result"]["current"]
    assert cur["revenue"] == 300 and cur["sales_count"] == 2 and cur["units_sold"] == 3
    assert cur["average_ticket"] == 150

    # igual ao Resultado do Mês e ao relatório de vendas do app
    res = (await test_client.get(f"{API}/expenses/resultado-mes", params={"year": hoje.year, "month": hoje.month}, headers=h)).json()
    assert float(res["revenue"]) == cur["revenue"] and float(res["cmv"]) == cur["cost"]
    vendas = (await test_client.get(f"{API}/reports/sales", params={"period": "this_month"}, headers=h)).json()
    assert vendas["total_revenue"] == cur["revenue"] and vendas["total_profit"] == cur["gross_profit"]
    assert rel["sales"]["returns_count"] == 1 and rel["sales"]["pieces_sold"] == vendas["pieces_sold"]
    assert rel["finance"]["started"] is False                            # a loja de teste não implantou o Financeiro
    assert any("ainda não foi implantado" in a["text"] for a in rel["attention"])
    assert rel["stock"]["pieces"] >= 0 and "turnover_pct" in rel["stock"]


async def test_mes_futuro_e_invalido_sao_recusados(test_client, async_session, test_user):
    t_id, h, *_ = await _cenario(async_session, test_user)
    futuro = date.today().year + 1
    assert (await test_client.get(f"{API}/reports/monthly", params={"year": futuro, "month": 1}, headers=h)).status_code == 400
    assert (await test_client.get(f"{API}/reports/monthly", params={"month": 13}, headers=h)).status_code == 422
    assert (await test_client.get(f"{API}/reports/monthly/pdf", params={"year": futuro, "month": 1}, headers=h)).status_code == 400


async def test_pdf_do_relatorio_mensal_traz_as_secoes(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _venda(test_client, h, p, va, 2)
    r = await test_client.get(f"{API}/reports/monthly/pdf", headers=h)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content[:4] == b"%PDF"
    texto = _pdf_text(r.content)
    for trecho in ("Relatório mensal da loja", "Saúde da loja", "Resultado do mês", "Faturamento", "Variação", "em relação ao mês anterior",
                   "Vendas do mês", "Financeiro", "A receber e a pagar", "Estoque", "Valor do estoque a preço de venda"):
        assert trecho in texto, trecho
    assert "custo" in texto.lower()                                      # interno da loja: o relatório é do dono, não da cliente


def test_pontos_de_atencao_em_palavras():
    base = {
        "result": {"current": {"sales_count": 10, "net_profit": -50.0, "gross_margin_pct": 20, "revenue": 1000, "expenses": 600},
                   "previous": {"sales_count": 10, "gross_margin_pct": 40}, "change": {"revenue": -30.0}},
        "finance": {"started": False}, "to_receive": {"fiado_overdue": 80.0}, "to_pay": {"overdue_count": 2, "overdue_total": 300.0},
        "stock": {"pieces": 100, "stagnant_units": 70, "other_out": 3},
    }
    textos = " | ".join(a["text"] for a in attention_points(base))
    for esperado in ("prejuízo", "caiu 30%", "margem de lucro", "40% do faturamento", "fiado vencido", "2 conta(s) a pagar vencida(s)",
                     "ainda não foi implantado", "Mais da metade do estoque", "sem venda"):
        assert esperado in textos, esperado
    vazio = dict(base, result={"current": {"sales_count": 0}, "previous": {"sales_count": 0}, "change": {}},
                 to_receive={"fiado_overdue": 0}, to_pay={"overdue_count": 0, "overdue_total": 0}, stock={"pieces": 0})
    assert any("Nenhuma venda" in a["text"] for a in attention_points(vazio))


def test_frases_dos_avisos_tem_pontuacao_e_dinheiro_certos():
    """Erro visto no navegador: o ponto final virava vírgula ('para cobrar,'). Só o número do dinheiro usa vírgula decimal."""
    base = {
        "result": {"current": {"sales_count": 10, "net_profit": -1234.5, "gross_margin_pct": 20, "revenue": 1000, "expenses": 10},
                   "previous": {"sales_count": 10, "gross_margin_pct": 20}, "change": {"revenue": 0}},
        "finance": {"started": False}, "to_receive": {"fiado_overdue": 1500.0}, "to_pay": {"overdue_count": 1, "overdue_total": 300.0},
        "stock": {"pieces": 100, "stagnant_units": 0, "other_out": 0},
    }
    frases = [a["text"] for a in attention_points(base)]
    assert "A loja fechou o mês no prejuízo: perdeu R$ 1.234,50." in frases
    assert "Há R$ 1.500,00 de fiado vencido para cobrar." in frases
    assert "Há 1 conta(s) a pagar vencida(s), somando R$ 300,00." in frases
