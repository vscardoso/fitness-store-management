"""
API endpoints for batch management.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.api.deps import get_db, get_current_user, require_role
from app.models.user import User, UserRole
from app.services.batch import BatchService
from app.schemas.batch import BatchCreate, BatchUpdate, BatchResponse, BatchSummary

router = APIRouter()
batch_service = BatchService()


@router.post("/", response_model=BatchResponse)
async def create_batch(
    batch_data: BatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER]))
):
    """
    Create a new batch.

    Requires ADMIN or SELLER role.
    """
    try:
        batch = await batch_service.create_batch(db, batch_data)

        # Calculate derived fields for response
        response_data = BatchResponse(
            **batch.__dict__,
            product_count=batch.get_product_count(),
            is_expired=batch.is_expired(),
            days_until_expiration=batch.days_until_expiration()
        )
        return response_data

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[BatchSummary])
async def get_batches(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records to return"),
    search: Optional[str] = Query(None, description="Search by batch number or name"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all batches with optional search.

    Returns simplified batch data for lists.
    """
    batches = await batch_service.get_all_batches(db, skip=skip, limit=limit, search=search)

    return [
        BatchSummary(
            **batch.__dict__,
            product_count=batch.get_product_count(),
            is_expired=batch.is_expired()
        )
        for batch in batches
    ]


@router.get("/expired", response_model=List[BatchSummary])
async def get_expired_batches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all expired batches.
    """
    batches = await batch_service.get_expired_batches(db)

    return [
        BatchSummary(
            **batch.__dict__,
            product_count=batch.get_product_count(),
            is_expired=True
        )
        for batch in batches
    ]


@router.get("/expiring-soon", response_model=List[BatchSummary])
async def get_expiring_soon(
    days: int = Query(30, ge=1, le=365, description="Number of days to check ahead"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get batches expiring within specified days.
    """
    batches = await batch_service.get_expiring_soon(db, days)

    return [
        BatchSummary(
            **batch.__dict__,
            product_count=batch.get_product_count(),
            is_expired=batch.is_expired()
        )
        for batch in batches
    ]


@router.get("/reports/slow-moving", response_model=List[dict])
async def get_slow_moving_report(
    min_days: int = Query(60, ge=1, le=365, description="Dias mínimos desde a compra"),
    min_remaining: int = Query(15, ge=0, description="Peças mínimas paradas"),
    max_sell_through: float = Query(50.0, ge=0, le=100, description="Máxima taxa de venda (%)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Relatório de lotes com venda lenta.

    Retorna lotes mais antigos com muitas peças paradas e baixa taxa de venda,
    além de uma sugestão de ação.
    """
    batches = await batch_service.get_slow_moving_batches(
        db,
        min_days=min_days,
        min_remaining=min_remaining,
        max_sell_through=max_sell_through,
    )

    result = []
    for b in batches:
        suggestion = None
        if b.days_since_purchase >= 90 and b.items_remaining >= 30:
            suggestion = "Fazer promoção!"
        elif b.days_since_purchase >= 60 and b.items_remaining >= 15:
            suggestion = "Avaliar promoção e giro"

        result.append({
            "id": b.id,
            "batch_code": b.batch_code,
            "days_since_purchase": b.days_since_purchase,
            "items_remaining": b.items_remaining,
            "sell_through_rate": round(b.sell_through_rate, 1),
            "roi": round(b.roi, 1),
            "total_revenue": round(b.total_revenue, 2),
            "profit": round(b.profit, 2),
            "suggestion": suggestion,
        })

    return result


@router.get("/reports/best-performing", response_model=List[dict])
async def get_best_performing_report(
    limit: int = Query(10, ge=1, le=100, description="Quantidade de lotes"),
    min_sell_through: float = Query(70.0, ge=0, le=100, description="Mínimo de venda (%)"),
    min_roi: float = Query(30.0, ge=0, le=500, description="ROI mínimo (%)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Relatório de lotes com melhor performance (alta venda e ROI).
    """
    batches = await batch_service.get_best_performing_batches(
        db,
        limit=limit,
        min_sell_through=min_sell_through,
        min_roi=min_roi,
    )

    result = []
    for b in batches:
        suggestion = "Comprar mais no próximo lote!" if b.sell_through_rate >= 80 and b.roi >= 40 else None
        result.append({
            "id": b.id,
            "batch_code": b.batch_code,
            "sell_through_rate": round(b.sell_through_rate, 1),
            "roi": round(b.roi, 1),
            "total_items": b.total_items,
            "items_sold": b.items_sold,
            "items_remaining": b.items_remaining,
            "total_revenue": round(b.total_revenue, 2),
            "profit": round(b.profit, 2),
            "suggestion": suggestion,
        })

    return result


@router.get("/by-supplier/{supplier}", response_model=List[BatchSummary])
async def get_batches_by_supplier(
    supplier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get batches by supplier.
    """
    batches = await batch_service.get_by_supplier(db, supplier)

    return [
        BatchSummary(
            **batch.__dict__,
            product_count=batch.get_product_count(),
            is_expired=batch.is_expired()
        )
        for batch in batches
    ]


@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(
    batch_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get batch by ID.
    """
    batch = await batch_service.get_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    return BatchResponse(
        **batch.__dict__,
        product_count=batch.get_product_count(),
        is_expired=batch.is_expired(),
        days_until_expiration=batch.days_until_expiration()
    )


@router.get("/by-number/{batch_number}", response_model=BatchResponse)
async def get_batch_by_number(
    batch_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get batch by batch number.
    """
    batch = await batch_service.get_batch_by_number(db, batch_number)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    return BatchResponse(
        **batch.__dict__,
        product_count=batch.get_product_count(),
        is_expired=batch.is_expired(),
        days_until_expiration=batch.days_until_expiration()
    )


@router.put("/{batch_id}", response_model=BatchResponse)
async def update_batch(
    batch_id: int,
    batch_data: BatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SELLER]))
):
    """
    Update batch.

    Requires ADMIN or SELLER role.
    """
    try:
        batch = await batch_service.update_batch(db, batch_id, batch_data)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

        return BatchResponse(
            **batch.__dict__,
            product_count=batch.get_product_count(),
            is_expired=batch.is_expired(),
            days_until_expiration=batch.days_until_expiration()
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{batch_id}")
async def delete_batch(
    batch_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Soft delete batch.

    Requires ADMIN role.
    """
    try:
        deleted = await batch_service.delete_batch(db, batch_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Batch not found")

        return {"message": "Batch deleted successfully"}

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))