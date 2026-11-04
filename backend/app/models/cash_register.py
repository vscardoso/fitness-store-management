"""
Caixa da loja: turno (abertura com o dinheiro que já estava na gaveta, fechamento com a contagem) e movimentos
manuais (suprimento = entrou dinheiro; sangria = saiu dinheiro).

O dinheiro das vendas e das devoluções NÃO é gravado aqui: o esperado no caixa é calculado na hora a partir dos
pagamentos em dinheiro (`payments`) e das devoluções pagas em dinheiro, dentro da janela do turno. Assim o caixa
nunca discorda das vendas. Ao fechar, o resultado vira uma fotografia (não muda mais).
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel

SESSION_OPEN = "open"
SESSION_CLOSED = "closed"
KIND_SUPPLY = "supply"          # entrou dinheiro no caixa (reforço de troco, aporte)
KIND_WITHDRAWAL = "withdrawal"  # saiu dinheiro do caixa (sangria, pagamento, retirada)


class CashSession(BaseModel):
    __tablename__ = "cash_sessions"
    __table_args__ = (
        # uma loja só tem UM caixa aberto por vez
        Index(
            "uq_cash_sessions_one_open", "tenant_id", unique=True,
            postgresql_where=text("status = 'open'"), sqlite_where=text("status = 'open'"),
        ),
    )

    status: Mapped[str] = mapped_column(String(10), default=SESSION_OPEN, server_default=SESSION_OPEN, nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    opened_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    opened_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    opening_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, comment="Dinheiro na gaveta ao abrir")
    opening_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    closed_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    closing_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # fotografia do fechamento (nulas enquanto o caixa está aberto: o aberto é sempre calculado ao vivo)
    counted_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True, comment="Dinheiro contado na gaveta")
    expected_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True, comment="Dinheiro que o sistema esperava")
    difference: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True, comment="contado - esperado (negativo = faltou)")
    cash_sales: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    cash_refunds: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    supplies_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    withdrawals_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    sales_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    other_methods: Mapped[str | None] = mapped_column(Text, nullable=True, comment="JSON: total por forma de pagamento (não-dinheiro)")


class CashMovement(BaseModel):
    __tablename__ = "cash_movements"
    __table_args__ = (Index("ix_cash_movements_session", "session_id"),)

    session_id: Mapped[int] = mapped_column(ForeignKey("cash_sessions.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False, comment="supply | withdrawal")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # sangria para o banco / reforço vindo do banco: a transferência gravada junto (o Financeiro conta só ela)
    transfer_id: Mapped[int | None] = mapped_column(ForeignKey("account_transfers.id", ondelete="SET NULL"), nullable=True)
