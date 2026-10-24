"""
Desconto de UM fornecedor dentro de uma entrada com vários fornecedores.

O desconto vale só para os itens daquele fornecedor (rateado proporcional ao custo de cada item dele).
O desconto "geral" da entrada continua em stock_entries.discount_amount e vale para todos os itens.
"""
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class EntrySupplierDiscount(BaseModel):
    __tablename__ = "entry_supplier_discounts"
    __table_args__ = (UniqueConstraint("entry_id", "supplier_id", name="uq_entry_supplier_discount"),)

    entry_id: Mapped[int] = mapped_column(ForeignKey("stock_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"), server_default="0")
