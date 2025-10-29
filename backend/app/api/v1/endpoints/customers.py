"""
Endpoints de gerenciamento de clientes.

Este módulo implementa a API REST para CRUD completo de clientes,
incluindo listagem, busca, criação, atualização, exclusão e
histórico de compras.

Endpoints:
    - GET /customers/: Listar clientes com paginação e busca
    - GET /customers/{customer_id}: Obter detalhes do cliente
    - POST /customers/: Criar novo cliente
    - PUT /customers/{customer_id}: Atualizar cliente
    - DELETE /customers/{customer_id}: Deletar cliente (soft delete)
    - GET /customers/{customer_id}/purchases: Histórico de compras
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse
from app.services.customer_service import CustomerService
from app.repositories.customer_repository import CustomerRepository
from app.api.deps import get_current_active_user
from app.models.user import User


router = APIRouter(prefix="/customers", tags=["Clientes"])


# ============================================================================
# ENDPOINTS DE LISTAGEM E BUSCA
# ============================================================================


@router.get(
    "/",
    response_model=List[CustomerResponse],
    summary="Listar clientes",
    description="Lista todos os clientes com paginação e busca opcional"
)
async def list_customers(
    skip: int = Query(0, ge=0, description="Número de registros a pular"),
    limit: int = Query(100, ge=1, le=100, description="Número máximo de registros"),
    search: Optional[str] = Query(None, description="Buscar por nome, email ou telefone"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Listar clientes com paginação.
    
    Suporta busca por nome, email ou telefone.
    
    Requer autenticação.
    
    Args:
        skip: Número de registros a pular (padrão: 0)
        limit: Número máximo de registros (padrão: 100, máximo: 100)
        search: Termo de busca (opcional) - busca em nome, email e telefone
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        List[CustomerResponse]: Lista de clientes ativos
        
    Example:
        GET /customers/?skip=0&limit=20&search=silva
        
    Example Response:
        [
            {
                "id": 1,
                "full_name": "Maria Silva",
                "email": "maria@email.com",
                "phone": "(11) 98765-4321",
                "cpf": "123.456.789-00",
                "birth_date": "1990-05-15",
                "address": "Rua A, 123",
                "city": "São Paulo",
                "state": "SP",
                "zip_code": "01234-567",
                "loyalty_points": 150,
                "is_active": true,
                "created_at": "2025-10-28T10:00:00",
                "updated_at": "2025-10-28T10:00:00"
            }
        ]
        
    Note:
        - Retorna apenas clientes ativos (is_active=true)
        - Busca é case-insensitive
        - Busca parcial (LIKE) em múltiplos campos
    """
    customer_repo = CustomerRepository(db)
    
    try:
        if search:
            customers = await customer_repo.search(search, skip, limit)
        else:
            customers = await customer_repo.get_multi(skip, limit)
        
        return customers
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar clientes: {str(e)}"
        )


