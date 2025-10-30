"""
Endpoints de controle de estoque.

Este módulo implementa a API REST para gerenciamento de inventário,
incluindo adição/remoção de estoque, consultas, alertas e histórico
de movimentações.

Endpoints:
    - POST /inventory/add: Adicionar estoque (entrada)
    - POST /inventory/remove: Remover estoque (saída manual)
    - GET /inventory/product/{product_id}: Consultar estoque atual
    - GET /inventory/alerts: Listar produtos com estoque baixo
    - GET /inventory/movements/{product_id}: Histórico de movimentações
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.schemas.inventory import (
    StockMovementCreate,
    StockMovementResponse,
    InventoryResponse
)
from app.services.inventory_service import InventoryService
from app.repositories.inventory_repository import InventoryRepository
from app.api.deps import get_current_active_user, require_role
from app.models.user import User, UserRole


router = APIRouter(prefix="/inventory", tags=["Estoque"])


# ============================================================================
# ENDPOINTS DE MOVIMENTAÇÃO DE ESTOQUE
# ============================================================================


@router.post(
    "/add",
    response_model=InventoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Adicionar estoque",
    description="Registra entrada de produtos no estoque (apenas Admin/Manager)"
)
async def add_stock(
    movement: StockMovementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Adicionar estoque (entrada de produtos).
    
    Cria uma movimentação do tipo IN (entrada) e incrementa
    a quantidade disponível do produto.
    
    Requer permissão de ADMIN ou MANAGER.
    
    Args:
        movement: Dados da movimentação (product_id, quantity, notes)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin/Manager)
        
    Returns:
        InventoryResponse: Estoque atualizado com nova quantidade
        
    Raises:
        HTTPException 400: Se:
            - Quantidade for inválida (zero ou negativa)
            - Produto não for encontrado
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão
        HTTPException 500: Se houver erro ao adicionar estoque
        
    Example Request:
        POST /inventory/add
        {
            "product_id": 1,
            "quantity": 50,
            "notes": "Compra fornecedor X - NF 12345"
        }
        
    Example Response:
        {
            "id": 1,
            "product_id": 1,
            "quantity": 150,
            "min_stock": 10,
            "max_stock": 500,
            "created_at": "2025-10-28T10:00:00",
            "updated_at": "2025-10-28T10:00:00"
        }
        
    Note:
        - Movimentação é registrada no histórico
        - Atualiza data de última movimentação
        - Valida se produto existe antes de adicionar
    """
    inventory_service = InventoryService(db)
    
    try:
        # Validar quantidade
        if movement.quantity <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quantidade deve ser maior que zero"
            )
        
        # Adicionar estoque
        inventory = await inventory_service.add_stock(
            product_id=movement.product_id,
            quantity=movement.quantity,
            notes=movement.notes
        )
        
        return inventory
        
    except ValueError as e:
        # Erros de validação (produto não encontrado, etc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao adicionar estoque: {str(e)}"
        )


@router.post(
    "/remove",
    response_model=InventoryResponse,
    summary="Remover estoque",
    description="Registra saída manual de produtos do estoque (apenas Admin/Manager)"
)
async def remove_stock(
    movement: StockMovementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Remover estoque manualmente (saída).
    
    Cria uma movimentação do tipo OUT (saída) e decrementa
    a quantidade disponível. Usado para ajustes, perdas,
    quebras ou outras saídas que não sejam vendas.
    
    Requer permissão de ADMIN ou MANAGER.
    
    Args:
        movement: Dados da movimentação (product_id, warehouse_id, quantity, notes)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin/Manager)
        
    Returns:
        InventoryResponse: Estoque atualizado com quantidade reduzida
        
    Raises:
        HTTPException 400: Se:
            - Quantidade for inválida (zero ou negativa)
            - Quantidade solicitada for maior que disponível
            - Produto não for encontrado
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão
        HTTPException 500: Se houver erro ao remover estoque
        
    Example Request:
        POST /inventory/remove
        {
            "product_id": 1,
            "warehouse_id": 1,
            "quantity": 5,
            "notes": "Produto danificado - quebra"
        }
        
    Example Response:
        {
            "id": 1,
            "product_id": 1,
            "warehouse_id": 1,
            "quantity": 145,
            "min_stock": 10,
            "max_stock": 500,
            "created_at": "2025-10-28T10:00:00",
            "updated_at": "2025-10-28T14:30:00"
        }
        
    Note:
        - Verifica disponibilidade antes de remover
        - Não permite estoque negativo
        - Movimentação é registrada no histórico
        - Para vendas, use o endpoint de vendas (não este)
    """
    # Validar quantidade
    if movement.quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantidade deve ser maior que zero"
        )
    
    inventory_service = InventoryService(db)
    
    try:
        # Remover estoque
        inventory = await inventory_service.remove_stock(
            product_id=movement.product_id,
            quantity=movement.quantity,
            notes=movement.notes
        )
        
        return inventory
        
    except ValueError as e:
        # Erros de validação (estoque insuficiente, produto não encontrado)
        error_detail = str(e)
        print(f"❌ Erro de validação ao remover estoque: {error_detail}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_detail
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Erro ao remover estoque: {str(e)}"
        print(f"❌ {error_msg}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_msg
        )


# ============================================================================
# ENDPOINTS DE CONSULTA DE ESTOQUE
# ============================================================================


@router.get(
    "/product/{product_id}",
    response_model=InventoryResponse,
    summary="Consultar estoque de produto",
    description="Retorna o estoque atual de um produto"
)
async def get_product_stock(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Consultar estoque atual de um produto.
    
    Requer autenticação.
    
    Args:
        product_id: ID do produto
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        InventoryResponse: Dados do estoque incluindo:
            - quantity: Quantidade disponível
            - min_stock: Estoque mínimo configurado
            - max_stock: Estoque máximo configurado
            - Alertas automáticos se abaixo do mínimo
            
    Raises:
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 404: Se estoque não for encontrado
        HTTPException 500: Se houver erro ao buscar estoque
        
    Example:
        GET /inventory/product/1
        
    Example Response:
        {
            "id": 1,
            "product_id": 1,
            "quantity": 145,
            "min_stock": 10,
            "max_stock": 500,
            "created_at": "2025-10-28T10:00:00",
            "updated_at": "2025-10-28T14:30:00"
        }
        
    Note:
        - Útil para verificar disponibilidade antes de vendas
    """
    inventory_repo = InventoryRepository(db)
    
    try:
        # Buscar o inventário completo do produto
        inventory = await inventory_repo.get_by_product(product_id)
        
        if not inventory:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Estoque não encontrado para produto {product_id}"
            )
        
        return inventory
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao consultar estoque: {str(e)}"
        )


