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
from collections import OrderedDict
import hmac
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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
    greetings: list[tuple] = field(default_factory=list)  # (tenant_id, conversation_id) a saudar depois do commit
    aways: list[tuple] = field(default_factory=list)      # idem, para a mensagem de ausência


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
    previous_inbound = _aware(conv.last_inbound_at)
    opens_window = previous_inbound is None or (sent_at - previous_inbound) > WINDOW
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
    if opens_window and str(msg.get("type") or "") not in GREETING_SKIP_TYPES:
        # Fora do horário comercial (com a ausência ligada) vale SÓ a ausência; no horário vale a saudação.
        if away_applies(number, sent_at):
            if await _claim_away(db, number, conv, sent_at):
                result.aways.append((number.tenant_id, conv.id))
        elif await _claim_greeting(db, number, conv, sent_at):
            result.greetings.append((number.tenant_id, conv.id))


def _apply_pricing(msg: WhatsAppMessage, st: dict) -> None:
    """Guarda a cobrança informada pela Meta no status (`pricing`, ou a categoria da `conversation` no formato antigo)."""
    pricing = st.get("pricing")
    if not isinstance(pricing, dict):
        return
    category = pricing.get("category")
    if not category:
        origin = ((st.get("conversation") or {}).get("origin") or {})
        category = origin.get("type")
    msg.pricing_billable = pricing.get("billable") if isinstance(pricing.get("billable"), bool) else msg.pricing_billable
    msg.pricing_category = str(category)[:40] if category else msg.pricing_category
    msg.pricing_type = str(pricing["type"])[:40] if pricing.get("type") else msg.pricing_type
    msg.pricing_model = str(pricing["pricing_model"])[:16] if pricing.get("pricing_model") else msg.pricing_model
    msg.pricing_raw = json.dumps(pricing, ensure_ascii=False)


async def _apply_status(db: AsyncSession, number: WhatsAppCloudNumber, st: dict, result: ProcessResult):
    wamid, status = st.get("id"), st.get("status")
    msg = None
    if wamid:
        msg = (await db.execute(
            select(WhatsAppMessage).where(WhatsAppMessage.wamid == wamid, WhatsAppMessage.tenant_id == number.tenant_id)
        )).scalar_one_or_none()
    if msg is not None and st.get("recipient_user_id"):
        # o BSUID do contato (identificador por empresa) também vem nos status de entrega
        conv = (await db.execute(
            select(WhatsAppConversation).where(WhatsAppConversation.id == msg.conversation_id)
        )).scalar_one_or_none()
        if conv is not None and not conv.bsuid:
            conv.bsuid = st["recipient_user_id"]
    if msg is not None and msg.direction == "out":
        _apply_pricing(msg, st)
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


# ── saudação automática ───────────────────────────────────────────────────────

GREETING_SKIP_TYPES = {"reaction", "system", "request_welcome", "unsupported"}
GREETING_MAX_CHARS = 1000


async def _is_system_contact(db: AsyncSession, conv: WhatsAppConversation) -> bool:
    """O contato é a própria loja ou outro número ligado ao sistema? Esse nunca recebe saudação."""
    if not conv.phone:
        return False
    shown = (await db.execute(select(WhatsAppCloudNumber.display_phone_number).where(
        WhatsAppCloudNumber.display_phone_number.isnot(None)))).scalars().all()
    return conv.phone in {customer_phone_key(x) for x in shown if x}


async def _claim_greeting(db: AsyncSession, number: WhatsAppCloudNumber, conv: WhatsAppConversation,
                          sent_at: datetime) -> bool:
    """Decide, de forma atômica, se ESTA mensagem de entrada dispara a saudação.

    O UPDATE condicional na linha da conversa é a trava: com duas mensagens simultâneas da mesma cliente, uma só
    muda `last_greeting_at` (a outra espera o commit da primeira e não casa mais o WHERE). Roda na mesma transação
    que grava a mensagem: se algo falhar, a trava volta junto (tudo-ou-nada).
    """
    if not number.greeting_enabled or not (number.greeting_text or "").strip():
        return False
    if await _is_system_contact(db, conv):
        return False
    res = await db.execute(
        update(WhatsAppConversation)
        .where(
            WhatsAppConversation.id == conv.id,
            or_(WhatsAppConversation.last_greeting_at.is_(None),
                WhatsAppConversation.last_greeting_at <= sent_at - WINDOW),
            # saudação e ausência nunca na mesma janela
            or_(WhatsAppConversation.last_away_at.is_(None),
                WhatsAppConversation.last_away_at <= sent_at - WINDOW),
        )
        .values(last_greeting_at=sent_at)
        .execution_options(synchronize_session=False)
    )
    return (res.rowcount or 0) == 1


DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")   # datetime.weekday(): segunda = 0
HOURS_TZ = "America/Sao_Paulo"
MAX_INTERVALS_PER_DAY = 4


def parse_hours(raw) -> Optional[dict]:
    """JSON do horário (texto ou dict) -> {dia: [(início_min, fim_min), ...]}; None se não houver horário configurado."""
    if raw is None or raw == "":
        return None
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    out = {}
    for d in DAYS:
        items = []
        for pair in data.get(d) or []:
            try:
                a, b = (int(x[:2]) * 60 + int(x[3:5]) for x in pair)
            except (ValueError, TypeError, IndexError):
                return None
            items.append((a, b))
        out[d] = items
    return out


def validate_hours(hours: dict) -> dict:
    """Confere o horário vindo da tela e devolve no formato guardado. Levanta ValueError com frase para a lojista."""
    if not isinstance(hours, dict):
        raise ValueError("Horário inválido.")
    clean = {}
    for d in DAYS:
        items = []
        for pair in (hours.get(d) or []):
            if not (isinstance(pair, (list, tuple)) and len(pair) == 2):
                raise ValueError("Horário inválido.")
            vals = []
            for x in pair:
                x = str(x)
                if len(x) != 5 or x[2] != ":" or not (x[:2].isdigit() and x[3:].isdigit()) or int(x[:2]) > 23 or int(x[3:]) > 59:
                    raise ValueError("Use horas no formato 09:00.")
                vals.append(x)
            if vals[0] >= vals[1]:
                raise ValueError("O horário de abertura precisa ser antes do de fechamento.")
            items.append(vals)
        if len(items) > MAX_INTERVALS_PER_DAY:
            raise ValueError(f"No máximo {MAX_INTERVALS_PER_DAY} faixas de horário por dia.")
        items.sort()
        for (a1, b1), (a2, b2) in zip(items, items[1:]):
            if a2 < b1:
                raise ValueError("As faixas de horário do mesmo dia não podem se sobrepor.")
        clean[d] = items
    return clean


def is_open_at(hours: Optional[dict], when: datetime) -> bool:
    """A loja está aberta nesse instante (horário de Brasília)? Sem horário configurado = sempre aberta."""
    if hours is None:
        return True
    from zoneinfo import ZoneInfo

    local = (when if when.tzinfo else when.replace(tzinfo=timezone.utc)).astimezone(ZoneInfo(HOURS_TZ))
    minutes = local.hour * 60 + local.minute
    return any(a <= minutes < b for a, b in hours.get(DAYS[local.weekday()], []))


def away_applies(number: WhatsAppCloudNumber, when: datetime) -> bool:
    """Ausência ligada, com texto e horário, e a loja está fechada neste instante."""
    if not number.away_enabled or not (number.away_text or "").strip():
        return False
    hours = parse_hours(number.business_hours)
    return hours is not None and not is_open_at(hours, when)


async def _claim_away(db: AsyncSession, number: WhatsAppCloudNumber, conv: WhatsAppConversation,
                      sent_at: datetime) -> bool:
    """Mesma trava atômica da saudação, em `last_away_at`: uma ausência por janela de 24 h (e nunca junto da saudação)."""
    if await _is_system_contact(db, conv):
        return False
    res = await db.execute(
        update(WhatsAppConversation)
        .where(
            WhatsAppConversation.id == conv.id,
            or_(WhatsAppConversation.last_away_at.is_(None), WhatsAppConversation.last_away_at <= sent_at - WINDOW),
            or_(WhatsAppConversation.last_greeting_at.is_(None), WhatsAppConversation.last_greeting_at <= sent_at - WINDOW),
        )
        .values(last_away_at=sent_at)
        .execution_options(synchronize_session=False)
    )
    return (res.rowcount or 0) == 1


async def send_away(tenant_id: int, conversation_id: int) -> None:
    """Manda a mensagem de ausência (depois do commit e do 200). Nunca levanta erro; mesmo caminho do `send_text`."""
    await _send_automatic(tenant_id, conversation_id, "away_enabled", "away_text", "ausência")


