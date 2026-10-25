"""Termos de Uso e Política de Privacidade: versão atual, situação do usuário e aceite."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user
from app.core.database import get_db
from app.core.legal import LEGAL_VERSION
from app.models.user import User
from app.services.legal_service import LegalVersionMismatch, accepted_current, client_ip, record_acceptance

router = APIRouter(prefix="/legal", tags=["Termos e privacidade"])


class LegalCurrent(BaseModel):
    version: str
    terms_path: str = "/termos"
    privacy_path: str = "/privacidade"


class LegalStatus(BaseModel):
    version: str
    accepted: bool


class LegalAcceptIn(BaseModel):
    version: str


@router.get("/current", response_model=LegalCurrent)
async def current():
    """Versão vigente (pública: o cadastro mostra e envia esta versão)."""
    return LegalCurrent(version=LEGAL_VERSION)


@router.get("/status", response_model=LegalStatus)
async def legal_status(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    return LegalStatus(version=LEGAL_VERSION, accepted=await accepted_current(db, user.id) is not None)


@router.post("/accept", response_model=LegalStatus)
async def accept(
    body: LegalAcceptIn, request: Request,
    user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db),
):
    try:
        await record_acceptance(
            db, user_id=user.id, tenant_id=user.tenant_id, version=body.version, channel="login",
            ip=client_ip(request.headers, request.client.host if request.client else None),
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
    except LegalVersionMismatch as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return LegalStatus(version=LEGAL_VERSION, accepted=True)
