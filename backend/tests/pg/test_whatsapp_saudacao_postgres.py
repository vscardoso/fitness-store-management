"""Saudação automática no Postgres de verdade: mensagens simultâneas da mesma cliente geram UMA saudação.

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_whatsapp_saudacao_postgres.py --no-cov
Cria e apaga o banco `provador_wa_greet_test` (use SÓ um Postgres local descartável).
"""
import asyncio
import json
import os
import time
from urllib.parse import urlparse

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import get_db_unscoped
from app.services import whatsapp_cloud_service as svc
from tests.test_whatsapp_cloud import SECRET, URL, event, sign, text_msg

PG_URL = os.getenv("TEST_PG_URL")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not PG_URL, reason="defina TEST_PG_URL para testar no Postgres"),
]
DB = "provador_wa_greet_test"


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
        s.add(WhatsAppCloudNumber(tenant_id=1, phone_number_id="PNID-PG", greeting_enabled=True, greeting_text="Oi! Teste de saudação."))
        await s.commit()
    yield mk
    await engine.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
    await root.dispose()


@pytest.fixture
async def client(maker, monkeypatch):
    import app.core.database as dbm
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    enviadas = []

    async def falso(phone_number_id, body):
        enviadas.append(body["to"])
        await asyncio.sleep(0.05)   # a Meta demora um pouco: abre espaço para a corrida
        return {"messages": [{"id": f"wamid.PGSAUDA{len(enviadas)}-{body['to']}"}]}

    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_APP_SECRET", SECRET)
    monkeypatch.setattr(settings, "WHATSAPP_CLOUD_ACCESS_TOKEN", "token-de-teste")
    monkeypatch.setattr(svc, "_post_graph", falso)
    monkeypatch.setattr(dbm, "async_session_maker", maker)

    async def unscoped():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db_unscoped] = unscoped
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as c:
        c.enviadas = enviadas
        yield c
    app.dependency_overrides.pop(get_db_unscoped, None)


async def _post(client, payload):
    body = json.dumps(payload).encode()
    return await client.post(URL, content=body, headers={"Content-Type": "application/json", "X-Hub-Signature-256": sign(body)})


async def _saidas(maker, fone):
    from app.models.whatsapp_cloud import WhatsAppConversation, WhatsAppMessage
    async with maker() as s:
        return (await s.execute(
            select(func.count()).select_from(WhatsAppMessage).join(
                WhatsAppConversation, WhatsAppConversation.id == WhatsAppMessage.conversation_id
            ).where(WhatsAppConversation.phone == fone, WhatsAppMessage.direction == "out")
        )).scalar()


async def test_mensagens_diferentes_ao_mesmo_tempo_uma_saudacao(client, maker):
    fone = "5511987660001"
    rs = await asyncio.gather(*[_post(client, event("PNID-PG", [text_msg(frm=fone, ts=int(time.time()))])) for _ in range(8)])
    assert [r.status_code for r in rs] == [200] * 8, [r.text for r in rs]
    assert sum(r.json()["saved"] for r in rs) == 8
    assert client.enviadas.count(fone) == 1
    assert await _saidas(maker, fone) == 1


async def test_mesma_mensagem_reentregue_ao_mesmo_tempo_uma_saudacao(client, maker):
    fone = "5511987660002"
    m = text_msg(frm=fone, ts=int(time.time()))
    rs = await asyncio.gather(*[_post(client, event("PNID-PG", [m])) for _ in range(8)])
    assert [r.status_code for r in rs] == [200] * 8
    assert sum(r.json()["saved"] for r in rs) == 1
    assert client.enviadas.count(fone) == 1 and await _saidas(maker, fone) == 1


async def test_clientes_diferentes_ao_mesmo_tempo_cada_uma_recebe_a_sua(client, maker):
    fones = [f"551198766010{i}" for i in range(5)]
    rs = await asyncio.gather(*[_post(client, event("PNID-PG", [text_msg(frm=f, ts=int(time.time()))])) for f in fones])
    assert [r.status_code for r in rs] == [200] * 5
    for f in fones:
        assert client.enviadas.count(f) == 1 and await _saidas(maker, f) == 1


async def test_conversa_antiga_e_varias_mensagens_ao_mesmo_tempo_uma_saudacao(client, maker):
    """O caso que a trava atômica resolve: a conversa já existe (janela vencida) e várias mensagens chegam juntas.

    Todas leem o `last_inbound_at` antigo e todas acham que abriram a janela; só uma pode saudar.
    """
    from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppConversation

    fone = "5511987660003"
    async with maker() as s:
        number = (await s.execute(select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == "PNID-PG"))).scalar_one()
        antigo = __import__("datetime").datetime.now(__import__("datetime").timezone.utc) - __import__("datetime").timedelta(hours=30)
        s.add(WhatsAppConversation(tenant_id=1, number_id=number.id, contact_key=fone, phone=fone, wa_id=fone,
                                   last_inbound_at=antigo, last_message_at=antigo, unread_count=0))
        await s.commit()
    rs = await asyncio.gather(*[_post(client, event("PNID-PG", [text_msg(frm=fone, ts=int(time.time()))])) for _ in range(8)])
    assert [r.status_code for r in rs] == [200] * 8 and sum(r.json()["saved"] for r in rs) == 8
    assert client.enviadas.count(fone) == 1 and await _saidas(maker, fone) == 1
