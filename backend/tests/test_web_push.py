"""Notificações do app instalado (Web Push): inscrição do aparelho, envio cifrado e assinado (VAPID) para os papéis
certos, aparelho que sumiu (410) é apagado, e sem chaves nada é enviado."""
import base64
import http.server
import threading

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
API = "/api/v1/notifications/web-push"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _vapid():
    k = ec.generate_private_key(ec.SECP256R1())
    pub = k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64(pub), _b64(k.private_numbers().private_value.to_bytes(32, "big"))


def _browser_keys():
    """Chaves que o navegador mandaria na inscrição (p256dh = ponto público, auth = 16 bytes)."""
    k = ec.generate_private_key(ec.SECP256R1())
    pub = k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64(pub), _b64(b"0123456789abcdef")


class _PushServer:
    """Serviço de push falso: /ok aceita (201), /gone diz que o aparelho sumiu (410). Guarda o que chegou."""
    def __init__(self):
        received = self.received = []

        class H(http.server.BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                received.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "len": len(body)})
                self.send_response(410 if self.path.startswith("/gone") else 201)
                self.end_headers()

            def log_message(self, *a):
                pass

        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()


async def test_inscricao_envio_e_aparelho_que_sumiu(test_client, async_session, test_user, test_engine, monkeypatch):
    from app.core import config, database
    from app.models.notification import WebPushSubscription
    from app.services import web_push_service

    t_id, h, *_ = await _cenario(async_session, test_user)

    # sem chaves: a rota diz que está desligado e o envio não faz nada
    monkeypatch.setattr(config.settings, "VAPID_PUBLIC_KEY", "")
    monkeypatch.setattr(config.settings, "VAPID_PRIVATE_KEY", "")
    assert (await test_client.get(f"{API}/key", headers=h)).json()["enabled"] is False
    assert (await web_push_service.notify_tenant(t_id, "x", "y"))["sent"] == 0

    pub, priv = _vapid()
    monkeypatch.setattr(config.settings, "VAPID_PUBLIC_KEY", pub)
    monkeypatch.setattr(config.settings, "VAPID_PRIVATE_KEY", priv)
    monkeypatch.setattr(database, "async_session_maker", sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False))
    key = (await test_client.get(f"{API}/key", headers=h)).json()
    assert key == {"enabled": True, "public_key": pub}

    # endpoint precisa ser https na rota
    p256dh, auth = _browser_keys()
    r = await test_client.post(f"{API}/subscribe", headers=h, json={"endpoint": "http://x.test/abc", "keys": {"p256dh": p256dh, "auth": auth}})
    assert r.status_code == 400

    r = await test_client.post(f"{API}/subscribe", headers=h, json={"endpoint": "https://push.test/aparelho-1", "keys": {"p256dh": p256dh, "auth": auth}})
    assert r.status_code == 201, r.text
    # o mesmo aparelho de novo não duplica
    r = await test_client.post(f"{API}/subscribe", headers=h, json={"endpoint": "https://push.test/aparelho-1", "keys": {"p256dh": p256dh, "auth": auth}})
    assert r.status_code == 201
    subs = (await async_session.execute(select(WebPushSubscription).where(WebPushSubscription.tenant_id == t_id))).scalars().all()
    assert len(subs) == 1

    # aponta as inscrições para o serviço falso: uma que recebe e uma que sumiu
    srv = _PushServer()
    uid = subs[0].user_id
    subs[0].endpoint, subs[0].endpoint_hash = f"{srv.url}/ok", "h-ok"
    gone = WebPushSubscription(user_id=subs[0].user_id, tenant_id=t_id, endpoint=f"{srv.url}/gone", endpoint_hash="h-gone",
                               p256dh=p256dh, auth=auth)
    async_session.add(gone)
    await async_session.commit()

    res = await web_push_service.notify_tenant(t_id, "Venda nova: R$ 100,00", "1 peça · Ana", "/sales/1", roles=("admin",))
    assert res == {"sent": 1, "removed": 1}, res
    ok = next(x for x in srv.received if x["path"] == "/ok")
    assert ok["headers"].get("content-encoding") == "aes128gcm" and ok["len"] > 0
    assert ok["headers"].get("authorization", "").startswith("vapid t=") and pub in ok["headers"]["authorization"]
    async_session.expire_all()
    left = (await async_session.execute(select(WebPushSubscription.endpoint_hash).where(WebPushSubscription.tenant_id == t_id))).scalars().all()
    assert left == ["h-ok"]

    # papel que não recebe: ninguém é notificado
    assert (await web_push_service.notify_tenant(t_id, "x", "y", roles=("seller",)))["sent"] == 0
    # quem vendeu não recebe a própria venda
    assert (await web_push_service.notify_tenant(t_id, "x", "y", roles=("admin",), exclude_user_id=uid))["sent"] == 0

    r = await test_client.post(f"{API}/unsubscribe", headers=h, json={"endpoint": f"{srv.url}/ok"})
    assert r.status_code == 200
    srv.srv.shutdown()


async def test_venda_nova_avisa_admin_e_gerente_menos_quem_vendeu(test_client, async_session, test_user, monkeypatch):
    from app.services import web_push_service
    from tests.test_troca import _vender
    calls = []

    async def fake_notify(tenant_id, title, body, url="/", **kw):
        calls.append((tenant_id, title, body, url, kw))
        return {"sent": 1}

    monkeypatch.setattr(web_push_service, "enabled", lambda: True)
    monkeypatch.setattr(web_push_service, "notify_tenant", fake_notify)
    t_id, h, p, va, _ = await _cenario(async_session, test_user)
    sale_id, _ = await _vender(test_client, h, p, va, 2, "100.00")
    assert len(calls) == 1, calls
    tenant, title, body, url, kw = calls[0]
    assert (tenant, title, url) == (t_id, "Venda nova: R$ 200,00", f"/sales/{sale_id}")
    assert body.startswith("2 peças · ")
    assert set(kw["roles"]) == {"admin", "manager"} and kw["exclude_user_id"] is not None
