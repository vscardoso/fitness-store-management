"""Feed de catálogo para a Meta: URL pública por loja (lida pela Meta) e configuração do admin."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db, get_db_unscoped
from app.models.store import Store
from app.models.user import User
from app.services import catalog_feed_service as svc
from app.services import whatsapp_cloud_service as wa

public_router = APIRouter(prefix="/public", tags=["Catálogo Público"])
router = APIRouter(prefix="/catalog-feed", tags=["Catálogo Meta"])


@public_router.get("/catalog-feed/{token}.csv", include_in_schema=False)
async def public_feed(token: str, db: AsyncSession = Depends(get_db_unscoped)):
    store = (await db.execute(
        select(Store).where(Store.catalog_feed_token == token, Store.is_active == True)  # noqa: E712
    )).scalars().first()
    if store is None:
        raise HTTPException(status_code=404, detail="Feed não encontrado")
    feed = await svc.build_feed(db, store)
    return Response(
        content=svc.render_csv(feed.items), media_type="text/csv; charset=utf-8",
        headers={"Cache-Control": "no-cache"},   # sem cache: trocar o link ou desligar vale na hora
    )


@public_router.get("/vitrine/{slug}/produtos/{product_id}")
async def public_showcase(slug: str, product_id: int, db: AsyncSession = Depends(get_db_unscoped)):
    """Página pública do produto (link do catálogo da Meta). Só produto publicado; nada de custo, quantidade ou marca."""
    store = (await db.execute(
        select(Store).where(Store.slug == slug, Store.is_active == True)  # noqa: E712
    )).scalars().first()
    data = await svc.build_showcase(db, store, product_id) if store is not None else None
    if data is None:
        raise HTTPException(status_code=404, detail="Produto não encontrado ou não está à venda.")
    return data


async def _status(db: AsyncSession, store: Store) -> dict:
    feed = await svc.build_feed(db, store)
    return {
        "enabled": bool(store.catalog_feed_token),
        "url": svc.feed_url(store.catalog_feed_token) if store.catalog_feed_token else None,
        "published_products": feed.products,
        "items": len(feed.items),
        "skipped_no_photo": feed.skipped_no_photo,
        "skipped_no_price": feed.skipped_no_price,
        "products_no_variants": feed.products_no_variants,
        "skipped_no_name": feed.skipped_no_name,
        "brand_removed": feed.brand_removed,
        "missing_photo_products": feed.missing_photo_products,
    }


async def _store(db: AsyncSession, tenant_id: int) -> Store:
    store = await db.get(Store, tenant_id)
    if store is None:
        raise HTTPException(status_code=404, detail="Loja não encontrada")
    return store


@router.get("")
async def get_status(
    db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    return await _status(db, await _store(db, tenant_id))


@router.post("/rotate")
async def enable_or_rotate(
    db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    """Liga o feed ou gera outro link (o anterior para de funcionar)."""
    store = await _store(db, tenant_id)
    store.catalog_feed_token = svc.new_token()
    await db.commit()
    return await _status(db, store)


@router.delete("")
async def disable(
    db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    store = await _store(db, tenant_id)
    store.catalog_feed_token = None
    await db.commit()
    return await _status(db, store)


class CatalogVisibleBody(BaseModel):
    visible: bool


@router.get("/whatsapp-status")
async def whatsapp_catalog_status(
    db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    """O que a Meta diz do catálogo no número da loja: visível, carrinho e catálogos ligados à conta."""
    try:
        return await wa.catalog_status(db, tenant_id)
    except wa.SendError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/whatsapp-visible")
async def whatsapp_catalog_visible(
    body: CatalogVisibleBody,
    db: AsyncSession = Depends(get_db), tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    try:
        return await wa.set_catalog_visible(db, tenant_id, body.visible)
    except wa.SendError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
