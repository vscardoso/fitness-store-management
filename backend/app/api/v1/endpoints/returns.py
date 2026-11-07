"""
Endpoints de devolução de vendas.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
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


def _brl(v) -> str:
    return f"R$ {float(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


async def _push_return(db, background, sale_return, sale_id: int, tenant_id: int, user: User, *, correction: bool) -> None:
    """Avisa admin e gerente no celular (parcial, total, troca ou estorno), depois da resposta. Nunca derruba a devolução."""
    try:
        from sqlalchemy import select
        from app.models.sale import Sale
        from app.services import web_push_service
        if not web_push_service.enabled():
            return
        raw = (await db.execute(select(Sale.status).where(Sale.id == sale_id))).scalar()
        st = str(getattr(raw, "value", raw) or "").lower()
        short = str(sale_return.sale_number or "").split("-")[-1]
        total = _brl(sale_return.total_refund)
        if correction:
            title = f"Estorno por erro de lançamento: {total}"
        elif sale_return.exchange_sale_id:
            title = f"Troca na venda #{short}"
        elif st == "refunded":
            title = f"Devolução total: {total}"
        else:
            title = f"Devolução parcial: {total}"
        body = f"Venda #{short} · {user.full_name or user.email}"
        if sale_return.exchange_sale_id and sale_return.net_amount is not None and float(sale_return.net_amount) != 0:
            body += f" · diferença {_brl(abs(float(sale_return.net_amount)))}"
        background.add_task(web_push_service.notify_tenant, tenant_id, title, body, f"/sales/{sale_id}",
                            roles=("admin", "manager"), tag=f"return-{sale_return.id}")
    except Exception:  # noqa: BLE001  (o aviso é um extra: a devolução já foi gravada)
        import logging
        logging.getLogger(__name__).exception("Web Push da devolução falhou")


def _role_value(user: User) -> str:
    return str(getattr(user.role, "value", user.role) or "").lower()


@router.get(
    "/eligibility/{sale_id}",
    response_model=ReturnEligibilityResponse,
    summary="Verificar elegibilidade para devolução",
    description="Verifica se uma venda pode ser devolvida e lista itens disponíveis"
)
async def check_return_eligibility(
    sale_id: int,
    correction: bool = Query(False, description="Estorno por erro de lançamento (só admin): ignora o prazo de troca"),
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
        if correction and _role_value(current_user) != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Só o administrador pode fazer estorno por erro de lançamento.")
        eligibility = await return_service.check_eligibility(
            sale_id,
            tenant_id=tenant_id,
            ignore_window=correction,
        )
        eligibility.allow_money_refund = True if correction else await return_service._allow_money_refund(tenant_id)
        return eligibility

    except HTTPException:
        raise
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
    background: BackgroundTasks,
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

    if return_data.is_correction and _role_value(current_user) != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Só o administrador pode fazer estorno por erro de lançamento.")

    try:
        sale_return = await return_service.process_return(
            sale_id=sale_id,
            return_data=return_data,
            processed_by_id=current_user.id,
            tenant_id=tenant_id,
        )
        if return_data.is_correction:
            from app.services.audit_service import AuditService
            await AuditService.log(db, "SALE_RETURN_CORRECTION",
                tenant_id=tenant_id, user_id=current_user.id, user_email=current_user.email,
                entity="sale", entity_id=sale_id,
                detail={"reason": return_data.reason, "return_number": sale_return.return_number,
                        "total_refund": str(sale_return.total_refund)},
            )
        await _push_return(db, background, sale_return, sale_id, tenant_id, current_user, correction=bool(return_data.is_correction))
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


@router.post(
    "/reconcile-status",
    summary="Reconciliar status de vendas com devoluções",
    description="Corrige vendas que têm SaleReturn mas status desatualizado (completed em vez de refunded)"
)
async def reconcile_sale_statuses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    from sqlalchemy import select, and_, func
    from sqlalchemy.orm import selectinload
    from app.models.sale import Sale, SaleItem, SaleStatus
    from app.models.sale_return import SaleReturn, ReturnItem

    # Buscar vendas COMPLETED ou PARTIALLY_REFUNDED com devoluções existentes
    stmt = (
        select(Sale)
        .where(
            and_(
                Sale.tenant_id == tenant_id,
                Sale.is_active == True,
                Sale.status.in_([SaleStatus.COMPLETED.value, SaleStatus.PARTIALLY_REFUNDED.value]),
            )
        )
        .options(
            selectinload(Sale.items),
            selectinload(Sale.returns).selectinload(SaleReturn.items),
        )
    )
    result = await db.execute(stmt)
    sales = result.scalars().unique().all()

    fixed = []
    for sale in sales:
        # Somar totais via itens ativos
        active_items = [i for i in sale.items if i.is_active]
        total_sold = sum(i.quantity for i in active_items)
        if total_sold == 0:
            continue

        returned_per_item: dict[int, int] = {}
        for sr in sale.returns:
            if sr.status == "completed":
                for ri in sr.items:
                    returned_per_item[ri.sale_item_id] = (
                        returned_per_item.get(ri.sale_item_id, 0) + ri.quantity_returned
                    )

        total_returned = sum(returned_per_item.get(i.id, 0) for i in active_items)

        new_status = None
        if total_returned >= total_sold:
            new_status = SaleStatus.REFUNDED.value
        elif total_returned > 0:
            new_status = SaleStatus.PARTIALLY_REFUNDED.value

        if new_status and sale.status != new_status:
            sale.status = new_status
            fixed.append({"sale_id": sale.id, "sale_number": sale.sale_number, "new_status": new_status})

    if fixed:
        await db.commit()

    return {"fixed": len(fixed), "sales": fixed}


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