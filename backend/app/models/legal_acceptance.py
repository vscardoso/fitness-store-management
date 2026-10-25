"""Aceite dos Termos de Uso e da Política de Privacidade: quem, qual versão, quando e de onde."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.models.base import BaseModel


class LegalAcceptance(BaseModel):
    __tablename__ = "legal_acceptances"
    __table_args__ = (UniqueConstraint("user_id", "version", name="uq_legal_acceptance_user_version"),)

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    version = Column(String(20), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=False)
    channel = Column(String(10), nullable=False)  # signup, login
    ip = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