@router.get(
    "/alerts",
    response_model=List[dict],
    summary="Alertas de estoque baixo",
    description="Lista produtos com estoque abaixo do mínimo configurado"
)
async def get_stock_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Listar produtos com estoque baixo (abaixo do mínimo).
    
    Útil para reposição automática e alertas de compra.
    
    Requer autenticação.
    
    Args:
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        List[dict]: Lista de alertas incluindo:
            - product_id: ID do produto
            - product_name: Nome do produto
            - current_stock: Quantidade atual
            - min_stock: Estoque mínimo configurado
            - deficit: Quantidade faltante (min_stock - current_stock)
            - warehouse_id: ID do armazém
            
    Example Response:
        [
            {
                "product_id": 5,
                "product_name": "Whey Protein 1kg",
                "current_stock": 3,
                "min_stock": 10,
                "deficit": 7,
                "warehouse_id": 1
            },
            {
                "product_id": 8,
                "product_name": "Creatina 300g",
                "current_stock": 1,
                "min_stock": 5,
                "deficit": 4,
                "warehouse_id": 1
            }
        ]
        
    Note:
        - Lista apenas produtos ativos (não deletados)
        - Ordenado por déficit (maior primeiro)
        - Produtos com estoque zero aparecem no topo
        - Útil para dashboards e notificações
    """
    inventory_service = InventoryService(db)
    
    try:
        alerts = await inventory_service.get_stock_alerts()
        return alerts
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar alertas de estoque: {str(e)}"
        )


# ============================================================================
# ENDPOINTS DE HISTÓRICO
# ============================================================================


@router.get(
    "/movements/{product_id}",
    response_model=List[StockMovementResponse],
    summary="Histórico de movimentações",
    description="Retorna histórico de movimentações de estoque de um produto"
)
async def get_product_movements(
    product_id: int,
    limit: int = Query(50, ge=1, le=100, description="Quantidade de movimentações a retornar"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Histórico de movimentações de um produto.
    
    Retorna todas as entradas, saídas, vendas e ajustes
    de estoque do produto, ordenadas da mais recente para a mais antiga.
    
    Requer autenticação.
    
    Args:
        product_id: ID do produto
        limit: Quantidade de movimentações (máximo 100, padrão 50)
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        List[StockMovementResponse]: Lista de movimentações incluindo:
            - id: ID da movimentação
            - product_id: ID do produto
            - warehouse_id: ID do armazém
            - movement_type: Tipo (IN, OUT, SALE, RETURN, ADJUSTMENT)
            - quantity: Quantidade movimentada
            - previous_quantity: Quantidade antes da movimentação
            - new_quantity: Quantidade após a movimentação
            - user_id: ID do usuário responsável
            - notes: Observações
            - created_at: Data/hora da movimentação
            
    Raises:
        HTTPException 400: Se limit for inválido
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 500: Se houver erro ao buscar movimentações
        
    Example:
        GET /inventory/movements/1?limit=50
        
    Example Response:
        [
            {
                "id": 150,
                "product_id": 1,
                "warehouse_id": 1,
                "movement_type": "SALE",
                "quantity": 2,
                "previous_quantity": 147,
                "new_quantity": 145,
                "user_id": 3,
                "notes": "Venda #VENDA-20251028143000",
                "created_at": "2025-10-28T14:30:00"
            },
            {
                "id": 149,
                "product_id": 1,
                "warehouse_id": 1,
                "movement_type": "IN",
                "quantity": 50,
                "previous_quantity": 97,
                "new_quantity": 147,
                "user_id": 1,
                "notes": "Compra fornecedor X - NF 12345",
                "created_at": "2025-10-28T10:00:00"
            }
        ]
        
    Note:
        - Ordenado por data (mais recente primeiro)
        - Inclui todas as movimentações (entradas, saídas, vendas)
        - Útil para auditoria e rastreabilidade
        - Mostra quem fez cada movimentação
    """
    inventory_repo = InventoryRepository(db)
    
    try:
        movements = await inventory_repo.get_movements_by_product(product_id, limit)
        return movements
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar histórico de movimentações: {str(e)}"
        )
