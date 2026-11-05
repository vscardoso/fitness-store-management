"""
Ligar o WhatsApp da loja ao Provador pelo Embedded Signup da Meta (inclusive coexistência com o app do celular).

Passos (documentação da Meta, lida em 05/11/2026):
1. A tela recebe do Embedded Signup um `code` (vale 30 s) e, pela mensagem de sessão, `phone_number_id`, `waba_id`
   e `business_id` (evento FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING na coexistência).
2. O servidor troca o código pelo token de negócio: GET /oauth/access_token?client_id&client_secret&code.
3. POST /<WABA_ID>/subscribed_apps com esse token (o webhook do app passa a receber os eventos da conta).
   Coexistência: NÃO chamar /register (o número já está ativo no app do celular).
4. GET /<PHONE_NUMBER_ID>?fields=display_phone_number,verified_name.
5. Coexistência: POST /<PHONE_NUMBER_ID>/smb_app_data uma vez com sync_type=smb_app_state_sync (agenda) e uma vez
   com sync_type=history (histórico). Prazo da Meta: 24 h depois da conexão, uma vez só.

Tudo-ou-nada no NOSSO banco: todas as chamadas à Meta vêm antes e só depois gravamos (um flush; o commit é da rota).
Falha da Meta = ConnectError 424 com frase em português e nada gravado. O token de negócio é guardado CIFRADO
(app/core/secret_box.py) e nunca sai em resposta nem em log (a URL da troca do código leva o App Secret: nunca logar
URL, parâmetro nem texto de exceção do httpx).

Limites conhecidos: o número que NÃO é coexistência também não é registrado (/register com PIN não foi feito);
os envios do Provador ainda usam o token global WHATSAPP_CLOUD_ACCESS_TOKEN (o token por loja só é guardado).
"""
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import secret_box
from app.core.config import settings
from app.models.whatsapp_cloud import WhatsAppCloudNumber

logger = logging.getLogger(__name__)

_META_ID = re.compile(r"^[0-9A-Za-z_-]{1,64}$")


class ConnectError(Exception):
    def __init__(self, message: str, status_code: int = 424):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _client() -> httpx.AsyncClient:
    """Fábrica do cliente HTTP (os testes trocam por um com transporte falso)."""
    return httpx.AsyncClient(timeout=20)


async def _graph(method: str, path: str, *, token: Optional[str] = None, params: Optional[dict] = None,
                 body: Optional[dict] = None) -> tuple[int, dict]:
    """Chamada à Graph API. Nunca levanta erro: (status, corpo); falha de rede = (0, {}). Não registra URL nem corpo."""
    url = f"{settings.WHATSAPP_CLOUD_GRAPH_BASE}/{settings.WHATSAPP_CLOUD_API_VERSION}/{path}"
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with _client() as client:
            resp = await client.request(method, url, params=params, json=body, headers=headers)
    except httpx.HTTPError as e:
        logger.warning("WhatsApp conexão: falha de rede na Graph API (%s em %s)", type(e).__name__, path.split("?")[0].split("/")[-1])
        return 0, {}
    try:
        data = resp.json() if resp.content else {}
    except ValueError:
        data = {}
    return resp.status_code, data if isinstance(data, dict) else {}


def _meta_code(data: dict):
    err = data.get("error") if isinstance(data, dict) else None
    return (err or {}).get("code") if isinstance(err, dict) else None


def is_configured() -> bool:
    return bool(settings.WHATSAPP_CLOUD_APP_ID and settings.WHATSAPP_CLOUD_APP_SECRET)


