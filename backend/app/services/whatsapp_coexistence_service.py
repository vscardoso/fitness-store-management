"""
WhatsApp em coexistência (WhatsApp Business app do celular + Cloud API no mesmo número): webhooks extras.

Campos tratados aqui (o `messages` continua em whatsapp_cloud_service):
- smb_message_echoes: mensagem que a loja mandou PELO CELULAR. Grava como saída (`source='phone_app'`), sem abrir
  nem fechar a janela de 24 h (não mexe em `last_inbound_at`) e zera o "não lidas" da conversa (a loja respondeu).
- history: histórico do celular (até 180 dias, em 3 fases). Grava entrada e saída (`source='history'`), idempotente
  pelo wamid, pula grupos, não conta como não lida, não notifica, não saúda e não mexe na janela de 24 h.
  Erro 2593109 = a loja recusou compartilhar o histórico (status `declined`).
- smb_app_state_sync: agenda do celular. Guarda em whatsapp_contacts e preenche `contact_name` das conversas.
  "remove" só desativa o contato (nunca apaga dado nem tira o nome já posto na conversa).
- account_update: conexão do número (PARTNER_REMOVED, ACCOUNT_OFFBOARDED, ACCOUNT_RECONNECTED, desconexão por
  celular parado ~14 dias...). Grava `connection_status`/`connection_event` para o app avisar a loja.

FORMATO DOS PAYLOADS: NÃO verificado com payload real (escrito pela documentação da Meta lida em 05/11/2026, sem
acesso a um evento de verdade). Por isso o parser é tolerante: chave faltando = item ignorado, nunca erro 500.
Formatos assumidos (ver docs/whatsapp-cloud-plano.md):
  smb_message_echoes: value.message_echoes[] = {from, to, id, timestamp, type, <type>: {...}}
  history:            value.history[] = {metadata: {phase, chunk_order, progress}, threads: [{id, messages: [
                          {from, to?, id, timestamp, type, <type>, history_context: {status}}]}]}
                      ou value.history[] = {errors: [{code: 2593109, ...}]} (também aceito em value.errors)
  smb_app_state_sync: value.state_sync[] = {type: "contact", contact: {full_name, first_name, phone_number},
                          action: "add"|"remove", metadata: {timestamp}}
  account_update:     value = {event, phone_number?, waba_info?: {waba_id}, disconnection_info?/reason?...}
                      (sem metadata.phone_number_id: a loja sai pelo entry.id = WABA ou pelo phone_number)
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.whatsapp_cloud import WhatsAppCloudNumber, WhatsAppContact, WhatsAppConversation, WhatsAppMessage

logger = logging.getLogger(__name__)

HISTORY_DECLINED_CODE = 2593109
HISTORY_OUT_STATUS = {"sent": "sent", "delivered": "delivered", "read": "read", "played": "read"}

# Evento do account_update -> estado da conexão. Desconhecido: guarda o evento sem mudar o estado.
DISCONNECTED_EVENTS = {
    "PARTNER_REMOVED", "ACCOUNT_OFFBOARDED", "ACCOUNT_DISCONNECTED", "PHONE_NUMBER_REMOVED", "ACCOUNT_DELETED",
}
CONNECTED_EVENTS = {"ACCOUNT_RECONNECTED", "PARTNER_ADDED", "PARTNER_APP_INSTALLED", "ACCOUNT_CONNECTED"}
ATTENTION_EVENTS = {"ACCOUNT_VIOLATION", "ACCOUNT_RESTRICTION", "DISABLED_UPDATE", "BUSINESS_PRIMARY_LOCATION_COUNTRY_UPDATE"}
# Motivos de desconexão que podem vir junto (ex.: celular parado ~14 dias)
DISCONNECT_REASONS = {"PRIMARY_INACTIVITY", "PRIMARY_DEVICE_INACTIVE", "USER_DISCONNECTED", "BUSINESS_APP_UNINSTALLED"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_group(thread: dict, msg: Optional[dict] = None) -> bool:
    """Grupos não deveriam vir no histórico; se vierem, pula. Marcas aceitas (suposição): @g.us, type=group, group_id."""
    tid = str(thread.get("id") or "")
    if "@g.us" in tid or thread.get("type") == "group" or thread.get("group_id"):
        return True
    if msg is not None:
        if msg.get("group_id") or (msg.get("context") or {}).get("group_id") or "@g.us" in str(msg.get("from") or ""):
            return True
    return False


async def _contact_name(db: AsyncSession, number: WhatsAppCloudNumber, phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    c = (await db.execute(select(WhatsAppContact).where(
        WhatsAppContact.number_id == number.id, WhatsAppContact.phone == phone,
    ))).scalar_one_or_none()
    return (c.full_name or c.first_name) if c else None


async def _conversation(db: AsyncSession, number: WhatsAppCloudNumber, contact_raw: Optional[str],
                        bsuid: Optional[str] = None) -> Optional[WhatsAppConversation]:
    from app.services.whatsapp_cloud_service import _get_or_create_conversation, normalize_phone

    conv = await _get_or_create_conversation(db, number, wa_id=contact_raw, bsuid=bsuid, profile_name=None)
    if conv is not None and not conv.contact_name:
        conv.contact_name = await _contact_name(db, number, normalize_phone(contact_raw))
    return conv


async def _store_message(db: AsyncSession, number: WhatsAppCloudNumber, conv: WhatsAppConversation, msg: dict, *,
                         direction: str, source: str, status: str, seen: set) -> bool:
    """Grava uma mensagem (eco ou histórico) se o wamid ainda não existe. Devolve True se gravou."""
    from app.services.whatsapp_cloud_service import _later, _ts, message_text

    wamid = msg.get("id")
    if not wamid or wamid in seen:
        return False
    seen.add(wamid)
    if (await db.execute(select(WhatsAppMessage.id).where(WhatsAppMessage.wamid == wamid))).scalar_one_or_none():
        return False
    sent_at = _ts(msg.get("timestamp")) or _now()
    msg_type = str(msg.get("type") or "unknown")[:30]
    db.add(WhatsAppMessage(
        tenant_id=number.tenant_id, conversation_id=conv.id, wamid=str(wamid)[:255], direction=direction,
        msg_type=msg_type, text=message_text(msg), payload=json.dumps(msg, ensure_ascii=False),
        sent_at=sent_at, status=status, status_at=sent_at, source=source,
    ))
    conv.last_message_at = _later(conv.last_message_at, sent_at)
    await db.flush()
    return True


# ── smb_message_echoes ────────────────────────────────────────────────────────

async def handle_echoes(db: AsyncSession, number: WhatsAppCloudNumber, value: dict, result) -> None:
    seen: set = set()
    for msg in value.get("message_echoes") or value.get("messages") or []:
        if not isinstance(msg, dict):
            continue
        to = msg.get("to") or msg.get("recipient_id")
        bsuid = msg.get("to_user_id") or msg.get("recipient_user_id")
        conv = await _conversation(db, number, to, bsuid)
        if conv is None:
            logger.warning("WhatsApp coexistência: eco %s sem destinatário, ignorado", msg.get("id"))
            continue
        if await _store_message(db, number, conv, msg, direction="out", source="phone_app", status="sent", seen=seen):
            conv.unread_count = 0   # a loja respondeu pelo celular: já viu a conversa
            result.messages_saved += 1
        else:
            result.messages_duplicated += 1


# ── history ───────────────────────────────────────────────────────────────────

def _history_errors(value: dict) -> list:
    errs = list(value.get("errors") or [])
    for item in value.get("history") or []:
        if isinstance(item, dict):
            errs.extend(item.get("errors") or [])
    return [e for e in errs if isinstance(e, dict)]


async def handle_history(db: AsyncSession, number: WhatsAppCloudNumber, value: dict, result) -> None:
    from app.services.whatsapp_cloud_service import normalize_phone

    errors = _history_errors(value)
    if any(str(e.get("code")) == str(HISTORY_DECLINED_CODE) for e in errors):
        number.history_sync_status = "declined"
        logger.info("WhatsApp coexistência: loja %s recusou compartilhar o histórico", number.tenant_id)
    elif errors:
        logger.warning("WhatsApp coexistência: erro no histórico (códigos %s)", [e.get("code") for e in errors])

    business = normalize_phone(number.display_phone_number)
    seen: set = set()
    for chunk in value.get("history") or []:
        if not isinstance(chunk, dict):
            continue
        meta = chunk.get("metadata") or {}
        try:
            phase = int(meta["phase"]) if meta.get("phase") is not None else None
            progress = int(meta["progress"]) if meta.get("progress") is not None else None
        except (TypeError, ValueError):
            phase = progress = None
        if phase is not None:
            number.history_sync_phase = phase
        if progress is not None:
            number.history_sync_progress = max(0, min(100, progress))
        if number.history_sync_status != "declined" and (phase is not None or chunk.get("threads")):
            number.history_sync_status = "done" if (phase == 2 and progress is not None and progress >= 100) else "receiving"

        for thread in chunk.get("threads") or []:
            if not isinstance(thread, dict) or _is_group(thread):
                continue
            contact_raw = thread.get("id")
            contact = normalize_phone(contact_raw)
            conv = None
            for msg in thread.get("messages") or []:
                if not isinstance(msg, dict) or _is_group(thread, msg):
                    continue
                frm = normalize_phone(msg.get("from"))
                # Entrada quando quem mandou é o contato da conversa; sem o id da conversa, compara com o número da loja
                if contact:
                    incoming = frm == contact
                else:
                    incoming = bool(frm) and frm != business
                    contact_raw = msg.get("from") if incoming else msg.get("to")
                if conv is None or not contact:
                    conv = await _conversation(db, number, contact_raw)
                if conv is None:
                    continue
                if incoming:
                    direction, status = "in", "received"
                else:
                    raw_status = str(((msg.get("history_context") or {}).get("status") or "")).lower()
                    direction, status = "out", HISTORY_OUT_STATUS.get(raw_status, "sent")
                if await _store_message(db, number, conv, msg, direction=direction, source="history",
                                        status=status, seen=seen):
                    result.messages_saved += 1
                else:
                    result.messages_duplicated += 1


# ── smb_app_state_sync (agenda) ───────────────────────────────────────────────

async def handle_state_sync(db: AsyncSession, number: WhatsAppCloudNumber, value: dict, result) -> None:
    from app.services.whatsapp_cloud_service import normalize_phone

    for item in value.get("state_sync") or []:
        if not isinstance(item, dict) or (item.get("type") not in (None, "contact")):
            continue
        c = item.get("contact") or {}
        phone = normalize_phone(c.get("phone_number") or c.get("wa_id"))
        if not phone:
            continue
        full = (str(c.get("full_name") or "").strip() or None)
        first = (str(c.get("first_name") or "").strip() or None)
        action = str(item.get("action") or "add").lower()
        row = (await db.execute(select(WhatsAppContact).where(
            WhatsAppContact.number_id == number.id, WhatsAppContact.phone == phone,
        ))).scalar_one_or_none()
        if action == "remove":
            if row is not None:
                row.is_active = False   # nunca apaga; o nome já posto nas conversas fica
            continue
        if row is None:
            row = WhatsAppContact(tenant_id=number.tenant_id, number_id=number.id, phone=phone)
            db.add(row)
        row.is_active = True
        row.full_name = full[:255] if full else row.full_name
        row.first_name = first[:120] if first else row.first_name
        row.synced_at = _now()
        name = row.full_name or row.first_name
        if name:
            convs = (await db.execute(select(WhatsAppConversation).where(
                WhatsAppConversation.number_id == number.id, WhatsAppConversation.phone == phone,
            ))).scalars().all()
            for conv in convs:
                conv.contact_name = name[:255]
        await db.flush()
        result.contacts_synced += 1


# ── account_update ────────────────────────────────────────────────────────────

def _disconnect_reason(value: dict) -> Optional[str]:
    for key in ("disconnection_info", "ban_info", "violation_info", "restriction_info"):
        info = value.get(key)
        if isinstance(info, dict):
            for k in ("reason", "disconnection_reason", "ban_state", "violation_type"):
                if info.get(k):
                    return str(info[k])[:120]
    for k in ("reason", "disconnection_reason"):
        if value.get(k):
            return str(value[k])[:120]
    return None


async def numbers_for_account_update(db: AsyncSession, entry_id: Optional[str], value: dict) -> list:
    """Números atingidos: pelo WABA (entry.id ou waba_info.waba_id), estreitando pelo telefone quando vier."""
    from app.services.whatsapp_cloud_service import normalize_phone

    waba_ids = {str(x) for x in (entry_id, (value.get("waba_info") or {}).get("waba_id")) if x}
    phone = normalize_phone(value.get("phone_number") or value.get("display_phone_number"))
    pnid = value.get("phone_number_id") or (value.get("metadata") or {}).get("phone_number_id")
    conds = []
    if pnid:
        conds.append(WhatsAppCloudNumber.phone_number_id == str(pnid))
    if waba_ids:
        conds.append(WhatsAppCloudNumber.waba_id.in_(waba_ids))
    if not conds:
        return []
    from sqlalchemy import or_
    rows = (await db.execute(select(WhatsAppCloudNumber).where(or_(*conds)))).scalars().all()
    if phone and len(rows) > 1:
        narrowed = [n for n in rows if normalize_phone(n.display_phone_number) == phone]
        rows = narrowed or rows
    return rows


async def handle_account_update(db: AsyncSession, entry_id: Optional[str], value: dict, result) -> None:
    event = str(value.get("event") or "").upper()[:60]
    if not event:
        return
    reason = _disconnect_reason(value)
    if event in DISCONNECTED_EVENTS or (reason and reason.upper() in DISCONNECT_REASONS):
        status = "disconnected"
    elif event in CONNECTED_EVENTS:
        status = "connected"
    elif event in ATTENTION_EVENTS:
        status = "attention"
    else:
        status = None   # evento desconhecido: guarda, sem mudar o estado
    detail = {"event": event}
    if reason:
        detail["reason"] = reason
    for k in ("disconnection_info", "ban_info", "violation_info", "restriction_info", "waba_info"):
        if isinstance(value.get(k), dict):
            detail[k] = value[k]
    numbers = await numbers_for_account_update(db, entry_id, value)
    if not numbers:
        logger.warning("WhatsApp coexistência: account_update %s sem número vinculado", event)
        return
    for number in numbers:
        number.connection_event = event
        number.connection_event_at = _now()
        number.connection_detail = json.dumps(detail, ensure_ascii=False)[:4000]
        if status:
            number.connection_status = status
        result.account_updates += 1
    await db.flush()
