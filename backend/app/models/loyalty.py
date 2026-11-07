"""Extrato de pontos de fidelidade: cada ganho tem validade própria (configurável por loja) e o resgate gasta primeiro o que vence antes."""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel

# earn = pontos ganhos numa compra; opening = saldo que a cliente já tinha quando o programa foi configurado;
# redeem = pontos usados como pagamento; revoke = pontos tirados por devolução ou cancelamento;
# restore = pontos devolvidos (venda paga com pontos que foi cancelada ou devolvida); expire = venceram; adjust = ajuste do admin
KIND_EARN, KIND_OPENING, KIND_REDEEM, KIND_REVOKE = "earn", "opening", "redeem", "revoke"
KIND_RESTORE, KIND_EXPIRE, KIND_ADJUST = "restore", "expire", "adjust"
KIND_LABELS = {
    KIND_EARN: "Pontos da compra", KIND_OPENING: "Saldo anterior", KIND_REDEEM: "Pontos usados",
    KIND_REVOKE: "Pontos tirados (devolução)", KIND_RESTORE: "Pontos devolvidos", KIND_EXPIRE: "Pontos vencidos",
    KIND_ADJUST: "Ajuste",
}


class LoyaltyEntry(BaseModel):
    __tablename__ = "loyalty_entries"
    __table_args__ = (Index("ix_loyalty_customer_remaining", "tenant_id", "customer_id", "remaining"),)

    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    sale_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sales.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)
    points: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, comment="Com sinal: ganho +, uso e perda -")
    # só nos lançamentos que somam saldo (earn, opening, restore, adjust positivo): quanto ainda está disponível
    remaining: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
