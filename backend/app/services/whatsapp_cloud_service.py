"""
WhatsApp oficial (Cloud API da Meta): validação do webhook e gravação dos eventos.

Regras:
- Assinatura: `X-Hub-Signature-256` = "sha256=" + HMAC-SHA256 do CORPO BRUTO com o App Secret,
  comparada em tempo constante. Segredo vazio recusa tudo.
- Idempotência: `whatsapp_messages.wamid` é único; mensagem repetida é ignorada.
- Tudo-ou-nada: `process_payload` só faz flush; quem chama faz UM commit ou rollback.
- Status de entrega só avança (sent < delivered < read); failed não desfaz delivered/read.
- Contato pode vir com telefone, com BSUID ou com os dois. Telefone brasileiro de celular
  com e sem o 9 depois do DDD é o mesmo contato.
"""
import hashlib
import hmac
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppConversation, WhatsAppMessage

logger = logging.getLogger(__name__)

STATUS_RANK = {"received": 0, "sent": 1, "delivered": 2, "read": 3}


def verify_signature(raw_body: bytes, header: Optional[str], app_secret: str) -> bool:
    """Confere a assinatura da Meta. Sem segredo configurado ou sem cabeçalho: False."""
    if not app_secret or not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len("sha256="):].strip().lower())


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """
    Só dígitos; celular brasileiro sempre com o 9 depois do DDD.
    5511987654321 e 551187654321 viram 5511987654321. Fixo (começa com 2 a 5) fica como está.
    """
    if not raw:
        return None
    digits = "".join(c for c in str(raw) if c.isdigit())
    if not digits:
        return None
    if digits.startswith("55") and len(digits) == 12 and digits[4] in "6789":
        digits = digits[:4] + "9" + digits[4:]
    return digits


def _ts(value: Any) -> Optional[datetime]:
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite devolve datetime sem fuso; tudo aqui é UTC."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _later(a: Optional[datetime], b: Optional[datetime]) -> Optional[datetime]:
    a, b = _aware(a), _aware(b)
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b)


def message_text(msg: dict) -> Optional[str]:
    """Texto legível de qualquer tipo de mensagem (para a lista de conversas)."""
    t = msg.get("type")
    body = msg.get(t) if isinstance(msg.get(t), dict) else {}
    if t == "text":
        return body.get("body")
    if t in ("image", "video", "document"):
        return body.get("caption") or body.get("filename")
    if t == "button":
        return body.get("text")
    if t == "interactive":
        for key in ("button_reply", "list_reply"):
            if isinstance(body.get(key), dict):
                return body[key].get("title")
        return None
    if t == "reaction":
        return body.get("emoji")
    if t == "location":
        return body.get("name") or body.get("address")
    return None


@dataclass
class ProcessResult:
    messages_saved: int = 0
    messages_duplicated: int = 0
    statuses_applied: int = 0
    statuses_ignored: int = 0
    unknown_numbers: list[str] = field(default_factory=list)


async def _find_number(db: AsyncSession, phone_number_id: Optional[str]) -> Optional[WhatsAppCloudNumber]:
    if not phone_number_id:
        return None
    return (await db.execute(
        select(WhatsAppCloudNumber).where(
            WhatsAppCloudNumber.phone_number_id == str(phone_number_id),
            WhatsAppCloudNumber.is_active == True,  # noqa: E712
        )
    )).scalar_one_or_none()


async def _get_or_create_conversation(
    db: AsyncSession, number: WhatsAppCloudNumber, *, wa_id: Optional[str], bsuid: Optional[str],
    profile_name: Optional[str],
) -> Optional[WhatsAppConversation]:
    phone = normalize_phone(wa_id)
    if not phone and not bsuid:
        return None
    conds = []
    if bsuid:
        conds.append(WhatsAppConversation.bsuid == bsuid)
    if phone:
        conds.append(WhatsAppConversation.phone == phone)
    found = (await db.execute(
        select(WhatsAppConversation)
        .where(WhatsAppConversation.number_id == number.id, or_(*conds))
        .order_by(WhatsAppConversation.id)
    )).scalars().all()
    # Preferência: quem casa pelo BSUID (estável), depois pelo telefone
    conv = next((c for c in found if bsuid and c.bsuid == bsuid), None) or (found[0] if found else None)
    if conv is None:
        conv = WhatsAppConversation(
            tenant_id=number.tenant_id, number_id=number.id,
            contact_key=phone or f"u:{bsuid}", phone=phone, wa_id=wa_id, bsuid=bsuid,
            profile_name=profile_name, unread_count=0,
        )
        db.add(conv)
        await db.flush()
        return conv
    # Completa o que faltava, sem trocar a chave
    if phone and not conv.phone:
        conv.phone = phone
    if wa_id:
        conv.wa_id = wa_id
    if bsuid and not conv.bsuid:
        conv.bsuid = bsuid
    if profile_name:
        conv.profile_name = profile_name
    return conv