async def send_greeting(tenant_id: int, conversation_id: int) -> None:
    """Manda a saudação (depois do commit da mensagem de entrada e da resposta ao webhook). Nunca levanta erro.

    Usa o mesmo caminho do texto da loja (`send_text`): só dentro da janela e só grava como enviada depois que a
    Meta aceitar. Qualquer falha vira log e o atendimento segue.
    """
    await _send_automatic(tenant_id, conversation_id, "greeting_enabled", "greeting_text", "saudação")


async def _send_automatic(tenant_id: int, conversation_id: int, enabled_attr: str, text_attr: str, label: str) -> None:
    import app.core.database as dbm
    from app.core.rls import bypass_on

    try:
        async with dbm.async_session_maker() as db:
            await bypass_on(db)
            try:
                conv = (await db.execute(select(WhatsAppConversation).where(
                    WhatsAppConversation.id == conversation_id, WhatsAppConversation.tenant_id == tenant_id))).scalar_one_or_none()
                number = (await db.execute(select(WhatsAppCloudNumber).where(
                    WhatsAppCloudNumber.id == conv.number_id))).scalar_one_or_none() if conv else None
                text = (getattr(number, text_attr) or "").strip() if number else ""
                if not number or not getattr(number, enabled_attr) or not text:
                    return  # desligada (ou apagada) entre o recebimento e o envio
                await send_text(db, tenant_id, conversation_id, text)
                await db.commit()
            except Exception:
                await db.rollback()
                raise
    except SendError as e:
        logger.warning("WhatsApp Cloud: %s não enviada (conversa %s): %s", label, conversation_id, e.message)
    except Exception:  # noqa: BLE001 - mensagem automática nunca derruba o atendimento
        logger.exception("WhatsApp Cloud: erro inesperado ao enviar a %s (conversa %s)", label, conversation_id)


# ── envio de saída ────────────────────────────────────────────────────────────

WINDOW = timedelta(hours=24)


