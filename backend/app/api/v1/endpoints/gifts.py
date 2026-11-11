"""Brindes: peça que sai do estoque sem cobrança. Só administrador (regra do dono, 09/11/2026); veja `gift_service.py`."""
from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.services.gift_service import GiftConflict, GiftError, GiftNotFound, GiftService

router = APIRouter(prefix="/gifts", tags=["Brindes"])


def _http(e: GiftError) -> HTTPException:
    code = 404 if isinstance(e, GiftNotFound) else 409 if isinstance(e, GiftConflict) else 400
    return HTTPException(status_code=code, detail=str(e))


@router.post("/", status_code=201, summary="Dar um brinde (tudo ou nada)")
async def create_gift(data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                      tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await GiftService(db).create(tenant_id, current_user, data)
    except GiftError as e:
        raise _http(e)


@router.get("/", summary="Brindes dados (com custo)")
async def list_gifts(start_date: Optional[date] = Query(None), end_date: Optional[date] = Query(None),
                     limit: int = Query(50, ge=1, le=200), skip: int = Query(0, ge=0),
                     db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                     current_user: User = Depends(get_current_active_user)):
    return await GiftService(db).list(tenant_id, start=start_date, end=end_date, limit=limit, skip=skip)


@router.get("/{gift_id}", summary="Detalhe de um brinde")
async def get_gift(gift_id: int, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                   current_user: User = Depends(get_current_active_user)):
    try:
        return await GiftService(db).get(tenant_id, gift_id)
    except GiftError as e:
        raise _http(e)


@router.post("/{gift_id}/cancel", summary="Cancelar um brinde lançado por engano (mesmo mês)")
async def cancel_gift(gift_id: int, data: Dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db),
                      tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    try:
        return await GiftService(db).cancel(tenant_id, current_user, gift_id, data.get("reason") or "")
    except GiftError as e:
        raise _http(e)


@router.get("/{gift_id}/receipt", summary="Comprovante do brinde para a pessoa validar (texto e link do WhatsApp)")
async def gift_receipt(gift_id: int, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                       current_user: User = Depends(get_current_active_user)):
    from app.services import gift_receipt_service as gr
    from app.services.sale_receipt_service import store_whatsapp_info
    try:
        gift = await GiftService(db).get(tenant_id, gift_id)
    except GiftError as e:
        raise _http(e)
    data = await gr.build_gift_receipt_data(db, tenant_id, gift)
    return {"receipt": data, "text": gr.build_gift_receipt_text(data), "whatsapp_url": gr.gift_whatsapp_link(data),
            "store_whatsapp": await store_whatsapp_info(db, tenant_id)}


@router.get("/{gift_id}/receipt/pdf", summary="Comprovante do brinde em PDF (58 mm, 80 mm ou A6)")
async def gift_receipt_pdf(gift_id: int, size: str = Query("a6", pattern="^(58|80|a6)$"), link: bool = Query(False),
                           db: AsyncSession = Depends(get_db),
                           tenant_id: int = Depends(get_current_tenant_id), current_user: User = Depends(get_current_active_user)):
    from app.services import gift_receipt_service as gr
    from app.services.pdf_delivery import pdf_response
    try:
        gift = await GiftService(db).get(tenant_id, gift_id)
    except GiftError as e:
        raise _http(e)
    pdf = gr.build_gift_receipt_pdf(await gr.build_gift_receipt_data(db, tenant_id, gift), size)
    return pdf_response(pdf, f"brinde-{gift['gift_number']}.pdf", link=link, tenant_id=tenant_id)


@router.post("/{gift_id}/receipt/send-whatsapp", summary="Manda o comprovante do brinde pelo WhatsApp OFICIAL da loja")
async def gift_receipt_send(gift_id: int, db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
                            current_user: User = Depends(get_current_active_user)):
    from app.services import gift_receipt_service as gr
    from app.services.whatsapp_cloud_service import SendError
    try:
        gift = await GiftService(db).get(tenant_id, gift_id)
    except GiftError as e:
        raise _http(e)
    data = await gr.build_gift_receipt_data(db, tenant_id, gift)
    try:
        return await gr.send_gift_via_store_whatsapp(db, tenant_id, gift, data, current_user)
    except SendError as e:
        await db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