async def _save_inbound(db: AsyncSession, number: WhatsAppCloudNumber, msg: dict, contacts: list, result: ProcessResult):
    wamid = msg.get("id")
    if not wamid:
        return
    exists = (await db.execute(select(WhatsAppMessage.id).where(WhatsAppMessage.wamid == wamid))).scalar_one_or_none()
    if exists:
        result.messages_duplicated += 1
        return

    wa_id = msg.get("from")
    # BSUID: nome do campo ainda não confirmado na documentação da Meta; aceitamos as duas formas
    bsuid = msg.get("from_user_id") or msg.get("user_id")
    contact = next(
        (c for c in contacts if (wa_id and c.get("wa_id") == wa_id) or (bsuid and c.get("user_id") == bsuid)),
        contacts[0] if len(contacts) == 1 else {},
    )
    wa_id = wa_id or contact.get("wa_id")
    bsuid = bsuid or contact.get("user_id")
    profile_name = (contact.get("profile") or {}).get("name")

    conv = await _get_or_create_conversation(db, number, wa_id=wa_id, bsuid=bsuid, profile_name=profile_name)
    if conv is None:
        logger.warning("WhatsApp Cloud: mensagem %s sem telefone nem BSUID, ignorada", wamid)
        return

    sent_at = _ts(msg.get("timestamp")) or datetime.now(timezone.utc)
    db.add(WhatsAppMessage(
        tenant_id=number.tenant_id, conversation_id=conv.id, wamid=wamid, direction="in",
        msg_type=str(msg.get("type") or "unknown")[:30], text=message_text(msg),
        payload=json.dumps(msg, ensure_ascii=False), sent_at=sent_at,
        status="received", status_at=sent_at,
    ))
    conv.last_message_at = _later(conv.last_message_at, sent_at)
    conv.last_inbound_at = _later(conv.last_inbound_at, sent_at)
    conv.unread_count = (conv.unread_count or 0) + 1
    await db.flush()
    result.messages_saved += 1


async def _apply_status(db: AsyncSession, number: WhatsAppCloudNumber, st: dict, result: ProcessResult):
    wamid, status = st.get("id"), st.get("status")
    msg = None
    if wamid:
        msg = (await db.execute(
            select(WhatsAppMessage).where(WhatsAppMessage.wamid == wamid, WhatsAppMessage.tenant_id == number.tenant_id)
        )).scalar_one_or_none()
    if msg is None or msg.direction != "out" or status not in ("sent", "delivered", "read", "failed"):
        # Mensagem enviada por fora do app (celular, painel da Meta) ou status desconhecido
        result.statuses_ignored += 1
        return
    at = _ts(st.get("timestamp"))
    if status == "failed":
        if msg.status in ("delivered", "read"):
            result.statuses_ignored += 1
            return
        msg.status, msg.status_at = "failed", at
        msg.error = json.dumps(st.get("errors") or [], ensure_ascii=False)
    else:
        if msg.status == "failed" or STATUS_RANK[status] <= STATUS_RANK.get(msg.status, 0):
            result.statuses_ignored += 1
            return
        msg.status, msg.status_at = status, at
    await db.flush()
    result.statuses_applied += 1


async def process_payload(db: AsyncSession, payload: dict) -> ProcessResult:
    """Grava mensagens e status de um webhook. Só faz flush: o commit é de quem chama."""
    result = ProcessResult()
    if payload.get("object") != "whatsapp_business_account":
        return result
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") != "messages":
                continue
            value = change.get("value") or {}
            pnid = (value.get("metadata") or {}).get("phone_number_id")
            number = await _find_number(db, pnid)
            if number is None:
                logger.warning("WhatsApp Cloud: phone_number_id %s sem loja vinculada, evento ignorado", pnid)
                result.unknown_numbers.append(str(pnid))
                continue
            contacts = value.get("contacts") or []
            for msg in value.get("messages") or []:
                await _save_inbound(db, number, msg, contacts, result)
            for st in value.get("statuses") or []:
                await _apply_status(db, number, st, result)
    return result
