"""Ligar o WhatsApp da loja pelo Embedded Signup da Meta (inclusive coexistência com o app do celular). Só admin."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_id, require_role
from app.core.database import get_db
from app.models.user import User, UserRole
from app.services import whatsapp_connect_service as svc

router = APIRouter(prefix="/whatsapp/connect", tags=["WhatsApp"])


class EmbeddedSignupBody(BaseModel):
    code: str = Field(..., min_length=1, max_length=2048)
    phone_number_id: str = Field(..., min_length=1, max_length=64)
    waba_id: str = Field(..., min_length=1, max_length=64)
    business_id: Optional[str] = Field(None, max_length=64)
    coexistence: bool = False


@router.post("/embedded-signup")
async def embedded_signup(
    body: EmbeddedSignupBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Troca o código da Meta, inscreve o app na conta, grava o número da loja e (coexistência) pede agenda e histórico."""
    try:
        number = await svc.connect_embedded_signup(
            db, tenant_id, code=body.code, phone_number_id=body.phone_number_id, waba_id=body.waba_id,
            business_id=body.business_id, coexistence=body.coexistence,
        )
        await db.commit()
    except svc.ConnectError as e:
        await db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception:
        await db.rollback()
        raise
    await db.refresh(number)
    return svc.number_status(number)


@router.get("/status")
async def connect_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Número(s) da loja, coexistência, estado da conexão e da cópia do histórico. Nunca devolve token."""
    return await svc.connection_status(db, tenant_id)
