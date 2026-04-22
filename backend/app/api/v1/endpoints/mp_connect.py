"""
MP Connect OAuth — conecta conta Mercado Pago do lojista.

Fluxo:
  GET /mp-connect/url          -> retorna URL de autorização MP
  GET /mp-connect/callback     -> recebe code, troca por token, salva no Store
  DELETE /mp-connect/disconnect -> desconecta (limpa tokens)
  GET /mp-connect/status        -> status da conexão do tenant
"""
import logging
from typing import Optional
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import get_db
from app.api.deps import get_current_user, get_current_tenant_id  # noqa
from app.models.store import Store
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mp-connect", tags=["MP Connect OAuth"])

MP_AUTH_URL = "https://auth.mercadopago.com/authorization"
MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token"


# ── URL de autorização ────────────────────────────────────────────────────────

@router.get("/url")
async def get_oauth_url(
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Retorna a URL de autorização OAuth do Mercado Pago para o lojista."""
    if not settings.MP_CLIENT_ID:
        return {"error": "MP_CLIENT_ID não configurado no servidor."}

    redirect_uri = f"{settings.APP_URL}/api/v1/mp-connect/callback"
    url = (
        f"{MP_AUTH_URL}"
        f"?client_id={settings.MP_CLIENT_ID}"
        f"&response_type=code"
        f"&platform_id=mp"
        f"&redirect_uri={redirect_uri}"
        f"&state={tenant_id}"
    )
    return {"url": url}


# ── Callback OAuth (chamado pelo MP — sem auth JWT) ───────────────────────────

@router.get("/callback")
async def oauth_callback(
    code: str = Query(..., description="Código de autorização retornado pelo MP"),
    state: str = Query(..., description="tenant_id passado no state"),
    db: AsyncSession = Depends(get_db),
):
    """
    Recebe o code do MP, troca por access_token e salva no Store.
    Este endpoint é chamado diretamente pelo Mercado Pago — sem autenticação JWT.
    """
    try:
        tenant_id = int(state)
    except (ValueError, TypeError):
        logger.error("MP OAuth callback: state inválido: %s", state)
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/settings/pix?error=invalid_state"
        )

    redirect_uri = f"{settings.APP_URL}/api/v1/mp-connect/callback"

    payload = {
        "client_id": settings.MP_CLIENT_ID,
        "client_secret": settings.MP_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                MP_TOKEN_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
    except httpx.RequestError as exc:
        logger.error("MP OAuth: erro de rede ao trocar code: %s", exc)
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/settings/pix?error=network_error"
        )

    if resp.status_code not in (200, 201):
        logger.error("MP OAuth: falha ao trocar code (%s): %s", resp.status_code, resp.text)
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/settings/pix?error=token_exchange_failed"
        )

    data = resp.json()
    access_token: str = data.get("access_token", "")
    refresh_token: Optional[str] = data.get("refresh_token")
    mp_user_id: Optional[str] = str(data.get("user_id", "")) or None
    expires_in: Optional[int] = data.get("expires_in")  # segundos

    expires_at: Optional[datetime] = None
    if expires_in:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    # Salva tokens no Store do tenant
    await db.execute(
        update(Store)
        .where(Store.id == tenant_id)
        .values(
            mp_access_token=access_token,
            mp_refresh_token=refresh_token,
            mp_user_id=mp_user_id,
            mp_token_expires_at=expires_at,
            pix_provider="mercadopago",
        )
    )
    await db.commit()

    logger.info("MP OAuth: tenant %s conectado (mp_user_id=%s)", tenant_id, mp_user_id)

    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/settings/pix?connected=true"
    )


# ── Desconectar ───────────────────────────────────────────────────────────────

@router.delete("/disconnect")
async def disconnect(
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove tokens MP do Store e volta ao provider mock."""
    await db.execute(
        update(Store)
        .where(Store.id == tenant_id)
        .values(
            mp_access_token=None,
            mp_refresh_token=None,
            mp_token_expires_at=None,
            pix_provider="mock",
        )
    )
    await db.commit()
    logger.info("MP OAuth: tenant %s desconectado", tenant_id)
    return {"disconnected": True, "provider": "mock"}


# ── Status da conexão ─────────────────────────────────────────────────────────

@router.get("/status")
async def connection_status(
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    """Retorna o status atual da conexão MP OAuth para o tenant."""
    result = await db.execute(select(Store).where(Store.id == tenant_id))
    store = result.scalar_one_or_none()

    if not store:
        return {
            "connected": False,
            "mp_user_id": None,
            "provider": "mock",
            "expires_at": None,
        }

    connected = bool(store.mp_access_token)
    expires_at_str: Optional[str] = None
    if store.mp_token_expires_at:
        expires_at_str = store.mp_token_expires_at.isoformat()

    return {
        "connected": connected,
        "mp_user_id": store.mp_user_id,
        "provider": store.pix_provider,
        "expires_at": expires_at_str,
    }
