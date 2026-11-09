"""
Brinde: peça que sai do estoque e vai para uma pessoa SEM cobrança (junto de uma venda, cortesia, divulgação).

Não é venda: não tem pagamento, não entra na receita, no caixa, no Financeiro, no fiado nem nos pontos de fidelidade.
O custo da peça (custo posto de cada camada FIFO) vira a linha "Brindes" do Resultado do Mês. Só administrador dá brinde.
Desenho e decisões: docs/auditoria/BRINDE_DESENHO.md (decisões do dono em 09/11/2026).
"""
from decimal import Decimal
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel

GIFT_GIVEN = "given"
GIFT_CANCELLED = "cancelled"
GIFT_REASONS = {
    "with_sale": "Junto com uma venda",
    "courtesy": "Cortesia / aniversário",
    "promotion": "Divulgação / influenciadora",
    "other": "Outro",
}


class Gift(BaseModel):
    __tablename__ = "gifts"

    gift_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default=GIFT_GIVEN, server_default=GIFT_GIVEN)
    reason_type: Mapped[str] = mapped_column(String(20), nullable=False)
    reason_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    recipient_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    related_sale_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sales.id", ondelete="SET NULL"), nullable=True)
    given_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    given_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    # Custo posto das peças dadas (soma das camadas FIFO) e o valor de vitrine (só informação)
    total_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    list_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    cancelled_at: Mapped[Optional[object]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class GiftItem(BaseModel):
    __tablename__ = "gift_items"

    gift_id: Mapped[int] = mapped_column(ForeignKey("gifts.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    variant_id: Mapped[Optional[int]] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)
    product_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    variant_label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_returned: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=0, server_default="0")
    list_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    # camadas FIFO de onde saiu (mesmo formato da venda): para a peça voltar à camada certa
    sale_sources: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class GiftReturn(BaseModel):
    """Peça de brinde que voltou ao estoque. O custo volta a favor da loja NO DIA da devolução (como devolução de venda)."""
    __tablename__ = "gift_returns"

    gift_id: Mapped[int] = mapped_column(ForeignKey("gifts.id", ondelete="CASCADE"), nullable=False, index=True)
    gift_item_id: Mapped[int] = mapped_column(ForeignKey("gift_items.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