class SendError(Exception):
    """Envio recusado antes ou pela Meta; `status_code` é o que a API devolve ao app."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def window_open(conv: WhatsAppConversation, now: Optional[datetime] = None) -> bool:
    """Texto livre só vale até 24 h depois da última mensagem DO CONTATO."""
    last = _aware(conv.last_inbound_at)
    return last is not None and (now or datetime.now(timezone.utc)) - last < WINDOW


async def _post_graph(phone_number_id: str, body: dict) -> dict:
    url = f"{settings.WHATSAPP_CLOUD_GRAPH_BASE}/{settings.WHATSAPP_CLOUD_API_VERSION}/{phone_number_id}/messages"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                url, json=body, headers={"Authorization": f"Bearer {settings.WHATSAPP_CLOUD_ACCESS_TOKEN}"},
            )
    except httpx.HTTPError:
        raise SendError("Não consegui falar com o WhatsApp agora. Tente de novo em instantes.", 424)
    data = resp.json() if resp.content else {}
    if resp.status_code >= 400:
        err = (data.get("error") or {}) if isinstance(data, dict) else {}
        logger.warning("WhatsApp Cloud: envio recusado (%s) code=%s", resp.status_code, err.get("code"))
        raise SendError("O WhatsApp recusou o envio. Confira o número da cliente e tente de novo.", 424)
    return data


async def _prepare_send(db: AsyncSession, tenant_id: int, conversation_id: int):
    """Confere token, conversa da loja, janela de 24 h e destino. Devolve (conversa, número, destino)."""
    if not settings.WHATSAPP_CLOUD_ACCESS_TOKEN:
        raise SendError("O WhatsApp da loja ainda não está configurado.", 424)
    conv = (await db.execute(
        select(WhatsAppConversation).where(
            WhatsAppConversation.id == conversation_id, WhatsAppConversation.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if conv is None:
        raise SendError("Conversa não encontrada.", 404)
    if not window_open(conv):
        raise SendError(
            "Passou de 24 horas desde a última mensagem da cliente. Só dá para responder com um modelo aprovado.", 409,
        )
    number = (await db.execute(
        select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.id == conv.number_id, WhatsAppCloudNumber.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    to = conv.wa_id or conv.phone   # o wa_id é como a Meta conhece o contato (celular pode vir sem o 9)
    if number is None or not to:
        raise SendError("Esta conversa não tem um número para responder.", 409)
    return conv, number, to


def _record_out(db: AsyncSession, tenant_id: int, conv: WhatsAppConversation, data: dict, msg_type: str,
                text: Optional[str], payload: dict) -> WhatsAppMessage:
    wamid = ((data.get("messages") or [{}])[0]).get("id")
    if not wamid:
        raise SendError("O WhatsApp não confirmou o envio.", 424)
    now = datetime.now(timezone.utc)
    msg = WhatsAppMessage(
        tenant_id=tenant_id, conversation_id=conv.id, wamid=wamid, direction="out", msg_type=msg_type,
        text=text, payload=json.dumps(payload, ensure_ascii=False), sent_at=now, status="sent", status_at=now,
    )
    db.add(msg)
    conv.last_message_at = _later(conv.last_message_at, now)
    return msg


async def send_text(db: AsyncSession, tenant_id: int, conversation_id: int, text: str) -> WhatsAppMessage:
    """Manda texto livre na conversa. A mensagem só é gravada DEPOIS que a Meta aceitar (devolve o wamid)."""
    text = (text or "").strip()
    if not text:
        raise SendError("Escreva a mensagem antes de enviar.", 400)
    if len(text) > 4096:
        raise SendError("A mensagem passa de 4.096 letras.", 400)
    conv, number, to = await _prepare_send(db, tenant_id, conversation_id)
    data = await _post_graph(number.phone_number_id, {
        "messaging_product": "whatsapp", "recipient_type": "individual", "to": to,
        "type": "text", "text": {"preview_url": False, "body": text},
    })
    msg = _record_out(db, tenant_id, conv, data, "text", text, {"to": to})
    await db.flush()
    return msg


MEDIA_MAX_BYTES = 16 * 1024 * 1024


async def send_media(db: AsyncSession, tenant_id: int, conversation_id: int, *, data: bytes, filename: str,
                     caption: Optional[str] = None) -> WhatsAppMessage:
    """Manda foto (regravada pelo filtro de imagem) ou PDF. Só grava depois que a Meta aceitar o envio."""
    from app.core.image_guard import InvalidImage, sanitize_image

    caption = (caption or "").strip()[:1024] or None
    if not data:
        raise SendError("O arquivo chegou vazio.", 400)
    if len(data) > MEDIA_MAX_BYTES:
        raise SendError("Arquivo muito grande (máximo 16 MB).", 400)
    if data[:5] == b"%PDF-":
        kind, mime, content = "document", "application/pdf", data
        name = (filename or "documento.pdf").strip()[:120] or "documento.pdf"
        if not name.lower().endswith(".pdf"):
            name += ".pdf"
    else:
        try:
            content, _ext, mime = sanitize_image(data)
        except InvalidImage as e:
            raise SendError(str(e) or "Envie uma foto ou um PDF.", 400)
        if mime not in ("image/jpeg", "image/png"):
            raise SendError("Envie a foto em JPG ou PNG, ou um PDF.", 400)
        if len(content) > 5 * 1024 * 1024:
            raise SendError("A foto passa de 5 MB, que é o limite do WhatsApp. Tire de novo em menor qualidade.", 400)
        kind, name = "image", None
    conv, number, to = await _prepare_send(db, tenant_id, conversation_id)

    # 1) sobe o arquivo para a Meta; 2) manda a mensagem com o id devolvido
    url = f"{settings.WHATSAPP_CLOUD_GRAPH_BASE}/{settings.WHATSAPP_CLOUD_API_VERSION}/{number.phone_number_id}/media"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            up = await client.post(
                url, data={"messaging_product": "whatsapp", "type": mime},
                files={"file": (name or "foto", content, mime)},
                headers={"Authorization": f"Bearer {settings.WHATSAPP_CLOUD_ACCESS_TOKEN}"},
            )
    except httpx.HTTPError:
        raise SendError("Não consegui falar com o WhatsApp agora. Tente de novo em instantes.", 424)
    media_id = (up.json() or {}).get("id") if up.status_code < 400 else None
    if not media_id:
        logger.warning("WhatsApp Cloud: envio de arquivo recusado (%s)", up.status_code)
        raise SendError("O WhatsApp recusou o arquivo. Confira se é foto JPG/PNG ou PDF e tente de novo.", 424)
    body_media = {"id": media_id}
    if caption:
        body_media["caption"] = caption
    if kind == "document":
        body_media["filename"] = name
    data_out = await _post_graph(number.phone_number_id, {
        "messaging_product": "whatsapp", "recipient_type": "individual", "to": to, "type": kind, kind: body_media,
    })
    msg = _record_out(db, tenant_id, conv, data_out, kind, caption or (name if kind == "document" else None),
                      {"to": to, kind: {"id": media_id, "mime_type": mime, "filename": name}})
    await db.flush()
    return msg


ALLOWED_VIEW = ("image/", "audio/", "video/", "application/pdf")


_MEDIA_CACHE: "OrderedDict[tuple, tuple]" = OrderedDict()
_MEDIA_CACHE_BYTES = 0
_MEDIA_CACHE_LIMIT = 64 * 1024 * 1024   # 64 MB em memória do processo; some ao reiniciar (nada de foto de cliente em disco)
THUMB_SIDE = 640


def _cache_get(key):
    hit = _MEDIA_CACHE.get(key)
    if hit is not None:
        _MEDIA_CACHE.move_to_end(key)
    return hit


def _cache_put(key, value) -> None:
    global _MEDIA_CACHE_BYTES
    size = len(value[0])
    if size > _MEDIA_CACHE_LIMIT // 4:
        return
    old = _MEDIA_CACHE.pop(key, None)
    if old is not None:
        _MEDIA_CACHE_BYTES -= len(old[0])
    _MEDIA_CACHE[key] = value
    _MEDIA_CACHE_BYTES += size
    while _MEDIA_CACHE_BYTES > _MEDIA_CACHE_LIMIT and _MEDIA_CACHE:
        _, (dropped, *_rest) = _MEDIA_CACHE.popitem(last=False)
        _MEDIA_CACHE_BYTES -= len(dropped)


def _make_thumb(data: bytes) -> Optional[bytes]:
    """Miniatura JPEG (lado maior 640 px, sem EXIF) de uma foto; None se não for imagem que o filtro aceita."""
    import io
    from app.core.image_guard import InvalidImage, sanitize_image
    from PIL import Image

    try:
        clean, _ext, _mime = sanitize_image(data)
        img = Image.open(io.BytesIO(clean))
        img.thumbnail((THUMB_SIDE, THUMB_SIDE))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, "JPEG", quality=75, optimize=True)
        return out.getvalue()
    except (InvalidImage, OSError, ValueError):
        return None


async def fetch_media(db: AsyncSession, tenant_id: int, message_id: int, thumb: bool = False) -> tuple[bytes, str, Optional[str]]:
    """Baixa da Meta o arquivo de uma mensagem da loja. Devolve (bytes, tipo, nome).

    Fica em cache na memória (por loja e mensagem), então a segunda abertura não vai à Meta. `thumb` devolve uma
    miniatura (para a bolha da conversa abrir rápido); a foto inteira só é baixada quando a pessoa toca nela.
    """
    import asyncio

    key = (tenant_id, message_id, bool(thumb))
    hit = _cache_get(key)
    if hit is not None:
        return hit
    msg = (await db.execute(
        select(WhatsAppMessage).where(WhatsAppMessage.id == message_id, WhatsAppMessage.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if msg is None:
        raise SendError("Mensagem não encontrada.", 404)
    try:
        body = json.loads(msg.payload or "{}")
    except ValueError:
        body = {}
    info = body.get(msg.msg_type) if isinstance(body.get(msg.msg_type), dict) else None
    media_id = (info or {}).get("id")
    if not media_id:
        raise SendError("Esta mensagem não tem arquivo.", 404)

    full_key = (tenant_id, message_id, False)
    full = _cache_get(full_key)
    if full is None:
        if not settings.WHATSAPP_CLOUD_ACCESS_TOKEN:
            raise SendError("O WhatsApp da loja ainda não está configurado.", 424)
        headers = {"Authorization": f"Bearer {settings.WHATSAPP_CLOUD_ACCESS_TOKEN}"}
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                meta = await client.get(
                    f"{settings.WHATSAPP_CLOUD_GRAPH_BASE}/{settings.WHATSAPP_CLOUD_API_VERSION}/{media_id}", headers=headers)
                mj = meta.json() if meta.status_code == 200 else {}
                url = mj.get("url")
                if not url:
                    raise SendError("O arquivo não está mais disponível no WhatsApp.", 404)
                if int(mj.get("file_size") or 0) > MEDIA_MAX_BYTES:
                    raise SendError("Arquivo grande demais para abrir aqui.", 413)
                resp = await client.get(url, headers=headers)
        except httpx.HTTPError:
            raise SendError("Não consegui falar com o WhatsApp agora. Tente de novo em instantes.", 424)
        if resp.status_code != 200 or len(resp.content) > MEDIA_MAX_BYTES:
            raise SendError("Não consegui baixar o arquivo.", 424)
        mime = str(mj.get("mime_type") or (info or {}).get("mime_type") or "application/octet-stream").split(";")[0].strip().lower()
        full = (resp.content, mime, (info or {}).get("filename"))
        _cache_put(full_key, full)
    if thumb and full[1].startswith("image/") and full[1] != "image/svg+xml":
        small = await asyncio.to_thread(_make_thumb, full[0])
        if small is not None:
            result = (small, "image/jpeg", full[2])
            _cache_put(key, result)
            return result
    return full


# ── convite: link para a cliente começar a conversa ──────────────────────────

async def invite_link(db: AsyncSession, tenant_id: int, text: Optional[str] = None) -> dict:
    """Link wa.me do número oficial da loja (a cliente escreve primeiro e abre a janela de 24 h).

    Usa o número de exibição gravado; se não houver, pergunta à Meta uma vez e grava.
    """
    from urllib.parse import quote

    number = (await db.execute(
        select(WhatsAppCloudNumber).where(
            WhatsAppCloudNumber.tenant_id == tenant_id, WhatsAppCloudNumber.is_active == True,  # noqa: E712
        ).order_by(WhatsAppCloudNumber.id)
    )).scalars().first()
    if number is None:
        raise SendError("Esta loja ainda não tem um número oficial do WhatsApp ligado.", 409)
    digits = "".join(ch for ch in (number.display_phone_number or "") if ch.isdigit())
    if not digits and settings.WHATSAPP_CLOUD_ACCESS_TOKEN:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{settings.WHATSAPP_CLOUD_GRAPH_BASE}/{settings.WHATSAPP_CLOUD_API_VERSION}/{number.phone_number_id}",
                    params={"fields": "display_phone_number"},
                    headers={"Authorization": f"Bearer {settings.WHATSAPP_CLOUD_ACCESS_TOKEN}"},
                )
            shown = (resp.json() or {}).get("display_phone_number") if resp.status_code == 200 else None
        except (httpx.HTTPError, ValueError):
            shown = None
        digits = "".join(ch for ch in (shown or "") if ch.isdigit())
        if digits:
            number.display_phone_number = digits
            await db.flush()
    if not digits:
        raise SendError("Não consegui descobrir o número do WhatsApp da loja. Tente de novo em instantes.", 424)
    link = f"https://wa.me/{digits}"
    if text and text.strip():
        link += f"?text={quote(text.strip()[:500])}"
    return {"phone": digits, "link": link}


# ── ligação da conversa com o cadastro da cliente (pelo telefone) ────────────

def customer_phone_key(raw: Optional[str]) -> Optional[str]:
    """Telefone do cadastro no mesmo formato da conversa: com 55, e celular com o 9."""
    digits = "".join(c for c in str(raw or "") if c.isdigit())
    if not digits:
        return None
    if len(digits) in (10, 11):
        digits = "55" + digits
    return normalize_phone(digits)


async def customers_by_phone(db: AsyncSession, tenant_id: int) -> dict:
    """{telefone normalizado: (id, nome)} das clientes ativas da loja que têm telefone."""
    from app.models.customer import Customer

    rows = (await db.execute(
        select(Customer.id, Customer.full_name, Customer.phone).where(
            Customer.tenant_id == tenant_id, Customer.is_active == True, Customer.phone.isnot(None),  # noqa: E712
        )
    )).all()
    out: dict = {}
    for cid, name, phone in rows:
        key = customer_phone_key(phone)
        if key and key not in out:
            out[key] = (cid, name)
    return out


async def start_conversation(db: AsyncSession, tenant_id: int, customer_id: int) -> WhatsAppConversation:
    """Abre (ou acha) a conversa da cliente no número oficial da loja. Não manda nada: só prepara a conversa."""
    from app.models.customer import Customer

    customer = (await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id, Customer.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if customer is None:
        raise SendError("Cliente não encontrada.", 404)
    key = customer_phone_key(customer.phone)
    if not key:
        raise SendError("Esta cliente não tem telefone cadastrado.", 409)
    number = (await db.execute(
        select(WhatsAppCloudNumber).where(
            WhatsAppCloudNumber.tenant_id == tenant_id, WhatsAppCloudNumber.is_active == True,  # noqa: E712
        ).order_by(WhatsAppCloudNumber.id)
    )).scalars().first()
    if number is None:
        raise SendError("Esta loja ainda não tem um número oficial do WhatsApp ligado.", 409)
    conv = await _get_or_create_conversation(db, number, wa_id=key, bsuid=None, profile_name=None)
    await db.flush()
    return conv


async def mark_read_on_meta(db: AsyncSession, tenant_id: int, conv: WhatsAppConversation) -> None:
    """Avisa o WhatsApp que a loja leu a última mensagem da cliente (ela vê os tiques azuis). Nunca levanta erro."""
    if not settings.WHATSAPP_CLOUD_ACCESS_TOKEN:
        return
    try:
        last = (await db.execute(
            select(WhatsAppMessage.wamid).where(
                WhatsAppMessage.conversation_id == conv.id, WhatsAppMessage.tenant_id == tenant_id,
                WhatsAppMessage.direction == "in",
            ).order_by(WhatsAppMessage.id.desc()).limit(1)
        )).scalar_one_or_none()
        number = (await db.execute(
            select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.id == conv.number_id)
        )).scalar_one_or_none()
        if last and number:
            await _post_graph(number.phone_number_id, {"messaging_product": "whatsapp", "status": "read", "message_id": last})
    except Exception:  # noqa: BLE001 - recibo de leitura é cortesia; falha não atrapalha o atendimento
        logger.info("WhatsApp Cloud: não consegui marcar como lida na Meta", exc_info=False)


async def costs_summary(db: AsyncSession, tenant_id: int, days: int = 30) -> dict:
    """Quantas mensagens enviadas a Meta cobrou ou não, por categoria e tipo, nos últimos `days` dias.

    Só contagens: o valor em reais depende da tabela de preços da Meta (muda por país, categoria e data) e não é inventado aqui.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(
        select(WhatsAppMessage.pricing_billable, WhatsAppMessage.pricing_category, WhatsAppMessage.pricing_type)
        .where(
            WhatsAppMessage.tenant_id == tenant_id, WhatsAppMessage.direction == "out",
            WhatsAppMessage.sent_at >= since,
        )
    )).all()
    out = {"days": days, "sent": len(rows), "billable": 0, "free": 0, "unknown": 0, "by_category": {}, "by_type": {}}
    for billable, category, ptype in rows:
        if billable is None and category is None and ptype is None:
            out["unknown"] += 1
            continue
        pays = billable if billable is not None else (ptype not in ("free_customer_service", "free_entry_point") if ptype else None)
        if pays is True:
            out["billable"] += 1
        elif pays is False:
            out["free"] += 1
        else:
            out["unknown"] += 1
        out["by_category"][category or "desconhecida"] = out["by_category"].get(category or "desconhecida", 0) + 1
        out["by_type"][ptype or "desconhecido"] = out["by_type"].get(ptype or "desconhecido", 0) + 1
    return out


