"""
Endpoints de vendas - Criação, Listagem e Detalhes.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import date

from app.core.database import get_db
from app.schemas.sale import SaleCreate, SaleResponse, SaleWithDetails
from app.services.sale_service import SaleService
from app.repositories.sale_repository import SaleRepository
from app.api.deps import get_current_active_user, require_role
from app.models.user import User, UserRole

router = APIRouter(prefix="/sales", tags=["Vendas"])


@router.post(
    "/",
    response_model=SaleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar nova venda",
    description="Processa uma nova venda com validação de estoque, movimentação e atualização de fidelidade"
)
async def create_sale(
    sale_data: SaleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Criar nova venda.
    
    Processo completo em 10 etapas:
    1. Valida estoque disponível para todos os itens
    2. Valida cliente (se fornecido)
    3. Valida vendedor (usuário atual)
    4. Calcula subtotal, descontos e total
    5. Valida pagamentos (total = soma dos pagamentos)
    6. Cria registro de venda
    7. Cria itens da venda
    8. Cria registros de pagamento
    9. Movimenta estoque (baixa)
    10. Atualiza pontos de fidelidade do cliente
    
    Requer autenticação. Qualquer usuário autenticado pode criar vendas.
    
    Args:
        sale_data: Dados da venda incluindo:
            - items: Lista de produtos e quantidades
            - payments: Formas de pagamento
            - customer_id: ID do cliente (opcional)
            - discount_amount: Desconto total
            - notes: Observações
        db: Sessão do banco de dados
        current_user: Usuário autenticado (será o vendedor)
        
    Returns:
        SaleResponse: Venda criada com número gerado
        
    Raises:
        HTTPException 400: Se:
            - Estoque insuficiente
            - Cliente não encontrado
            - Pagamentos não cobrem o total
            - Dados inválidos
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 500: Se houver erro no processamento
        
    Example Request Body:
        {
            "customer_id": 1,
            "items": [
                {
                    "product_id": 1,
                    "quantity": 2,
                    "unit_price": 99.90
                }
            ],
            "payments": [
                {
                    "payment_method": "CREDIT_CARD",
                    "amount": 194.80,
                    "payment_reference": "CARD-123456"
                }
            ],
            "discount_amount": 5.00,
            "notes": "Venda teste"
        }
        
    Example Response:
        {
            "id": 1,
            "sale_number": "VENDA-20251028140000",
            "status": "COMPLETED",
            "total_amount": 194.80,
            "customer_id": 1,
            "seller_id": 2,
            "created_at": "2025-10-28T14:00:00"
        }
    """
    sale_service = SaleService(db)
    
    try:
        # Criar venda com o usuário atual como vendedor
        sale = await sale_service.create_sale(
            sale_data, 
            seller_id=current_user.id
        )
        return sale
        
    except ValueError as e:
        # Erros de validação de negócio
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        # Erros inesperados
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao processar venda: {str(e)}"
        )


