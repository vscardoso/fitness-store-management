"""
Endpoints de viagens (Trips) - Gerenciamento de compras com viagem.

Todos os endpoints requerem autenticação.
Operações de modificação (POST, PUT, DELETE) requerem permissões de admin ou seller.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import date

from app.core.database import get_db
from app.schemas.trip import TripResponse, TripCreate, TripUpdate, TripStatusUpdate
from app.services.trip_service import TripService
from app.api.deps import get_current_active_user, require_role, get_current_tenant_id
from app.models.user import User, UserRole
from app.models.trip import TripStatus

router = APIRouter(prefix="/trips", tags=["Viagens"])


@router.post(
    "/",
    response_model=TripResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar viagem",
    description="Cria uma nova viagem de compras. Requer permissões de admin ou seller."
)
async def create_trip(
    trip_data: TripCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Cria uma nova viagem de compras.
    
    Args:
        trip_data: Dados da viagem (trip_code, destination, dates, costs)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (admin ou seller)
        
    Returns:
        TripResponse: Viagem criada com ID e total_cost calculado
        
    Raises:
        HTTPException 400: Se trip_code já existe ou dados inválidos
        HTTPException 401: Se não autenticado
        HTTPException 403: Se não tiver permissões
        
    Examples:
        POST /trips
        {
            "trip_code": "TRIP-2025-001",
            "trip_date": "2025-01-15",
            "destination": "São Paulo - SP",
            "departure_time": "2025-01-15T08:00:00",
            "return_time": "2025-01-15T18:00:00",
            "travel_cost_fuel": 250.00,
            "travel_cost_food": 80.00,
            "travel_cost_toll": 45.00,
            "status": "planned"
        }
    """
    try:
        service = TripService(db)
        trip = await service.create_trip(trip_data, current_user.id, tenant_id=tenant_id)
        await db.commit()
        await db.refresh(trip)
        return trip
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar viagem: {str(e)}"
        )


@router.get(
    "/",
    response_model=List[TripResponse],
    summary="Listar viagens",
    description="Lista viagens com filtros opcionais por status e data"
)
async def list_trips(
    skip: int = Query(0, ge=0, description="Número de registros para pular"),
    limit: int = Query(100, ge=1, le=1000, description="Limite de registros por página"),
    status_filter: Optional[TripStatus] = Query(None, alias="status", description="Filtrar por status"),
    start_date: Optional[date] = Query(None, description="Data inicial (trip_date >= start_date)"),
    end_date: Optional[date] = Query(None, description="Data final (trip_date <= end_date)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Lista viagens com filtros opcionais.
    
    Args:
        skip: Número de registros para pular (paginação)
        limit: Limite de registros por página
        status_filter: Filtrar por status (planned, in_progress, completed, cancelled)
        start_date: Data inicial para filtro
        end_date: Data final para filtro
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        List[TripResponse]: Lista de viagens encontradas
        
    Examples:
        - GET /trips?skip=0&limit=10
        - GET /trips?status=completed
        - GET /trips?start_date=2025-01-01&end_date=2025-01-31
        - GET /trips?status=in_progress&start_date=2025-01-01
    """
    try:
        service = TripService(db)
        
        # Aplicar filtros
        if status_filter or start_date or end_date:
            trips = await service.get_trips_filtered(
                status=status_filter,
                start_date=start_date,
                end_date=end_date,
                skip=skip,
                limit=limit,
                tenant_id=tenant_id,
            )
        else:
            # Lista todos
            from app.repositories.trip_repository import TripRepository
            repo = TripRepository()
            trips = await repo.get_multi(db, skip=skip, limit=limit, tenant_id=tenant_id)
        
        return trips
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar viagens: {str(e)}"
        )


@router.get(
    "/{trip_id}",
    response_model=TripResponse,
    summary="Detalhes da viagem",
    description="Retorna detalhes completos de uma viagem específica"
)
async def get_trip(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Retorna detalhes de uma viagem específica.
    
    Args:
        trip_id: ID da viagem
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        TripResponse: Dados completos da viagem
        
    Raises:
        HTTPException 404: Se viagem não encontrada
        
    Examples:
        GET /trips/1
    """
    try:
        from app.repositories.trip_repository import TripRepository
        repo = TripRepository()
        trip = await repo.get_by_id(db, trip_id, include_entries=True, tenant_id=tenant_id)
        
        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Viagem {trip_id} não encontrada"
            )
        
        return trip
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar viagem: {str(e)}"
        )


