"""
Endpoints de gerenciamento de descontos por forma de pagamento.

Este módulo implementa a API REST para CRUD completo de descontos
por forma de pagamento, incluindo cálculo automático de valores.

Endpoints:
    - GET /payment-discounts/: Listar todos os descontos
    - GET /payment-discounts/{discount_id}: Obter desconto específico
    - GET /payment-discounts/method/{payment_method}: Obter desconto por forma de pagamento
    - POST /payment-discounts/calculate: Calcular desconto para valor
    - POST /payment-discounts/: Criar novo desconto
    - PUT /payment-discounts/{discount_id}: Atualizar desconto
    - DELETE /payment-discounts/{discount_id}: Deletar desconto (soft delete)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from decimal import Decimal

from app.core.database import get_db
from app.schemas.payment_discount import (
    PaymentDiscountCreate,
    PaymentDiscountUpdate,
    PaymentDiscountResponse,
    PaymentDiscountCalculation,
    PaymentDiscountListResponse
)
from app.services.payment_discount_service import PaymentDiscountService
from app.api.deps import get_current_active_user, get_current_tenant_id, require_role
from app.models.user import User, UserRole


router = APIRouter(prefix="/payment-discounts", tags=["Payment Discounts"])


# ============================================================================
# ENDPOINTS DE LISTAGEM E CONSULTA
# ============================================================================


@router.get(
    "/",
    response_model=PaymentDiscountListResponse,
    summary="Listar descontos",
    description="Lista todos os descontos configurados para o tenant"
)
async def list_payment_discounts(
    active_only: bool = Query(False, description="Filtrar apenas descontos ativos"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id)
):
    """
    Listar todos os descontos por forma de pagamento.
    
    Retorna lista de todos os descontos configurados para o tenant.
    
    Args:
        active_only: Se True, retorna apenas descontos ativos
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        tenant_id: ID do tenant (extraído do token)
        
    Returns:
        PaymentDiscountListResponse: Lista de descontos
        
    Example:
        GET /payment-discounts/?active_only=true
        
    Example Response:
        {
            "items": [
                {
                    "id": 1,
                    "tenant_id": 1,
                    "payment_method": "pix",
                    "discount_percentage": 10.00,
                    "description": "Desconto PIX",
                    "is_active": true,
                    "created_at": "2026-01-24T10:00:00",
                    "updated_at": "2026-01-24T10:00:00"
                }
            ],
            "total": 1
        }
    """
    service = PaymentDiscountService(db)
    discounts = await service.get_all_discounts(tenant_id, active_only=active_only)
    
    return PaymentDiscountListResponse(
        items=discounts,
        total=len(discounts)
    )


@router.get(
    "/{discount_id}",
    response_model=PaymentDiscountResponse,
    summary="Obter desconto por ID",
    description="Retorna detalhes de um desconto específico"
)
async def get_payment_discount(
    discount_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id)
):
    """
    Obter desconto específico por ID.
    
    Args:
        discount_id: ID do desconto
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        tenant_id: ID do tenant
        
    Returns:
        PaymentDiscountResponse: Dados do desconto
        
    Raises:
        HTTPException 404: Se desconto não encontrado
    """
    service = PaymentDiscountService(db)
    discount = await service.get_discount(discount_id, tenant_id)
    
    if not discount:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment discount with ID {discount_id} not found"
        )
    
    return discount


@router.get(
    "/method/{payment_method}",
    response_model=PaymentDiscountResponse,
    summary="Obter desconto por forma de pagamento",
    description="Retorna desconto configurado para forma de pagamento específica"
)
async def get_discount_by_method(
    payment_method: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id)
):
    """
    Obter desconto por forma de pagamento.
    
    Args:
        payment_method: Forma de pagamento (pix, cash, debit_card, etc)
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        tenant_id: ID do tenant
        
    Returns:
        PaymentDiscountResponse: Dados do desconto
        
    Raises:
        HTTPException 404: Se desconto não encontrado
        
    Example:
        GET /payment-discounts/method/pix
    """
    service = PaymentDiscountService(db)
    discount = await service.get_discount_by_method(tenant_id, payment_method)
    
    if not discount:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No discount configured for payment method '{payment_method}'"
        )
    
    return discount


# ============================================================================
# CÁLCULO DE DESCONTO
# ============================================================================


@router.post(
    "/calculate",
    response_model=PaymentDiscountCalculation,
    summary="Calcular desconto",
    description="Calcula valor do desconto para forma de pagamento e valor específicos"
)
async def calculate_discount(
    payment_method: str = Query(..., description="Forma de pagamento"),
    amount: Decimal = Query(..., gt=0, description="Valor original"),
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id)
):
    """
    Calcular desconto para forma de pagamento.
    
    Não requer autenticação (permite cálculo público).
    
    Args:
        payment_method: Forma de pagamento (pix, cash, etc)
        amount: Valor original da compra
        db: Sessão do banco de dados
        tenant_id: ID do tenant
        
    Returns:
        PaymentDiscountCalculation: Resultado do cálculo
        
    Example:
        POST /payment-discounts/calculate?payment_method=pix&amount=100.00
        
    Example Response:
        {
            "payment_method": "pix",
            "original_amount": 100.00,
            "discount_percentage": 10.00,
            "discount_amount": 10.00,
            "final_amount": 90.00
        }
    """
    service = PaymentDiscountService(db)
    return await service.calculate_discount(tenant_id, payment_method, amount)


# ============================================================================
# ENDPOINTS DE CRIAÇÃO E MODIFICAÇÃO
# ============================================================================


@router.post(
    "/",
    response_model=PaymentDiscountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar desconto",
    description="Cria novo desconto por forma de pagamento"
)
async def create_payment_discount(
    discount_data: PaymentDiscountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    tenant_id: int = Depends(get_current_tenant_id)
):
    """
    Criar novo desconto.
    
    Requer permissão de ADMIN.
    
    Args:
        discount_data: Dados do desconto
        db: Sessão do banco de dados
        current_user: Usuário autenticado (ADMIN)
        tenant_id: ID do tenant
        
    Returns:
        PaymentDiscountResponse: Desconto criado
        
    Raises:
        HTTPException 400: Se já existe desconto para esta forma de pagamento
        HTTPException 403: Se usuário não é ADMIN
        
    Example:
        POST /payment-discounts/
        {
            "payment_method": "pix",
            "discount_percentage": 10.00,
            "description": "Desconto para pagamento via PIX",
            "is_active": true
        }
    """
    service = PaymentDiscountService(db)
    
    try:
        discount = await service.create_discount(tenant_id, discount_data)
        return discount
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put(
    "/{discount_id}",
    response_model=PaymentDiscountResponse,
    summary="Atualizar desconto",
    description="Atualiza desconto existente"
)
async def update_payment_discount(
    discount_id: int,
    discount_data: PaymentDiscountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    tenant_id: int = Depends(get_current_tenant_id)
):
    """
    Atualizar desconto existente.
    
    Requer permissão de ADMIN.
    
    Args:
        discount_id: ID do desconto
        discount_data: Dados atualizados
        db: Sessão do banco de dados
        current_user: Usuário autenticado (ADMIN)
        tenant_id: ID do tenant
        
    Returns:
        PaymentDiscountResponse: Desconto atualizado
        
    Raises:
        HTTPException 404: Se desconto não encontrado
        HTTPException 403: Se usuário não é ADMIN
    """
    service = PaymentDiscountService(db)
    
    try:
        discount = await service.update_discount(discount_id, tenant_id, discount_data)
        return discount
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.delete(
    "/{discount_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deletar desconto",
    description="Remove desconto (soft delete)"
)
async def delete_payment_discount(
    discount_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    tenant_id: int = Depends(get_current_tenant_id)
):
    """
    Deletar desconto (soft delete).
    
    Requer permissão de ADMIN.
    
    Args:
        discount_id: ID do desconto
        db: Sessão do banco de dados
        current_user: Usuário autenticado (ADMIN)
        tenant_id: ID do tenant
        
    Raises:
        HTTPException 404: Se desconto não encontrado
        HTTPException 403: Se usuário não é ADMIN
    """
    service = PaymentDiscountService(db)
    
    deleted = await service.delete_discount(discount_id, tenant_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment discount with ID {discount_id} not found"
        )
