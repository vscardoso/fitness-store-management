"""
Webhook do WhatsApp oficial (Cloud API da Meta).

    GET  /webhooks/whatsapp-cloud  verificação inicial (hub.challenge)
    POST /webhooks/whatsapp-cloud  mensagens e status, assinados com o App Secret

O webhook antigo do bot Baileys (/webhooks/whatsapp) é outro arquivo e continua como está.
Resposta 200 só depois de gravar; erro de banco devolve 500 para a Meta reenviar
(a idempotência pelo wamid evita duplicar).
"""
import hmac
import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db_unscoped
from app.services.whatsapp_cloud_service import process_payload, verify_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.get("/whatsapp-cloud")
async def verify_webhook(request: Request):
    q = request.query_params
    expected = settings.WHATSAPP_CLOUD_VERIFY_TOKEN
    token = q.get("hub.verify_token") or ""
    if expected and q.get("hub.mode") == "subscribe" and hmac.compare_digest(token, expected):
        return PlainTextResponse(q.get("hub.challenge") or "")
    return PlainTextResponse("forbidden", status_code=403)


@router.post("/whatsapp-cloud")
async def receive_webhook(request: Request, db: AsyncSession = Depends(get_db_unscoped)):
    raw = await request.body()
    if not settings.WHATSAPP_CLOUD_APP_SECRET:
        logger.error("WhatsApp Cloud: WHATSAPP_CLOUD_APP_SECRET não configurado, webhook recusado")
        return JSONResponse({"detail": "not configured"}, status_code=503)
    if not verify_signature(raw, request.headers.get("x-hub-signature-256"), settings.WHATSAPP_CLOUD_APP_SECRET):
        logger.warning("WhatsApp Cloud: assinatura inválida")
        return JSONResponse({"detail": "invalid signature"}, status_code=403)
    try:
        payload = json.loads(raw)
    except ValueError:
        return JSONResponse({"detail": "invalid json"}, status_code=400)
    if not isinstance(payload, dict):
        return JSONResponse({"detail": "invalid json"}, status_code=400)

    # Duas entregas iguais ao mesmo tempo: a segunda bate no índice único do wamid.
    # Desfaz tudo e reprocessa uma vez (agora ela enxerga a mensagem já gravada).
    for attempt in (1, 2):
        try:
            result = await process_payload(db, payload)
            await db.commit()
            break
        except IntegrityError:
            await db.rollback()
            if attempt == 2:
                raise
            logger.info("WhatsApp Cloud: conflito de gravação simultânea, reprocessando")
        except Exception:
            await db.rollback()
            raise
    return {
        "ok": True,
        "saved": result.messages_saved,
        "duplicated": result.messages_duplicated,
        "statuses": result.statuses_applied,
    }