@router.get(
    "/{trip_id}/analytics",
    summary="Analytics da viagem",
    description="Retorna análises e métricas detalhadas de uma viagem"
)
async def get_trip_analytics(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Retorna análises e métricas de uma viagem.
    
    Calcula:
    - Total investido em produtos
    - ROI (Return on Investment)
    - Número de entradas e itens
    - Taxa de venda (sell-through rate)
    - Lucro total
    
    Args:
        trip_id: ID da viagem
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        Dict com análises da viagem
        
    Raises:
        HTTPException 404: Se viagem não encontrada
        
    Examples:
        GET /trips/1/analytics
        
        Response:
        {
            "trip_id": 1,
            "trip_code": "TRIP-2025-001",
            "travel_costs": 375.00,
            "products_cost": 5000.00,
            "total_cost": 5375.00,
            "revenue": 8500.00,
            "profit": 3125.00,
            "roi": 58.14,
            "entries_count": 2,
            "items_count": 15,
            "quantity_purchased": 150,
            "quantity_sold": 120,
            "quantity_remaining": 30,
            "sell_through_rate": 80.00
        }
    """
    try:
        service = TripService(db)
        analytics = await service.get_trip_analytics(trip_id, tenant_id=tenant_id)
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


@router.get(
    "/compare",
    summary="Comparar viagens",
    description="Compara múltiplas viagens lado a lado"
)
async def compare_trips(
    ids: str = Query(..., description="IDs das viagens separados por vírgula (ex: 1,2,3)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Compara múltiplas viagens lado a lado.
    
    Retorna métricas comparativas:
    - ROI de cada viagem
    - Custos totais
    - Lucros
    - Taxas de venda
    
    Args:
        ids: IDs das viagens separados por vírgula (ex: "1,2,3")
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        Dict com comparação das viagens
        
    Raises:
        HTTPException 400: Se IDs inválidos ou menos de 2 viagens
        HTTPException 404: Se alguma viagem não encontrada
        
    Examples:
        GET /trips/compare?ids=1,2,3
        
        Response:
        {
            "trips_count": 3,
            "trips": [
                {
                    "trip_id": 1,
                    "trip_code": "TRIP-2025-001",
                    "roi": 58.14,
                    "total_cost": 5375.00,
                    "profit": 3125.00,
                    "sell_through_rate": 80.00
                },
                ...
            ],
            "summary": {
                "best_roi": {"trip_id": 1, "value": 58.14},
                "best_profit": {"trip_id": 2, "value": 4500.00},
                "average_roi": 45.32,
                "total_invested": 15000.00,
                "total_profit": 10000.00
            }
        }
    """
    try:
        # Parse IDs
        try:
            trip_ids = [int(id.strip()) for id in ids.split(",")]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="IDs inválidos. Use formato: 1,2,3"
            )
        
        if len(trip_ids) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Forneça pelo menos 2 viagens para comparar"
            )
        
        if len(trip_ids) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Máximo de 10 viagens para comparar"
            )
        
        service = TripService(db)
        comparison = await service.compare_trips(trip_ids, tenant_id=tenant_id)
        return comparison
    
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao comparar viagens: {str(e)}"
        )


@router.put(
    "/{trip_id}",
    response_model=TripResponse,
    summary="Atualizar viagem",
    description="Atualiza dados completos de uma viagem. Requer permissões de admin ou seller."
)
async def update_trip(
    trip_id: int,
    trip_data: TripUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Atualiza dados de uma viagem.
    
    Campos atualizáveis:
    - trip_code, trip_date, destination
    - departure_time, return_time
    - travel_cost_* (fuel, food, toll, hotel, other)
    - status, notes
    
    Args:
        trip_id: ID da viagem
        trip_data: Dados para atualizar (apenas campos fornecidos serão atualizados)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (admin ou seller)
        
    Returns:
        TripResponse: Viagem atualizada
        
    Raises:
        HTTPException 404: Se viagem não encontrada
        HTTPException 400: Se dados inválidos
        HTTPException 403: Se não tiver permissões
        
    Examples:
        PUT /trips/1
        {
            "status": "completed",
            "travel_cost_fuel": 280.00,
            "notes": "Viagem concluída com sucesso"
        }
    """
    try:
        service = TripService(db)
        trip = await service.update_trip(trip_id, trip_data, tenant_id=tenant_id)
        await db.commit()
        await db.refresh(trip)
        return trip
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar viagem: {str(e)}"
        )


@router.put(
    "/{trip_id}/status",
    response_model=TripResponse,
    summary="Atualizar status da viagem",
    description="Atualiza apenas o status da viagem. Endpoint otimizado para mudanças de status."
)
async def update_trip_status(
    trip_id: int,
    status_data: TripStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Atualiza apenas o status de uma viagem.
    
    Status possíveis:
    - planned: Viagem planejada
    - in_progress: Viagem em andamento
    - completed: Viagem concluída
    - cancelled: Viagem cancelada
    
    Args:
        trip_id: ID da viagem
        status_data: Novo status
        db: Sessão do banco de dados
        current_user: Usuário autenticado (admin ou seller)
        
    Returns:
        TripResponse: Viagem com status atualizado
        
    Raises:
        HTTPException 404: Se viagem não encontrada
        HTTPException 400: Se status inválido
        
    Examples:
        PUT /trips/1/status
        {
            "status": "completed"
        }
    """
    try:
        service = TripService(db)
        trip = await service.update_trip_status(trip_id, status_data.status, tenant_id=tenant_id)
        await db.commit()
        await db.refresh(trip)
        return trip
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar status: {str(e)}"
        )


@router.delete(
    "/{trip_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deletar viagem",
    description="Faz soft delete de uma viagem. Requer permissões de admin."
)
async def delete_trip(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Deleta uma viagem (soft delete).
    
    A viagem é marcada como inativa (is_active = False) mas não é
    removida fisicamente do banco de dados.
    
    ⚠️ ATENÇÃO: Se a viagem possui stock_entries associados,
    a deleção pode falhar devido a integridade referencial.
    
    Args:
        trip_id: ID da viagem
        db: Sessão do banco de dados
        current_user: Usuário autenticado (apenas admin)
        
    Returns:
        HTTP 204 No Content
        
    Raises:
        HTTPException 404: Se viagem não encontrada
        HTTPException 400: Se viagem possui entradas associadas
        HTTPException 403: Se não for admin
        
    Examples:
        DELETE /trips/1
    """
    try:
        service = TripService(db)
        await service.delete_trip(trip_id, tenant_id=tenant_id)
        await db.commit()
        return None
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        await db.rollback()
        
        # Verificar se é erro de integridade referencial
        error_msg = str(e).lower()
        if "foreign key" in error_msg or "constraint" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível deletar viagem com entradas de estoque associadas"
            )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar viagem: {str(e)}"
        )
