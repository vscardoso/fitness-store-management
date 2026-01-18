from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.repositories.base import BaseRepository
from app.models.notification import PushToken, NotificationLog


class PushTokenRepository(BaseRepository[PushToken, Any, Any]):
    def __init__(self):
        super().__init__(PushToken)

    async def get_by_user(self, db: AsyncSession, user_id: int) -> PushToken | None:
        result = await db.execute(
            select(PushToken).where(PushToken.user_id == user_id, PushToken.is_active == True)
        )
        return result.scalars().first()

    async def get_tokens_by_users(self, db: AsyncSession, user_ids: list[int]) -> list[PushToken]:
        result = await db.execute(
            select(PushToken).where(
                PushToken.user_id.in_(user_ids),
                PushToken.is_active == True
            )
        )
        return result.scalars().all()


class NotificationLogRepository(BaseRepository[NotificationLog, Any, Any]):
    def __init__(self):
        super().__init__(NotificationLog)
