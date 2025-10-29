"""
Endpoints de produtos - Listagem, Detalhes, Criação, Atualização e Deleção.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.schemas.product import ProductResponse, ProductCreate, ProductUpdate
from app.services.product_service import ProductService
from app.repositories.product_repository import ProductRepository
from app.repositories.inventory_repository import InventoryRepository
from app.api.deps import get_current_active_user, require_role
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
async def list_products(
    skip: int = Query(0, ge=0, description="Número de registros para pular"),
    limit: int = Query(100, ge=1, le=1000, description="Limite de registros por página"),
    category_id: Optional[int] = Query(None, description="Filtrar por ID da categoria"),
    search: Optional[str] = Query(None, description="Buscar por nome, SKU ou marca"),
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
            products = await product_repo.search(search)
        elif category_id:
            # Filtro por categoria
            products = await product_repo.get_by_category(category_id)
        else:
            # Lista todos os produtos
            products = await product_repo.get_multi(db, skip=skip, limit=limit)
        
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
        products = await product_repo.get_low_stock(threshold)
        
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
    "/sku/{sku}",
    response_model=ProductResponse,
    summary="Buscar produto por SKU",
    description="Retorna produto pelo código SKU"
)
async def get_product_by_sku(
    sku: str,
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
        product = await product_repo.get_by_sku(sku)
        
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
        product = await product_repo.get_by_barcode(barcode)
        
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
        product = await product_repo.get(db, product_id)
        
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
async def create_product(
    product_data: ProductCreate,
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
    product_service = ProductService(db)
    
    try:
        # Extrair dados de estoque
        initial_stock = product_data.initial_stock if hasattr(product_data, 'initial_stock') else 0
        min_stock = product_data.min_stock if hasattr(product_data, 'min_stock') else 5
        
        product = await product_service.create_product(
            product_data, 
            initial_quantity=initial_stock,
            min_stock=min_stock
        )
        return product
        
    except ValueError as e:
        # Erros de validação (SKU duplicado, categoria inválida, etc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
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
        product = await product_service.update_product(product_id, product_data)
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
            cost_price
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
        await product_service.delete_product(product_id)
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
