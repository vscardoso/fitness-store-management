"""
Regressao dos 2 achados ALTOS novos da 2a rodada (docs/security-audit/RUN2.md).
Comando: cd backend && venv\Scripts\python -m pytest tests/test_seguranca_achados_altos_onda2.py -q
"""
import uuid

import pytest

from app.models.notification import PushToken
from app.repositories.notification_repository import PushTokenRepository


@pytest.mark.asyncio
async def test_push_so_chega_a_usuarios_do_proprio_tenant(db, test_user):
    t_proprio = test_user.tenant_id
    t_outro = t_proprio + 1000
    db.add(PushToken(user_id=test_user.id, tenant_id=t_proprio, token="ExpoPushToken[" + uuid.uuid4().hex + "]"))
    db.add(PushToken(user_id=test_user.id, tenant_id=t_outro, token="ExpoPushToken[" + uuid.uuid4().hex + "]"))
    await db.flush()

    repo = PushTokenRepository()
    proprios = await repo.get_tokens_by_users(db, [test_user.id], tenant_id=t_proprio)
    assert proprios and all(t.tenant_id == t_proprio for t in proprios)
    assert await repo.get_tokens_by_users(db, [test_user.id], tenant_id=t_outro + 1) == []


@pytest.mark.asyncio
async def test_send_notification_exige_limite_de_user_ids():
    from pydantic import ValidationError
    from app.schemas.notification import SendNotificationRequest
    with pytest.raises(ValidationError):
        SendNotificationRequest(user_ids=list(range(1, 202)), title="t", body="b")


@pytest.mark.asyncio
async def test_fifo_costs_filtra_por_tenant_e_limita_lista(test_client, auth_token, monkeypatch):
    from app.services import fifo_service as fs
    visto = {}

    async def _fake(self, product_id, *, variant_id=None, tenant_id=None):
        visto["tenant_id"] = tenant_id
        return {"average_unit_cost": 0, "total_quantity": 0, "sources_count": 0}

    monkeypatch.setattr(fs.FIFOService, "get_product_cost_info", _fake)
    h = {"Authorization": f"Bearer {auth_token}"}
    r = await test_client.post("/api/v1/products/fifo-costs", json=[1], headers=h)
    assert r.status_code == 200, r.text
    assert visto["tenant_id"] is not None
    grande = await test_client.post("/api/v1/products/fifo-costs", json=list(range(1, 202)), headers=h)
    assert grande.status_code == 422
