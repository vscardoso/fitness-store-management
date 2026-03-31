"""Endpoints de branding e configuração da loja."""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError

from app.core.database import get_db
from app.core.config import settings
from app.api.deps import get_current_tenant_id, require_role
from app.models.user import User, UserRole
from app.models.store import Store
from app.schemas.store_branding import StoreBrandingResponse, StoreBrandingUpdate, LogoUploadResponse

router = APIRouter(prefix="/store", tags=["Loja"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_LOGO_SIZE = 5 * 1024 * 1024  # 5 MB
DEFAULT_PRIMARY_COLOR = "#667eea"
DEFAULT_SECONDARY_COLOR = "#764ba2"
DEFAULT_ACCENT_COLOR = "#10B981"


async def _get_store(tenant_id: int, db: AsyncSession) -> Store:
    result = await db.execute(
        select(Store).where(Store.id == tenant_id, Store.is_active == True)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")
    return store


async def _resolve_public_tenant_id(request: Request, db: AsyncSession) -> int | None:
    """Resolve tenant para rotas públicas (sem exigir autenticação)."""
    # Se houver JWT válido, prioriza tenant do usuário autenticado.
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            try:
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
                token_tenant_id = payload.get("tenant_id")
                if token_tenant_id is not None:
                    return int(token_tenant_id)
            except (JWTError, ValueError, TypeError):
                # Ignora token inválido e segue com resolução pública.
                pass

    state_tenant_id = getattr(request.state, "tenant_id", None)
    if state_tenant_id:
        return int(state_tenant_id)

    tenant_id_hdr = request.headers.get("X-Tenant-Id")
    if tenant_id_hdr and tenant_id_hdr.isdigit():
        return int(tenant_id_hdr)

    slug = request.headers.get("X-Store-Slug")
    if slug:
        result = await db.execute(select(Store.id).where(Store.slug == slug, Store.is_active == True))
        tid = result.scalar_one_or_none()
        if tid:
            return int(tid)

    host = request.headers.get("host") or request.headers.get("Host")
    if host:
        domain = host.split(":")[0]
        result = await db.execute(select(Store.id).where(Store.domain == domain, Store.is_active == True))
        tid = result.scalar_one_or_none()
        if tid:
            return int(tid)

    result = await db.execute(select(Store.id).where(Store.is_default == True, Store.is_active == True))
    tid = result.scalar_one_or_none()
    if tid:
        return int(tid)

    # Fallback: primeira loja ativa, quando não há default configurada.
    result = await db.execute(
        select(Store.id)
        .where(Store.is_active == True)
        .order_by(Store.created_at.asc())
        .limit(1)
    )
    tid = result.scalar_one_or_none()
    if tid:
        return int(tid)

    return None


def _logo_url(logo_path: str | None, request_base: str = "") -> str | None:
    if not logo_path:
        return None
    return f"/uploads/{logo_path}"


def _to_branding_response(store: Store) -> StoreBrandingResponse:
    """Normaliza valores nulos legados para manter resposta sempre válida."""
    return StoreBrandingResponse(
        name=store.name,
        tagline=store.tagline,
        primary_color=store.primary_color or DEFAULT_PRIMARY_COLOR,
        secondary_color=store.secondary_color or DEFAULT_SECONDARY_COLOR,
        accent_color=store.accent_color or DEFAULT_ACCENT_COLOR,
        logo_url=_logo_url(store.logo_path),
    )


@router.get("/branding", response_model=StoreBrandingResponse)
async def get_branding(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Retorna branding da loja (acesso público, somente leitura)."""
    tenant_id = await _resolve_public_tenant_id(request, db)
    if tenant_id is None:
        return StoreBrandingResponse(
            name="Fitness Store",
            tagline="Gestão de produtos fitness",
            primary_color=DEFAULT_PRIMARY_COLOR,
            secondary_color=DEFAULT_SECONDARY_COLOR,
            accent_color=DEFAULT_ACCENT_COLOR,
            logo_url=None,
        )

    store = await _get_store(tenant_id, db)
    return _to_branding_response(store)


@router.put("/branding", response_model=StoreBrandingResponse)
async def update_branding(
    data: StoreBrandingUpdate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    """Atualiza as configurações de branding da loja. Apenas ADMIN."""
    store = await _get_store(tenant_id, db)

    if data.name is not None:
        store.name = data.name
    if data.tagline is not None:
        store.tagline = data.tagline
    if data.primary_color is not None:
        store.primary_color = data.primary_color
    if data.secondary_color is not None:
        store.secondary_color = data.secondary_color
    if data.accent_color is not None:
        store.accent_color = data.accent_color

    await db.commit()
    await db.refresh(store)

    return _to_branding_response(store)


@router.post("/logo", response_model=LogoUploadResponse, status_code=status.HTTP_200_OK)
async def upload_logo(
    file: UploadFile = File(...),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role([UserRole.ADMIN])),
):
    """Faz upload do logo da loja. Apenas ADMIN. Máx 5MB (JPEG/PNG/WebP)."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de arquivo não suportado. Use: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )

    contents = await file.read()
    if len(contents) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="Arquivo muito grande. Máximo 5MB.")

    # Salvar em uploads/logos/<tenant_id>/
    ext = Path(file.filename or "logo.png").suffix or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    rel_path = f"logos/{tenant_id}/{filename}"
    abs_path = Path(settings.UPLOAD_DIR) / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)

    with open(abs_path, "wb") as f:
        f.write(contents)

    # Remover logo antigo
    store = await _get_store(tenant_id, db)
    if store.logo_path:
        old = Path(settings.UPLOAD_DIR) / store.logo_path
        if old.exists():
            old.unlink()

    store.logo_path = rel_path
    await db.commit()

    return LogoUploadResponse(logo_url=f"/uploads/{rel_path}")