@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Obter detalhes do cliente",
    description="Retorna informações completas de um cliente específico"
)
async def get_customer(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Obter detalhes completos do cliente.
    
    Requer autenticação.
    
    Args:
        customer_id: ID do cliente
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        CustomerResponse: Dados completos do cliente incluindo:
            - Informações pessoais
            - Endereço
            - Pontos de fidelidade
            - Status
            
    Raises:
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 404: Se cliente não for encontrado
        HTTPException 500: Se houver erro ao buscar cliente
        
    Example:
        GET /customers/1
        
    Example Response:
        {
            "id": 1,
            "full_name": "Maria Silva",
            "email": "maria@email.com",
            "phone": "(11) 98765-4321",
            "cpf": "123.456.789-00",
            "birth_date": "1990-05-15",
            "address": "Rua A, 123",
            "city": "São Paulo",
            "state": "SP",
            "zip_code": "01234-567",
            "loyalty_points": 150,
            "is_active": true,
            "created_at": "2025-10-28T10:00:00",
            "updated_at": "2025-10-28T10:00:00"
        }
    """
    customer_repo = CustomerRepository(db)
    
    try:
        customer = await customer_repo.get(customer_id)
        
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Cliente com ID {customer_id} não encontrado"
            )
        
        return customer
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar cliente: {str(e)}"
        )


# ============================================================================
# ENDPOINTS DE CRIAÇÃO E ATUALIZAÇÃO
# ============================================================================


@router.post(
    "/",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar novo cliente",
    description="Cadastra um novo cliente no sistema"
)
async def create_customer(
    customer_data: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Criar novo cliente.
    
    Valida email e CPF únicos antes de criar.
    
    Requer autenticação.
    
    Args:
        customer_data: Dados do cliente (nome, email, telefone, CPF, etc)
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        CustomerResponse: Cliente criado com ID gerado
        
    Raises:
        HTTPException 400: Se:
            - Email já estiver cadastrado
            - CPF já estiver cadastrado
            - Dados forem inválidos
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 500: Se houver erro ao criar cliente
        
    Example Request:
        POST /customers/
        {
            "full_name": "João Santos",
            "email": "joao@email.com",
            "phone": "(11) 91234-5678",
            "cpf": "987.654.321-00",
            "birth_date": "1985-08-20",
            "address": "Av. B, 456",
            "city": "Rio de Janeiro",
            "state": "RJ",
            "zip_code": "20000-000"
        }
        
    Example Response:
        {
            "id": 2,
            "full_name": "João Santos",
            "email": "joao@email.com",
            "phone": "(11) 91234-5678",
            "cpf": "987.654.321-00",
            "birth_date": "1985-08-20",
            "address": "Av. B, 456",
            "city": "Rio de Janeiro",
            "state": "RJ",
            "zip_code": "20000-000",
            "loyalty_points": 0,
            "is_active": true,
            "created_at": "2025-10-28T14:30:00",
            "updated_at": "2025-10-28T14:30:00"
        }
        
    Note:
        - Email e CPF devem ser únicos
        - Cliente inicia com 0 pontos de fidelidade
        - Cliente é criado como ativo por padrão
    """
    customer_service = CustomerService(db)
    
    try:
        customer = await customer_service.create_customer(customer_data)
        return customer
        
    except ValueError as e:
        # Erros de validação (email/CPF duplicado, etc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao criar cliente: {str(e)}"
        )


@router.put(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Atualizar cliente",
    description="Atualiza informações de um cliente existente"
)
async def update_customer(
    customer_id: int,
    customer_data: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Atualizar dados do cliente.
    
    Permite atualização parcial (apenas campos enviados são atualizados).
    
    Requer autenticação.
    
    Args:
        customer_id: ID do cliente a ser atualizado
        customer_data: Dados a serem atualizados (campos opcionais)
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        CustomerResponse: Cliente atualizado
        
    Raises:
        HTTPException 400: Se:
            - Email já estiver em uso por outro cliente
            - CPF já estiver em uso por outro cliente
            - Dados forem inválidos
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 404: Se cliente não for encontrado
        HTTPException 500: Se houver erro ao atualizar cliente
        
    Example Request:
        PUT /customers/2
        {
            "phone": "(11) 99999-8888",
            "address": "Nova Rua C, 789",
            "city": "São Paulo"
        }
        
    Example Response:
        {
            "id": 2,
            "full_name": "João Santos",
            "email": "joao@email.com",
            "phone": "(11) 99999-8888",
            "cpf": "987.654.321-00",
            "birth_date": "1985-08-20",
            "address": "Nova Rua C, 789",
            "city": "São Paulo",
            "state": "RJ",
            "zip_code": "20000-000",
            "loyalty_points": 0,
            "is_active": true,
            "created_at": "2025-10-28T14:30:00",
            "updated_at": "2025-10-28T15:45:00"
        }
        
    Note:
        - Atualização parcial: envie apenas os campos que deseja alterar
        - Email e CPF continuam devendo ser únicos
        - Campo updated_at é atualizado automaticamente
    """
    customer_service = CustomerService(db)
    
    try:
        customer = await customer_service.update_customer(customer_id, customer_data)
        return customer
        
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao atualizar cliente: {str(e)}"
        )


# ============================================================================
# ENDPOINTS DE EXCLUSÃO
# ============================================================================


@router.delete(
    "/{customer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deletar cliente",
    description="Desativa um cliente (soft delete)"
)
async def delete_customer(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Deletar cliente (soft delete).
    
    Cliente não é removido do banco, apenas marcado como inativo.
    Histórico de compras é preservado.
    
    Requer autenticação.
    
    Args:
        customer_id: ID do cliente a ser deletado
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        None (Status 204 No Content)
        
    Raises:
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 404: Se cliente não for encontrado
        HTTPException 500: Se houver erro ao deletar cliente
        
    Example:
        DELETE /customers/2
        
    Note:
        - Soft delete: cliente permanece no banco para auditoria
        - is_active é alterado para false
        - Histórico de compras é preservado
        - Cliente não aparece mais em listagens normais
        - Pode ser reativado posteriormente se necessário
    """
    customer_repo = CustomerRepository(db)
    
    try:
        customer = await customer_repo.get(customer_id)
        
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Cliente com ID {customer_id} não encontrado"
            )
        
        # Soft delete
        await customer_repo.update(customer_id, {'is_active': False})
        await db.commit()
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao deletar cliente: {str(e)}"
        )


