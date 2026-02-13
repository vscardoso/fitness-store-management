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
from app.schemas.entry_item import EntryItemCreate, EntryItemResponse, EntryItemUpdate
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
    "/check-code/{entry_code}",
    response_model=dict,
    summary="Verificar se código de entrada já existe",
    description="Verifica se o código informado já está em uso por outra entrada ativa"
)
async def check_entry_code(
    entry_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Verifica se o código de entrada já existe para o tenant atual.

    Args:
        entry_code: Código da entrada a verificar
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        tenant_id: ID do tenant atual

    Returns:
        dict: {"exists": bool, "message": str}

    Examples:
        GET /stock-entries/check-code/ENTRY-001
        Response: {"exists": true, "message": "Código já existe"}
    """
    try:
        service = StockEntryService(db)
        exists = await service.check_code_exists(entry_code, tenant_id)

        return {
            "exists": exists,
            "message": "Código já existe" if exists else "Código disponível"
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao verificar código: {str(e)}"
        )


@router.get(
    "/stats",
    summary="Estatísticas gerais de entradas",
    description="Retorna estatísticas agregadas de todas as entradas (total investido, quantidade de entradas, etc.)"
)
async def get_stock_entries_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Retorna estatísticas gerais de todas as entradas de estoque.

    Args:
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        tenant_id: ID do tenant

    Returns:
        Dict com estatísticas:
        - total_invested: Soma total de custo de todas as entradas
        - total_entries: Número total de entradas ativas
        - total_items: Soma de itens únicos em todas as entradas
        - total_quantity: Soma de quantidades recebidas

    Examples:
        GET /stock-entries/stats

        Response:
        {
            "total_invested": 150000.00,
            "total_entries": 45,
            "total_items": 120,
            "total_quantity": 2500
        }
    """
    try:
        from sqlalchemy import select, func
        from app.models.stock_entry import StockEntry
        from app.models.entry_item import EntryItem

        # Total investido: soma de todos os total_cost
        total_invested_result = await db.execute(
            select(func.sum(StockEntry.total_cost))
            .where(StockEntry.is_active == True)
            .where(StockEntry.tenant_id == tenant_id)
        )
        total_invested = total_invested_result.scalar() or 0

        # Total de entradas ativas
        total_entries_result = await db.execute(
            select(func.count(StockEntry.id))
            .where(StockEntry.is_active == True)
            .where(StockEntry.tenant_id == tenant_id)
        )
        total_entries = total_entries_result.scalar() or 0

        # Total de itens e quantidades
        total_items_result = await db.execute(
            select(
                func.count(func.distinct(EntryItem.product_id)),
                func.sum(EntryItem.quantity_received)
            )
            .join(StockEntry, EntryItem.entry_id == StockEntry.id)
            .where(EntryItem.is_active == True)
            .where(StockEntry.is_active == True)
            .where(StockEntry.tenant_id == tenant_id)
        )
        stats_row = total_items_result.first()
        total_items = stats_row[0] or 0
        total_quantity = stats_row[1] or 0

        return {
            "total_invested": float(total_invested),
            "total_entries": total_entries,
            "total_items": total_items,
            "total_quantity": total_quantity,
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao calcular estatísticas: {str(e)}"
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
    "/{entry_id}/has-sales",
    summary="Verificar se entrada tem vendas",
    description="Retorna se a entrada teve vendas (usado para validar exclusão)"
)
async def check_entry_has_sales(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Verifica rapidamente se uma entrada teve vendas.

    Útil para UI validar se uma entrada pode ser excluída ou não.
    Entradas com vendas não devem ser excluídas pois são histórico.

    Args:
        entry_id: ID da entrada
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        tenant_id: ID do tenant

    Returns:
        dict: {
            "has_sales": bool,
            "items_sold": int,
            "can_delete": bool
        }

    Examples:
        GET /stock-entries/1/has-sales

        Response:
        {
            "has_sales": true,
            "items_sold": 45,
            "can_delete": false
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

        return {
            "has_sales": entry.has_sales,
            "items_sold": entry.items_sold,
            "can_delete": not entry.has_sales,  # Só pode deletar se não teve vendas
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao verificar vendas: {str(e)}"
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
        import logging
        logger = logging.getLogger(__name__)

        logger.info(f"Buscando entrada {entry_id} para tenant {tenant_id}")
        repo = StockEntryRepository()
        entry = await repo.get_by_id(db, entry_id, include_items=True, tenant_id=tenant_id)

        if not entry:
            logger.warning(f"Entrada {entry_id} não encontrada para tenant {tenant_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Entrada {entry_id} não encontrada"
            )

        logger.info(f"Entrada {entry_id} encontrada com {len(entry.entry_items)} itens")
        return entry

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Erro ao buscar entrada {entry_id}: {str(e)}\n{traceback.format_exc()}")
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
    status_code=status.HTTP_200_OK,
    summary="Deletar entrada",
    description="Faz soft delete de uma entrada e produtos órfãos. Requer permissões de admin."
)
async def delete_stock_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Deleta uma entrada de estoque (soft delete).

    ATENÇÃO: Também exclui produtos que só existem nesta entrada (órfãos).

    Args:
        entry_id: ID da entrada
        db: Sessão do banco de dados
        current_user: Usuário autenticado (admin)

    Returns:
        dict: Informações sobre a exclusão

    Raises:
        HTTPException 404: Se entrada não encontrada
        HTTPException 400: Se entrada não puder ser deletada
        HTTPException 403: Se não tiver permissões
    """
    try:
        service = StockEntryService(db)
        result = await service.delete_entry(entry_id, tenant_id=tenant_id)

        await db.commit()
        return result
    
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


@router.put(
    "/entry-items/{item_id}",
    response_model=EntryItemResponse,
    summary="Atualizar item de entrada",
    description="Atualiza quantidade e custo de um item de entrada com recálculo automático de inventário. Requer permissões de admin ou seller."
)
async def update_entry_item(
    item_id: int,
    item_data: EntryItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Atualiza um item de entrada com recálculo automático de inventário.

    FUNCIONALIDADES:
    - Atualiza quantity_received, unit_cost, notes
    - Recalcula inventário automaticamente quando quantidade muda
    - Recalcula total_cost da entrada quando custo/quantidade mudam
    - BLOQUEIA edição se o item já teve vendas (rastreabilidade FIFO)

    Campos atualizáveis:
    - quantity_received: Nova quantidade recebida (recalcula inventário)
    - unit_cost: Novo custo unitário (recalcula total da entrada)
    - notes: Observações do item

    VALIDAÇÕES:
    - Bloqueia edição se quantity_sold > 0 (rastreabilidade)
    - quantity_received deve ser > 0
    - unit_cost deve ser >= 0

    Args:
        item_id: ID do item a atualizar
        item_data: Dados para atualização (EntryItemUpdate)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (admin ou seller)
        tenant_id: ID do tenant

    Returns:
        EntryItemResponse: Item atualizado com inventário recalculado

    Raises:
        HTTPException 404: Se item não encontrado
        HTTPException 400: Se item tem vendas ou dados inválidos
        HTTPException 403: Se não tiver permissões

    Examples:
        PUT /stock-entries/entry-items/1
        {
            "quantity_received": 150,
            "unit_cost": 12.50,
            "notes": "Quantidade corrigida após recontagem"
        }

        Error response (item com vendas):
        {
            "detail": "Não é possível editar item que já teve vendas.
                       Este item já vendeu 25 unidade(s).
                       A rastreabilidade FIFO exige que itens com vendas não sejam modificados."
        }
    """
    try:
        service = StockEntryService(db)

        # Converter Pydantic model para dict
        item_dict = item_data.model_dump(exclude_unset=True)

        # Atualizar item com recálculo automático
        updated_item = await service.update_entry_item(
            item_id=item_id,
            item_data=item_dict,
            tenant_id=tenant_id,
        )

        return updated_item

    except ValueError as e:
        error_msg = str(e).lower()

        # Erro 404: Item não encontrado
        if "não encontrado" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e)
            )
        # Erro 400: Validação (vendas, valores inválidos, etc.)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar item: {str(e)}"
        )


