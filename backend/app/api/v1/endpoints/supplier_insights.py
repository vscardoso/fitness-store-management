"""
Análises de fornecedores (Fase 2): ranking, comparação de custo e lista de reposição.

Este roteador deve ser incluído ANTES de `suppliers.router`, para que `/suppliers/ranking`
não seja interpretado como `/suppliers/{supplier_id}`.
"""
from typing import Any, Dict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.services.supplier_insights_service import SupplierInsightsService

router = APIRouter(prefix="/suppliers", tags=["Fornecedores: análises"])


@router.get(
    "/ranking",
    summary="Ranking de fornecedores por giro e margem",
    description=(
        "Para as compras feitas nos últimos `days` dias (0 = todas): quanto foi comprado, quanto já vendeu "
        "(giro), receita, custo FIFO das unidades vendidas e margem. Score de 0 a 100 = 60% giro + 40% "
        "margem. Fornecedores com menos de 5 unidades compradas aparecem como `low_data`."
    ),
)
async def supplier_ranking(
    days: int = Query(180, ge=0, le=3650, description="Janela de compras em dias (0 = todas)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
) -> Dict[str, Any]:
    return await SupplierInsightsService(db).ranking(tenant_id, days=days)


@router.get(
    "/cost-comparison",
    summary="Comparação de custo entre fornecedores",
    description=(
        "Produtos comprados de mais de um fornecedor: menor e maior último custo, economia por unidade e "
        "em %, e quem é o mais barato. Traz também aumentos de custo de 10% ou mais entre as duas últimas "
        "compras do mesmo fornecedor."
    ),
)
async def supplier_cost_comparison(
    only_multi: bool = Query(True, description="Só produtos com 2+ fornecedores"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
) -> Dict[str, Any]:
    return await SupplierInsightsService(db).cost_comparison(tenant_id, only_multi=only_multi)


@router.get(
    "/restock-list",
    summary="Lista de reposição por fornecedor",
    description=(
        "Variações com estoque baixo e venda recente, agrupadas pelo fornecedor de menor custo, com "
        "quantidade sugerida (cobre `cover_days` dias de vendas) e texto pronto para WhatsApp."
    ),
)
async def supplier_restock_list(
    cover_days: int = Query(30, ge=7, le=180, description="Dias de venda que a reposição deve cobrir"),
    low_threshold: int = Query(2, ge=0, le=50, description="Estoque máximo para entrar na lista"),
    lookback_days: int = Query(90, ge=14, le=365, description="Janela usada para medir o ritmo de vendas"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
) -> Dict[str, Any]:
    return await SupplierInsightsService(db).restock_list(
        tenant_id, cover_days=cover_days, low_threshold=low_threshold, lookback_days=lookback_days
    )
