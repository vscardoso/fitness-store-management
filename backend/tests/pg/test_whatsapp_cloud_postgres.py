"""
Webhook do WhatsApp oficial no Postgres de verdade: entregas simultâneas da mesma mensagem e fuso horário.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg -p no:cacheprovider --no-cov
Cria e apaga o banco `provador_wa_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import json
import os
from urllib.parse import urlparse

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import get_db_unscoped
from tests.test_whatsapp_cloud import SECRET, URL, event, sign, st, text_msg

PG_URL = os.getenv("TEST_PG_URL")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not PG_URL, reason="defina TEST_PG_URL para testar no Postgres"),
]

DB = "provador_wa_test"


def _url(db: str) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "teste só roda em Postgres local"
    auth = f"{u.username}@" if u.username else ""
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture(scope="module")
async def maker():
    from app.models.base import BaseModel
    from app.models.store import Store
    from app.models.whatsapp_cloud import WhatsAppCloudNumber
    import app.models  # noqa: F401

    root = create_async_engine(_url("postgres"), isolation_level="AUTOCOMMIT")
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
        await c.execute(text(f"CREATE DATABASE {DB}"))
    engine = create_async_engine(_url(DB), poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    mk = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with mk() as s:
        s.add(Store(id=1, name="Loja PG", slug="loja-pg", subdomain="loja-pg", is_default=True, is_active=True))
        await s.flush()
        s.add(WhatsAppCloudNumber(tenant_id=1, phone_number_id="PNID-PG"))
        await s.commit()
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


@pytest.fixture
async def client(maker, monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_APP_SECRET", SECRET)

    async def unscoped():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db_unscoped] = unscoped
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as c:
        yield c
    app.dependency_overrides.pop(get_db_unscoped, None)


async def _post(client, payload):
    body = json.dumps(payload).encode()
    return await client.post(URL, content=body, headers={"Content-Type": "application/json", "X-Hub-Signature-256": sign(body)})


async def test_entregas_simultaneas_gravam_uma_vez(client, maker):
    from app.models.whatsapp_cloud import WhatsAppConversation, WhatsAppMessage

    m = text_msg(frm="5511987650001")
    rs = await asyncio.gather(*[_post(client, event("PNID-PG", [m])) for _ in range(5)])
    assert [r.status_code for r in rs] == [200] * 5, [r.text for r in rs]
    assert sum(r.json()["saved"] for r in rs) == 1
    async with maker() as s:
        assert (await s.execute(select(func.count()).select_from(WhatsAppMessage).where(WhatsAppMessage.wamid == m["id"]))).scalar() == 1
        conv = (await s.execute(select(WhatsAppConversation).where(WhatsAppConversation.phone == "5511987650001"))).scalar_one()
        assert conv.unread_count == 1


async def test_status_e_horario_com_fuso_no_postgres(client, maker):
    from app.models.whatsapp_cloud import WhatsAppConversation, WhatsAppMessage

    r = await _post(client, event("PNID-PG", [text_msg(frm="5511987650002", ts=1761235200)]))
    assert r.json()["saved"] == 1
    r = await _post(client, event("PNID-PG", [text_msg(frm="551187650002", ts=1761235100)]))  # mais antiga, sem o 9
    assert r.json()["saved"] == 1
    async with maker() as s:
        conv = (await s.execute(select(WhatsAppConversation).where(WhatsAppConversation.phone == "5511987650002"))).scalar_one()
        assert conv.unread_count == 2 and int(conv.last_inbound_at.timestamp()) == 1761235200
        s.add(WhatsAppMessage(tenant_id=1, conversation_id=conv.id, wamid="wamid.PG-OUT", direction="out", msg_type="text", status="sent"))
        await s.commit()
    assert (await _post(client, event("PNID-PG", statuses=[st("wamid.PG-OUT", "read")]))).json()["statuses"] == 1
    assert (await _post(client, event("PNID-PG", statuses=[st("wamid.PG-OUT", "delivered")]))).json()["statuses"] == 0
