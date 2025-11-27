"""
Endpoints de produtos - Listagem, Detalhes, Criação, Atualização e Deleção.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.schemas.product import ProductResponse, ProductCreate, ProductUpdate, ActivateProductRequest
from app.services.product_service import ProductService
from app.repositories.product_repository import ProductRepository
from app.repositories.inventory_repository import InventoryRepository
from app.api.deps import get_current_active_user, require_role, get_current_tenant_id
from app.models.user import User, UserRole

router = APIRouter(prefix="/products", tags=["Produtos"])


async def enrich_product_with_stock(product, inventory_repo: InventoryRepository):
    """Helper para adicionar informações de estoque ao produto."""
    inventory = await inventory_repo.get_by_product(product.id)
    if inventory:
        product.current_stock = inventory.quantity
        product.min_stock_threshold = inventory.min_stock
    else:
        product.current_stock = 0
        product.min_stock_threshold = 0
    return product


@router.get(
    "/",
    response_model=List[ProductResponse],
    summary="Listar produtos",
    description="Lista produtos com paginação e filtros opcionais por categoria ou busca"
)
@router.get(
    "",
    response_model=List[ProductResponse],
    include_in_schema=False
)
async def list_products(
    skip: int = Query(0, ge=0, description="Número de registros para pular"),
    limit: int = Query(100, ge=1, le=1000, description="Limite de registros por página"),
    category_id: Optional[int] = Query(None, description="Filtrar por ID da categoria"),
    search: Optional[str] = Query(None, description="Buscar por nome, SKU ou marca"),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Listar produtos com filtros opcionais.
    
    Args:
        skip: Número de registros para pular (paginação)
        limit: Limite de registros por página (máximo 1000)
        category_id: ID da categoria para filtrar produtos
        search: Termo de busca para nome, SKU ou marca
        db: Sessão do banco de dados
        
    Returns:
        List[ProductResponse]: Lista de produtos encontrados
        
    Examples:
        - GET /products?skip=0&limit=10
        - GET /products?category_id=1
        - GET /products?search=legging
        - GET /products?search=LEG-001
    """
    product_repo = ProductRepository(db)
    inventory_repo = InventoryRepository(db)
    
    try:
        if search:
            # Busca por nome, SKU ou marca
            products = await product_repo.search(search, tenant_id=tenant_id)
        elif category_id:
            # Filtro por categoria
            products = await product_repo.get_by_category(category_id, tenant_id=tenant_id)
        else:
            # Lista todos os produtos
            products = await product_repo.get_multi(db, skip=skip, limit=limit, tenant_id=tenant_id)
        
        # Adicionar informações de estoque
        for product in products:
            await enrich_product_with_stock(product, inventory_repo)
        
        return products
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar produtos: {str(e)}"
        )


@router.get(
    "/low-stock",
    response_model=List[dict],
    summary="Produtos com estoque baixo",
    description="Lista produtos com estoque abaixo do mínimo configurado"
)
async def get_low_stock(
    threshold: Optional[int] = Query(None, ge=0, description="Threshold customizado (usa min_stock se não fornecido)"),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Listar produtos com estoque baixo.
    
    Requer autenticação.
    
    Args:
        threshold: Threshold customizado para considerar estoque baixo
                  Se não fornecido, usa o min_stock de cada produto
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        List[dict]: Lista de produtos com estoque baixo, incluindo:
            - product_id: ID do produto
            - name: Nome do produto
            - sku: SKU do produto
            - current_stock: Estoque atual
            - min_stock: Estoque mínimo
            - deficit: Diferença (negativa se abaixo do mínimo)
            
    Raises:
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 500: Se houver erro ao buscar produtos
    """
    product_repo = ProductRepository(db)
    
    try:
        # Buscar produtos com estoque baixo
        products = await product_repo.get_low_stock(threshold, tenant_id=tenant_id)
        
        # Formatar resposta com informações de estoque detalhadas
        result = []
        for product in products:
            # Inventory já está carregado via selectinload
            inventory = product.inventory[0] if product.inventory else None
            
            if not inventory:
                continue
            
            current_stock = inventory.quantity
            min_stock_value = threshold if threshold is not None else inventory.min_stock
            
            result.append({
                "product_id": product.id,
                "name": product.name,
                "sku": product.sku,
                "barcode": product.barcode,
                "category_id": product.category_id,
                "current_stock": current_stock,
                "min_stock": min_stock_value,
                "deficit": min_stock_value - current_stock,
                "price": float(product.price) if product.price else 0.0
            })
        
        # Ordenar por déficit (maior déficit primeiro)
        result.sort(key=lambda x: x["deficit"], reverse=True)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar produtos com estoque baixo: {str(e)}"
        )


@router.get(
    "/active",
    response_model=List[ProductResponse],
    summary="Listar produtos ativos da loja",
    description="Lista apenas produtos que o lojista já ativou (não inclui catálogo)"
)
async def list_active_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lista produtos ATIVOS da loja (is_catalog=false).

    Estes são produtos que o lojista:
    - Ativou do catálogo, OU
    - Criou manualmente

    Produtos do catálogo (is_catalog=true) NÃO aparecem aqui.
    """
    try:
        service = ProductService(db)
        products = await service.get_active_products(
            tenant_id=tenant_id,
            skip=skip,
            limit=limit
        )

        # Enriquecer com informações de estoque
        inventory_repo = InventoryRepository(db)
        for product in products:
            await enrich_product_with_stock(product, inventory_repo)

        return products

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar produtos ativos: {str(e)}"
        )


