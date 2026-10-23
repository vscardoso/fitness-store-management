"""
WhatsApp oficial (Cloud API da Meta): número da loja, conversas e mensagens.

O webhook descobre a loja pelo `phone_number_id` que a Meta manda em cada evento
(tabela whatsapp_cloud_numbers). Uma conversa é um contato falando com um número;
o contato pode chegar só com telefone, só com BSUID (identificador por empresa) ou com os dois.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class WhatsAppCloudNumber(BaseModel):
    """Número ligado à Cloud API, vinculado a uma loja."""
    __tablename__ = "whatsapp_cloud_numbers"

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    phone_number_id = Column(String(64), nullable=False, unique=True, index=True)  # ID do número na Meta (não é segredo)
    waba_id = Column(String(64), nullable=True)  # ID da conta do WhatsApp Business
    display_phone_number = Column(String(32), nullable=True)
    verified_name = Column(String(120), nullable=True)


class WhatsAppConversation(BaseModel):
    """Conversa entre um contato e um número da loja."""
    __tablename__ = "whatsapp_conversations"
    __table_args__ = (
        UniqueConstraint("number_id", "contact_key", name="uq_whatsapp_conversation_contact"),
    )

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    number_id = Column(Integer, ForeignKey("whatsapp_cloud_numbers.id"), nullable=False, index=True)
    # Chave estável do contato: telefone normalizado (55 + DDD + 9 dígitos no celular) ou "u:" + BSUID
    contact_key = Column(String(160), nullable=False)
    phone = Column(String(20), nullable=True, index=True)   # normalizado; nulo quando a Meta só manda BSUID
    wa_id = Column(String(32), nullable=True)               # como a Meta mandou (pode vir sem o 9)
    bsuid = Column(String(150), nullable=True, index=True)
    profile_name = Column(String(255), nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    last_inbound_at = Column(DateTime(timezone=True), nullable=True)  # abre a janela de 24 h
    unread_count = Column(Integer, nullable=False, default=0)

    messages = relationship("WhatsAppMessage", back_populates="conversation")


class WhatsAppMessage(BaseModel):
    """Mensagem recebida ou enviada. `wamid` (id da Meta) é único: base da idempotência."""
    __tablename__ = "whatsapp_messages"

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("whatsapp_conversations.id"), nullable=False, index=True)
    wamid = Column(String(255), nullable=False, unique=True, index=True)
    direction = Column(String(3), nullable=False)       # in, out
    msg_type = Column(String(30), nullable=False)       # text, image, audio, button, interactive, reaction...
    text = Column(Text, nullable=True)                  # texto, legenda ou título do botão escolhido
    payload = Column(Text, nullable=True)               # JSON da mensagem como a Meta mandou
    sent_at = Column(DateTime(timezone=True), nullable=True)  # horário informado pela Meta
    status = Column(String(12), nullable=False)         # received, sent, delivered, read, failed
    status_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)                 # JSON dos erros quando status = failed

    conversation = relationship("WhatsAppConversation", back_populates="messages")