@router.get(
    "/",
    response_model=List[SaleResponse],
    summary="Listar vendas",
    description="Lista vendas com paginação e filtros opcionais por cliente, vendedor ou período"
)
async def list_sales(
    skip: int = Query(0, ge=0, description="Número de registros para pular"),
    limit: int = Query(100, ge=1, le=100, description="Limite de registros por página"),
    customer_id: Optional[int] = Query(None, description="Filtrar por ID do cliente"),
    seller_id: Optional[int] = Query(None, description="Filtrar por ID do vendedor"),
    start_date: Optional[date] = Query(None, description="Data inicial (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Data final (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Listar vendas com filtros.
    
    Requer autenticação.
    
    Args:
        skip: Número de registros para pular (paginação)
        limit: Limite de registros por página (máximo 100)
        customer_id: Filtrar vendas de um cliente específico
        seller_id: Filtrar vendas de um vendedor específico
        start_date: Data inicial para filtro de período
        end_date: Data final para filtro de período
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        List[SaleResponse]: Lista de vendas encontradas
        
    Raises:
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 500: Se houver erro ao buscar vendas
        
    Examples:
        - GET /sales?skip=0&limit=10
        - GET /sales?customer_id=1
        - GET /sales?seller_id=2
        - GET /sales?start_date=2025-10-01&end_date=2025-10-31
        
    Note:
        Se múltiplos filtros forem fornecidos, a prioridade é:
        1. Período (start_date + end_date)
        2. Cliente (customer_id)
        3. Vendedor (seller_id)
        4. Todos (sem filtro)
    """
    sale_repo = SaleRepository(db)
    
    try:
        # Aplicar filtros na ordem de prioridade
        if start_date and end_date:
            # Filtro por período
            sales = await sale_repo.get_by_date_range(start_date, end_date, skip, limit)
        elif customer_id:
            # Filtro por cliente
            sales = await sale_repo.get_by_customer(customer_id, skip, limit)
        elif seller_id:
            # Filtro por vendedor
            sales = await sale_repo.get_by_seller(seller_id, skip, limit)
        else:
            # Sem filtro - todas as vendas
            sales = await sale_repo.get_multi(skip, limit)
        
        return sales
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar vendas: {str(e)}"
        )


@router.get(
    "/daily-total",
    response_model=dict,
    summary="Total de vendas do dia",
    description="Retorna o valor total de vendas realizadas no dia atual"
)
async def get_daily_total(
    target_date: Optional[date] = Query(None, description="Data alvo (padrão: hoje)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Obter total de vendas do dia.
    
    Requer autenticação.
    
    Args:
        target_date: Data para calcular total (padrão: data atual)
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        dict: Informações do dia incluindo:
            - date: Data consultada
            - total: Valor total de vendas
            - count: Quantidade de vendas
            
    Example Response:
        {
            "date": "2025-10-28",
            "total": 1500.00,
            "count": 8
        }
    """
    sale_service = SaleService(db)
    
    try:
        # Usar data atual se não fornecida
        if target_date is None:
            from datetime import datetime
            target_date = datetime.now().date()
        
        # Buscar total do dia
        total = await sale_service.get_daily_total(target_date)
        
        # Buscar quantidade de vendas
        sale_repo = SaleRepository(db)
        sales = await sale_repo.get_by_date_range(target_date, target_date)
        
        return {
            "date": target_date.isoformat(),
            "total": float(total) if total else 0.0,
            "count": len(sales)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao calcular total diário: {str(e)}"
        )


@router.get(
    "/number/{sale_number}",
    response_model=SaleWithDetails,
    summary="Buscar venda por número",
    description="Retorna detalhes completos de uma venda pelo número gerado"
)
async def get_sale_by_number(
    sale_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Buscar venda por número.
    
    Args:
        sale_number: Número da venda (formato: VENDA-YYYYMMDDHHMMSS)
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        SaleWithDetails: Venda com itens e pagamentos
        
    Raises:
        HTTPException 404: Se venda não for encontrada
    """
    sale_repo = SaleRepository(db)
    
    try:
        sale = await sale_repo.get_by_sale_number(sale_number)
        
        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Venda {sale_number} não encontrada"
            )
        
        return sale
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar venda: {str(e)}"
        )


@router.get(
    "/{sale_id}",
    response_model=SaleWithDetails,
    summary="Obter detalhes da venda",
    description="Retorna informações completas da venda incluindo itens, pagamentos e relacionamentos"
)
async def get_sale(
    sale_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Obter detalhes completos da venda.
    
    Retorna venda com todos os relacionamentos:
    - Items da venda (produtos e quantidades)
    - Pagamentos realizados
    - Dados do cliente
    - Dados do vendedor
    
    Requer autenticação.
    
    Args:
        sale_id: ID da venda
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        SaleWithDetails: Venda completa com:
            - Dados básicos da venda
            - Lista de items vendidos
            - Lista de pagamentos
            - Informações do cliente
            - Informações do vendedor
            
    Raises:
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 404: Se venda não for encontrada
        HTTPException 500: Se houver erro ao buscar venda
        
    Example Response:
        {
            "id": 1,
            "sale_number": "VENDA-20251028140000",
            "status": "COMPLETED",
            "total_amount": 194.80,
            "items": [
                {
                    "product_id": 1,
                    "quantity": 2,
                    "unit_price": 99.90,
                    "subtotal": 199.80
                }
            ],
            "payments": [
                {
                    "payment_method": "CREDIT_CARD",
                    "amount": 194.80
                }
            ],
            "customer": {...},
            "seller": {...}
        }
    """
    sale_repo = SaleRepository(db)
    
    try:
        # Buscar venda com todos os detalhes
        sale = await sale_repo.get_with_details(sale_id)
        
        if not sale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Venda com ID {sale_id} não encontrada"
            )
        
        return sale
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar venda: {str(e)}"
        )


# ============================================================================
# ENDPOINTS DE CANCELAMENTO E GESTÃO
# ============================================================================


@router.post(
    "/{sale_id}/cancel",
    response_model=SaleResponse,
    summary="Cancelar venda",
    description="Cancela uma venda revertendo estoque e pontos de fidelidade (apenas Admin ou Manager)"
)
async def cancel_sale(
    sale_id: int,
    reason: str = Query(..., description="Motivo do cancelamento"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Cancelar venda (soft cancel).
    
    Processo de cancelamento em 3 etapas:
    1. Reverte estoque dos produtos
    2. Reverte pontos de fidelidade do cliente
    3. Atualiza status para CANCELLED
    
    Requer permissão de ADMIN.
    
    Args:
        sale_id: ID da venda a ser cancelada
        reason: Motivo do cancelamento (obrigatório)
        db: Sessão do banco de dados
        current_user: Usuário autenticado (Admin)
        
    Returns:
        SaleResponse: Venda cancelada
        
    Raises:
        HTTPException 400: Se:
            - Venda já estiver cancelada
            - Venda não puder ser cancelada (regras de negócio)
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 403: Se usuário não tiver permissão
        HTTPException 404: Se venda não for encontrada
        HTTPException 500: Se houver erro ao cancelar
        
    Example:
        POST /sales/1/cancel?reason=Produto defeituoso
        
    Note:
        - Estoque é revertido automaticamente
        - Pontos de fidelidade são estornados
        - Venda permanece no banco para auditoria
        - Movimentações de estoque são registradas como RETURN
    """
    sale_service = SaleService(db)
    
    try:
        # Cancelar venda com motivo e usuário
        sale = await sale_service.cancel_sale(
            sale_id=sale_id,
            reason=reason,
            user_id=current_user.id
        )
        return sale
        
    except ValueError as e:
        error_msg = str(e).lower()
        
        # Determinar código de status apropriado
        if "não encontrada" in error_msg or "not found" in error_msg:
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
            detail=f"Erro ao cancelar venda: {str(e)}"
        )


# ============================================================================
# ENDPOINTS DE RELATÓRIOS E ANALYTICS
# ============================================================================


@router.get(
    "/reports/daily",
    response_model=dict,
    summary="Relatório diário de vendas",
    description="Retorna resumo das vendas do dia com total, quantidade e ticket médio"
)
async def get_daily_report(
    report_date: Optional[date] = Query(None, description="Data do relatório (padrão: hoje)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Relatório de vendas do dia.
    
    Requer autenticação.
    
    Args:
        report_date: Data para gerar relatório (padrão: data atual)
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        dict: Resumo do dia incluindo:
            - date: Data do relatório
            - total_sales: Valor total vendido
            - sales_count: Quantidade de vendas
            - average_ticket: Ticket médio
            - status_breakdown: Breakdown por status
            
    Example Response:
        {
            "date": "2025-10-28",
            "total_sales": 1500.00,
            "sales_count": 8,
            "average_ticket": 187.50,
            "status_breakdown": {
                "COMPLETED": 7,
                "CANCELLED": 1
            }
        }
    """
    sale_service = SaleService(db)
    sale_repo = SaleRepository(db)
    
    try:
        # Usar data atual se não fornecida
        if report_date is None:
            from datetime import datetime
            report_date = datetime.now().date()
        
        # Total do dia
        daily_total = await sale_service.get_daily_total(report_date)
        
        # Buscar todas as vendas do dia
        sales = await sale_repo.get_by_date_range(report_date, report_date)
        
        # Calcular ticket médio (apenas vendas não canceladas)
        active_sales = [s for s in sales if s.status != "CANCELLED"]
        active_total = sum(float(s.total_amount) for s in active_sales)
        
        # Breakdown por status
        status_breakdown = {}
        for sale in sales:
            status = sale.status
            status_breakdown[status] = status_breakdown.get(status, 0) + 1
        
        return {
            "date": report_date.isoformat(),
            "total_sales": float(daily_total) if daily_total else 0.0,
            "sales_count": len(sales),
            "active_sales_count": len(active_sales),
            "average_ticket": active_total / len(active_sales) if active_sales else 0.0,
            "status_breakdown": status_breakdown
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar relatório diário: {str(e)}"
        )


@router.get(
    "/reports/period",
    response_model=dict,
    summary="Relatório de vendas por período",
    description="Retorna análise completa de vendas entre duas datas"
)
async def get_period_report(
    start_date: date = Query(..., description="Data inicial (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Data final (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Relatório de vendas por período.
    
    Análise completa incluindo:
    - Totais e médias
    - Top produtos vendidos
    - Breakdown por status
    - Comparações
    
    Requer autenticação.
    
    Args:
        start_date: Data inicial do período
        end_date: Data final do período
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        dict: Análise completa do período incluindo:
            - start_date, end_date: Período analisado
            - total_sales: Valor total vendido
            - sales_count: Quantidade de vendas
            - average_ticket: Ticket médio
            - top_products: Top 10 produtos mais vendidos
            - status_breakdown: Vendas por status
            - daily_average: Média diária de vendas
            
    Raises:
        HTTPException 400: Se datas forem inválidas
        HTTPException 401: Se usuário não estiver autenticado
        HTTPException 500: Se houver erro ao gerar relatório
        
    Example:
        GET /sales/reports/period?start_date=2025-10-01&end_date=2025-10-31
        
    Example Response:
        {
            "start_date": "2025-10-01",
            "end_date": "2025-10-31",
            "total_sales": 45000.00,
            "sales_count": 250,
            "average_ticket": 180.00,
            "top_products": [...],
            "status_breakdown": {"COMPLETED": 245, "CANCELLED": 5},
            "daily_average": 1451.61
        }
    """
    sale_repo = SaleRepository(db)
    
    try:
        # Validar datas
        if start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Data inicial deve ser menor ou igual à data final"
            )
        
        # Buscar vendas do período
        sales = await sale_repo.get_by_date_range(start_date, end_date)
        
        # Calcular totais
        total_sales = sum(float(s.total_amount) for s in sales)
        active_sales = [s for s in sales if s.status != "CANCELLED"]
        active_total = sum(float(s.total_amount) for s in active_sales)
        
        # Breakdown por status
        status_breakdown = {}
        for sale in sales:
            status = sale.status
            status_breakdown[status] = status_breakdown.get(status, 0) + 1
        
        # Top produtos (se implementado no repositório)
        top_products = []
        try:
            top_products_raw = await sale_repo.get_top_products(
                start_date=start_date,
                end_date=end_date,
                limit=10
            )
            top_products = [
                {
                    "product_id": p.product_id,
                    "product_name": p.product_name if hasattr(p, 'product_name') else f"Produto {p.product_id}",
                    "quantity_sold": p.quantity_sold,
                    "revenue": float(p.revenue)
                }
                for p in top_products_raw
            ]
        except AttributeError:
            # Se método não existir, retornar lista vazia
            pass
        
        # Calcular dias no período
        days_in_period = (end_date - start_date).days + 1
        
        return {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "period_days": days_in_period,
            "total_sales": total_sales,
            "sales_count": len(sales),
            "active_sales_count": len(active_sales),
            "cancelled_sales_count": len(sales) - len(active_sales),
            "average_ticket": active_total / len(active_sales) if active_sales else 0.0,
            "daily_average": total_sales / days_in_period if days_in_period > 0 else 0.0,
            "status_breakdown": status_breakdown,
            "top_products": top_products
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao gerar relatório de período: {str(e)}"
        )


@router.get(
    "/reports/top-customers",
    response_model=List[dict],
    summary="Top clientes",
    description="Retorna os clientes com maior volume de compras"
)
async def get_top_customers(
    limit: int = Query(10, ge=1, le=100, description="Quantidade de clientes a retornar"),
    start_date: Optional[date] = Query(None, description="Data inicial (opcional)"),
    end_date: Optional[date] = Query(None, description="Data final (opcional)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Top clientes por volume de compras.
    
    Args:
        limit: Quantidade de clientes (máximo 100)
        start_date: Filtro de data inicial (opcional)
        end_date: Filtro de data final (opcional)
        db: Sessão do banco de dados
        current_user: Usuário autenticado
        
    Returns:
        List[dict]: Lista de clientes com:
            - customer_id: ID do cliente
            - customer_name: Nome do cliente
            - total_purchases: Total gasto
            - purchase_count: Quantidade de compras
            - average_purchase: Ticket médio
            
    Example Response:
        [
            {
                "customer_id": 1,
                "customer_name": "Maria Silva",
                "total_purchases": 5000.00,
                "purchase_count": 25,
                "average_purchase": 200.00
            }
        ]
    """
    sale_repo = SaleRepository(db)
    
    try:
        # Buscar vendas (com filtro de data se fornecido)
        if start_date and end_date:
            sales = await sale_repo.get_by_date_range(start_date, end_date)
        else:
            sales = await sale_repo.get_multi(skip=0, limit=10000)  # Limite alto para pegar todas
        
        # Filtrar apenas vendas completas com clientes
        sales = [s for s in sales if s.status == "COMPLETED" and s.customer_id]
        
        # Agrupar por cliente
        customer_stats = {}
        for sale in sales:
            customer_id = sale.customer_id
            if customer_id not in customer_stats:
                customer_stats[customer_id] = {
                    "customer_id": customer_id,
                    "total_purchases": 0.0,
                    "purchase_count": 0
                }
            
            customer_stats[customer_id]["total_purchases"] += float(sale.total_amount)
            customer_stats[customer_id]["purchase_count"] += 1
        
        # Calcular ticket médio e ordenar
        result = []
        for customer_id, stats in customer_stats.items():
            stats["average_purchase"] = stats["total_purchases"] / stats["purchase_count"]
            result.append(stats)
        
        # Ordenar por total de compras (decrescente) e limitar
        result.sort(key=lambda x: x["total_purchases"], reverse=True)
        result = result[:limit]
        
        # Buscar nomes dos clientes
        from app.repositories.customer_repository import CustomerRepository
        customer_repo = CustomerRepository(db)
        
        for item in result:
            customer = await customer_repo.get(item["customer_id"])
            item["customer_name"] = customer.full_name if customer else "Cliente Desconhecido"
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao buscar top clientes: {str(e)}"
        )
