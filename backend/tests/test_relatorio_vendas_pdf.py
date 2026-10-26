"""Relatório de vendas em PDF gerado no servidor (usado pelo app web)."""
import pytest

from tests.test_lot_costs import _loja_api, _limpa_loja_1, D  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio


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
