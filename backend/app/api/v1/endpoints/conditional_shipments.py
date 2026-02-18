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
    MarkAsSentRequest,
    ConditionalShipmentFilters,
)
from app.services.conditional_shipment import ConditionalShipmentService
from app.services.conditional_notification_service import ConditionalNotificationService
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
        shipment_full = details["shipment"]
        customer = details["customer"]

        # Construir lista de items manualmente
        items_list = []
        for item_data in details["items"]:
            db_item = item_data["item"]
            product = item_data["product"]

            items_list.append({
                "id": db_item.id,
                "shipment_id": db_item.shipment_id,
                "product_id": db_item.product_id,
                "quantity_sent": db_item.quantity_sent,
                "quantity_kept": db_item.quantity_kept,
                "quantity_returned": db_item.quantity_returned,
                "quantity_pending": db_item.quantity_pending,
                "status": db_item.status,
                "unit_price": db_item.unit_price,
                "notes": db_item.notes,
                "total_value": db_item.total_value,
                "kept_value": db_item.kept_value,
                "product_name": product.name if product else None,
                "product_sku": product.sku if product else None,
                "created_at": db_item.created_at,
                "updated_at": db_item.updated_at,
            })

        return ConditionalShipmentResponse(
            id=shipment_full.id,
            tenant_id=shipment_full.tenant_id,
            customer_id=shipment_full.customer_id,
            status=shipment_full.status,
            scheduled_ship_date=shipment_full.scheduled_ship_date,
            sent_at=shipment_full.sent_at,
            departure_datetime=shipment_full.departure_datetime,
            return_datetime=shipment_full.return_datetime,
            deadline_type=shipment_full.deadline_type,
            deadline_value=shipment_full.deadline_value,
            deadline=shipment_full.deadline,
            returned_at=shipment_full.returned_at,
            completed_at=shipment_full.completed_at,
            carrier=shipment_full.carrier,
            tracking_code=shipment_full.tracking_code,
            shipping_address=shipment_full.shipping_address,
            notes=shipment_full.notes,
            is_overdue=shipment_full.is_overdue,
            days_remaining=shipment_full.days_remaining,
            total_items_sent=shipment_full.total_items_sent,
            total_items_kept=shipment_full.total_items_kept,
            total_items_returned=shipment_full.total_items_returned,
            total_value_sent=shipment_full.total_value_sent,
            total_value_kept=shipment_full.total_value_kept,
            customer_name=customer.full_name if customer else None,
            customer_phone=customer.phone if customer else None,
            created_at=shipment_full.created_at,
            updated_at=shipment_full.updated_at,
            is_active=shipment_full.is_active,
            items=items_list
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
        from app.repositories.customer_repository import CustomerRepository
        customer_repo = CustomerRepository(db)
        
        result = []
        for shipment in shipments:
            customer = await customer_repo.get(db, shipment.customer_id, tenant_id=tenant_id)
            result.append(
                ConditionalShipmentListResponse(
                    id=shipment.id,
                    customer_id=shipment.customer_id,
                    customer_name=customer.full_name if customer else None,
                    customer_phone=customer.phone if customer else None,
                    status=shipment.status,
                    deadline=shipment.deadline,
                    is_overdue=shipment.is_overdue,
                    days_remaining=shipment.days_remaining,
                    total_items_sent=shipment.total_items_sent,
                    total_items_kept=shipment.total_items_kept,
                    total_items_returned=shipment.total_items_returned,
                    total_value_sent=shipment.total_value_sent,
                    total_value_kept=shipment.total_value_kept,
                    created_at=shipment.created_at,
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
    
    # Construir lista de items manualmente (sem usar __dict__ que causa problemas de serialização)
    items_list = []
    for item_data in details["items"]:
        db_item = item_data["item"]
        product = item_data["product"]

        items_list.append({
            "id": db_item.id,
            "shipment_id": db_item.shipment_id,
            "product_id": db_item.product_id,
            "quantity_sent": db_item.quantity_sent,
            "quantity_kept": db_item.quantity_kept,
            "quantity_returned": db_item.quantity_returned,
            "quantity_pending": db_item.quantity_pending,
            "status": db_item.status,
            "unit_price": db_item.unit_price,
            "notes": db_item.notes,
            "total_value": db_item.total_value,
            "kept_value": db_item.kept_value,
            "product_name": product.name if product else None,
            "product_sku": product.sku if product else None,
            "created_at": db_item.created_at,
            "updated_at": db_item.updated_at,
        })

    return ConditionalShipmentResponse(
        id=shipment.id,
        tenant_id=shipment.tenant_id,
        customer_id=shipment.customer_id,
        status=shipment.status,
        scheduled_ship_date=shipment.scheduled_ship_date,
        sent_at=shipment.sent_at,
        departure_datetime=shipment.departure_datetime,
        return_datetime=shipment.return_datetime,
        deadline_type=shipment.deadline_type,
        deadline_value=shipment.deadline_value,
        deadline=shipment.deadline,
        returned_at=shipment.returned_at,
        completed_at=shipment.completed_at,
        carrier=shipment.carrier,
        tracking_code=shipment.tracking_code,
        shipping_address=shipment.shipping_address,
        notes=shipment.notes,
        is_overdue=shipment.is_overdue,
        days_remaining=shipment.days_remaining,
        total_items_sent=shipment.total_items_sent,
        total_items_kept=shipment.total_items_kept,
        total_items_returned=shipment.total_items_returned,
        total_value_sent=shipment.total_value_sent,
        total_value_kept=shipment.total_value_kept,
        customer_name=customer.full_name if customer else None,
        customer_phone=customer.phone if customer else None,
        created_at=shipment.created_at,
        updated_at=shipment.updated_at,
        is_active=shipment.is_active,
        items=items_list
    )


@router.put(
    "/{shipment_id}/mark-as-sent",
    response_model=ConditionalShipmentResponse,
    summary="Marcar como enviado",
    description="Marca envio como SENT (saiu da loja) e define deadline"
)
async def mark_as_sent(
    shipment_id: int,
    sent_data: MarkAsSentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Marcar envio como SENT (saiu da loja).

    Processo:
    1. Valida que envio está PENDING
    2. Atualiza status para SENT
    3. Define deadline (7 dias padrão)
    4. Registra informações de envio (transportadora, rastreio)

    Args:
        shipment_id: ID do envio
        sent_data: Dados do envio (carrier, tracking_code, sent_notes)

    Returns:
        ConditionalShipmentResponse atualizado

    Raises:
        HTTPException 400: Status não é PENDING
        HTTPException 404: Envio não encontrado
    """
    service = ConditionalShipmentService()

    try:
        shipment = await service.mark_as_sent(
            db,
            shipment_id,
            tenant_id,
            current_user.id,
            carrier=sent_data.carrier,
            tracking_code=sent_data.tracking_code,
            sent_notes=sent_data.sent_notes,
        )

        # Retornar com dados completos
        details = await service.get_shipment_with_details(db, shipment.id, tenant_id)
        shipment_full = details["shipment"]
        customer = details["customer"]

        # Construir lista de items manualmente
        items_list = []
        for item_data in details["items"]:
            db_item = item_data["item"]
            product = item_data["product"]

            items_list.append({
                "id": db_item.id,
                "shipment_id": db_item.shipment_id,
                "product_id": db_item.product_id,
                "quantity_sent": db_item.quantity_sent,
                "quantity_kept": db_item.quantity_kept,
                "quantity_returned": db_item.quantity_returned,
                "quantity_pending": db_item.quantity_pending,
                "status": db_item.status,
                "unit_price": db_item.unit_price,
                "notes": db_item.notes,
                "total_value": db_item.total_value,
                "kept_value": db_item.kept_value,
                "product_name": product.name if product else None,
                "product_sku": product.sku if product else None,
                "created_at": db_item.created_at,
                "updated_at": db_item.updated_at,
            })

        return ConditionalShipmentResponse(
            id=shipment_full.id,
            tenant_id=shipment_full.tenant_id,
            customer_id=shipment_full.customer_id,
            status=shipment_full.status,
            scheduled_ship_date=shipment_full.scheduled_ship_date,
            sent_at=shipment_full.sent_at,
            departure_datetime=shipment_full.departure_datetime,
            return_datetime=shipment_full.return_datetime,
            deadline_type=shipment_full.deadline_type,
            deadline_value=shipment_full.deadline_value,
            deadline=shipment_full.deadline,
            returned_at=shipment_full.returned_at,
            completed_at=shipment_full.completed_at,
            carrier=shipment_full.carrier,
            tracking_code=shipment_full.tracking_code,
            shipping_address=shipment_full.shipping_address,
            notes=shipment_full.notes,
            is_overdue=shipment_full.is_overdue,
            days_remaining=shipment_full.days_remaining,
            total_items_sent=shipment_full.total_items_sent,
            total_items_kept=shipment_full.total_items_kept,
            total_items_returned=shipment_full.total_items_returned,
            total_value_sent=shipment_full.total_value_sent,
            total_value_kept=shipment_full.total_value_kept,
            customer_name=customer.full_name if customer else None,
            customer_phone=customer.phone if customer else None,
            created_at=shipment_full.created_at,
            updated_at=shipment_full.updated_at,
            is_active=shipment_full.is_active,
            items=items_list
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao marcar envio como enviado: {str(e)}"
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
        shipment_full = details["shipment"]
        customer = details["customer"]

        # Construir lista de items manualmente
        items_list = []
        for item_data in details["items"]:
            db_item = item_data["item"]
            product = item_data["product"]

            items_list.append({
                "id": db_item.id,
                "shipment_id": db_item.shipment_id,
                "product_id": db_item.product_id,
                "quantity_sent": db_item.quantity_sent,
                "quantity_kept": db_item.quantity_kept,
                "quantity_returned": db_item.quantity_returned,
                "quantity_pending": db_item.quantity_pending,
                "status": db_item.status,
                "unit_price": db_item.unit_price,
                "notes": db_item.notes,
                "total_value": db_item.total_value,
                "kept_value": db_item.kept_value,
                "product_name": product.name if product else None,
                "product_sku": product.sku if product else None,
                "created_at": db_item.created_at,
                "updated_at": db_item.updated_at,
            })

        return ConditionalShipmentResponse(
            id=shipment_full.id,
            tenant_id=shipment_full.tenant_id,
            customer_id=shipment_full.customer_id,
            status=shipment_full.status,
            scheduled_ship_date=shipment_full.scheduled_ship_date,
            sent_at=shipment_full.sent_at,
            departure_datetime=shipment_full.departure_datetime,
            return_datetime=shipment_full.return_datetime,
            deadline_type=shipment_full.deadline_type,
            deadline_value=shipment_full.deadline_value,
            deadline=shipment_full.deadline,
            returned_at=shipment_full.returned_at,
            completed_at=shipment_full.completed_at,
            carrier=shipment_full.carrier,
            tracking_code=shipment_full.tracking_code,
            shipping_address=shipment_full.shipping_address,
            notes=shipment_full.notes,
            is_overdue=shipment_full.is_overdue,
            days_remaining=shipment_full.days_remaining,
            total_items_sent=shipment_full.total_items_sent,
            total_items_kept=shipment_full.total_items_kept,
            total_items_returned=shipment_full.total_items_returned,
            total_value_sent=shipment_full.total_value_sent,
            total_value_kept=shipment_full.total_value_kept,
            customer_name=customer.full_name if customer else None,
            customer_phone=customer.phone if customer else None,
            created_at=shipment_full.created_at,
            updated_at=shipment_full.updated_at,
            is_active=shipment_full.is_active,
            items=items_list
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


@router.put(
    "/{shipment_id}",
    response_model=ConditionalShipmentResponse,
    summary="Atualizar envio",
    description="Atualiza informações básicas do envio (status, endereço, observações)"
)
async def update_conditional_shipment(
    shipment_id: int,
    update_data: ConditionalShipmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Atualizar informações básicas do envio.

    Permite atualizar:
    - Status (PENDING, SENT, PARTIAL_RETURN, COMPLETED, CANCELLED, OVERDUE)
    - Endereço de entrega
    - Observações

    Args:
        shipment_id: ID do envio
        update_data: Dados a atualizar

    Returns:
        ConditionalShipmentResponse atualizado

    Raises:
        HTTPException 404: Envio não encontrado
        HTTPException 400: Dados inválidos
    """
    service = ConditionalShipmentService()

    try:
        # Buscar envio
        shipment = await service.shipment_repo.get(db, shipment_id, tenant_id=tenant_id)
        if not shipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Envio #{shipment_id} não encontrado"
            )

        # Atualizar campos fornecidos
        if update_data.status:
            shipment.status = update_data.status
        if update_data.shipping_address:
            shipment.shipping_address = update_data.shipping_address
        if update_data.notes is not None:
            shipment.notes = update_data.notes

        await db.commit()
        await db.refresh(shipment)

        # Retornar com dados completos
        details = await service.get_shipment_with_details(db, shipment.id, tenant_id)
        shipment_full = details["shipment"]
        customer = details["customer"]

        # Construir lista de items
        items_list = []
        for item_data in details["items"]:
            db_item = item_data["item"]
            product = item_data["product"]

            items_list.append({
                "id": db_item.id,
                "shipment_id": db_item.shipment_id,
                "product_id": db_item.product_id,
                "quantity_sent": db_item.quantity_sent,
                "quantity_kept": db_item.quantity_kept,
                "quantity_returned": db_item.quantity_returned,
                "quantity_pending": db_item.quantity_pending,
                "status": db_item.status,
                "unit_price": db_item.unit_price,
                "notes": db_item.notes,
                "total_value": db_item.total_value,
                "kept_value": db_item.kept_value,
                "product_name": product.name if product else None,
                "product_sku": product.sku if product else None,
                "created_at": db_item.created_at,
                "updated_at": db_item.updated_at,
            })

        return ConditionalShipmentResponse(
            id=shipment_full.id,
            tenant_id=shipment_full.tenant_id,
            customer_id=shipment_full.customer_id,
            status=shipment_full.status,
            scheduled_ship_date=shipment_full.scheduled_ship_date,
            sent_at=shipment_full.sent_at,
            departure_datetime=shipment_full.departure_datetime,
            return_datetime=shipment_full.return_datetime,
            deadline_type=shipment_full.deadline_type,
            deadline_value=shipment_full.deadline_value,
            deadline=shipment_full.deadline,
            returned_at=shipment_full.returned_at,
            completed_at=shipment_full.completed_at,
            carrier=shipment_full.carrier,
            tracking_code=shipment_full.tracking_code,
            shipping_address=shipment_full.shipping_address,
            notes=shipment_full.notes,
            is_overdue=shipment_full.is_overdue,
            days_remaining=shipment_full.days_remaining,
            total_items_sent=shipment_full.total_items_sent,
            total_items_kept=shipment_full.total_items_kept,
            total_items_returned=shipment_full.total_items_returned,
            total_value_sent=shipment_full.total_value_sent,
            total_value_kept=shipment_full.total_value_kept,
            customer_name=customer.full_name if customer else None,
            customer_phone=customer.phone if customer else None,
            created_at=shipment_full.created_at,
            updated_at=shipment_full.updated_at,
            is_active=shipment_full.is_active,
            items=items_list
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar envio: {str(e)}"
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
        from app.repositories.customer_repository import CustomerRepository
        customer_repo = CustomerRepository(db)

        result = []
        for shipment in overdue:
            customer = await customer_repo.get(db, shipment.customer_id, tenant_id=tenant_id)
            result.append(
                ConditionalShipmentListResponse(
                    id=shipment.id,
                    customer_id=shipment.customer_id,
                    customer_name=customer.full_name if customer else None,
                    customer_phone=customer.phone if customer else None,
                    status=shipment.status,
                    deadline=shipment.deadline,
                    is_overdue=shipment.is_overdue,
                    days_remaining=shipment.days_remaining,
                    total_items_sent=shipment.total_items_sent,
                    total_items_kept=shipment.total_items_kept,
                    total_items_returned=shipment.total_items_returned,
                    total_value_sent=shipment.total_value_sent,
                    total_value_kept=shipment.total_value_kept,
                    created_at=shipment.created_at,
                )
            )

        return result

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao checar envios atrasados: {str(e)}"
        )


@router.post(
    "/{shipment_id}/postpone-departure",
    response_model=ConditionalShipmentResponse,
    summary="Protelar SLA de envio"
)
async def postpone_departure_sla(
    shipment_id: int,
    minutes: int = Query(30, ge=5, le=1440, description="Minutos para protelar (5-1440)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Protelar SLA de envio"""
    service = ConditionalNotificationService()
    try:
        shipment = await service.postpone_departure(db, shipment_id, tenant_id, minutes)
        details = await ConditionalShipmentService().get_shipment_with_details(db, shipment.id, tenant_id)
        shipment_full = details["shipment"]
        customer = details["customer"]

        items_list = []
        for item_data in details["items"]:
            db_item = item_data["item"]
            product = item_data["product"]
            items_list.append({
                "id": db_item.id,
                "shipment_id": db_item.shipment_id,
                "product_id": db_item.product_id,
                "quantity_sent": db_item.quantity_sent,
                "quantity_kept": db_item.quantity_kept,
                "quantity_returned": db_item.quantity_returned,
                "quantity_pending": db_item.quantity_pending,
                "status": db_item.status,
                "unit_price": db_item.unit_price,
                "notes": db_item.notes,
                "total_value": db_item.total_value,
                "kept_value": db_item.kept_value,
                "product_name": product.name if product else None,
                "product_sku": product.sku if product else None,
                "created_at": db_item.created_at,
                "updated_at": db_item.updated_at,
            })

        return ConditionalShipmentResponse(
            id=shipment_full.id,
            tenant_id=shipment_full.tenant_id,
            customer_id=shipment_full.customer_id,
            status=shipment_full.status,
            scheduled_ship_date=shipment_full.scheduled_ship_date,
            sent_at=shipment_full.sent_at,
            departure_datetime=shipment_full.departure_datetime,
            return_datetime=shipment_full.return_datetime,
            deadline_type=shipment_full.deadline_type,
            deadline_value=shipment_full.deadline_value,
            deadline=shipment_full.deadline,
            returned_at=shipment_full.returned_at,
            completed_at=shipment_full.completed_at,
            carrier=shipment_full.carrier,
            tracking_code=shipment_full.tracking_code,
            shipping_address=shipment_full.shipping_address,
            notes=shipment_full.notes,
            is_overdue=shipment_full.is_overdue,
            days_remaining=shipment_full.days_remaining,
            total_items_sent=shipment_full.total_items_sent,
            total_items_kept=shipment_full.total_items_kept,
            total_items_returned=shipment_full.total_items_returned,
            total_value_sent=shipment_full.total_value_sent,
            total_value_kept=shipment_full.total_value_kept,
            customer_name=customer.full_name if customer else None,
            customer_phone=customer.phone if customer else None,
            created_at=shipment_full.created_at,
            updated_at=shipment_full.updated_at,
            is_active=shipment_full.is_active,
            items=items_list
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/{shipment_id}/postpone-return",
    response_model=ConditionalShipmentResponse,
    summary="Protelar SLA de retorno"
)
async def postpone_return_sla(
    shipment_id: int,
    minutes: int = Query(30, ge=5, le=1440),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """Protelar SLA de retorno"""
    service = ConditionalNotificationService()
    try:
        shipment = await service.postpone_return(db, shipment_id, tenant_id, minutes)
        details = await ConditionalShipmentService().get_shipment_with_details(db, shipment.id, tenant_id)
        shipment_full = details["shipment"]
        customer = details["customer"]

        items_list = []
        for item_data in details["items"]:
            db_item = item_data["item"]
            product = item_data["product"]
            items_list.append({
                "id": db_item.id,
                "shipment_id": db_item.shipment_id,
                "product_id": db_item.product_id,
                "quantity_sent": db_item.quantity_sent,
                "quantity_kept": db_item.quantity_kept,
                "quantity_returned": db_item.quantity_returned,
                "quantity_pending": db_item.quantity_pending,
                "status": db_item.status,
                "unit_price": db_item.unit_price,
                "notes": db_item.notes,
                "total_value": db_item.total_value,
                "kept_value": db_item.kept_value,
                "product_name": product.name if product else None,
                "product_sku": product.sku if product else None,
                "created_at": db_item.created_at,
                "updated_at": db_item.updated_at,
            })

        return ConditionalShipmentResponse(
            id=shipment_full.id,
            tenant_id=shipment_full.tenant_id,
            customer_id=shipment_full.customer_id,
            status=shipment_full.status,
            scheduled_ship_date=shipment_full.scheduled_ship_date,
            sent_at=shipment_full.sent_at,
            departure_datetime=shipment_full.departure_datetime,
            return_datetime=shipment_full.return_datetime,
            deadline_type=shipment_full.deadline_type,
            deadline_value=shipment_full.deadline_value,
            deadline=shipment_full.deadline,
            returned_at=shipment_full.returned_at,
            completed_at=shipment_full.completed_at,
            carrier=shipment_full.carrier,
            tracking_code=shipment_full.tracking_code,
            shipping_address=shipment_full.shipping_address,
            notes=shipment_full.notes,
            is_overdue=shipment_full.is_overdue,
            days_remaining=shipment_full.days_remaining,
            total_items_sent=shipment_full.total_items_sent,
            total_items_kept=shipment_full.total_items_kept,
            total_items_returned=shipment_full.total_items_returned,
            total_value_sent=shipment_full.total_value_sent,
            total_value_kept=shipment_full.total_value_kept,
            customer_name=customer.full_name if customer else None,
            customer_phone=customer.phone if customer else None,
            created_at=shipment_full.created_at,
            updated_at=shipment_full.updated_at,
            is_active=shipment_full.is_active,
            items=items_list
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/sla/check-notifications", summary="Verificar e enviar notificações SLA")
async def check_sla_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Verifica SLAs e envia notificações (rodar via cron a cada 1 min)"""
    service = ConditionalNotificationService()
    result = await service.check_and_send_sla_notifications(db)
    return result


@router.post(
    "/notifications/send-periodic",
    summary="Enviar notificações periódicas de envios pendentes e atrasados",
    description="Envia resumo de envios pendentes e alertas críticos de envios atrasados (ADMIN apenas)"
)
async def send_periodic_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Enviar notificações periódicas consolidadas.

    Este endpoint deve ser chamado periodicamente (ex: diariamente às 9h) via cron/scheduler.
    Apenas usuários ADMIN podem chamar.

    Processo:
    1. Busca todos envios PENDING e agrupa por tenant
    2. Envia notificação de lembrete: "Você tem X envios pendentes"
    3. Busca todos envios OVERDUE (atrasados) e agrupa por tenant
    4. Envia alerta crítico: "️ X envios estão atrasados!" com lista de clientes

    Returns:
        Estatísticas detalhadas:
        - pending_notifications: resultados dos lembretes de envios pendentes
        - overdue_notifications: resultados dos alertas de envios atrasados
        - summary: resumo consolidado

    Raises:
        HTTPException 403: Usuário não é ADMIN
    """
    # Verificar se usuário é ADMIN
    if current_user.role != 'ADMIN':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem enviar notificações periódicas"
        )

    service = ConditionalNotificationService()

    try:
        # Enviar notificações de envios pendentes
        pending_result = await service.send_pending_shipments_reminder(db)

        # Enviar alertas de envios atrasados
        overdue_result = await service.send_overdue_shipments_alert(db)

        # Consolidar estatísticas
        total_sent = pending_result['sent_count'] + overdue_result['sent_count']
        total_failed = pending_result['failed_count'] + overdue_result['failed_count']
        all_errors = pending_result.get('errors', []) + overdue_result.get('errors', [])

        return {
            'pending_notifications': {
                'total_tenants': pending_result['total_tenants'],
                'total_shipments': pending_result['total_shipments'],
                'sent_count': pending_result['sent_count'],
                'failed_count': pending_result['failed_count'],
                'errors': pending_result.get('errors', [])
            },
            'overdue_notifications': {
                'total_tenants': overdue_result['total_tenants'],
                'total_shipments': overdue_result['total_shipments'],
                'sent_count': overdue_result['sent_count'],
                'failed_count': overdue_result['failed_count'],
                'errors': overdue_result.get('errors', [])
            },
            'summary': {
                'total_notifications_sent': total_sent,
                'total_notifications_failed': total_failed,
                'total_errors': len(all_errors),
                'success': total_sent > 0 and total_failed == 0,
                'timestamp': datetime.utcnow().isoformat()
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao enviar notificações periódicas: {str(e)}"
        )
