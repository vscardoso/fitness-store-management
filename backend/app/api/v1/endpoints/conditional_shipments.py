"""
Endpoints de envios condicionais (try before you buy).
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.schemas.conditional_shipment import (
    ConditionalShipmentCreate,
    ConditionalShipmentResponse,
    ConditionalShipmentListResponse,
    ConditionalShipmentUpdate,
    ProcessReturnRequest,
    ConditionalShipmentFilters,
)
from app.services.conditional_shipment import ConditionalShipmentService
from app.repositories.conditional_shipment import ConditionalShipmentRepository
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User

router = APIRouter(prefix="/conditional-shipments", tags=["Envios Condicionais"])


@router.post(
    "/",
    response_model=ConditionalShipmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar envio condicional",
    description="Cria envio condicional (try before you buy) e reserva estoque"
)
async def create_conditional_shipment(
    shipment_data: ConditionalShipmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Criar envio condicional.
    
    Processo:
    1. Valida estoque disponível
    2. Cria envio com itens
    3. Reserva estoque (decrementa quantity)
    4. Define status SENT e prazo de devolução
    
    Args:
        shipment_data: Dados do envio (customer_id, items, shipping_address, deadline_days)
        
    Returns:
        ConditionalShipmentResponse com dados completos
        
    Raises:
        HTTPException 400: Estoque insuficiente ou dados inválidos
        HTTPException 401: Não autenticado
    """
    service = ConditionalShipmentService()
    
    try:
        shipment = await service.create_shipment(
            db, tenant_id, current_user.id, shipment_data
        )
        
        # Buscar com dados completos
        details = await service.get_shipment_with_details(db, shipment.id, tenant_id)
        
        return ConditionalShipmentResponse(
            **shipment.__dict__,
            customer_name=details["customer"].full_name if details["customer"] else None,
            customer_phone=details["customer"].phone if details["customer"] else None,
            items=[
                {
                    **item["item"].__dict__,
                    "product_name": item["product"].name if item["product"] else None,
                    "product_sku": item["product"].sku if item["product"] else None,
                }
                for item in details["items"]
            ]
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar envio condicional: {str(e)}"
        )


@router.get(
    "/",
    response_model=List[ConditionalShipmentListResponse],
    summary="Listar envios condicionais",
    description="Lista envios com filtros (status, customer, overdue)"
)
async def list_conditional_shipments(
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[int] = Query(None),
    is_overdue: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Listar envios condicionais com filtros.
    
    Filtros disponíveis:
    - status: PENDING, SENT, PARTIAL_RETURN, COMPLETED, CANCELLED, OVERDUE
    - customer_id: Filtrar por cliente específico
    - is_overdue: true/false para mostrar apenas atrasados
    - skip/limit: Paginação
    
    Returns:
        Lista de ConditionalShipmentListResponse (sem itens detalhados)
    """
    repo = ConditionalShipmentRepository()
    service = ConditionalShipmentService()
    
    try:
        # Atualizar envios atrasados antes de listar
        await service.check_overdue_shipments(db, tenant_id)
        
        shipments = await repo.list_by_tenant(
            db,
            tenant_id,
            status=status_filter,
            customer_id=customer_id,
            is_overdue=is_overdue,
            skip=skip,
            limit=limit,
        )
        
        # Enriquecer com dados de customer
        from app.repositories.customer import CustomerRepository
        customer_repo = CustomerRepository()
        
        result = []
        for shipment in shipments:
            customer = await customer_repo.get(db, shipment.customer_id, tenant_id=tenant_id)
            result.append(
                ConditionalShipmentListResponse(
                    **shipment.__dict__,
                    customer_name=customer.full_name if customer else None,
                    customer_phone=customer.phone if customer else None,
                )
            )
        
        return result
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar envios: {str(e)}"
        )


@router.get(
    "/{shipment_id}",
    response_model=ConditionalShipmentResponse,
    summary="Buscar envio por ID",
    description="Retorna envio com itens e dados completos"
)
async def get_conditional_shipment(
    shipment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Buscar envio condicional por ID.
    
    Returns:
        ConditionalShipmentResponse com todos os itens e dados de customer/produtos
        
    Raises:
        HTTPException 404: Envio não encontrado
    """
    service = ConditionalShipmentService()
    
    details = await service.get_shipment_with_details(db, shipment_id, tenant_id)
    
    if not details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Envio {shipment_id} não encontrado"
        )
    
    shipment = details["shipment"]
    customer = details["customer"]
    
    return ConditionalShipmentResponse(
        **shipment.__dict__,
        customer_name=customer.full_name if customer else None,
        customer_phone=customer.phone if customer else None,
        items=[
            {
                **item["item"].__dict__,
                "product_name": item["product"].name if item["product"] else None,
                "product_sku": item["product"].sku if item["product"] else None,
            }
            for item in details["items"]
        ]
    )


