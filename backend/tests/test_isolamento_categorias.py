"""Categoria de uma loja não pode ser renomeada, apagada nem usada como categoria-mãe por outra loja.

Antes: update_category/delete_category e a categoria-mãe buscavam pelo número sem filtrar a loja."""
import pytest

from tests.test_isolamento_fornecedores import _h, _sem_override, _tenant_de_verdade  # noqa: F401  (fixture)
from tests.test_team_limit import _nova_loja

pytestmark = pytest.mark.asyncio
URL = "/api/v1/categories"


async def test_categoria_de_outra_loja_nao_se_mexe(test_client, async_session):
    _sem_override()
    _, _, token_a = await _nova_loja(async_session, "pro")
    _, _, token_b = await _nova_loja(async_session, "pro")
    r = await test_client.post(URL + "/", headers=_h(token_a), json={"name": "Leggings da Loja A"})
    assert r.status_code == 201, r.text
    cat_a = r.json()["id"]

    r = await test_client.put(f"{URL}/{cat_a}", headers=_h(token_b), json={"name": "Invadida"})
    assert r.status_code == 404, f"loja B renomeou categoria da loja A: {r.text[:150]}"
    r = await test_client.delete(f"{URL}/{cat_a}", headers=_h(token_b))
    assert r.status_code == 404, f"loja B apagou categoria da loja A ({r.status_code})"
    r = await test_client.post(URL + "/", headers=_h(token_b), json={"name": "Filha", "parent_id": cat_a})
    assert r.status_code == 400, f"loja B pendurou categoria na da loja A: {r.text[:150]}"

    lista_a = (await test_client.get(URL + "/", headers=_h(token_a))).json()
    nomes = {c["id"]: c["name"] for c in lista_a}
    assert (nomes.get(cat_a) or "").lower() == "leggings da loja a", "a categoria da loja A mudou ou sumiu"

    # a própria loja continua podendo editar
    r = await test_client.put(f"{URL}/{cat_a}", headers=_h(token_a), json={"name": "Leggings A"})
    assert r.status_code == 200 and r.json()["name"].lower() == "leggings a"
