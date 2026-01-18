from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
import httpx
from typing import Optional
from app.repositories.notification_repository import PushTokenRepository, NotificationLogRepository
from app.models.notification import PushToken, NotificationLog


class NotificationService:
    def __init__(self):
        self.token_repo = PushTokenRepository()
        self.log_repo = NotificationLogRepository()
        self.expo_url = "https://exp.host/--/api/v2/push/send"

    async def register_token(
        self, db: AsyncSession, user_id: int, tenant_id: int, token: str, device_type: Optional[str] = None
    ) -> PushToken:
        """Registra ou atualiza token"""
        existing = await self.token_repo.get_by_user(db, user_id)

        if existing:
            existing.token = token
            existing.device_type = device_type
            await db.commit()
            await db.refresh(existing)
            return existing

        push_token = PushToken(
            user_id=user_id,
            tenant_id=tenant_id,
            token=token,
            device_type=device_type,
        )
        db.add(push_token)
        await db.commit()
        await db.refresh(push_token)
        return push_token

    async def send_notification(
        self,
        db: AsyncSession,
        tenant_id: int,
        user_ids: list[int],
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> dict:
        """Envia notificação via Expo Push"""
        tokens = await self.token_repo.get_tokens_by_users(db, user_ids)

        if not tokens:
            return {"success": False, "sent_count": 0, "failed_count": 0, "errors": ["Nenhum token encontrado"]}

        messages = []
        for token in tokens:
            messages.append({
                "to": token.token,
                "title": title,
                "body": body,
                "data": data or {},
                "sound": "default",
            })

        success_count = 0
        failed_count = 0
        errors = []

        async with httpx.AsyncClient() as client:
            response = await client.post(self.expo_url, json=messages)
            result = response.json()

            for idx, item in enumerate(result.get("data", [])):
                user_id = tokens[idx].user_id if idx < len(tokens) else None

                if item.get("status") == "ok":
                    success_count += 1
                    await self._log_notification(db, tenant_id, user_id, title, body, data, True, None)
                else:
                    failed_count += 1
                    error_msg = item.get("message", "Unknown error")
                    errors.append(f"User {user_id}: {error_msg}")
                    await self._log_notification(db, tenant_id, user_id, title, body, data, False, error_msg)

        return {
            "success": success_count > 0,
            "sent_count": success_count,
            "failed_count": failed_count,
            "errors": errors,
        }

    async def _log_notification(
        self, db: AsyncSession, tenant_id: int, user_id: Optional[int],
        title: str, body: str, data: Optional[dict], success: bool, error_message: Optional[str]
    ):
        """Salva log"""
        import json
        log = NotificationLog(
            tenant_id=tenant_id,
            user_id=user_id,
            title=title,
            body=body,
            data=json.dumps(data) if data else None,
            sent_at=datetime.utcnow(),
            success=success,
            error_message=error_message,
        )
        db.add(log)
        await db.commit()