async def connect_embedded_signup(
    db: AsyncSession, tenant_id: int, *, code: str, phone_number_id: str, waba_id: str,
    business_id: Optional[str] = None, coexistence: bool = False,
) -> WhatsAppCloudNumber:
    code = (code or "").strip()
    phone_number_id = (phone_number_id or "").strip()
    waba_id = (waba_id or "").strip()
    business_id = (business_id or "").strip() or None
    if not code or len(code) > 2048:
        raise ConnectError("O código de conexão da Meta não veio. Refaça a conexão.", 400)
    for value in (phone_number_id, waba_id) + ((business_id,) if business_id else ()):
        if not _META_ID.match(value):
            raise ConnectError("Os dados do número vindos da Meta estão incompletos. Refaça a conexão.", 400)
    if not is_configured():
        raise ConnectError("A conexão do WhatsApp pela tela ainda não está configurada no servidor do Provador.", 424)

    # Número de outra loja: recusa ANTES de gastar o código (vale 30 s e uma vez só)
    existing = (await db.execute(
        select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.phone_number_id == phone_number_id)
    )).scalar_one_or_none()
    if existing is not None and existing.tenant_id != tenant_id:
        raise ConnectError("Este número de WhatsApp já está ligado a outra loja no Provador.", 409)

    # 1) código -> token de negócio
    status, data = await _graph("GET", "oauth/access_token", params={
        "client_id": settings.WHATSAPP_CLOUD_APP_ID, "client_secret": settings.WHATSAPP_CLOUD_APP_SECRET, "code": code,
    })
    token = data.get("access_token") if status == 200 else None
    if not token or not isinstance(token, str):
        logger.warning("WhatsApp conexão: troca do código recusada (HTTP %s, código Meta %s)", status, _meta_code(data))
        raise ConnectError(
            "A Meta não aceitou o código de conexão (ele vale só 30 segundos). Refaça a conexão do WhatsApp.", 424)

    # 2) inscreve o app do Provador na conta (WABA) da loja
    status, data = await _graph("POST", f"{waba_id}/subscribed_apps", token=token)
    if status != 200 or data.get("success") is False:
        logger.warning("WhatsApp conexão: subscribed_apps recusado (HTTP %s, código Meta %s)", status, _meta_code(data))
        raise ConnectError(
            "Não consegui ligar o Provador à conta do WhatsApp da loja. Tente conectar de novo em instantes.", 424)

    # 3) nome e telefone que a cliente vê
    status, info = await _graph("GET", phone_number_id, token=token,
                                params={"fields": "display_phone_number,verified_name"})
    if status != 200 or not info:
        logger.warning("WhatsApp conexão: leitura do número recusada (HTTP %s, código Meta %s)", status, _meta_code(info))
        raise ConnectError("Não consegui confirmar o número na Meta. Tente conectar de novo em instantes.", 424)

    # 4) coexistência: pede agenda e histórico do celular (cada um uma vez; a Meta dá 24 h)
    now = datetime.now(timezone.utc)
    if coexistence:
        for sync_type in ("smb_app_state_sync", "history"):
            status, data = await _graph("POST", f"{phone_number_id}/smb_app_data", token=token,
                                        body={"messaging_product": "whatsapp", "sync_type": sync_type})
            if status != 200 or data.get("success") is False:
                logger.warning("WhatsApp conexão: smb_app_data %s recusado (HTTP %s, código Meta %s)",
                               sync_type, status, _meta_code(data))
                raise ConnectError(
                    "O número foi aceito, mas a Meta não liberou a cópia das conversas do celular. "
                    "Refaça a conexão (a Meta dá até 24 horas para isso).", 424)

    # 5) grava (nada foi gravado antes daqui)
    number = existing
    if number is None:
        number = WhatsAppCloudNumber(tenant_id=tenant_id, phone_number_id=phone_number_id)
        db.add(number)
    number.is_active = True
    number.waba_id = waba_id
    number.business_id = business_id or number.business_id
    number.display_phone_number = (str(info.get("display_phone_number") or "")[:32] or number.display_phone_number)
    number.verified_name = (str(info.get("verified_name") or "")[:120] or number.verified_name)
    number.is_coexistence = bool(coexistence)
    number.access_token_encrypted = secret_box.encrypt(token)
    number.connected_at = now
    number.connection_status = "connected"
    number.connection_event = "EMBEDDED_SIGNUP"
    number.connection_event_at = now
    number.connection_detail = None
    if coexistence:
        number.contacts_sync_requested_at = now
        number.history_sync_requested_at = now
        number.history_sync_status = "requested"
        number.history_sync_phase = None
        number.history_sync_progress = None
    await db.flush()
    return number


WARNINGS = {
    "disconnected": "O WhatsApp da loja se desconectou do Provador. As mensagens novas não estão chegando aqui: "
                    "conecte de novo. Na coexistência, abra o WhatsApp Business no celular pelo menos a cada 14 dias.",
    "attention": "A Meta mandou um aviso sobre a conta do WhatsApp da loja. Confira no Gerenciador do WhatsApp.",
}


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def number_status(n: WhatsAppCloudNumber) -> dict:
    """Estado do número para o app. NUNCA inclui o token (só se existe)."""
    try:
        detail = json.loads(n.connection_detail) if n.connection_detail else None
    except ValueError:
        detail = None
    return {
        "id": n.id,
        "phone_number_id": n.phone_number_id,
        "waba_id": n.waba_id,
        "display_phone_number": n.display_phone_number,
        "verified_name": n.verified_name,
        "is_coexistence": bool(n.is_coexistence),
        "has_business_token": bool(n.access_token_encrypted),
        "connected_at": _iso(n.connected_at),
        "connection_status": n.connection_status or "connected",
        "connection_event": n.connection_event,
        "connection_event_at": _iso(n.connection_event_at),
        "connection_detail": detail,
        "warning": WARNINGS.get(n.connection_status or ""),
        "contacts_sync_requested_at": _iso(n.contacts_sync_requested_at),
        "history_sync": {
            "status": n.history_sync_status,
            "requested_at": _iso(n.history_sync_requested_at),
            "phase": n.history_sync_phase,
            "progress": n.history_sync_progress,
        },
    }


async def connection_status(db: AsyncSession, tenant_id: int) -> dict:
    numbers = (await db.execute(
        select(WhatsAppCloudNumber).where(
            WhatsAppCloudNumber.tenant_id == tenant_id, WhatsAppCloudNumber.is_active == True,  # noqa: E712
        ).order_by(WhatsAppCloudNumber.id)
    )).scalars().all()
    items = [number_status(n) for n in numbers]
    return {
        "configured": is_configured(),
        # IDs públicos que a tela precisa para abrir o Embedded Signup (não são segredo)
        "app_id": settings.WHATSAPP_CLOUD_APP_ID or None,
        "config_id": settings.WHATSAPP_CLOUD_ES_CONFIG_ID or None,
        "connected": bool(items),
        "numbers": items,
    }
