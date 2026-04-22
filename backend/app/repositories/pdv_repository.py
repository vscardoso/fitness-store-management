"""
Repository para PDVTerminal.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Sequence

from app.models.pdv_terminal import PDVTerminal
from app.repositories.base import BaseRepository


class PDVTerminalRepository(BaseRepository[PDVTerminal, dict, dict]):
    def __init__(self):
        super().__init__(PDVTerminal)

    async def get_by_tenant(self, db: AsyncSession, tenant_id: int) -> Sequence[PDVTerminal]:
        result = await db.execute(
            select(PDVTerminal)
            .where(PDVTerminal.tenant_id == tenant_id)
            .where(PDVTerminal.is_active == True)
            .order_by(PDVTerminal.name)
        )
        return result.scalars().all()

    async def get_by_external_id(
        self, db: AsyncSession, external_id: str, tenant_id: int
    ) -> Optional[PDVTerminal]:
        result = await db.execute(
            select(PDVTerminal)
            .where(PDVTerminal.external_id == external_id)
            .where(PDVTerminal.tenant_id == tenant_id)
            .where(PDVTerminal.is_active == True)
        )
        return result.scalar_one_or_none()
