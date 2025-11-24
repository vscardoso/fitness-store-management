"""
Endpoints de entradas de estoque (StockEntries) - Gerenciamento de compras e inventário.

Todos os endpoints requerem autenticação.
Operações de modificação (POST, PUT, DELETE) requerem permissões de admin ou seller.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import date

from app.core.database import get_db
from app.schemas.stock_entry import (
    StockEntryResponse, 
    StockEntryCreate, 
    StockEntryUpdate,
    StockEntryWithItems
)
from app.schemas.entry_item import EntryItemCreate, EntryItemResponse
from app.services.stock_entry_service import StockEntryService
from app.api.deps import get_current_active_user, require_role, get_current_tenant_id
from app.models.user import User, UserRole
from app.models.stock_entry import EntryType

router = APIRouter(prefix="/stock-entries", tags=["Entradas de Estoque"])


class StockEntryCreateRequest(StockEntryCreate):
    """Request completo para criar entrada com itens."""
    items: List[EntryItemCreate]


@router.post(
    "/",
    response_model=StockEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar entrada de estoque",
    description="Cria uma nova entrada de estoque com itens. Requer permissões de admin ou seller."
)
async def create_stock_entry(
    request_data: StockEntryCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Cria uma nova entrada de estoque com seus itens em transação única.
    
    Args:
        request_data: Dados da entrada + lista de itens
        db: Sessão do banco de dados
        current_user: Usuário autenticado (admin ou seller)
        
    Returns:
        StockEntryResponse: Entrada criada com custos calculados
        
    Raises:
        HTTPException 400: Se entry_code já existe, dados inválidos ou sem itens
        HTTPException 404: Se trip_id ou product_id não encontrado
        HTTPException 401: Se não autenticado
        HTTPException 403: Se não tiver permissões
        
    Examples:
        POST /stock-entries
        {
            "entry_code": "ENTRY-2025-001",
            "entry_date": "2025-01-15",
            "entry_type": "trip",
            "trip_id": 1,
            "supplier_name": "Fornecedor ABC",
            "supplier_cnpj": "12.345.678/0001-90",
            "invoice_number": "NF-12345",
            "items": [
                {
                    "product_id": 1,
                    "quantity_received": 50,
                    "unit_cost": 15.00
                },
                {
                    "product_id": 2,
                    "quantity_received": 100,
                    "unit_cost": 8.50
                }
            ]
        }
    """
    try:
        # Extrair items do request
        items = request_data.items
        
        # Criar StockEntryCreate sem items
        entry_data = StockEntryCreate(
            entry_code=request_data.entry_code,
            entry_date=request_data.entry_date,
            entry_type=request_data.entry_type,
            trip_id=request_data.trip_id,
            supplier_name=request_data.supplier_name,
            supplier_cnpj=request_data.supplier_cnpj,
            supplier_contact=request_data.supplier_contact,
            invoice_number=request_data.invoice_number,
            payment_method=request_data.payment_method,
            notes=request_data.notes
        )
        
        service = StockEntryService(db)
        entry = await service.create_entry(entry_data, items, current_user.id, tenant_id=tenant_id)
        
        await db.commit()
        await db.refresh(entry)
        
        return entry
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar entrada: {str(e)}"
        )


