"""Caixa de conversas do WhatsApp oficial (Cloud API): listar, abrir, marcar como lida e responder."""
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.models.whatsapp_cloud import (
    WhatsAppConversation, WhatsAppConversationLabel, WhatsAppLabel, WhatsAppMessage,
)
from app.services import whatsapp_cloud_service as svc

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])


class SendBody(BaseModel):
    text: str = Field(..., max_length=4096)


async def _labels_of(db: AsyncSession, tenant_id: int, conv_ids: list) -> dict:
    """{conversa: [{id, name, color_key}]} só com etiquetas ativas."""
    if not conv_ids:
        return {}
    rows = (await db.execute(
        select(WhatsAppConversationLabel.conversation_id, WhatsAppLabel.id, WhatsAppLabel.name, WhatsAppLabel.color_key)
        .join(WhatsAppLabel, WhatsAppLabel.id == WhatsAppConversationLabel.label_id)
        .where(
            WhatsAppConversationLabel.tenant_id == tenant_id, WhatsAppConversationLabel.is_active == True,  # noqa: E712
            WhatsAppLabel.is_active == True, WhatsAppConversationLabel.conversation_id.in_(conv_ids),  # noqa: E712
        ).order_by(WhatsAppLabel.name)
    )).all()
    out: dict = {}
    for cid, lid, name, color in rows:
        out.setdefault(cid, []).append({"id": lid, "name": name, "color_key": color})
    return out


def _conv(c: WhatsAppConversation, last: Optional[WhatsAppMessage] = None, customers: Optional[dict] = None,
          labels: Optional[list] = None) -> dict:
    cust = (customers or {}).get(c.phone) if c.phone else None
    return {
        "id": c.id,
        "customer_id": cust[0] if cust else None,
        "name": (cust[1] if cust else None) or c.profile_name or c.phone or "Contato sem telefone",
        "phone": c.phone,
        "unread_count": c.unread_count or 0,
        "last_message_at": c.last_message_at,
        "window_open": svc.window_open(c),
        "labels": labels or [],
        "last_text": (last.text if last else None),
        "last_direction": (last.direction if last else None),
    }


def _media_info(m: WhatsAppMessage) -> Optional[dict]:
    """Tem arquivo (foto, áudio, vídeo, documento, figurinha)? Só diz o tipo; o arquivo vem de /messages/{id}/media."""
    if m.msg_type not in ("image", "audio", "video", "document", "sticker") or not m.payload:
        return None
    import json
    try:
        info = (json.loads(m.payload) or {}).get(m.msg_type)
    except ValueError:
        return None
    if not isinstance(info, dict) or not info.get("id"):
        return None
    return {"kind": m.msg_type, "mime": info.get("mime_type"), "filename": info.get("filename")}


def _msg(m: WhatsAppMessage) -> dict:
    return {
        "id": m.id, "direction": m.direction, "type": m.msg_type, "text": m.text,
        "status": m.status, "sent_at": m.sent_at, "has_error": bool(m.error), "media": _media_info(m),
    }


