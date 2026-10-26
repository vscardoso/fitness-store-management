"""Editar tamanho e cor de uma variação já cadastrada (cadastro errado ou sem tamanho)."""
import pytest

from app.models.user import UserRole
from tests.test_short_codes import _loja, _produto, _sem_override, _user

pytestmark = pytest.mark.asyncio


async def test_corrige_tamanho_e_cor_e_normaliza(test_client, async_session):
    _sem_override()
    t, c = await _loja(async_session)
    _, vs = await _produto(async_session, t, c, grade=(("Preto", None), ("Preto", "M")))
    await async_session.commit()
    sem_tamanho, outra = vs[0].id, vs[1].id
    h = await _user(async_session, t, UserRole.MANAGER)

    # variação sem tamanho passa a ter um (e o servidor padroniza)
    r = await test_client.patch(f"/api/v1/product-variants/{sem_tamanho}", json={"size": "p / m"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["size"] == "P/M" and r.json()["id"] == sem_tamanho

    # cor errada corrigida; mesmo id, então estoque e código curto ficam com ela
    antes = r.json()["short_code"]
    r = await test_client.patch(f"/api/v1/product-variants/{sem_tamanho}", json={"color": "azul marinho", "size": "unico"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["color"] == "Azul Marinho" and r.json()["size"] == "ÚNICO"
    assert r.json()["short_code"] == antes

    # não deixa virar uma variação que já existe no produto
    r = await test_client.patch(f"/api/v1/product-variants/{sem_tamanho}", json={"color": "Preto", "size": "m"}, headers=h)
    assert r.status_code == 400, r.text
    assert (await test_client.get(f"/api/v1/product-variants/{outra}", headers=h)).json()["size"] == "M"