@router.get(
    "/catalog",
    response_model=List[ProductResponse],
    summary="Listar produtos do catálogo",
    description="Lista os 115 produtos templates que podem ser ativados na loja"
)
async def list_catalog_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    category_id: Optional[int] = Query(None, description="Filtrar por categoria"),
    search: Optional[str] = Query(None, description="Buscar por nome ou marca"),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lista produtos do CATÁLOGO (templates/sugestões).

    Estes são os 115 produtos padrão criados no signup.
    O usuário pode "ativar" produtos do catálogo para adicionar à sua loja.

    Produtos do catálogo têm is_catalog=true e não aparecem na listagem normal.
    """
    try:
        service = ProductService(db)
        products = await service.get_catalog_products(
            tenant_id=tenant_id,
            category_id=category_id,
            search=search,
            skip=skip,
            limit=limit
        )

        # Não precisa enriquecer com estoque (catálogo não tem estoque)
        return products

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar catálogo: {str(e)}"
        )


@router.get(
    "/sku/{sku}",
    response_model=ProductResponse,
    summary="Buscar produto por SKU",
    description="Retorna produto pelo código SKU"
)
async def get_product_by_sku(
    sku: str,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Obter produto por SKU.
    
    Args:
        sku: Código SKU do produto
        db: Sessão do banco de dados
        
    Returns:
        ProductResponse: Dados do produto
        
    Raises:
        HTTPException 404: Se produto não for encontrado
    """
    product_repo = ProductRepository(db)
    
    try:
        product = await product_repo.get_by_sku(sku, tenant_id=tenant_id)
        
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Produto com SKU '{sku}' não encontrado"
            )
        
        return product
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar produto: {str(e)}"
        )


@router.get(
    "/barcode/{barcode}",
    response_model=ProductResponse,
    summary="Buscar produto por código de barras",
    description="Retorna produto pelo código de barras"
)
async def get_product_by_barcode(
    barcode: str,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Obter produto por código de barras.

    Args:
        barcode: Código de barras do produto
        db: Sessão do banco de dados

    Returns:
        ProductResponse: Dados do produto

    Raises:
        HTTPException 404: Se produto não for encontrado
    """
    product_repo = ProductRepository(db)

    try:
        product = await product_repo.get_by_barcode(barcode, tenant_id=tenant_id)

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Produto com código de barras '{barcode}' não encontrado"
            )

        return product

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar produto: {str(e)}"
        )


@router.get(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Obter detalhes do produto",
    description="Retorna informações completas de um produto específico"
)
async def get_product(
    product_id: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Obter detalhes de um produto.

    Args:
        product_id: ID do produto
        db: Sessão do banco de dados

    Returns:
        ProductResponse: Dados completos do produto

    Raises:
        HTTPException 404: Se produto não for encontrado
        HTTPException 500: Se houver erro ao buscar produto
    """
    product_repo = ProductRepository(db)

    try:
        product = await product_repo.get(db, product_id, tenant_id=tenant_id)

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Produto com ID {product_id} não encontrado"
            )

        return product

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar produto: {str(e)}"
        )



