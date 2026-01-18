from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Text, DateTime
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class PushToken(BaseModel):
    """Token Expo Push para notificações"""
    __tablename__ = "push_tokens"

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True, index=True)
    device_type = Column(String(20), nullable=True)  # ios, android

    user = relationship("User", back_populates="push_tokens")


class NotificationLog(BaseModel):
    """Log de notificações enviadas"""
    __tablename__ = "notification_logs"

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    data = Column(Text, nullable=True)  # JSON
    sent_at = Column(DateTime, nullable=False)
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
