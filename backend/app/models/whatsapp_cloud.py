"""
WhatsApp oficial (Cloud API da Meta): número da loja, conversas e mensagens.

O webhook descobre a loja pelo `phone_number_id` que a Meta manda em cada evento
(tabela whatsapp_cloud_numbers). Uma conversa é um contato falando com um número;
o contato pode chegar só com telefone, só com BSUID (identificador por empresa) ou com os dois.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import expression

from app.models.base import BaseModel


class WhatsAppCloudNumber(BaseModel):
    """Número ligado à Cloud API, vinculado a uma loja."""
    __tablename__ = "whatsapp_cloud_numbers"

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    phone_number_id = Column(String(64), nullable=False, unique=True, index=True)  # ID do número na Meta (não é segredo)
    waba_id = Column(String(64), nullable=True)  # ID da conta do WhatsApp Business
    display_phone_number = Column(String(32), nullable=True)
    verified_name = Column(String(120), nullable=True)
    # Saudação automática: manda 1 vez por janela de 24 h quando a cliente escreve (desligada por padrão)
    greeting_enabled = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    greeting_text = Column(Text, nullable=True)
    # Mensagem de ausência: fora do horário comercial, 1 vez por janela de 24 h (a API da Meta não tem isso)
    away_enabled = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    away_text = Column(Text, nullable=True)
    business_hours = Column(Text, nullable=True)  # JSON {"mon": [["09:00","18:00"]], ... "sun": []}; nulo = sem horário (sempre aberto)
    # Coexistência (WhatsApp Business app do celular + Cloud API no mesmo número, ligado pelo Embedded Signup).
    # Número em coexistência: o celular da loja tem a própria saudação/ausência, então as do Provador NÃO disparam.
    is_coexistence = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    business_id = Column(String(64), nullable=True)            # portfólio empresarial da loja na Meta (não é segredo)
    # Token de negócio da loja (troca do código do Embedded Signup). CIFRADO (app/core/secret_box.py);
    # nunca vai em resposta de API nem em log.
    access_token_encrypted = Column(Text, nullable=True)
    connected_at = Column(DateTime(timezone=True), nullable=True)
    connection_status = Column(String(20), nullable=True)      # connected, disconnected, attention (nulo = ligado à mão)
    connection_event = Column(String(60), nullable=True)       # último evento do account_update (ex.: PARTNER_REMOVED)
    connection_event_at = Column(DateTime(timezone=True), nullable=True)
    connection_detail = Column(Text, nullable=True)            # JSON resumido do evento (motivo da desconexão etc.)
    contacts_sync_requested_at = Column(DateTime(timezone=True), nullable=True)  # smb_app_data smb_app_state_sync (1 vez)
    history_sync_requested_at = Column(DateTime(timezone=True), nullable=True)   # smb_app_data history (1 vez)
    history_sync_status = Column(String(20), nullable=True)    # requested, receiving, done, declined
    history_sync_progress = Column(Integer, nullable=True)     # 0 a 100 da última fase recebida
    history_sync_phase = Column(Integer, nullable=True)        # 0, 1 ou 2 (a Meta manda o histórico em 3 fases)


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
    last_greeting_at = Column(DateTime(timezone=True), nullable=True)  # trava da saudação: 1 por janela de 24 h
    last_away_at = Column(DateTime(timezone=True), nullable=True)      # trava da ausência: 1 por janela de 24 h
    contact_name = Column(String(255), nullable=True)  # nome salvo na agenda do celular da loja (coexistência)

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
    # Cobrança que a Meta informa no status da mensagem enviada (campo `pricing`); nulo = a Meta ainda não informou
    pricing_billable = Column(Boolean, nullable=True)
    pricing_category = Column(String(40), nullable=True)   # service, utility, marketing, authentication, referral_conversion...
    pricing_type = Column(String(40), nullable=True)       # regular, free_customer_service, free_entry_point...
    pricing_model = Column(String(16), nullable=True)      # CBP (por conversa) ou PMP (por mensagem)
    pricing_raw = Column(Text, nullable=True)              # JSON do `pricing` como a Meta mandou
    # De onde veio: api (enviada pelo Provador), phone_app (enviada pelo celular da loja, eco da coexistência),
    # history (histórico importado na coexistência). Nulo = recebida pelo webhook normal (ou anterior a esta coluna).
    source = Column(String(12), nullable=True)

    conversation = relationship("WhatsAppConversation", back_populates="messages")


class WhatsAppContact(BaseModel):
    """Contato da agenda do celular da loja (coexistência, webhook smb_app_state_sync).

    "remove" no celular só desativa a linha (nunca apaga); o nome fica nas conversas que já tinham.
    """
    __tablename__ = "whatsapp_contacts"
    __table_args__ = (UniqueConstraint("number_id", "phone", name="uq_whatsapp_contact_phone"),)

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    number_id = Column(Integer, ForeignKey("whatsapp_cloud_numbers.id"), nullable=False, index=True)
    phone = Column(String(20), nullable=False)          # normalizado (normalize_phone)
    full_name = Column(String(255), nullable=True)
    first_name = Column(String(120), nullable=True)
    synced_at = Column(DateTime(timezone=True), nullable=True)


class WhatsAppQuickReply(BaseModel):
    """Resposta rápida da loja: o atalho (`/preco`) abre o texto no campo de resposta."""
    __tablename__ = "whatsapp_quick_replies"
    __table_args__ = (UniqueConstraint("tenant_id", "shortcut", name="uq_whatsapp_quick_reply_shortcut"),)

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    shortcut = Column(String(40), nullable=False)   # sem a barra, minúsculo, letras/números/_-
    text = Column(Text, nullable=False)


class WhatsAppLabel(BaseModel):
    """Etiqueta das conversas (só do Provador: as do app WhatsApp Business não sincronizam com a API)."""
    __tablename__ = "whatsapp_labels"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_whatsapp_label_name"),)

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    name = Column(String(40), nullable=False)
    color_key = Column(String(20), nullable=False, default="primary")  # chave do tema do app (primary, success, warning...)


class WhatsAppConversationLabel(BaseModel):
    """Liga etiqueta e conversa (N:N). Tirar a etiqueta desativa a linha, nunca apaga."""
    __tablename__ = "whatsapp_conversation_labels"
    __table_args__ = (UniqueConstraint("conversation_id", "label_id", name="uq_whatsapp_conversation_label"),)

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("whatsapp_conversations.id"), nullable=False, index=True)
    label_id = Column(Integer, ForeignKey("whatsapp_labels.id"), nullable=False, index=True)
