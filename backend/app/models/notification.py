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


class AppNotification(BaseModel):
    """Caixa de entrada de alertas da loja (estoque baixo etc.), compartilhada pelo tenant"""
    __tablename__ = "app_notifications"

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    kind = Column(String(40), nullable=False, index=True)  # low_stock, out_of_stock
    dedupe_key = Column(String(120), nullable=False, index=True)  # ex.: low_stock:12
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
