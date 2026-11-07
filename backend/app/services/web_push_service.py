"""
Notificações do app instalado (Web Push, padrão do navegador; no iPhone a partir do iOS 16.4 com o app na tela de início).

- subscribe/unsubscribe: guarda a inscrição de cada aparelho (endpoint + chaves que o navegador gera).
- notify_tenant: manda para os aparelhos dos papéis escolhidos da loja, em sessão própria (chamado em segundo plano,
  depois da resposta). Inscrição recusada pelo serviço do navegador (404/410) é apagada.
Sem VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY configuradas, nada é enviado (enabled() é False).
"""
import asyncio
import hashlib
import json
import logging
from typing import Iterable, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.notification import WebPushSubscription
from app.models.user import User

logger = logging.getLogger(__name__)


def enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def _hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()


async def subscribe(db: AsyncSession, *, user_id: int, tenant_id: int, endpoint: str, p256dh: str, auth: str,
                    user_agent: Optional[str] = None) -> WebPushSubscription:
    """Inscreve (ou atualiza) o aparelho. O mesmo navegador trocando de usuário passa a ser do usuário novo."""
    h = _hash(endpoint)
    sub = (await db.execute(select(WebPushSubscription).where(WebPushSubscription.endpoint_hash == h))).scalar_one_or_none()
    if sub is None:
        sub = WebPushSubscription(endpoint=endpoint, endpoint_hash=h)
        db.add(sub)
    sub.user_id, sub.tenant_id, sub.p256dh, sub.auth = user_id, tenant_id, p256dh, auth
    sub.user_agent = (user_agent or "")[:255] or None
    sub.is_active = True
    await db.commit()
    await db.refresh(sub)
    return sub


async def unsubscribe(db: AsyncSession, *, user_id: int, endpoint: str) -> bool:
    res = await db.execute(delete(WebPushSubscription).where(
        WebPushSubscription.endpoint_hash == _hash(endpoint), WebPushSubscription.user_id == user_id))
    await db.commit()
    return bool(res.rowcount)


def _send_one(sub: dict, payload: str) -> Optional[int]:
    """Envia para um aparelho. Devolve o status HTTP de erro (ou None se foi)."""
    from pywebpush import WebPushException, webpush
    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=3600,
            timeout=10,
        )
        return None
    except WebPushException as exc:
        return getattr(exc.response, "status_code", None) or 500
    except Exception:  # noqa: BLE001  (rede fora do ar não pode derrubar quem chamou)
        logger.exception("Web Push: falha ao enviar")
        return 500


async def notify_tenant(tenant_id: int, title: str, body: str, url: str = "/", *,
                        roles: Iterable[str] = ("admin", "manager"), exclude_user_id: Optional[int] = None,
                        tag: Optional[str] = None) -> dict:
    """Manda a notificação para os aparelhos inscritos da loja, só dos papéis pedidos. Usa sessão própria."""
    if not enabled():
        return {"sent": 0, "removed": 0, "skipped": "sem chaves VAPID"}
    from app.core.database import async_session_maker
    from app.core.rls import bypass_on

    wanted = {r.lower() for r in roles}
    async with async_session_maker() as db:
        await bypass_on(db)
        rows = (await db.execute(
            select(WebPushSubscription, User.role)
            .join(User, User.id == WebPushSubscription.user_id)
            .where(WebPushSubscription.tenant_id == tenant_id, WebPushSubscription.is_active == True,  # noqa: E712
                   User.is_active == True)  # noqa: E712
        )).all()
        targets = [
            {"id": s.id, "endpoint": s.endpoint, "p256dh": s.p256dh, "auth": s.auth}
            for s, role in rows
            if str(getattr(role, "value", role)).lower() in wanted and s.user_id != exclude_user_id
        ]
        if not targets:
            return {"sent": 0, "removed": 0}
        payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag}, ensure_ascii=False)
        results = await asyncio.gather(*(asyncio.to_thread(_send_one, t, payload) for t in targets))
        gone = [t["id"] for t, st in zip(targets, results) if st in (404, 410)]
        if gone:
            await db.execute(delete(WebPushSubscription).where(WebPushSubscription.id.in_(gone)))
            await db.commit()
        sent = sum(1 for st in results if st is None)
        failed = [st for st in results if st is not None and st not in (404, 410)]
        # visível no log do servidor (este módulo roda em INFO, ver main.py): sem isso não dá para saber se um push saiu
        logger.info("Web Push loja %s: %s enviada(s), %s aparelho(s) removido(s), %s falha(s) %s | %s",
                    tenant_id, sent, len(gone), len(failed), failed or "", title[:60])
        return {"sent": sent, "removed": len(gone)}
