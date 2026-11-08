"""Livro de movimentos de cada lote (item de entrada): toda mudança em `entry_items.quantity_remaining` vira um registro.

Cada registro guarda o saldo ANTES e DEPOIS, o motivo (venda, baixa, exclusão de variação...) e quem fez. Os registros de um
lote formam uma corrente: o "antes" de um é o "depois" do anterior e o último "depois" é o saldo de agora. Se o saldo for
diferente do último registro, alguém mexeu sem passar pelo livro (ver `app/services/stock_ledger.py`).
"""
from typing import Optional

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class EntryItemEvent(BaseModel):
    __tablename__ = "entry_item_events"
    __table_args__ = (Index("ix_entry_item_events_item", "entry_item_id", "id"),)

    entry_item_id: Mapped[int] = mapped_column(ForeignKey("entry_items.id"), nullable=False, index=True)
    variant_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    product_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    reason: Mapped[str] = mapped_column(String(40), nullable=False, comment="Por que a quantidade mudou (ver REASONS)")
    delta: Mapped[int] = mapped_column(Integer, nullable=False, comment="Com sinal: entrou +, saiu -")
    before: Mapped[int] = mapped_column(Integer, nullable=False)
    after: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ref: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, comment="Ex.: sale:123, count:7")
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reconstructed: Mapped[bool] = mapped_column(
        default=False, server_default="false", nullable=False,
        comment="True = registro refeito depois, a partir de outras provas (não foi gravado na hora)",
    )
