"""Comparação com o período anterior: sem venda antes não há "+100%" (05/11/2026, primeira venda da loja real
mostrou "+100% vs ontem" depois de um dia sem venda)."""
from app.api.v1.endpoints.dashboard import pct_change


def test_sem_base_nao_compara():
    assert pct_change(59.96, 0) is None          # ontem zero: o app esconde o selo
    assert pct_change(0, 0) is None
    assert pct_change(10, -5) is None            # lucro anterior negativo também não é base
    assert pct_change(59.96, None) is None


def test_com_base_calcula():
    assert pct_change(150, 100) == 50.0
    assert pct_change(50, 100) == -50.0
    assert pct_change(100, 100) == 0.0
    assert pct_change(1, 3, 1) == -66.7


async def test_painel_do_dia_sem_venda_ontem_nao_mostra_100(test_client, auth_token):
    auth_headers = {"Authorization": f"Bearer {auth_token}"}
    r = await test_client.get("/api/v1/dashboard/stats", headers=auth_headers)
    assert r.status_code == 200, r.text
    vendas = r.json()["sales"]
    if (vendas.get("total_yesterday") or 0) <= 0:
        assert vendas["trend_percent"] is None
