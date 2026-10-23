"""Endpoints de branding e configuração da loja."""
import io
from pydantic import BaseModel, Field
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request
from starlette.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError

from app.core.database import get_db, get_db_unscoped
from app.core.config import settings
from app.api.deps import get_current_tenant_id, require_role
from app.models.user import User, UserRole
from app.models.store import Store
from app.schemas.store_branding import StoreBrandingResponse, StoreBrandingUpdate, LogoUploadResponse, StorePIXKeyUpdate, StorePIXKeyResponse

router = APIRouter(prefix="/store", tags=["Loja"])

LOGO_MAX_SIDE = 512  # px; o logo aparece em ~40-120 px, o original de vários MB atrasava a tela
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_LOGO_SIZE = 5 * 1024 * 1024  # 5 MB
DEFAULT_PRIMARY_COLOR = "#667eea"
DEFAULT_SECONDARY_COLOR = "#764ba2"
DEFAULT_ACCENT_COLOR = "#10B981"

def _optimize_logo(contents: bytes) -> bytes:
    """Reduz o logo para no máximo LOGO_MAX_SIDE px e grava em WebP (mantém transparência)."""
    try:
        with Image.open(io.BytesIO(contents)) as img:
            img = ImageOps.exif_transpose(img)
            img.thumbnail((LOGO_MAX_SIDE, LOGO_MAX_SIDE), Image.LANCZOS)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "transparency" in img.info or img.mode in ("LA", "PA") else "RGB")
            out = io.BytesIO()
            img.save(out, format="WEBP", quality=85, method=4)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(status_code=400, detail="Imagem inválida ou corrompida.")



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
    db: AsyncSession = Depends(get_db_unscoped),
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

    store = await _get_store(tenant_id, db)
    optimized = await run_in_threadpool(_optimize_logo, contents)

    # Salvar em uploads/logos/<tenant_id>/
    rel_path = f"logos/{tenant_id}/{uuid.uuid4().hex}.webp"
    abs_path = Path(settings.UPLOAD_DIR) / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(optimized)

    old_path = store.logo_path
    store.logo_path = rel_path
    try:
        await db.commit()
    except Exception:
        # Tudo-ou-nada: sem commit não sobra arquivo novo e o logo antigo continua valendo.
        await db.rollback()
        abs_path.unlink(missing_ok=True)
        raise

    if old_path:
        (Path(settings.UPLOAD_DIR) / old_path).unlink(missing_ok=True)

    return LogoUploadResponse(logo_url=f"/uploads/{rel_path}")


class ReturnSettings(BaseModel):
    return_window_days: int = Field(7, ge=0, le=90, description="Prazo, em dias, para devolver ou trocar uma compra")
    allow_money_refund: bool = Field(True, description="False: a loja só troca peça, não devolve dinheiro")


@router.get("/return-settings", response_model=ReturnSettings)
async def get_return_settings(
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role([UserRole.ADMIN])),
):
    store = await _get_store(tenant_id, db)
    return ReturnSettings(return_window_days=store.return_window_days, allow_money_refund=store.allow_money_refund)


@router.put("/return-settings", response_model=ReturnSettings)
async def update_return_settings(
    data: ReturnSettings,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role([UserRole.ADMIN])),
):
    store = await _get_store(tenant_id, db)
    store.return_window_days = data.return_window_days
    store.allow_money_refund = data.allow_money_refund
    await db.commit()
    return ReturnSettings(return_window_days=store.return_window_days, allow_money_refund=store.allow_money_refund)


@router.get("/pix", response_model=StorePIXKeyResponse)
async def get_pix_key(
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role([UserRole.ADMIN])),
):
    """Retorna a chave PIX configurada para a loja. Apenas ADMIN."""
    store = await _get_store(tenant_id, db)
    return StorePIXKeyResponse(
        pix_key=store.pix_key,
        pix_key_type=store.pix_key_type,
        has_pix_key=bool(store.pix_key),
        pix_provider=store.pix_provider,
    )


@router.put("/pix", response_model=StorePIXKeyResponse)
async def update_pix_key(
    data: StorePIXKeyUpdate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role([UserRole.ADMIN])),
):
    """Configura a chave PIX da loja para geração de QR Codes. Apenas ADMIN."""
    store = await _get_store(tenant_id, db)

    if data.pix_key is not None:
        store.pix_key = data.pix_key.strip() or None
    if data.pix_key_type is not None:
        store.pix_key_type = data.pix_key_type

    # Provider: usa o enviado pelo cliente se válido, senão auto-detecta
    VALID_PROVIDERS = {"generic", "cielo_pix", "mercadopago", "mock"}
    if data.pix_provider and data.pix_provider in VALID_PROVIDERS:
        store.pix_provider = data.pix_provider
        # Se removeu a chave, volta para mock independente do provider solicitado
        if not store.pix_key:
            store.pix_provider = "mock"
    else:
        # Comportamento legado: generic quando há chave, mock quando não há
        if store.pix_key:
            store.pix_provider = store.pix_provider if store.pix_provider in ("cielo_pix", "mercadopago") else "generic"
        else:
            store.pix_provider = "mock"

    await db.commit()
    await db.refresh(store)

    return StorePIXKeyResponse(
        pix_key=store.pix_key,
        pix_key_type=store.pix_key_type,
        has_pix_key=bool(store.pix_key),
        pix_provider=store.pix_provider,
    )
