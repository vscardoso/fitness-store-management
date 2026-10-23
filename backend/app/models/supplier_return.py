"""
Devolução ao fornecedor: peça com defeito (vinda de uma troca de cliente) ou peça comprada em condicional que
a loja devolve ao fornecedor para trocar por outra.

Fluxo: enviada -> resolvida (trocada por outra peça, creditada em dinheiro ou recusada pelo fornecedor).
"""
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class SupplierReturn(BaseModel):
    __tablename__ = "supplier_returns"

    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True, comment="Fornecedor que recebe a peça"
    )
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("stock_entries.id", ondelete="RESTRICT"), nullable=False, index=True, comment="Entrada de onde a peça veio"
    )
    entry_item_id: Mapped[int] = mapped_column(
        ForeignKey("entry_items.id", ondelete="RESTRICT"), nullable=False, index=True, comment="Item da entrada de origem"
    )
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    return_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("return_items.id", ondelete="SET NULL"), nullable=True, index=True,
        comment="Item de devolução de cliente (peça com defeito) que originou este envio"
    )

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, comment="Custo da mercadoria por peça")
    from_stock: Mapped[bool] = mapped_column(
        default=False, server_default="false", nullable=False,
        comment="True = a peça estava no estoque (saiu dele ao enviar); False = já estava fora (defeito de cliente)"
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="sent", server_default="sent",
                                        comment="sent | exchanged | credited | rejected")
    resolved_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    credit_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    replacement_entry_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("entry_items.id", ondelete="SET NULL"), nullable=True, comment="Peça que o fornecedor mandou no lugar"
    )
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