# ── perfil comercial do número (Graph API: whatsapp_business_profile) ────────

PROFILE_VERTICALS = (
    "UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN", "EVENT_PLAN", "FINANCE", "GROCERY",
    "GOVT", "HOTEL", "HEALTH", "NONPROFIT", "PROF_SERVICES", "RETAIL", "TRAVEL", "RESTAURANT", "NOT_A_BIZ",
)
PROFILE_LIMITS = {"about": 139, "address": 256, "description": 512, "email": 128}
PROFILE_FIELDS = "about,address,description,email,profile_picture_url,websites,vertical"


def validate_profile(data: dict) -> dict:
    """Confere tamanhos e formatos ANTES de chamar a Meta. Devolve só os campos preenchidos. ValueError = frase pronta."""
    out: dict = {}
    names = {"about": "O recado", "address": "O endereço", "description": "A descrição", "email": "O e-mail"}
    for key, limit in PROFILE_LIMITS.items():
        value = (data.get(key) or "").strip()
        if len(value) > limit:
            raise ValueError(f"{names[key]} passa de {limit} letras.")
        if value:
            out[key] = value
    if out.get("email") and ("@" not in out["email"] or " " in out["email"]):
        raise ValueError("O e-mail não parece certo.")
    sites = [str(w).strip() for w in (data.get("websites") or []) if str(w).strip()]
    if len(sites) > 2:
        raise ValueError("O WhatsApp aceita no máximo 2 endereços de site.")
    for w in sites:
        if not w.lower().startswith("https://") or len(w) > 256 or " " in w:
            raise ValueError("Os sites precisam começar com https://")
    if sites:
        out["websites"] = sites
    vertical = (data.get("vertical") or "").strip().upper()
    if vertical:
        if vertical not in PROFILE_VERTICALS:
            raise ValueError("Escolha um ramo de atividade da lista.")
        out["vertical"] = vertical
    if not out:
        raise ValueError("Preencha pelo menos um campo do perfil.")
    return out


