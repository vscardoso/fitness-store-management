"""Retiradas, empréstimos e fechamento do mês de uma loja nunca aparecem nem podem ser mexidos por outra loja."""
from datetime import date, timedelta

import pytest

from tests.test_team_limit import _nova_loja

pytestmark = pytest.mark.asyncio
API = "/api/v1/finance"
MES_PASSADO = (date.today().replace(day=1) - timedelta(days=1)).replace(day=1)
Y, M = MES_PASSADO.year, MES_PASSADO.month


@pytest.fixture(autouse=True)
def _tenant_de_verdade():
    """O conftest força a loja 1 em toda rota; aqui vale a loja do usuário logado."""
    from app.api.deps import get_current_tenant_id
    from app.main import app
    guardado = app.dependency_overrides.pop(get_current_tenant_id, None)
    yield
    if guardado is not None:
        app.dependency_overrides[get_current_tenant_id] = guardado


def _h(token):
    return {"Authorization": f"Bearer {token}"}


async def _implantar(client, h):
    r = await client.post(f"{API}/setup", headers=h, json={
        "start_date": MES_PASSADO.isoformat(), "cash_balance": "100", "banks": [{"name": "Banco", "balance": "500"}]})
    assert r.status_code == 200, r.text
    return {a["name"]: a["id"] for a in r.json()["accounts"]}


async def test_lancamentos_e_fechamento_ficam_na_propria_loja(test_client, async_session):
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)   # o test_client põe o override ao ser criado
    _, _, ta = await _nova_loja(async_session, "pro")
    _, _, tb = await _nova_loja(async_session, "pro")
    a, b = _h(ta), _h(tb)
    contas_a, contas_b = await _implantar(test_client, a), await _implantar(test_client, b)

    r = await test_client.post(f"{API}/entries", headers=a, json={
        "kind": "loan_given", "account_id": contas_a["Banco"], "amount": "77", "person": "Cliente Segredo A"})
    assert r.status_code == 200, r.text
    entrada_a = r.json()["id"]

    # B não vê nem apaga o lançamento de A, nem lança na conta de A
    assert "Cliente Segredo A" not in (await test_client.get(f"{API}/entries", headers=b)).text
    assert "Cliente Segredo A" not in (await test_client.get(f"{API}/loans", headers=b)).text
    assert (await test_client.delete(f"{API}/entries/{entrada_a}", headers=b)).status_code == 404
    r = await test_client.post(f"{API}/entries", headers=b, json={
        "kind": "owner_withdrawal", "account_id": contas_a["Banco"], "amount": "1", "person": "Invasor"})
    assert r.status_code == 404
    # o empréstimo de A não pode ser "recebido" por B
    r = await test_client.post(f"{API}/entries", headers=b, json={
        "kind": "loan_repaid", "account_id": contas_b["Banco"], "amount": "10", "person": "Cliente Segredo A"})
    assert r.status_code == 400

    # A fecha o mês; B continua com o mês aberto e não reabre nem lê o fechamento de A
    contado = {str(i): v for i, v in ((contas_a["Gaveta"], "100"), (contas_a["Maquininha a receber"], "0"),
                                       (contas_a["Banco"], "500"))}
    r = await test_client.post(f"{API}/closings/{Y}/{M}", headers=a, json={"counted": contado})
    assert r.status_code == 200, r.text
    fb = (await test_client.get(f"{API}/closings/{Y}/{M}", headers=b)).json()
    assert fb["closed"] is None and fb["expected_total"] == 600.0
    assert "Cliente Segredo A" not in str(fb) and fb["to_receive"]["loans"] == 0.0
    assert (await test_client.post(f"{API}/closings/{Y}/{M}/reopen", headers=b)).status_code == 404
    # B não fecha usando as contas de A
    r = await test_client.post(f"{API}/closings/{Y}/{M}", headers=b, json={"counted": contado})
    assert r.status_code == 400
    assert (await test_client.get(f"{API}/closings/{Y}/{M}", headers=a)).json()["closed"]["counted_total"] == 600.0