@router.post(
    "/{entry_id}/items",
    response_model=EntryItemResponse,
    summary="Adicionar item a entrada existente",
    description="Adiciona um novo produto a uma entrada de estoque existente. Atualiza inventário automaticamente."
)
async def add_item_to_entry(
    entry_id: int,
    item_data: EntryItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Adiciona um novo item a uma entrada de estoque existente.

    Este endpoint permite vincular um produto (do catálogo ou ativo) a uma entrada
    de estoque já existente, criando o rastreamento FIFO necessário.

    FUNCIONALIDADES:
    - Cria novo EntryItem vinculado à entrada
    - Atualiza inventário do produto automaticamente
    - Recalcula total_cost da entrada
    - Marca produtos do catálogo como ativos

    Args:
        entry_id: ID da entrada existente
        item_data: Dados do item (product_id, quantity_received, unit_cost, selling_price, notes)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (admin ou seller)
        tenant_id: ID do tenant

    Returns:
        EntryItemResponse: Item criado com dados completos

    Raises:
        HTTPException 404: Se entrada ou produto não encontrado
        HTTPException 400: Se dados inválidos

    Examples:
        POST /stock-entries/1/items
        {
            "product_id": 123,
            "quantity_received": 10,
            "unit_cost": 25.00,
            "selling_price": 49.90,
            "notes": "Adicionado após criação da entrada"
        }
    """
    try:
        service = StockEntryService(db)

        # Converter Pydantic model para dict
        item_dict = item_data.model_dump(exclude_unset=True)

        # Adicionar item à entrada
        new_item = await service.add_item_to_entry(
            entry_id=entry_id,
            item_data=item_dict,
            tenant_id=tenant_id,
        )

        # Buscar dados completos do produto para response
        from sqlalchemy import select, text
        from app.models.product import Product

        product_result = await db.execute(
            select(Product).where(Product.id == new_item.product_id)
        )
        product = product_result.scalar_one_or_none()

        return EntryItemResponse(
            id=new_item.id,
            entry_id=new_item.entry_id,
            product_id=new_item.product_id,
            product_name=product.name if product else "Produto",
            product_sku=product.sku if product else None,
            product_price=product.price if product else None,
            quantity_received=new_item.quantity_received,
            quantity_remaining=new_item.quantity_remaining,
            quantity_sold=0,  # Novo item, sem vendas
            unit_cost=float(new_item.unit_cost),
            total_cost=float(new_item.quantity_received * new_item.unit_cost),
            notes=new_item.notes,
            is_active=new_item.is_active,
            created_at=new_item.created_at,
            updated_at=new_item.updated_at,
        )

    except ValueError as e:
        error_msg = str(e).lower()

        # Erro 404: Entrada ou produto não encontrado
        if "não encontrad" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e)
            )
        # Erro 400: Validação
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao adicionar item: {str(e)}"
        )