async def _graph_profile(phone_number_id: str, body: Optional[dict] = None) -> dict:
    """GET (body=None) ou POST do perfil comercial. Erro da Meta vira SendError legível; nunca devolve 'ok' falso."""
    if not settings.WHATSAPP_CLOUD_ACCESS_TOKEN:
        raise SendError("O WhatsApp da loja ainda não está configurado.", 424)
    url = f"{settings.WHATSAPP_CLOUD_GRAPH_BASE}/{settings.WHATSAPP_CLOUD_API_VERSION}/{phone_number_id}/whatsapp_business_profile"
    headers = {"Authorization": f"Bearer {settings.WHATSAPP_CLOUD_ACCESS_TOKEN}"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            if body is None:
                resp = await client.get(url, params={"fields": PROFILE_FIELDS}, headers=headers)
            else:
                resp = await client.post(url, json={"messaging_product": "whatsapp", **body}, headers=headers)
    except httpx.HTTPError:
        raise SendError("Não consegui falar com o WhatsApp agora. Tente de novo em instantes.", 424)
    try:
        data = resp.json() if resp.content else {}
    except ValueError:
        data = {}
    if resp.status_code >= 400:
        code = ((data.get("error") or {}) if isinstance(data, dict) else {}).get("code")
        logger.warning("WhatsApp Cloud: perfil recusado (%s) code=%s", resp.status_code, code)
        if resp.status_code in (401, 403) or code == 190:
            raise SendError("O acesso da loja ao WhatsApp venceu ou não tem permissão. Avise o suporte.", 424)
        raise SendError("O WhatsApp recusou a alteração do perfil. Confira os campos e tente de novo.", 424)
    return data if isinstance(data, dict) else {}


async def get_profile(db: AsyncSession, tenant_id: int) -> dict:
    number = await _tenant_number(db, tenant_id)
    data = await _graph_profile(number.phone_number_id)
    item = ((data.get("data") or [{}])[0]) if isinstance(data.get("data"), list) else {}
    return {
        "about": item.get("about") or "", "address": item.get("address") or "", "description": item.get("description") or "",
        "email": item.get("email") or "", "websites": item.get("websites") or [], "vertical": item.get("vertical") or "",
        "profile_picture_url": item.get("profile_picture_url") or None,
        "limits": {**PROFILE_LIMITS, "websites": 2}, "verticals": list(PROFILE_VERTICALS),
    }


async def update_profile(db: AsyncSession, tenant_id: int, data: dict) -> dict:
    clean = validate_profile(data)          # tamanhos conferidos antes de chamar a Meta
    number = await _tenant_number(db, tenant_id)
    result = await _graph_profile(number.phone_number_id, clean)
    if result.get("success") is not True:   # a Meta responde {"success": true}; qualquer outra coisa não é "salvo"
        raise SendError("O WhatsApp não confirmou a alteração do perfil.", 424)
    return await get_profile(db, tenant_id)


async def _tenant_number(db: AsyncSession, tenant_id: int) -> WhatsAppCloudNumber:
    number = (await db.execute(
        select(WhatsAppCloudNumber).where(
            WhatsAppCloudNumber.tenant_id == tenant_id, WhatsAppCloudNumber.is_active == True,  # noqa: E712
        ).order_by(WhatsAppCloudNumber.id)
    )).scalars().first()
    if number is None:
        raise SendError("Esta loja ainda não tem um número oficial do WhatsApp ligado.", 409)
    return number