@router.get("/conversations")
async def list_conversations(
    q: Optional[str] = Query(None, max_length=80),
    label_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    customers = await svc.customers_by_phone(db, tenant_id)
    query = select(WhatsAppConversation).where(WhatsAppConversation.tenant_id == tenant_id)
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        digits = "".join(ch for ch in term if ch.isdigit())
        by_name = [ph for ph, (_, nm) in customers.items() if nm and term.lower() in nm.lower()]
        conds = [WhatsAppConversation.profile_name.ilike(like), WhatsAppConversation.phone.in_(by_name or [""])]
        if digits:
            conds.append(WhatsAppConversation.phone.like(f"%{digits}%"))
        query = query.where(or_(*conds))
    if label_id is not None:
        query = query.where(WhatsAppConversation.id.in_(
            select(WhatsAppConversationLabel.conversation_id).where(
                WhatsAppConversationLabel.tenant_id == tenant_id, WhatsAppConversationLabel.label_id == label_id,
                WhatsAppConversationLabel.is_active == True,  # noqa: E712
            )))
    convs = (await db.execute(
        query.order_by(WhatsAppConversation.last_message_at.desc().nullslast(), WhatsAppConversation.id.desc())
        .offset(skip).limit(limit)
    )).scalars().all()
    out = []
    labels = await _labels_of(db, tenant_id, [c.id for c in convs])
    for c in convs:
        last = (await db.execute(
            select(WhatsAppMessage).where(WhatsAppMessage.conversation_id == c.id)
            .order_by(WhatsAppMessage.id.desc()).limit(1)
        )).scalar_one_or_none()
        out.append(_conv(c, last, customers, labels.get(c.id)))
    return out


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    total = (await db.execute(
        select(func.coalesce(func.sum(WhatsAppConversation.unread_count), 0))
        .where(WhatsAppConversation.tenant_id == tenant_id)
    )).scalar()
    return {"unread": int(total or 0)}


async def _get_conv(db: AsyncSession, tenant_id: int, conversation_id: int) -> WhatsAppConversation:
    conv = (await db.execute(
        select(WhatsAppConversation).where(
            WhatsAppConversation.id == conversation_id, WhatsAppConversation.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversa não encontrada.")
    return conv


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: int, limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    conv = await _get_conv(db, tenant_id, conversation_id)
    msgs = (await db.execute(
        select(WhatsAppMessage).where(WhatsAppMessage.conversation_id == conv.id)
        .order_by(WhatsAppMessage.id.desc()).limit(limit)
    )).scalars().all()
    customers = await svc.customers_by_phone(db, tenant_id)
    labels = await _labels_of(db, tenant_id, [conv.id])
    return {**_conv(conv, msgs[0] if msgs else None, customers, labels.get(conv.id)), "messages": [_msg(m) for m in reversed(msgs)]}


@router.post("/conversations/{conversation_id}/read")
async def mark_read(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    conv = await _get_conv(db, tenant_id, conversation_id)
    had_unread = (conv.unread_count or 0) > 0
    conv.unread_count = 0
    await db.commit()
    if had_unread:
        await svc.mark_read_on_meta(db, tenant_id, conv)
    return {"ok": True}


@router.post("/conversations/{conversation_id}/send")
async def send_message(
    conversation_id: int, body: SendBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        msg = await svc.send_text(db, tenant_id, conversation_id, body.text)
        await db.commit()
    except svc.SendError as e:
        await db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    return _msg(msg)


@router.get("/invite")
async def invite(
    text: Optional[str] = Query(None, max_length=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Link e número para convidar a cliente a escrever para o WhatsApp da loja."""
    try:
        data = await svc.invite_link(db, tenant_id, text)
        await db.commit()
    except svc.SendError as e:
        await db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    return data


class StartBody(BaseModel):
    customer_id: int


@router.post("/conversations/start")
async def start_conversation(
    body: StartBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Abre a conversa da cliente (pelo telefone do cadastro). Não envia nada."""
    try:
        conv = await svc.start_conversation(db, tenant_id, body.customer_id)
        await db.commit()
    except svc.SendError as e:
        await db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    customers = await svc.customers_by_phone(db, tenant_id)
    return _conv(conv, None, customers)


@router.get("/by-customer/{customer_id}")
async def conversation_of_customer(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Conversa já existente da cliente no número da loja (ou `null`)."""
    from app.models.customer import Customer

    row = (await db.execute(
        select(Customer.phone, Customer.full_name).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
    )).first()
    phone, cname = (row[0], row[1]) if row else (None, None)
    key = svc.customer_phone_key(phone)
    if not key:
        return None
    conv = (await db.execute(
        select(WhatsAppConversation).where(WhatsAppConversation.tenant_id == tenant_id, WhatsAppConversation.phone == key)
        .order_by(WhatsAppConversation.id).limit(1)
    )).scalar_one_or_none()
    return _conv(conv, None, {key: (customer_id, cname)}) if conv else None


@router.get("/costs")
async def costs(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Mensagens enviadas que a Meta cobrou ou não (pelo campo `pricing` dos status). Só contagens."""
    return await svc.costs_summary(db, tenant_id, days)


@router.post("/conversations/{conversation_id}/send-media")
async def send_media(
    conversation_id: int,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Envia foto (JPG/PNG) ou PDF dentro da janela de 24 h."""
    raw = await file.read(svc.MEDIA_MAX_BYTES + 1)
    try:
        msg = await svc.send_media(db, tenant_id, conversation_id, data=raw, filename=file.filename or "", caption=caption)
        await db.commit()
    except svc.SendError as e:
        await db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    return _msg(msg)


@router.get("/messages/{message_id}/media")
async def message_media(
    message_id: int,
    thumb: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Arquivo de uma mensagem (da cliente ou da loja), buscado na Meta na hora."""
    try:
        content, mime, name = await svc.fetch_media(db, tenant_id, message_id, thumb=thumb)
    except svc.SendError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    viewable = mime.startswith(svc.ALLOWED_VIEW) and mime != "image/svg+xml"
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": ("inline" if viewable else "attachment") + (f'; filename="{name}"' if name else ""),
    }
    return Response(content=content, media_type=mime if viewable else "application/octet-stream", headers=headers)


# ── saudação automática (configuração da loja; só admin) ─────────────────────

class GreetingBody(BaseModel):
    enabled: bool
    text: Optional[str] = None


async def _store_number(db: AsyncSession, tenant_id: int):
    from app.models.whatsapp_cloud import WhatsAppCloudNumber

    number = (await db.execute(
        select(WhatsAppCloudNumber).where(
            WhatsAppCloudNumber.tenant_id == tenant_id, WhatsAppCloudNumber.is_active == True,  # noqa: E712
        ).order_by(WhatsAppCloudNumber.id)
    )).scalars().first()
    if number is None:
        raise HTTPException(status_code=409, detail="Esta loja ainda não tem um número oficial do WhatsApp ligado.")
    return number


def _greeting(number) -> dict:
    return {"enabled": bool(number.greeting_enabled), "text": number.greeting_text or "", "max_chars": svc.GREETING_MAX_CHARS}


@router.get("/greeting")
async def get_greeting(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    return _greeting(await _store_number(db, tenant_id))


@router.put("/greeting")
async def set_greeting(
    body: GreetingBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    text = (body.text or "").strip()
    if len(text) > svc.GREETING_MAX_CHARS:
        raise HTTPException(status_code=400, detail=f"O texto passa de {svc.GREETING_MAX_CHARS} letras.")
    if body.enabled and not text:
        raise HTTPException(status_code=400, detail="Escreva a mensagem antes de ligar a saudação.")
    number = await _store_number(db, tenant_id)
    number.greeting_enabled = body.enabled
    number.greeting_text = text or None
    await db.commit()
    return _greeting(number)
