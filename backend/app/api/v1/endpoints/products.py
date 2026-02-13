"""
Endpoints de produtos - Listagem, Detalhes, Criação, Atualização e Deleção.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.core.database import get_db
from app.schemas.product import (
    ProductResponse,
    ProductCreate,
    ProductUpdate,
    ActivateProductRequest,
    ProductStatusResponse,
    ProductQuantityAdjustRequest,
    ProductQuantityAdjustResponse,
)
from app.services.product_service import ProductService
from app.repositories.product_repository import ProductRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.entry_item_repository import EntryItemRepository
from app.api.deps import get_current_active_user, require_role, get_current_tenant_id
from app.models.user import User, UserRole
from app.models.product import Product
from app.models.category import Category

router = APIRouter(prefix="/products", tags=["Produtos"])

# Cache de categorias para evitar múltiplas queries
_category_cache: dict = {}


async def get_category_data(db: AsyncSession, category_id: int) -> dict | None:
    """Busca dados da categoria com cache."""
    if category_id in _category_cache:
        return _category_cache[category_id]

    result = await db.execute(
        text("SELECT id, name, description, parent_id, is_active, created_at, updated_at FROM categories WHERE id = :cat_id"),
        {"cat_id": category_id}
    )
    row = result.fetchone()
    if row:
        data = {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "parent_id": row[3],
            "is_active": row[4],
            "created_at": row[5],
            "updated_at": row[6]
        }
        _category_cache[category_id] = data
        return data
    return None


async def build_product_response(
    product: Product,
    db: AsyncSession,
    inventory_repo: InventoryRepository,
    tenant_id: int,
    include_entries: bool = False
) -> dict:
    """Constrói o response completo de um produto."""
    # Categoria
    category_data = None
    if product.category_id:
        category_data = await get_category_data(db, product.category_id)

    # Estoque
    inventory = await inventory_repo.get_by_product(product.id, tenant_id=tenant_id)

    return {
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "sku": product.sku,
        "barcode": product.barcode,
        "price": product.price,
        "cost_price": product.cost_price,
        "category_id": product.category_id,
        "category": category_data,
        "brand": product.brand,
        "color": product.color,
        "size": product.size,
        "gender": product.gender,
        "material": product.material,
        "is_digital": product.is_digital,
        "is_activewear": product.is_activewear,
        "is_catalog": product.is_catalog,
        "is_active": product.is_active,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
        "current_stock": inventory.quantity if inventory else 0,
        "min_stock_threshold": inventory.min_stock if inventory else None,
        "entry_items": []
    }


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
    has_stock: bool = Query(False, description="Filtrar apenas produtos com estoque disponível"),
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
    entry_item_repo = EntryItemRepository()
    
    try:
        # NOVA LÓGICA: Se has_stock=True, buscar APENAS produtos com estoque no FIFO
        if has_stock:
            # 1. Buscar IDs de produtos com estoque (FIFO é fonte da verdade)
            products_with_stock_ids = await entry_item_repo.get_products_with_stock(db, tenant_id)
            
            if not products_with_stock_ids:
                return []  # Nenhum produto com estoque
            
            # 2. Buscar produtos diretamente pelos IDs (não precisa paginar muito, são poucos)
            stmt = select(Product).where(
                Product.id.in_(products_with_stock_ids),
                Product.is_catalog == False,
                Product.is_active == True,
                Product.tenant_id == tenant_id
            )
            
            # Aplicar filtros adicionais
            if search:
                search_term = f"%{search}%"
                stmt = stmt.where(
                    or_(
                        Product.name.ilike(search_term),
                        Product.sku.ilike(search_term),
                        Product.brand.ilike(search_term)
                    )
                )
            
            if category_id:
                stmt = stmt.where(Product.category_id == category_id)
            
            # Ordenar e paginar
            stmt = stmt.order_by(Product.name).offset(skip).limit(limit)
            
            result = await db.execute(stmt)
            products = result.scalars().all()
            
            # 3. Construir responses completos
            responses = []
            for product in products:
                resp = await build_product_response(product, db, inventory_repo, tenant_id)
                responses.append(resp)
            return responses

        # LÓGICA ORIGINAL: Listar todos os produtos (sem filtro de estoque)
        if search:
            products = await product_repo.search(search, tenant_id=tenant_id)
        elif category_id:
            products = await product_repo.get_by_category(category_id, tenant_id=tenant_id)
        else:
            products = await product_repo.get_multi(db, skip=skip, limit=limit, tenant_id=tenant_id)

        # Filtrar não-catálogo e construir responses
        responses = []
        for product in products:
            if product.is_catalog:
                continue
            resp = await build_product_response(product, db, inventory_repo, tenant_id)
            responses.append(resp)
        return responses
        
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

        # Construir responses completos
        inventory_repo = InventoryRepository(db)
        responses = []
        for product in products:
            resp = await build_product_response(product, db, inventory_repo, tenant_id)
            responses.append(resp)
        return responses

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

        # Construir responses completos
        inventory_repo = InventoryRepository(db)
        responses = []
        for product in products:
            resp = await build_product_response(product, db, inventory_repo, tenant_id)
            responses.append(resp)
        return responses

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar catálogo: {str(e)}"
        )


@router.get(
    "/status",
    response_model=List[ProductStatusResponse],
    summary="Status de estoque por produto",
    description="Classifica produtos em in_stock, depleted, never_stocked"
)
async def get_products_status(
    include_catalog: bool = Query(False, description="Incluir produtos do catálogo"),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna o status de estoque para os produtos do tenant atual.

    - in_stock: estoque atual > 0
    - depleted: já teve entradas mas estoque atual == 0
    - never_stocked: nunca teve entradas
    """
    try:
        service = ProductService(db)
        return await service.get_products_status(tenant_id=tenant_id, include_catalog=include_catalog)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao obter status dos produtos: {str(e)}"
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
    Obter detalhes de um produto com histórico FIFO de entradas.

    Args:
        product_id: ID do produto
        db: Sessão do banco de dados

    Returns:
        ProductResponse: Dados completos do produto incluindo entry_items

    Raises:
        HTTPException 404: Se produto não for encontrado
        HTTPException 500: Se houver erro ao buscar produto
    """
    from app.repositories.entry_item_repository import EntryItemRepository
    from app.schemas.product import ProductEntryItem

    product_repo = ProductRepository(db)
    inventory_repo = InventoryRepository(db)
    entry_item_repo = EntryItemRepository()

    try:
        product = await product_repo.get(db, product_id, tenant_id=tenant_id)

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Produto com ID {product_id} não encontrado"
            )

# Carregar categoria com todos os campos necessários
        category_data = None
        if product.category_id:
            try:
                category_result = await db.execute(
                    text("SELECT id, name, description, parent_id, is_active, created_at, updated_at FROM categories WHERE id = :cat_id"),
                    {"cat_id": product.category_id}
                )
                category_row = category_result.fetchone()
                if category_row:
                    category_data = {
                        "id": category_row[0],
                        "name": category_row[1],
                        "description": category_row[2],
                        "parent_id": category_row[3],
                        "is_active": category_row[4],
                        "created_at": category_row[5],
                        "updated_at": category_row[6]
                    }
            except Exception as e:
                print(f"Erro ao buscar categoria: {e}")
                category_data = None

        # Buscar inventory de forma assíncrona
        inventory = await inventory_repo.get_by_product(product_id, tenant_id=tenant_id)
        current_stock = inventory.quantity if inventory else 0
        min_stock_threshold = inventory.min_stock if inventory else None

        # Buscar entry items - não quebrar se falhar
        product_entry_items = []
        try:
            entry_items = await entry_item_repo.get_by_product(db, product_id)
            from app.repositories.stock_entry_repository import StockEntryRepository
            entry_repo = StockEntryRepository()

            for item in entry_items:
                try:
                    entry = await entry_repo.get_by_id(db, item.entry_id, include_items=False, tenant_id=tenant_id)
                    if entry:
                        product_entry_items.append(ProductEntryItem(
                            entry_item_id=item.id,
                            entry_id=item.entry_id,
                            entry_code=entry.entry_code,
                            entry_date=entry.entry_date,
                            entry_type=entry.entry_type.value,
                            quantity_received=item.quantity_received,
                            quantity_remaining=item.quantity_remaining,
                            quantity_sold=item.quantity_sold,
                            unit_cost=item.unit_cost,
                            supplier_name=entry.supplier_name
                        ))
                except:
                    pass  # Continuar se falhar um item específico
        except:
            pass  # Se falhar busca de entry_items, retornar lista vazia

        # Adicionar entry_items ao product response
        product_dict = {
            "id": product.id,
            "name": product.name,
            "description": product.description,
            "sku": product.sku,
            "barcode": product.barcode,
            "price": product.price,
            "cost_price": product.cost_price,
            "category_id": product.category_id,
            "category": category_data,
            "brand": product.brand,
            "color": product.color,
            "size": product.size,
            "gender": product.gender,
            "material": product.material,
            "is_digital": product.is_digital,
            "is_activewear": product.is_activewear,
            "is_catalog": product.is_catalog,
            "is_active": product.is_active,
            "created_at": product.created_at,
            "updated_at": product.updated_at,
            "current_stock": current_stock,
            "min_stock_threshold": min_stock_threshold,
            "entry_items": product_entry_items
        }

        return product_dict

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

        inventory_repo = InventoryRepository(db)
        return await build_product_response(product, db, inventory_repo, tenant_id)

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
    inventory_repo = InventoryRepository(db)

    try:
        product = await product_service.update_product(product_id, product_data, tenant_id=tenant_id)
        return await build_product_response(product, db, inventory_repo, tenant_id)

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

        inventory_repo = InventoryRepository(db)
        return await build_product_response(activated_product, db, inventory_repo, tenant_id)

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


# ============================================================================
# AJUSTE DE QUANTIDADE (FIFO)
# ============================================================================

@router.post(
    "/{product_id}/adjust-quantity",
    response_model=ProductQuantityAdjustResponse,
    summary="Ajustar quantidade do produto (FIFO)",
    description=(
        "Ajusta a quantidade total do produto respeitando FIFO: "
        "para aumento, cria uma entrada ADJUSTMENT; para redução, consome dos EntryItems existentes."
    ),
)
async def adjust_product_quantity(
    product_id: int,
    payload: ProductQuantityAdjustRequest,
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Endpoint para ajuste de quantidade com confirmação do app.

    Importante: Mantém rastreabilidade FIFO e reflete no inventário derivado.
    """
    svc = ProductService(db)
    try:
        result = await svc.adjust_product_quantity(
            product_id,
            new_quantity=payload.new_quantity,
            reason=payload.reason,
            unit_cost=float(payload.unit_cost) if payload.unit_cost is not None else None,
            tenant_id=tenant_id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ajustar quantidade: {str(e)}")


# ============================================================================
# FIFO COSTS (para carrinho de vendas)
# ============================================================================

@router.post(
    "/fifo-costs",
    summary="Obter custo FIFO de produtos",
    description="Retorna custo médio FIFO para uma lista de produtos. Usado pelo carrinho para calcular margem em tempo real.",
)
async def get_fifo_costs(
    product_ids: List[int],
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Retorna custo FIFO médio para cada produto da lista."""
    from app.services.fifo_service import FIFOService
    fifo_service = FIFOService(db)

    results = {}
    for pid in product_ids:
        cost_info = await fifo_service.get_product_cost_info(pid)
        results[str(pid)] = {
            "product_id": pid,
            "average_unit_cost": cost_info["average_unit_cost"],
            "total_quantity": cost_info["total_quantity"],
            "sources_count": cost_info["sources_count"],
        }

    return results
