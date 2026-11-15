"""Relatório de vendas em PDF gerado no servidor (usado pelo app web)."""
import pytest

from tests.test_lot_costs import _loja_api, _limpa_loja_1, D  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
async def _limpa_vendas(async_session):
    """Banco de teste compartilhado: apaga as vendas criadas aqui (ids reaproveitados confundem outros testes de FIFO)."""
    from sqlalchemy import delete, func, select
    from app.models.sale import Payment, Sale, SaleItem
    modelos = [Payment, SaleItem, Sale]
    antes = {m: (await async_session.execute(select(func.coalesce(func.max(m.id), 0)))).scalar() for m in modelos}
    yield
    await async_session.rollback()
    for m in modelos:
        await async_session.execute(delete(m).where(m.id > antes[m]))
    await async_session.commit()


async def test_pdf_do_relatorio_de_vendas(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    for periodo in ("this_month", "last_30_days", "this_year"):
        r = await test_client.get(f"/api/v1/reports/sales/pdf?period={periodo}", headers=h)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF") and len(r.content) > 1500


async def test_pdf_sem_login_e_recusado(test_client):
    r = await test_client.get("/api/v1/reports/sales/pdf?period=this_month")
    assert r.status_code in (401, 403)


async def test_relatorio_detalhado_nao_conta_venda_cancelada(test_client, async_session, test_user):
    from tests.test_troca import _cenario, _vender
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _vender(test_client, h, p, va, 3, "100.00")
    cancelada, _ = await _vender(test_client, h, p, vb, 1, "100.00")
    r = await test_client.post(f"/api/v1/sales/{cancelada}/cancel?reason=teste", headers=h)
    assert r.status_code == 200, r.text

    rep = (await test_client.get("/api/v1/reports/sales?period=this_month", headers=h)).json()
    assert rep["total_sales"] == 1 and rep["total_revenue"] == 300.0     # a cancelada não conta
    assert rep["cancelled_count"] == 1 and rep["cancelled_total"] == 100.0
    assert rep["pieces_sold"] == 3
    assert rep["total_cost"] == 120.0 and rep["total_profit"] == 180.0
    assert len(rep["daily"]) == 1 and rep["daily"][0]["revenue"] == 300.0 and rep["daily"][0]["profit"] == 180.0
    assert sum(d["sales"] for d in rep["by_weekday"]) == 1 and len(rep["by_weekday"]) == 7
    assert len(rep["by_category"]) == 1 and rep["by_category"][0]["pieces"] == 3 and rep["by_category"][0]["percentage"] == 100.0
    assert len(rep["by_seller"]) == 1 and rep["by_seller"][0]["revenue"] == 300.0
    assert rep["sales_with_customer"] + rep["sales_without_customer"] == 1
    assert rep["comparison"]["previous_total"] == 0 and rep["comparison"]["is_growth"] is True

    pdf = await test_client.get("/api/v1/reports/sales/pdf?period=this_month", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


async def test_datas_dos_periodos_curtos():
    """Hoje, Ontem, 7 e 15 dias: dias corridos do Brasil, 7 dias contam hoje."""
    from datetime import timedelta
    from app.services.report_service import ReportService
    f = ReportService._get_period_dates
    ini, fim = f("today")
    assert ini.date() == fim.date() and ini.hour == 0 and fim.hour == 23
    ini, fim = f("yesterday")
    hoje = f("today")[0]
    assert ini.date() == fim.date() == hoje.date() - timedelta(days=1)
    ini, fim = f("last_7_days")
    assert (fim.date() - ini.date()).days == 6 and fim.date() == hoje.date()
    ini, fim = f("last_15_days")
    assert (fim.date() - ini.date()).days == 14


async def test_relatorio_por_periodo_curto(test_client, async_session, test_user):
    from tests.test_troca import _cenario, _vender
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _vender(test_client, h, p, va, 2, "100.00")

    for periodo in ("today", "last_7_days", "last_15_days"):
        rep = (await test_client.get(f"/api/v1/reports/sales?period={periodo}", headers=h)).json()
        assert rep["total_sales"] == 1 and rep["total_revenue"] == 200.0, (periodo, rep["total_revenue"])
    # ontem não tem nada: a venda de hoje não entra
    rep = (await test_client.get("/api/v1/reports/sales?period=yesterday", headers=h)).json()
    assert rep["total_sales"] == 0 and rep["total_revenue"] == 0
    # comparação: hoje contra o dia anterior (1 dia) e 7 dias contra os 7 anteriores
    hoje = (await test_client.get("/api/v1/reports/sales?period=today", headers=h)).json()
    assert hoje["comparison"]["previous_total"] == 0
    for periodo in ("today", "yesterday", "last_7_days", "last_15_days"):
        pdf = await test_client.get(f"/api/v1/reports/sales/pdf?period={periodo}", headers=h)
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF"), periodo