# ============================================================================
# ENDPOINTS DE HISTÓRICO E RELATÓRIOS
# ============================================================================


@router.get(
    "/{customer_id}/purchases",
    response_model=List[dict],
    summary="Histórico de compras do cliente",
    description="Retorna todas as compras realizadas por um cliente"
)
async def get_customer_purchases(
    customer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Histórico de compras do cliente.
    
    Lista todas as vendas associadas ao cliente, incluindo
    canceladas, para auditoria completa.
    
    Requer autenticação.
    
    Args:
        customer_id: ID do cliente
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        List[dict]: Lista de compras incluindo:
            - sale_id: ID da venda
            - sale_number: Número da venda (formato VENDA-YYYYMMDDHHMMSS)
            - date: Data/hora da compra
            - total: Valor total
            - status: Status da venda (COMPLETED, CANCELLED, etc)
            
    Raises:
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 404: Se cliente não for encontrado
        HTTPException 500: Se houver erro ao buscar histórico
        
    Example:
        GET /customers/1/purchases
        
    Example Response:
        [
            {
                "sale_id": 10,
                "sale_number": "VENDA-20251028143000",
                "date": "2025-10-28T14:30:00",
                "total": 250.00,
                "status": "COMPLETED"
            },
            {
                "sale_id": 8,
                "sale_number": "VENDA-20251027100000",
                "date": "2025-10-27T10:00:00",
                "total": 180.50,
                "status": "COMPLETED"
            },
            {
                "sale_id": 5,
                "sale_number": "VENDA-20251025153000",
                "date": "2025-10-25T15:30:00",
                "total": 320.00,
                "status": "CANCELLED"
            }
        ]
        
    Note:
        - Inclui todas as vendas (completas e canceladas)
        - Ordenado por data (mais recente primeiro)
        - Útil para análise de comportamento do cliente
        - Mostra total gasto e frequência de compras
    """
    from app.repositories.sale_repository import SaleRepository
    
    customer_repo = CustomerRepository(db)
    
    try:
        # Verificar se cliente existe
        customer = await customer_repo.get(customer_id)
        
        if not customer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Cliente com ID {customer_id} não encontrado"
            )
        
        # Buscar vendas do cliente
        sale_repo = SaleRepository(db)
        sales = await sale_repo.get_by_customer(customer_id)
        
        # Formatar resposta
        return [
            {
                "sale_id": sale.id,
                "sale_number": sale.sale_number,
                "date": sale.created_at,
                "total": float(sale.total_amount),
                "status": sale.status
            }
            for sale in sales
        ]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar histórico de compras: {str(e)}"
        )
