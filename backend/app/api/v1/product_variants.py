"""
Endpoints de API para variantes de produto.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_tenant_id
from app.models.user import User
from app.services.product_variant_service import ProductVariantService
from app.schemas.product_variant import (
    ProductVariantCreate,
    ProductVariantUpdate,
    ProductVariantResponse,
    ProductVariantWithProductResponse,
    ProductVariantMinimal,
    ProductWithVariantsCreate,
    ProductWithVariantsResponse,
    BulkVariantCreate,
    BulkVariantResponse,
    VariantGridResponse,
    VariantGridItem,
)

router = APIRouter(prefix="/product-variants", tags=["Product Variants"])


@router.post(
    "/",
    response_model=ProductVariantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar variante",
    description="Cria uma nova variante para um produto existente."
)
async def create_variant(
    product_id: int,
    variant_data: ProductVariantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Cria uma nova variante de produto."""
    service = ProductVariantService(db)
    try:
        variant = await service.create_variant(product_id, variant_data, tenant_id)
        return ProductVariantResponse(
            **variant.__dict__,
            current_stock=variant.get_current_stock(),
            variant_label=variant.get_variant_label(),
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/with-product",
    response_model=ProductWithVariantsResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar produto com variantes",
    description="Cria um produto com múltiplas variantes de uma vez."
)
async def create_product_with_variants(
    data: ProductWithVariantsCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Cria um produto com variantes."""
    service = ProductVariantService(db)
    try:
        product = await service.create_product_with_variants(
            data, tenant_id, current_user.id
        )
        
        # Buscar variantes
        variants = await service.get_product_variants(product.id, tenant_id)
        
        return ProductWithVariantsResponse(
            **product.__dict__,
            variant_count=len(variants),
            total_stock=product.get_current_stock(),
            price_range=product.get_price_range(),
            variants=[
                ProductVariantResponse(
                    **v.__dict__,
                    current_stock=v.get_current_stock(),
                    variant_label=v.get_variant_label(),
                )
                for v in variants
            ],
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/bulk",
    response_model=BulkVariantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar variantes em massa",
    description="Cria múltiplas variantes a partir de listas de tamanhos e cores."
)
async def create_bulk_variants(
    data: BulkVariantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Cria variantes em massa (grade de tamanhos × cores)."""
    service = ProductVariantService(db)
    try:
        variants = await service.create_bulk_variants(data, tenant_id)
        return BulkVariantResponse(
            product_id=data.product_id,
            variants_created=len(variants),
            variants=[
                ProductVariantResponse(
                    **v.__dict__,
                    current_stock=v.get_current_stock(),
                    variant_label=v.get_variant_label(),
                )
                for v in variants
            ],
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/{variant_id}",
    response_model=ProductVariantWithProductResponse,
    summary="Buscar variante por ID",
)
async def get_variant(
    variant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Busca uma variante por ID."""
    service = ProductVariantService(db)
    variant = await service.get_variant(variant_id, tenant_id)
    
    if not variant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variante não encontrada"
        )
    
    return ProductVariantWithProductResponse(
        **variant.__dict__,
        current_stock=variant.get_current_stock(),
        variant_label=variant.get_variant_label(),
        product_name=variant.product.name if variant.product else None,
        product_brand=variant.product.brand if variant.product else None,
        product_image_url=variant.product.image_url if variant.product else None,
        category_id=variant.product.category_id if variant.product else None,
        category_name=variant.product.category.name if variant.product and variant.product.category else None,
    )


@router.get(
    "/sku/{sku}",
    response_model=ProductVariantWithProductResponse,
    summary="Buscar variante por SKU",
)
async def get_variant_by_sku(
    sku: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Busca uma variante por SKU."""
    service = ProductVariantService(db)
    variant = await service.get_variant_by_sku(sku, tenant_id)
    
    if not variant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variante não encontrada"
        )
    
    return ProductVariantWithProductResponse(
        **variant.__dict__,
        current_stock=variant.get_current_stock(),
        variant_label=variant.get_variant_label(),
        product_name=variant.product.name if variant.product else None,
        product_brand=variant.product.brand if variant.product else None,
        product_image_url=variant.product.image_url if variant.product else None,
        category_id=variant.product.category_id if variant.product else None,
        category_name=variant.product.category.name if variant.product and variant.product.category else None,
    )


@router.get(
    "/product/{product_id}",
    response_model=List[ProductVariantResponse],
    summary="Listar variantes de um produto",
)
async def list_product_variants(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Lista todas as variantes de um produto."""
    service = ProductVariantService(db)
    variants = await service.get_product_variants(product_id, tenant_id)
    
    return [
        ProductVariantResponse(
            **v.__dict__,
            current_stock=v.get_current_stock(),
            variant_label=v.get_variant_label(),
        )
        for v in variants
    ]


@router.get(
    "/product/{product_id}/grid",
    response_model=VariantGridResponse,
    summary="Grade de variações",
    description="Retorna a grade de variações organizada por cor/tamanho."
)
async def get_variant_grid(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Retorna a grade de variações de um produto."""
    from app.services.product_service import ProductService
    
    variant_service = ProductVariantService(db)
    product_service = ProductService(db)
    
    # Buscar produto
    product = await product_service.get_product(product_id, tenant_id=tenant_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produto não encontrado"
        )
    
    # Buscar variantes
    variants = await variant_service.get_product_variants(product_id, tenant_id)
    
    # Extrair tamanhos e cores únicos
    sizes = sorted(set(v.size for v in variants if v.size))
    colors = sorted(set(v.color for v in variants if v.color))
    
    # Montar grade
    grid = [
        VariantGridItem(
            size=v.size,
            color=v.color,
            sku=v.sku,
            price=v.price,
            stock=v.get_current_stock(),
            variant_id=v.id,
        )
        for v in variants
    ]
    
    return VariantGridResponse(
        product_id=product_id,
        product_name=product.name,
        product_brand=product.brand,
        base_price=product.base_price,
        available_sizes=sizes,
        available_colors=colors,
        grid=grid,
    )


@router.get(
    "/search/",
    response_model=List[ProductVariantMinimal],
    summary="Buscar variantes",
)
async def search_variants(
    q: str = Query(..., min_length=1, description="Termo de busca"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Busca variantes por termo (SKU, nome do produto, cor)."""
    service = ProductVariantService(db)
    variants = await service.search_variants(q, tenant_id, skip, limit)
    
    return [
        ProductVariantMinimal(
            **v.__dict__,
            current_stock=v.get_current_stock(),
        )
        for v in variants
    ]


@router.patch(
    "/{variant_id}",
    response_model=ProductVariantResponse,
    summary="Atualizar variante",
)
async def update_variant(
    variant_id: int,
    variant_data: ProductVariantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Atualiza uma variante."""
    service = ProductVariantService(db)
    try:
        variant = await service.update_variant(variant_id, variant_data, tenant_id)
        return ProductVariantResponse(
            **variant.__dict__,
            current_stock=variant.get_current_stock(),
            variant_label=variant.get_variant_label(),
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete(
    "/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Desativar variante",
)
async def delete_variant(
    variant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Desativa uma variante (soft delete)."""
    service = ProductVariantService(db)
    try:
        await service.delete_variant(variant_id, tenant_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))