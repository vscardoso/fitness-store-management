from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class PushTokenCreate(BaseModel):
    token: str = Field(..., min_length=10)
    device_type: Optional[str] = None


class PushTokenResponse(BaseModel):
    id: int
    user_id: int
    token: str
    device_type: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class SendNotificationRequest(BaseModel):
    user_ids: list[int] = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    data: Optional[dict] = None


class NotificationResponse(BaseModel):
    success: bool
    sent_count: int
    failed_count: int
    errors: list[str] = []
