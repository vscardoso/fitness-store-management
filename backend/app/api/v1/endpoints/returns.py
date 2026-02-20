"""
Endpoints de devolução de vendas.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.schemas.return_schema import (
    SaleReturnCreate,
    SaleReturnResponse,
    ReturnEligibilityResponse,
)
from app.services.return_service import ReturnService
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User

router = APIRouter(prefix="/returns", tags=["Devoluções"])


@router.get(
    "/eligibility/{sale_id}",
    response_model=ReturnEligibilityResponse,
    summary="Verificar elegibilidade para devolução",
    description="Verifica se uma venda pode ser devolvida e lista itens disponíveis"
)
async def check_return_eligibility(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Verifica se uma venda é elegível para devolução.
    
    Regras:
    - Venda deve estar COMPLETED
    - Venda deve ter no máximo 7 dias
    - Venda não pode ter sido totalmente devolvida
    
    Returns:
        ReturnEligibilityResponse com:
        - is_eligible: True se pode devolver
        - reason: Motivo se não elegível
        - items: Lista de itens que podem ser devolvidos
    """
    return_service = ReturnService(db)
    
    try:
        eligibility = await return_service.check_eligibility(
            sale_id,
            tenant_id=tenant_id,
        )
        return eligibility
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao verificar elegibilidade: {str(e)}"
        )


@router.post(
    "/{sale_id}",
    response_model=SaleReturnResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Processar devolução",
    description="Processa devolução parcial ou total de uma venda"
)
async def process_return(
    sale_id: int,
    return_data: SaleReturnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Processa uma devolução de venda.
    
    Processo:
    1. Valida elegibilidade (7 dias, status COMPLETED)
    2. Valida quantidades solicitadas
    3. Calcula valor do reembolso
    4. Devolve ao estoque via FIFO
    5. Estorna pontos de fidelidade (proporcional)
    6. Cria registro de devolução
    7. Atualiza status da venda (se total)
    
    Args:
        sale_id: ID da venda
        return_data: Dados da devolução
            - items: Lista de itens a devolver
            - reason: Motivo da devolução (obrigatório)
            - refund_method: Método de reembolso (opcional)
    
    Returns:
        SaleReturnResponse com dados da devolução processada
        
    Raises:
        HTTPException 400: Se validações falharem
        HTTPException 500: Se houver erro no processamento
    """
    return_service = ReturnService(db)
    
    try:
        sale_return = await return_service.process_return(
            sale_id=sale_id,
            return_data=return_data,
            processed_by_id=current_user.id,
            tenant_id=tenant_id,
        )
        return sale_return
        
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


@router.get(
    "/history/{sale_id}",
    response_model=List[SaleReturnResponse],
    summary="Histórico de devoluções",
    description="Lista todas as devoluções de uma venda"
)
async def get_return_history(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    """
    Busca histórico de devoluções de uma venda.
    
    Args:
        sale_id: ID da venda
        
    Returns:
        Lista de devoluções da venda
    """
    return_service = ReturnService(db)
    
    try:
        history = await return_service.get_return_history(
            sale_id,
            tenant_id=tenant_id,
        )
        return history
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar histórico: {str(e)}"
        )