@router.get(
    "/",
    response_model=List[StockEntryResponse],
    summary="Listar entradas de estoque",
    description="Lista entradas com filtros opcionais por tipo, data e trip"
)
async def list_stock_entries(
    skip: int = Query(0, ge=0, description="Número de registros para pular"),
    limit: int = Query(100, ge=1, le=1000, description="Limite de registros por página"),
    entry_type: Optional[EntryType] = Query(None, description="Filtrar por tipo (trip/online/local)"),
    trip_id: Optional[int] = Query(None, description="Filtrar por viagem"),
    start_date: Optional[date] = Query(None, description="Data inicial (entry_date >= start_date)"),
    end_date: Optional[date] = Query(None, description="Data final (entry_date <= end_date)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Lista entradas de estoque com filtros opcionais.
    
    Args:
        skip: Número de registros para pular (paginação)
        limit: Limite de registros por página
        entry_type: Filtrar por tipo (trip, online, local)
        trip_id: Filtrar por ID da viagem
        start_date: Data inicial para filtro
        end_date: Data final para filtro
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        List[StockEntryResponse]: Lista de entradas encontradas
        
    Examples:
        GET /stock-entries?skip=0&limit=10
        GET /stock-entries?entry_type=trip
        GET /stock-entries?trip_id=1
    """
    try:
        service = StockEntryService(db)
        
        # Aplicar filtros
        if entry_type or trip_id or start_date or end_date:
            entries = await service.get_entries_filtered(
                entry_type=entry_type,
                trip_id=trip_id,
                start_date=start_date,
                end_date=end_date,
                skip=skip,
                limit=limit,
                tenant_id=tenant_id,
            )
        else:
            # Lista todos
            from app.repositories.stock_entry_repository import StockEntryRepository
            repo = StockEntryRepository()
            entries = await repo.get_multi(db, skip=skip, limit=limit, tenant_id=tenant_id)
        
        return entries
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar entradas: {str(e)}"
        )


@router.get(
    "/slow-moving",
    summary="Produtos encalhados",
    description="Lista produtos com venda lenta (baixa taxa de depleção)"
)
async def get_slow_moving_products(
    threshold: float = Query(30.0, ge=0, le=100, description="Limite de depleção (%) para considerar lento"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Retorna produtos com venda lenta (encalhados).
    
    Produtos são considerados de venda lenta quando:
    - Taxa de depleção < threshold
    - Ainda há estoque restante (quantity_remaining > 0)
    - Entrada tem mais de 30 dias
    
    Args:
        threshold: Porcentagem de depleção para considerar lento (default: 30%)
        skip: Registros para pular
        limit: Limite de registros
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        Lista de entry_items com venda lenta
        
    Examples:
        GET /stock-entries/slow-moving?threshold=25
        
        Response:
        [
            {
                "entry_item_id": 5,
                "entry_code": "ENTRY-2025-001",
                "product_id": 3,
                "product_name": "Produto X",
                "quantity_received": 100,
                "quantity_remaining": 85,
                "quantity_sold": 15,
                "depletion_rate": 15.0,
                "days_in_stock": 45,
                "unit_cost": 10.00
            },
            ...
        ]
    """
    try:
        service = StockEntryService(db)
        slow_movers = await service.get_slow_moving_products(
            threshold=threshold,
            skip=skip,
            limit=limit,
            tenant_id=tenant_id,
        )
        return slow_movers
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar produtos encalhados: {str(e)}"
        )


@router.get(
    "/best-performing",
    summary="Melhores entradas",
    description="Lista entradas com melhor performance (maior taxa de depleção)"
)
async def get_best_performing_entries(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Retorna entradas de estoque com melhor performance.
    
    Performance é medida por:
    - Taxa de depleção média dos itens
    - Quantidade vendida vs recebida
    - ROI simplificado
    
    Args:
        skip: Registros para pular
        limit: Limite de registros
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        Lista de entradas ordenadas por performance
        
    Examples:
        GET /stock-entries/best-performing?limit=10
        
        Response:
        [
            {
                "entry_id": 3,
                "entry_code": "ENTRY-2025-003",
                "entry_date": "2025-01-20",
                "supplier_name": "Fornecedor XYZ",
                "total_cost": 2500.00,
                "total_items": 5,
                "average_depletion_rate": 87.5,
                "total_quantity_sold": 245,
                "performance_score": 87.5
            },
            ...
        ]
    """
    try:
        service = StockEntryService(db)
        best_entries = await service.get_best_performing_entries(
            skip=skip,
            limit=limit,
            tenant_id=tenant_id,
        )
        return best_entries
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar melhores entradas: {str(e)}"
        )


@router.get(
    "/{entry_id}",
    response_model=StockEntryWithItems,
    summary="Detalhes da entrada",
    description="Retorna detalhes completos de uma entrada específica incluindo itens"
)
async def get_stock_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Retorna detalhes de uma entrada de estoque com seus itens.
    
    Args:
        entry_id: ID da entrada
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        StockEntryWithItems: Dados completos da entrada com itens
        
    Raises:
        HTTPException 404: Se entrada não encontrada
        
    Examples:
        GET /stock-entries/1
        
        Response:
        {
            "id": 1,
            "entry_code": "ENTRY-2025-001",
            "entry_date": "2025-01-15",
            "entry_type": "trip",
            "trip_id": 1,
            "supplier_name": "Fornecedor ABC",
            "total_cost": 1600.00,
            "items": [
                {
                    "id": 1,
                    "product_id": 1,
                    "quantity_received": 50,
                    "quantity_remaining": 30,
                    "unit_cost": 15.00,
                    "total_cost": 750.00
                },
                ...
            ]
        }
    """
    try:
        from app.repositories.stock_entry_repository import StockEntryRepository
        repo = StockEntryRepository()
        entry = await repo.get_by_id(db, entry_id, include_items=True, tenant_id=tenant_id)
        
        if not entry:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Entrada {entry_id} não encontrada"
            )
        
        return entry
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar entrada: {str(e)}"
        )