@router.put(
    "/{shipment_id}/process-return",
    response_model=ConditionalShipmentResponse,
    summary="Processar devolução",
    description="Processa devolução de itens, atualiza estoque e opcionalmente cria venda"
)
async def process_return(
    shipment_id: int,
    return_data: ProcessReturnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Processar devolução de envio condicional.
    
    Processo:
    1. Valida quantidades (kept + returned <= sent)
    2. Atualiza status dos itens
    3. Devolve estoque dos itens returned
    4. Se create_sale=true e houver itens kept, cria venda automática
    5. Atualiza status do shipment (PARTIAL_RETURN, COMPLETED ou CANCELLED)
    
    Args:
        shipment_id: ID do envio
        return_data: Lista de itens com quantity_kept e quantity_returned
        
    Returns:
        ConditionalShipmentResponse atualizado
        
    Raises:
        HTTPException 400: Quantidades inválidas ou status não permite processamento
        HTTPException 404: Envio não encontrado
    """
    service = ConditionalShipmentService()
    
    try:
        shipment = await service.process_return(
            db, shipment_id, tenant_id, current_user.id, return_data
        )
        
        # Retornar com dados completos
        details = await service.get_shipment_with_details(db, shipment.id, tenant_id)
        
        return ConditionalShipmentResponse(
            **shipment.__dict__,
            customer_name=details["customer"].full_name if details["customer"] else None,
            customer_phone=details["customer"].phone if details["customer"] else None,
            items=[
                {
                    **item["item"].__dict__,
                    "product_name": item["product"].name if item["product"] else None,
                    "product_sku": item["product"].sku if item["product"] else None,
                }
                for item in details["items"]
            ]
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao processar devolução: {str(e)}"
        )


@router.delete(
    "/{shipment_id}",
    status_code=status.HTTP_200_OK,
    summary="Cancelar envio",
    description="Cancela envio e devolve estoque"
)
async def cancel_conditional_shipment(
    shipment_id: int,
    reason: str = Query(..., min_length=5, description="Motivo do cancelamento"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Cancelar envio condicional.
    
    Processo:
    1. Valida se envio pode ser cancelado (status PENDING ou SENT)
    2. Devolve estoque de todos os itens não processados
    3. Atualiza status para CANCELLED
    
    Args:
        shipment_id: ID do envio
        reason: Motivo do cancelamento (mínimo 5 caracteres)
        
    Returns:
        {"message": "Envio cancelado com sucesso"}
        
    Raises:
        HTTPException 400: Status não permite cancelamento
        HTTPException 404: Envio não encontrado
    """
    service = ConditionalShipmentService()
    
    try:
        await service.cancel_shipment(
            db, shipment_id, tenant_id, current_user.id, reason
        )
        
        return {"message": f"Envio #{shipment_id} cancelado com sucesso"}
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao cancelar envio: {str(e)}"
        )


@router.get(
    "/overdue/check",
    response_model=List[ConditionalShipmentListResponse],
    summary="Checar envios atrasados",
    description="Retorna e atualiza todos os envios com deadline vencido"
)
async def check_overdue_shipments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Verificar envios atrasados.
    
    Retorna todos os envios com deadline vencido e atualiza status para OVERDUE.
    Útil para rodar periodicamente (cron job) ou ao carregar tela de listagem.
    
    Returns:
        Lista de envios atrasados
    """
    service = ConditionalShipmentService()
    
    try:
        overdue = await service.check_overdue_shipments(db, tenant_id)
        
        # Enriquecer com customer
        from app.repositories.customer import CustomerRepository
        customer_repo = CustomerRepository()
        
        result = []
        for shipment in overdue:
            customer = await customer_repo.get(db, shipment.customer_id, tenant_id=tenant_id)
            result.append(
                ConditionalShipmentListResponse(
                    **shipment.__dict__,
                    customer_name=customer.full_name if customer else None,
                    customer_phone=customer.phone if customer else None,
                )
            )
        
        return result
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao checar envios atrasados: {str(e)}"
        )
