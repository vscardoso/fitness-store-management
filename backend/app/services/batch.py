"""
Business logic for batch operations.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import date

from app.models.batch import Batch
from app.repositories.batch import BatchRepository
from app.schemas.batch import BatchCreate, BatchUpdate


class BatchService:
    """Service for batch business logic."""

    def __init__(self):
        self.batch_repo = BatchRepository()

    async def create_batch(self, db: AsyncSession, batch_data: BatchCreate) -> Batch:
        """
        Create a new batch.

        Args:
            db: Database session
            batch_data: Batch creation data

        Returns:
            Created batch

        Raises:
            ValueError: If batch number already exists
        """
        # Check if batch number already exists
        existing = await self.batch_repo.get_by_batch_number(db, batch_data.batch_number)
        if existing:
            raise ValueError(f"Batch number '{batch_data.batch_number}' already exists")

        # Validate dates
        if batch_data.expiration_date and batch_data.expiration_date <= batch_data.production_date:
            raise ValueError("Expiration date must be after production date")

        batch = await self.batch_repo.create(db, obj_in=batch_data.model_dump())
        return batch

    async def get_batch(self, db: AsyncSession, batch_id: int) -> Optional[Batch]:
        """
        Get batch by ID.

        Args:
            db: Database session
            batch_id: Batch ID

        Returns:
            Batch if found, None otherwise
        """
        return await self.batch_repo.get(db, id=batch_id)

    async def get_batch_by_number(self, db: AsyncSession, batch_number: str) -> Optional[Batch]:
        """
        Get batch by batch number.

        Args:
            db: Database session
            batch_number: Batch number

        Returns:
            Batch if found, None otherwise
        """
        return await self.batch_repo.get_by_batch_number(db, batch_number)

    async def get_all_batches(
        self,
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None
    ) -> List[Batch]:
        """
        Get all batches with optional search.

        Args:
            db: Database session
            skip: Number of records to skip
            limit: Maximum number of records to return
            search: Optional search query

        Returns:
            List of batches
        """
        if search:
            return await self.batch_repo.search(db, search)

        return await self.batch_repo.get_multi(db, skip=skip, limit=limit)

    async def update_batch(self, db: AsyncSession, batch_id: int, batch_data: BatchUpdate) -> Optional[Batch]:
        """
        Update batch.

        Args:
            db: Database session
            batch_id: Batch ID
            batch_data: Updated batch data

        Returns:
            Updated batch if found, None otherwise

        Raises:
            ValueError: If validation fails
        """
        batch = await self.batch_repo.get(db, id=batch_id)
        if not batch:
            return None

        # Check if new batch number conflicts
        if batch_data.batch_number and batch_data.batch_number != batch.batch_number:
            existing = await self.batch_repo.get_by_batch_number(db, batch_data.batch_number)
            if existing:
                raise ValueError(f"Batch number '{batch_data.batch_number}' already exists")

        # Validate dates
        production_date = batch_data.production_date or batch.production_date
        expiration_date = batch_data.expiration_date or batch.expiration_date

        if expiration_date and expiration_date <= production_date:
            raise ValueError("Expiration date must be after production date")

        return await self.batch_repo.update(db, id=batch_id, obj_in=batch_data.model_dump(exclude_unset=True))

    async def delete_batch(self, db: AsyncSession, batch_id: int) -> bool:
        """
        Soft delete batch.

        Args:
            db: Database session
            batch_id: Batch ID

        Returns:
            True if deleted, False if not found

        Raises:
            ValueError: If batch has active products
        """
        batch = await self.batch_repo.get(db, id=batch_id)
        if not batch:
            return False

        # Check if batch has active products
        active_products = [p for p in batch.products if p.is_active]
        if active_products:
            raise ValueError(f"Cannot delete batch with {len(active_products)} active products")

        await self.batch_repo.delete(db, id=batch_id)
        return True

    async def get_expired_batches(self, db: AsyncSession) -> List[Batch]:
        """
        Get all expired batches.

        Args:
            db: Database session

        Returns:
            List of expired batches
        """
        return await self.batch_repo.get_expired_batches(db)

    async def get_expiring_soon(self, db: AsyncSession, days: int = 30) -> List[Batch]:
        """
        Get batches expiring within specified days.

        Args:
            db: Database session
            days: Number of days to check ahead

        Returns:
            List of batches expiring soon
        """
        return await self.batch_repo.get_expiring_soon(db, days)

    async def get_by_supplier(self, db: AsyncSession, supplier: str) -> List[Batch]:
        """
        Get batches by supplier.

        Args:
            db: Database session
            supplier: Supplier name

        Returns:
            List of batches from supplier
        """
        return await self.batch_repo.get_by_supplier(db, supplier)

    async def get_slow_moving_batches(
        self,
        db: AsyncSession,
        *,
        min_days: int = 60,
        min_remaining: int = 15,
        max_sell_through: float = 50.0
    ) -> List[Batch]:
        """
        Batches com venda lenta: antigos, com muitas peças paradas e baixa taxa de venda.

        Args:
            db: Sessão
            min_days: mínimo de dias desde a compra
            min_remaining: peças mínimas paradas
            max_sell_through: taxa máxima de venda (%)

        Returns:
            Lista de batches ordenada por (dias desde compra desc, peças restantes desc)
        """
        candidates = await self.batch_repo.get_slow_moving_batches(db, days=min_days)

        filtered = [
            b for b in candidates
            if b.items_remaining >= min_remaining and b.sell_through_rate <= max_sell_through
        ]

        # Ordenar por mais críticos primeiro
        filtered.sort(key=lambda b: (b.days_since_purchase, b.items_remaining, -b.sell_through_rate), reverse=True)
        return filtered

    async def get_best_performing_batches(
        self,
        db: AsyncSession,
        *,
        limit: int = 10,
        min_sell_through: float = 70.0,
        min_roi: float = 30.0
    ) -> List[Batch]:
        """
        Melhores lotes por performance (ROI e sell-through).

        Args:
            db: Sessão
            limit: máximo de lotes a retornar
            min_sell_through: venda mínima (%)
            min_roi: ROI mínimo (%)

        Returns:
            Lista de batches ordenada por (ROI desc, sell_through desc)
        """
        # Buscar mais candidatos que o limit, para filtrar depois
        candidates = await self.batch_repo.get_best_performing_batches(db, limit=limit * 3)

        filtered = [
            b for b in candidates
            if b.sell_through_rate >= min_sell_through and b.roi >= min_roi
        ]

        filtered.sort(key=lambda b: (b.roi, b.sell_through_rate), reverse=True)
        return filtered[:limit]