@router.get(
    "/{entry_id}/analytics",
    summary="Analytics da entrada",
    description="Retorna análises e métricas detalhadas de uma entrada"
)
async def get_entry_analytics(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Retorna análises e métricas de uma entrada de estoque.
    
    Calcula:
    - Total investido
    - Quantidade de itens e produtos
    - Taxa de depleção (vendas vs estoque)
    - Produtos mais vendidos
    - Produtos com venda lenta
    
    Args:
        entry_id: ID da entrada
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        Dict com análises da entrada
        
    Raises:
        HTTPException 404: Se entrada não encontrada
    """
    try:
        service = StockEntryService(db)
        analytics = await service.get_entry_analytics(entry_id, tenant_id=tenant_id)
        return analytics
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao calcular analytics: {str(e)}"
        )


@router.put(
    "/{entry_id}",
    response_model=StockEntryResponse,
    summary="Atualizar entrada",
    description="Atualiza dados de uma entrada de estoque. Requer permissões de admin ou seller."
)
async def update_stock_entry(
    entry_id: int,
    entry_data: StockEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Atualiza dados de uma entrada de estoque.
    
    Campos atualizáveis:
    - entry_code, entry_date, entry_type
    - trip_id, supplier_name, supplier_cnpj
    - supplier_contact, invoice_number
    - payment_method, notes
    
    ATENÇÃO: Não atualiza itens da entrada.
    Use endpoints específicos de entry_items para isso.
    
    Args:
        entry_id: ID da entrada
        entry_data: Dados para atualizar
        db: Sessão do banco de dados
        current_user: Usuário autenticado (admin ou seller)
        
    Returns:
        StockEntryResponse: Entrada atualizada
        
    Raises:
        HTTPException 404: Se entrada não encontrada
        HTTPException 400: Se dados inválidos ou entry_code duplicado
        HTTPException 403: Se não tiver permissões
    """
    try:
        service = StockEntryService(db)
        entry = await service.update_entry(entry_id, entry_data, tenant_id=tenant_id)
        
        await db.commit()
        await db.refresh(entry)
        
        return entry
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar entrada: {str(e)}"
        )


@router.delete(
    "/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deletar entrada",
    description="Faz soft delete de uma entrada. Requer permissões de admin."
)
async def delete_stock_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Deleta uma entrada de estoque (soft delete).
    
    Args:
        entry_id: ID da entrada
        db: Sessão do banco de dados
        current_user: Usuário autenticado (admin)
        
    Returns:
        None (204 No Content)
        
    Raises:
        HTTPException 404: Se entrada não encontrada
        HTTPException 400: Se entrada não puder ser deletada
        HTTPException 403: Se não tiver permissões
    """
    try:
        service = StockEntryService(db)
        await service.delete_entry(entry_id, tenant_id=tenant_id)
        
        await db.commit()
        return None
    
    except ValueError as e:
        error_msg = str(e).lower()
        
        if "não encontrada" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e)
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
    
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar entrada: {str(e)}"
        )