# ============================================================================
# ENDPOINTS DE CRIAÇÃO, ATUALIZAÇÃO E DELEÇÃO
# ============================================================================


@router.post(
    "/",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar novo produto",
    description="Cria um novo produto no sistema (requer permissão de Admin ou Manager)"
)
@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False
)
async def create_product(
    product_data: ProductCreate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Criar novo produto.
    
    Requer permissão de ADMIN.
    
    Args:
        product_data: Dados do produto a ser criado (inclui estoque inicial)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin)
        
    Returns:
        ProductResponse: Produto criado com ID gerado
        
    Raises:
        HTTPException 400: Se dados forem inválidos ou SKU/barcode duplicados
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão
        HTTPException 500: Se houver erro ao criar produto
        
    Example Request Body:
        {
            "name": "Legging Premium",
            "sku": "LEG-001",
            "barcode": "7891234567890",
            "price": 89.90,
            "cost_price": 45.00,
            "category_id": 1,
            "brand": "FitWear",
            "color": "Preto",
            "size": "M",
            "gender": "Feminino",
            "material": "Poliamida",
            "is_activewear": true,
            "initial_stock": 10,
            "min_stock": 5
        }
    """
    import logging
    logger = logging.getLogger(__name__)
    
    product_service = ProductService(db)
    
    try:
        # Log dos dados recebidos
        logger.info(f"📥 Dados recebidos: {product_data.model_dump()}")
        
        # Extrair dados de estoque do schema
        initial_stock = product_data.initial_stock or 0
        min_stock = product_data.min_stock or 5
        
        logger.info(f"📊 Estoque extraído - initial_stock: {initial_stock}, min_stock: {min_stock}")
        logger.info(f"🔧 Chamando service.create_product com initial_quantity={initial_stock}")
        
        # Garantir mapeamento sale_price -> price (compatibilidade)
        if product_data.price is None and getattr(product_data, "sale_price", None) is not None:
            product_data.price = product_data.sale_price  # type: ignore

        product = await product_service.create_product(
            product_data,
            initial_quantity=initial_stock,
            min_stock=min_stock,
            tenant_id=tenant_id,
            user_id=current_user.id,
        )

        logger.info(f"✅ Produto criado com sucesso - ID: {product.id}")
        return product
        
    except ValueError as e:
        # Erros de validação (SKU duplicado, categoria inválida, etc)
        logger.warning(f"⚠️ Erro de validação: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        # Erro genérico com log detalhado
        import traceback
        logger.error(f"❌ ERRO ao criar produto: {str(e)}")
        logger.error(f"❌ Tipo do erro: {type(e).__name__}")
        logger.error(f"❌ Traceback completo:\n{traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar produto: {str(e)}"
        )


@router.put(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Atualizar produto",
    description="Atualiza dados de um produto existente (requer permissão de Admin ou Manager)"
)
async def update_product(
    product_id: int,
    product_data: ProductUpdate,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Atualizar produto existente.
    
    Requer permissão de ADMIN.
    
    Args:
        product_id: ID do produto a ser atualizado
        product_data: Dados parciais ou completos para atualização
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin)
        
    Returns:
        ProductResponse: Produto atualizado
        
    Raises:
        HTTPException 400: Se dados forem inválidos
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão
        HTTPException 404: Se produto não for encontrado
        HTTPException 500: Se houver erro ao atualizar produto
        
    Example Request Body (parcial):
        {
            "price": 99.90,
            "cost_price": 50.00
        }
    """
    product_service = ProductService(db)
    
    try:
        product = await product_service.update_product(product_id, product_data, tenant_id=tenant_id)
        return product
        
    except ValueError as e:
        error_msg = str(e).lower()
        
        # Determinar código de status apropriado
        if "não encontrado" in error_msg or "not found" in error_msg:
            status_code = status.HTTP_404_NOT_FOUND
        else:
            status_code = status.HTTP_400_BAD_REQUEST
            
        raise HTTPException(
            status_code=status_code,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar produto: {str(e)}"
        )


