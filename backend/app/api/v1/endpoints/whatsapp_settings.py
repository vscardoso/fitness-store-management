"""Configurações do WhatsApp da loja: perfil comercial, horário e ausência, respostas rápidas e etiquetas."""
import json
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.models.whatsapp_cloud import (
    WhatsAppConversation, WhatsAppConversationLabel, WhatsAppLabel, WhatsAppQuickReply,
)
from app.services import whatsapp_cloud_service as svc

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

AWAY_MAX_CHARS = 1000
COLOR_KEYS = ("primary", "secondary", "success", "warning", "info", "error")


def _raise(e: svc.SendError):
    raise HTTPException(status_code=e.status_code, detail=e.message)


# ── perfil comercial ─────────────────────────────────────────────────────────

class ProfileBody(BaseModel):
    about: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    email: Optional[str] = None
    websites: Optional[List[str]] = None
    vertical: Optional[str] = None


@router.get("/profile")
async def get_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Perfil que a cliente vê no WhatsApp (lido da Meta). Só leitura."""
    try:
        return await svc.get_profile(db, tenant_id)
    except svc.SendError as e:
        _raise(e)


@router.put("/profile")
async def put_profile(
    body: ProfileBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Grava o perfil na Meta (só campos preenchidos). A confirmação é feita na tela, antes de chamar."""
    try:
        return await svc.update_profile(db, tenant_id, body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except svc.SendError as e:
        _raise(e)


# ── horário comercial e ausência ─────────────────────────────────────────────

class AwayBody(BaseModel):
    enabled: bool
    text: Optional[str] = None
    hours: Optional[dict] = None


async def _number(db: AsyncSession, tenant_id: int):
    try:
        return await svc._tenant_number(db, tenant_id)
    except svc.SendError as e:
        _raise(e)


def _away(number) -> dict:
    hours = svc.parse_hours(number.business_hours)
    return {
        "enabled": bool(number.away_enabled), "text": number.away_text or "", "max_chars": AWAY_MAX_CHARS,
        "timezone": svc.HOURS_TZ,
        "hours": {d: [[f"{a // 60:02d}:{a % 60:02d}", f"{b // 60:02d}:{b % 60:02d}"] for a, b in (hours or {}).get(d, [])] for d in svc.DAYS},
        "has_hours": hours is not None,
    }


@router.get("/away")
async def get_away(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    return _away(await _number(db, tenant_id))


@router.put("/away")
async def put_away(
    body: AwayBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    text = (body.text or "").strip()
    if len(text) > AWAY_MAX_CHARS:
        raise HTTPException(status_code=400, detail=f"O texto passa de {AWAY_MAX_CHARS} letras.")
    hours = None
    if body.hours is not None:
        try:
            hours = svc.validate_hours(body.hours)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    number = await _number(db, tenant_id)
    final_hours = hours if hours is not None else svc.parse_hours(number.business_hours)
    if body.enabled:
        if not text:
            raise HTTPException(status_code=400, detail="Escreva a mensagem antes de ligar a ausência.")
        if not final_hours or not any(final_hours.get(d) for d in svc.DAYS):
            raise HTTPException(status_code=400, detail="Informe o horário em que a loja abre antes de ligar a ausência.")
    number.away_enabled = body.enabled
    number.away_text = text or None
    if hours is not None:
        number.business_hours = json.dumps(hours) if any(hours.values()) else None
    await db.commit()
    return _away(number)


# ── respostas rápidas ────────────────────────────────────────────────────────

SHORTCUT_RE = re.compile(r"^[a-z0-9_-]{1,40}$")


class QuickReplyBody(BaseModel):
    shortcut: str
    text: str


def _qr(r: WhatsAppQuickReply) -> dict:
    return {"id": r.id, "shortcut": r.shortcut, "text": r.text}


def _clean_shortcut(raw: str) -> str:
    s = (raw or "").strip().lstrip("/").lower()
    if not SHORTCUT_RE.match(s):
        raise HTTPException(status_code=400, detail="O atalho usa só letras, números, - e _ (sem espaço), até 40 caracteres.")
    return s


@router.get("/quick-replies")
async def list_quick_replies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    rows = (await db.execute(select(WhatsAppQuickReply).where(
        WhatsAppQuickReply.tenant_id == tenant_id, WhatsAppQuickReply.is_active == True,  # noqa: E712
    ).order_by(WhatsAppQuickReply.shortcut))).scalars().all()
    return [_qr(r) for r in rows]


@router.post("/quick-replies")
async def create_quick_reply(
    body: QuickReplyBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    shortcut, text = _clean_shortcut(body.shortcut), (body.text or "").strip()
    if not text or len(text) > 1000:
        raise HTTPException(status_code=400, detail="O texto precisa ter de 1 a 1000 letras.")
    existing = (await db.execute(select(WhatsAppQuickReply).where(
        WhatsAppQuickReply.tenant_id == tenant_id, WhatsAppQuickReply.shortcut == shortcut))).scalar_one_or_none()
    if existing is not None and existing.is_active:
        raise HTTPException(status_code=409, detail="Já existe uma resposta rápida com este atalho.")
    if existing is not None:      # atalho apagado antes: reaproveita a linha
        existing.is_active, existing.text = True, text
        item = existing
    else:
        item = WhatsAppQuickReply(tenant_id=tenant_id, shortcut=shortcut, text=text)
        db.add(item)
    await db.commit()
    return _qr(item)


async def _get_qr(db, tenant_id, qid) -> WhatsAppQuickReply:
    item = (await db.execute(select(WhatsAppQuickReply).where(
        WhatsAppQuickReply.id == qid, WhatsAppQuickReply.tenant_id == tenant_id, WhatsAppQuickReply.is_active == True,  # noqa: E712
    ))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Resposta rápida não encontrada.")
    return item


@router.put("/quick-replies/{qid}")
async def update_quick_reply(
    qid: int, body: QuickReplyBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    item = await _get_qr(db, tenant_id, qid)
    shortcut, text = _clean_shortcut(body.shortcut), (body.text or "").strip()
    if not text or len(text) > 1000:
        raise HTTPException(status_code=400, detail="O texto precisa ter de 1 a 1000 letras.")
    other = (await db.execute(select(WhatsAppQuickReply).where(
        WhatsAppQuickReply.tenant_id == tenant_id, WhatsAppQuickReply.shortcut == shortcut,
        WhatsAppQuickReply.id != qid))).scalar_one_or_none()
    if other is not None:
        raise HTTPException(status_code=409, detail="Já existe uma resposta rápida com este atalho.")
    item.shortcut, item.text = shortcut, text
    await db.commit()
    return _qr(item)


@router.delete("/quick-replies/{qid}")
async def delete_quick_reply(
    qid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    item = await _get_qr(db, tenant_id, qid)
    item.is_active = False
    await db.commit()
    return {"ok": True}


# ── etiquetas ────────────────────────────────────────────────────────────────

class LabelBody(BaseModel):
    name: str
    color_key: str = "primary"


def _label(l: WhatsAppLabel) -> dict:
    return {"id": l.id, "name": l.name, "color_key": l.color_key}


def _label_fields(body: LabelBody):
    name = (body.name or "").strip()
    if not name or len(name) > 40:
        raise HTTPException(status_code=400, detail="O nome da etiqueta precisa ter de 1 a 40 letras.")
    if body.color_key not in COLOR_KEYS:
        raise HTTPException(status_code=400, detail="Escolha uma das cores da lista.")
    return name, body.color_key


@router.get("/labels")
async def list_labels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    rows = (await db.execute(select(WhatsAppLabel).where(
        WhatsAppLabel.tenant_id == tenant_id, WhatsAppLabel.is_active == True,  # noqa: E712
    ).order_by(WhatsAppLabel.name))).scalars().all()
    return [_label(l) for l in rows]


@router.post("/labels")
async def create_label(
    body: LabelBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    name, color = _label_fields(body)
    existing = (await db.execute(select(WhatsAppLabel).where(
        WhatsAppLabel.tenant_id == tenant_id, WhatsAppLabel.name == name))).scalar_one_or_none()
    if existing is not None and existing.is_active:
        raise HTTPException(status_code=409, detail="Já existe uma etiqueta com este nome.")
    if existing is not None:
        existing.is_active, existing.color_key = True, color
        item = existing
    else:
        item = WhatsAppLabel(tenant_id=tenant_id, name=name, color_key=color)
        db.add(item)
    await db.commit()
    return _label(item)


async def _get_label(db, tenant_id, lid) -> WhatsAppLabel:
    item = (await db.execute(select(WhatsAppLabel).where(
        WhatsAppLabel.id == lid, WhatsAppLabel.tenant_id == tenant_id, WhatsAppLabel.is_active == True,  # noqa: E712
    ))).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Etiqueta não encontrada.")
    return item


@router.put("/labels/{lid}")
async def update_label(
    lid: int, body: LabelBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    item = await _get_label(db, tenant_id, lid)
    name, color = _label_fields(body)
    other = (await db.execute(select(WhatsAppLabel).where(
        WhatsAppLabel.tenant_id == tenant_id, WhatsAppLabel.name == name, WhatsAppLabel.id != lid))).scalar_one_or_none()
    if other is not None:
        raise HTTPException(status_code=409, detail="Já existe uma etiqueta com este nome.")
    item.name, item.color_key = name, color
    await db.commit()
    return _label(item)


@router.delete("/labels/{lid}")
async def delete_label(
    lid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    item = await _get_label(db, tenant_id, lid)
    item.is_active = False
    links = (await db.execute(select(WhatsAppConversationLabel).where(
        WhatsAppConversationLabel.label_id == lid, WhatsAppConversationLabel.is_active == True,  # noqa: E712
    ))).scalars().all()
    for l in links:
        l.is_active = False
    await db.commit()
    return {"ok": True}


class ConversationLabelsBody(BaseModel):
    label_ids: List[int]


@router.put("/conversations/{conversation_id}/labels")
async def set_conversation_labels(
    conversation_id: int, body: ConversationLabelsBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Define o conjunto de etiquetas da conversa (troca tudo numa transação)."""
    conv = (await db.execute(select(WhatsAppConversation).where(
        WhatsAppConversation.id == conversation_id, WhatsAppConversation.tenant_id == tenant_id))).scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversa não encontrada.")
    wanted = set(body.label_ids)
    valid = {l.id: l for l in (await db.execute(select(WhatsAppLabel).where(
        WhatsAppLabel.tenant_id == tenant_id, WhatsAppLabel.is_active == True,  # noqa: E712
        WhatsAppLabel.id.in_(wanted or {0})))).scalars().all()}
    if wanted - set(valid):
        raise HTTPException(status_code=400, detail="Alguma etiqueta não existe nesta loja.")
    links = (await db.execute(select(WhatsAppConversationLabel).where(
        WhatsAppConversationLabel.conversation_id == conversation_id))).scalars().all()
    by_label = {l.label_id: l for l in links}
    for lid in wanted:
        if lid in by_label:
            by_label[lid].is_active = True
        else:
            db.add(WhatsAppConversationLabel(tenant_id=tenant_id, conversation_id=conversation_id, label_id=lid))
    for lid, l in by_label.items():
        if lid not in wanted:
            l.is_active = False
    await db.commit()
    return [_label(valid[i]) for i in sorted(wanted)]
