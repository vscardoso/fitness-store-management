"""Caixa de conversas do WhatsApp oficial (Cloud API): listar, abrir, marcar como lida e responder."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.models.whatsapp_cloud import WhatsAppConversation, WhatsAppMessage
from app.services import whatsapp_cloud_service as svc

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])


class SendBody(BaseModel):
    text: str = Field(..., max_length=4096)


def _conv(c: WhatsAppConversation, last: Optional[WhatsAppMessage] = None, customers: Optional[dict] = None) -> dict:
    cust = (customers or {}).get(c.phone) if c.phone else None
    return {
        "id": c.id,
        "customer_id": cust[0] if cust else None,
        "name": (cust[1] if cust else None) or c.profile_name or c.phone or "Contato sem telefone",
        "phone": c.phone,
        "unread_count": c.unread_count or 0,
        "last_message_at": c.last_message_at,
        "window_open": svc.window_open(c),
        "last_text": (last.text if last else None),
        "last_direction": (last.direction if last else None),
    }


def _msg(m: WhatsAppMessage) -> dict:
    return {
        "id": m.id, "direction": m.direction, "type": m.msg_type, "text": m.text,
        "status": m.status, "sent_at": m.sent_at, "has_error": bool(m.error),
    }


@router.get("/conversations")
async def list_conversations(
    q: Optional[str] = Query(None, max_length=80),
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
    convs = (await db.execute(
        query.order_by(WhatsAppConversation.last_message_at.desc().nullslast(), WhatsAppConversation.id.desc())
        .offset(skip).limit(limit)
    )).scalars().all()
    out = []
    for c in convs:
        last = (await db.execute(
            select(WhatsAppMessage).where(WhatsAppMessage.conversation_id == c.id)
            .order_by(WhatsAppMessage.id.desc()).limit(1)
        )).scalar_one_or_none()
        out.append(_conv(c, last, customers))
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
    return {**_conv(conv, msgs[0] if msgs else None, customers), "messages": [_msg(m) for m in reversed(msgs)]}


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
