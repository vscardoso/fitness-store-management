"""Fornecedor de uma loja nunca aparece, nem pode ser usado, por outra loja."""
import pytest

from tests.test_team_limit import _nova_loja

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _tenant_de_verdade():
    """O conftest força a loja 1 em toda rota; aqui vale a resolução real (loja do usuário logado)."""
    from app.api.deps import get_current_tenant_id
    from app.main import app
    guardado = app.dependency_overrides.pop(get_current_tenant_id, None)
    yield
    if guardado is not None:
        app.dependency_overrides[get_current_tenant_id] = guardado


def _sem_override():
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)


def _h(token):
    return {"Authorization": f"Bearer {token}"}


async def test_fornecedor_de_uma_loja_nao_aparece_na_outra(test_client, async_session):
    _sem_override()
    _, _, token_a = await _nova_loja(async_session, "pro")
    _, _, token_b = await _nova_loja(async_session, "pro")

    r = await test_client.post("/api/v1/suppliers", headers=_h(token_a), json={"name": "Fornecedor Exclusivo da Loja A"})
    assert r.status_code in (200, 201), r.text
    sid = r.json()["id"]

    lista_a = (await test_client.get("/api/v1/suppliers", headers=_h(token_a))).json()
    lista_b = (await test_client.get("/api/v1/suppliers", headers=_h(token_b))).json()
    assert sid in [s["id"] for s in lista_a]
    assert sid not in [s["id"] for s in lista_b], "fornecedor da loja A apareceu na loja B"
    assert all(s["name"] != "Fornecedor Exclusivo da Loja A" for s in lista_b)

    # A loja B também não consegue ler, editar nem apagar
    assert (await test_client.get(f"/api/v1/suppliers/{sid}", headers=_h(token_b))).status_code == 404
    assert (await test_client.put(f"/api/v1/suppliers/{sid}", headers=_h(token_b), json={"name": "Invadido"})).status_code == 404
    assert (await test_client.delete(f"/api/v1/suppliers/{sid}", headers=_h(token_b))).status_code in (403, 404)
    assert (await test_client.get(f"/api/v1/suppliers/{sid}", headers=_h(token_a))).json()["name"] == "Fornecedor Exclusivo da Loja A"

    # Rankings e listas derivadas também respeitam a loja
    for rota in ("/api/v1/suppliers/ranking", "/api/v1/suppliers/cost-comparison", "/api/v1/suppliers/restock-list"):
        r = await test_client.get(rota, headers=_h(token_b))
        assert r.status_code == 200, (rota, r.text[:120])
        assert "Fornecedor Exclusivo da Loja A" not in r.text, rota


async def test_mesmo_nome_em_duas_lojas_vira_dois_cadastros(test_client, async_session):
    _sem_override()
    _, _, token_a = await _nova_loja(async_session, "pro")
    _, _, token_b = await _nova_loja(async_session, "pro")
    a = (await test_client.post("/api/v1/suppliers", headers=_h(token_a), json={"name": "Léo Gêmeos Teste"})).json()
    b = (await test_client.post("/api/v1/suppliers", headers=_h(token_b), json={"name": "Léo Gêmeos Teste"})).json()
    assert a["id"] != b["id"]
    nomes_b = [s["id"] for s in (await test_client.get("/api/v1/suppliers", headers=_h(token_b))).json()]
    assert b["id"] in nomes_b and a["id"] not in nomes_b
