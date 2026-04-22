"""
Endpoints de galeria de mídia de produtos.

Rotas:
  GET    /products/{product_id}/media              — lista todas as mídias do produto
  POST   /products/{product_id}/media/upload       — upload FormData (foto produto)
  POST   /products/{product_id}/media/upload/base64 — upload base64 (foto produto)
  PATCH  /products/{product_id}/media/{media_id}/cover — define como capa
  DELETE /products/{product_id}/media/{media_id}   — deleta mídia
  PUT    /products/{product_id}/media/reorder       — reordena fotos
"""
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_tenant_id, require_role
from app.models.user import User, UserRole
from app.schemas.product_media import ProductMediaResponse, ProductMediaReorderItem
from app.services.product_media_service import ProductMediaService

router = APIRouter(prefix="/products", tags=["Galeria de Produtos"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg", "image/gif"}
CONVERTIBLE_TYPES = {"image/heic", "image/heif", "image/tiff", "image/bmp"}
EXT_MAP = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "png": "image/png", "webp": "image/webp",
    "gif": "image/gif",
    "heic": "image/heic", "heif": "image/heif",
    "tiff": "image/tiff", "tif": "image/tiff", "bmp": "image/bmp",
}


def _resolve_content_type(file: UploadFile) -> str:
    ct = file.content_type or "application/octet-stream"
    if ct not in (ALLOWED_TYPES | CONVERTIBLE_TYPES):
        filename = file.filename or ""
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        inferred = EXT_MAP.get(ext)
        if not inferred:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tipo não suportado: {file.content_type}. Use JPG, PNG, WebP, GIF ou HEIC.",
            )
        return inferred
    return ct


@router.get(
    "/{product_id}/media",
    response_model=List[ProductMediaResponse],
    summary="Listar galeria do produto",
)
async def list_product_media(
    product_id: int,
    variant_id: Optional[int] = Query(None, description="Filtrar por variação (null = só produto)"),
    scope: Optional[str] = Query(None, description="'product' para só produto-nível, 'variant' para só variações"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    svc = ProductMediaService(db)
    try:
        variant_id_filter = scope in ("product", "variant") or variant_id is not None
        resolved_variant_id = None if scope == "product" else variant_id
        return await svc.list_product_media(
            product_id, tenant_id,
            variant_id=resolved_variant_id,
            variant_id_filter=variant_id_filter,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/{product_id}/media/upload",
    response_model=ProductMediaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload de foto para galeria do produto",
)
async def upload_product_media(
    product_id: int,
    file: UploadFile = File(...),
    variant_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    from app.services.storage_service import get_storage_service
    from app.api.v1.endpoints.ai import _convert_to_jpeg

    content_type = _resolve_content_type(file)
    file_bytes = await file.read()

    # Converte HEIC/TIFF/BMP → JPEG
    if content_type in CONVERTIBLE_TYPES:
        file_bytes = _convert_to_jpeg(file_bytes)
        content_type = "image/jpeg"

    media_type = "gif" if content_type == "image/gif" else "photo"
    ext = "gif" if media_type == "gif" else "jpg"
    if content_type == "image/png":
        ext = "png"
    elif content_type == "image/webp":
        ext = "webp"

    scope = f"variant_{variant_id}" if variant_id else f"product_{product_id}"
    filename = f"{scope}_media"

    storage = get_storage_service()
    file_path = await storage.upload_from_bytes(
        file_bytes, folder="product_media", filename=filename, ext=f".{ext}"
    )
    url = storage.get_url(file_path)

    svc = ProductMediaService(db)
    try:
        return await svc.add_media(product_id, tenant_id, url, media_type, variant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/{product_id}/media/upload/base64",
    response_model=ProductMediaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload base64 para galeria do produto",
)
async def upload_product_media_base64(
    product_id: int,
    image_data: str = Body(..., embed=True),
    variant_id: Optional[int] = Body(None, embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    import base64
    import re
    from app.services.storage_service import get_storage_service

    # Strip data URI prefix
    match = re.match(r"data:(?P<mime>[^;]+);base64,(?P<data>.+)", image_data, re.DOTALL)
    if match:
        mime = match.group("mime")
        raw = base64.b64decode(match.group("data"))
    else:
        mime = "image/jpeg"
        raw = base64.b64decode(image_data)

    ext = "gif" if mime == "image/gif" else "jpg"
    media_type = "gif" if mime == "image/gif" else "photo"

    scope = f"variant_{variant_id}" if variant_id else f"product_{product_id}"
    filename = f"{scope}_media"

    storage = get_storage_service()
    file_path = await storage.upload_from_bytes(raw, folder="product_media", filename=filename, ext=f".{ext}")
    url = storage.get_url(file_path)

    svc = ProductMediaService(db)
    try:
        return await svc.add_media(product_id, tenant_id, url, media_type, variant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch(
    "/{product_id}/media/{media_id}/cover",
    response_model=ProductMediaResponse,
    summary="Definir foto como capa",
)
async def set_media_as_cover(
    product_id: int,
    media_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    svc = ProductMediaService(db)
    try:
        return await svc.set_cover(product_id, media_id, tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete(
    "/{product_id}/media/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deletar foto da galeria",
)
async def delete_product_media(
    product_id: int,
    media_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    svc = ProductMediaService(db)
    try:
        await svc.delete_media(product_id, media_id, tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put(
    "/{product_id}/media/reorder",
    response_model=List[ProductMediaResponse],
    summary="Reordenar fotos da galeria",
)
async def reorder_product_media(
    product_id: int,
    items: List[ProductMediaReorderItem],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    svc = ProductMediaService(db)
    try:
        return await svc.reorder(
            product_id, tenant_id,
            [{"id": i.id, "position": i.position} for i in items],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