@router.patch(
    "/{product_id}/price",
    response_model=ProductResponse,
    summary="Atualizar preço do produto",
    description="Atualiza apenas o preço e custo de um produto (requer permissão de Admin)"
)
async def update_product_price(
    product_id: int,
    price: float = Query(..., gt=0, description="Novo preço de venda"),
    cost_price: Optional[float] = Query(None, ge=0, description="Novo preço de custo"),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Atualizar preço do produto.
    
    Endpoint simplificado para atualização rápida de preços.
    Requer permissão de ADMIN.
    
    Args:
        product_id: ID do produto
        price: Novo preço de venda (obrigatório, > 0)
        cost_price: Novo preço de custo (opcional, >= 0)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin)
        
    Returns:
        ProductResponse: Produto com preço atualizado
        
    Raises:
        HTTPException 400: Se preço for inválido
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão
        HTTPException 404: Se produto não for encontrado
        
    Example:
        PATCH /products/1/price?price=99.90&cost_price=50.00
    """
    product_service = ProductService(db)
    
    try:
        product = await product_service.update_product_price(
            product_id, 
            price, 
            cost_price,
            tenant_id=tenant_id,
        )
        return product
        
    except ValueError as e:
        error_msg = str(e).lower()
        
        if "não encontrado" in error_msg or "not found" in error_msg:
            status_code = status.HTTP_404_NOT_FOUND
        else:
            status_code = status.HTTP_400_BAD_REQUEST
            
        raise HTTPException(
            status_code=status_code,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar preço: {str(e)}"
        )


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deletar produto",
    description="Deleta um produto (soft delete, apenas Admin)"
)
async def delete_product(
    product_id: int,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Deletar produto (soft delete).
    
    Marca o produto como inativo ao invés de deletá-lo permanentemente.
    Requer permissão de ADMIN.
    
    Args:
        product_id: ID do produto a ser deletado
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin)
        
    Returns:
        None (204 No Content)
        
    Raises:
        HTTPException 400: Se produto não puder ser deletado (ex: tem vendas)
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão
        HTTPException 404: Se produto não for encontrado
        HTTPException 500: Se houver erro ao deletar produto
        
    Note:
        Este é um soft delete. O produto permanece no banco mas fica inativo.
        Para reativar, use o endpoint PUT com is_active=true.
    """
    product_service = ProductService(db)
    
    try:
        await product_service.delete_product(product_id, tenant_id=tenant_id)
        return None
        
    except ValueError as e:
        error_msg = str(e).lower()
        
        if "não encontrado" in error_msg or "not found" in error_msg:
            status_code = status.HTTP_404_NOT_FOUND
        else:
            status_code = status.HTTP_400_BAD_REQUEST
            
        raise HTTPException(
            status_code=status_code,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar produto: {str(e)}"
        )


# ============================================================================
# CATÁLOGO DE PRODUTOS - ATIVAÇÃO
# ============================================================================

@router.post(
    "/catalog/{product_id}/activate",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ativar produto do catálogo",
    description="Copia um produto do catálogo para a loja do usuário"
)
async def activate_catalog_product(
    product_id: int,
    request: ActivateProductRequest,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Ativa um produto do catálogo, criando uma cópia para a loja.

    Fluxo:
    1. Busca produto do catálogo (is_catalog=true)
    2. Cria CÓPIA com is_catalog=false
    3. Gera SKU único para a loja
    4. Usa preço customizado ou mantém o sugerido

    O produto ativado:
    - Aparece em /products/active
    - Pode ter estoque adicionado
    - Pode ser editado/deletado normalmente

    Args:
        product_id: ID do produto no catálogo
        request: Opcionalmente um preço customizado

    Returns:
        Produto ativado (cópia)
    """
    try:
        service = ProductService(db)

        # Ativar produto
        activated_product = await service.activate_catalog_product(
            catalog_product_id=product_id,
            tenant_id=tenant_id,
            user_id=current_user.id,
            custom_price=float(request.custom_price) if request.custom_price else None,
            entry_id=request.entry_id,
            quantity=request.quantity
        )

        # Enriquecer com estoque (será 0)
        inventory_repo = InventoryRepository(db)
        await enrich_product_with_stock(activated_product, inventory_repo)

        return activated_product

    except ValueError as e:
        error_msg = str(e).lower()

        if "não encontrado" in error_msg or "not found" in error_msg:
            status_code = status.HTTP_404_NOT_FOUND
        elif "não é um template" in error_msg or "não é catálogo" in error_msg:
            status_code = status.HTTP_400_BAD_REQUEST
        else:
            status_code = status.HTTP_400_BAD_REQUEST

        raise HTTPException(
            status_code=status_code,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao ativar produto: {str(e)}"
        )
