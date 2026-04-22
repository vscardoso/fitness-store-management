"""
Modelo de transações PIX — auditoria e idempotência.

Registra cada QR Code gerado e o status do pagamento.
Garante que o mesmo payment_id não seja processado duas vezes.
"""
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Numeric, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from .base import BaseModel


class PixTransaction(BaseModel):
    """
    Rastreia cada pagamento PIX gerado pelo PDV.

    Regras de integridade:
    - payment_id é ÚNICO — garante idempotência no processamento de webhooks
    - amount_expected deve bater com sale.total_amount
    - amount_paid é preenchido apenas quando aprovado (via webhook ou polling)
    - status segue o ciclo: pending → approved | rejected | cancelled | expired
    """
    __tablename__ = "pix_transactions"
    __table_args__ = (
        UniqueConstraint("payment_id", name="uq_pix_payment_id"),
        Index("ix_pix_transactions_sale_id", "sale_id"),
        Index("ix_pix_transactions_status", "status"),
    )

    # Provider que gerou o PIX (ex: mercadopago)
    provider: Mapped[str] = mapped_column(
        String(50),
        default="mercadopago",
        server_default="mercadopago",
        nullable=False,
        comment="Provider: mercadopago (futuro: outros PSPs)",
    )

    # ID do pagamento no provider — chave de idempotência
    payment_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="ID do pagamento no provider (idempotency key)",
    )

    # Venda associada
    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="RESTRICT"),
        nullable=False,
        comment="ID da venda associada",
    )

    # Valores — campo crítico de segurança
    amount_expected: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Valor esperado da venda (do sistema)",
    )
    amount_paid: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        comment="Valor efetivamente pago (do MP) — preenchido após aprovação",
    )

    # Status do ciclo de vida do PIX
    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
        nullable=False,
        comment="pending | approved | rejected | cancelled | expired",
    )

    # Referência externa — "sale_{id}_tenant_{id}"
    mp_external_reference: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="external_reference enviado ao Mercado Pago",
    )

    # Email do pagador (para compliance MP e rastreabilidade)
    payer_email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Email do pagador informado ao MP",
    )

    # Timestamps de ciclo de vida
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Expiração do QR Code PIX (padrão MP: 30 min)",
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp da confirmação do pagamento",
    )

    # Origem da confirmação — para auditoria
    confirmed_by: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="webhook | polling — como o pagamento foi confirmado",
    )
