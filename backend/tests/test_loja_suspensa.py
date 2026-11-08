"""Bloqueio simples de loja suspensa: loja inativa não entra nem usa a API; a loja 2 (piloto) nunca é bloqueada."""
import pytest
from sqlalchemy import update

from app.core import store_suspension
from app.models.store import Store
from tests.test_lot_costs import _loja_api

pytestmark = pytest.mark.asyncio
API = "/api/v1"


async def _suspender(db, tenant_id, ativa):
    await db.execute(update(Store).where(Store.id == tenant_id).values(is_active=ativa))
    await db.commit()
    store_suspension.clear_cache()


async def test_loja_suspensa_nao_usa_a_api_e_volta_ao_reativar(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    assert (await test_client.get(f"{API}/auth/me", headers=h)).status_code == 200
    try:
        await _suspender(async_session, t_id, False)
        r = await test_client.get(f"{API}/products/", headers=h)
        assert r.status_code == 403 and "suspensa" in r.json()["detail"].lower(), r.text
        r = await test_client.get(f"{API}/sales/", headers=h)
        assert r.status_code == 403
        await _suspender(async_session, t_id, True)
        assert (await test_client.get(f"{API}/auth/me", headers=h)).status_code == 200
    finally:
        await _suspender(async_session, t_id, True)


async def test_loja_piloto_nunca_e_bloqueada(async_session):
    assert 2 in store_suspension.protected_store_ids()
    assert await store_suspension.store_is_blocked(async_session, 2) is False
    assert await store_suspension.store_is_blocked(async_session, None) is False
