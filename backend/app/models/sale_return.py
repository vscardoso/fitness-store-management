"""
Modelo de devoluções de vendas.
"""
from sqlalchemy import String, ForeignKey, Numeric, Text, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from decimal import Decimal
from typing import List, TYPE_CHECKING, Any
from .base import BaseModel

if TYPE_CHECKING:
    from .sale import Sale, SaleItem
    from .user import User
    from .product import Product


class SaleReturn(BaseModel):
    """
    Modelo de devolução de venda.
    
    Registra devoluções parciais ou totais de vendas,
    com rastreabilidade FIFO para devolução ao estoque.
    """
    __tablename__ = "sale_returns"
    
    # Identificação
    return_number: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
        comment="Número único da devolução"
    )
    
    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="RESTRICT"),
        nullable=False,
        comment="ID da venda original"
    )
    
    # Status
    status: Mapped[str] = mapped_column(
        String(20),
        default="completed",
        comment="Status: completed, pending, cancelled"
    )
    
    # Motivo
    reason: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Motivo da devolução"
    )
    
    # Valores
    total_refund: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Valor total do reembolso"
    )
    
    # Método de reembolso
    refund_method: Mapped[str] = mapped_column(
        String(20),
        default="original",
        comment="Método: original, store_credit, cash"
    )
    
    # Processado por
    processed_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        comment="ID do usuário que processou a devolução"
    )
    
    # Observações adicionais
    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Observações adicionais"
    )
    
    # Relacionamentos
    sale: Mapped["Sale"] = relationship(
        "Sale",
        back_populates="returns"
    )
    
    processed_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[processed_by_id]
    )
    
    items: Mapped[List["ReturnItem"]] = relationship(
        "ReturnItem",
        back_populates="sale_return",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<SaleReturn(id={self.id}, return_number='{self.return_number}', total={self.total_refund})>"


class ReturnItem(BaseModel):
    """
    Item de devolução.
    
    Registra cada item devolvido com rastreabilidade FIFO.
    
    Após migração: cada ReturnItem está vinculado a uma ProductVariant (tamanho/cor).
    """
    __tablename__ = "return_items"
    
    # Referência ao item original
    sale_item_id: Mapped[int] = mapped_column(
        ForeignKey("sale_items.id", ondelete="RESTRICT"),
        nullable=False,
        comment="ID do item da venda original"
    )
    
    # Devolução pai
    return_id: Mapped[int] = mapped_column(
        ForeignKey("sale_returns.id", ondelete="CASCADE"),
        nullable=False,
        comment="ID da devolução"
    )
    
    # NOVO: FK para variante (substitui product_id)
    variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"),
        nullable=True,  # NULL durante migração, depois será NOT NULL
        index=True,
        comment="ID da variante do produto (tamanho/cor)"
    )
    
    # LEGADO: Mantido para compatibilidade durante migração
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=True,  # Agora opcional após migração
        comment="ID do produto (legado - usar variant_id)"
    )
    
    # Quantidade devolvida
    quantity_returned: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Quantidade devolvida"
    )
    
    # Valores
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Preço unitário original"
    )
    
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        server_default="0",
        comment="Custo unitário original (para estorno FIFO)"
    )
    
    refund_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Valor do reembolso deste item"
    )
    
    # FIFO Tracking - Rastreabilidade de devolução ao estoque
    return_sources: Mapped[Any | None] = mapped_column(
        JSON,
        nullable=True,
        comment="JSON com fontes FIFO para devolução ao estoque"
    )
    
    # Relacionamentos
    sale_return: Mapped["SaleReturn"] = relationship(
        "SaleReturn",
        back_populates="items"
    )
    
    sale_item: Mapped["SaleItem"] = relationship(
        "SaleItem",
        back_populates="return_items"
    )
    
    # LEGADO: relacionamento com Product (via product_id)
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="return_items"
    )
    
    # NOVO: relacionamento com ProductVariant (via variant_id)
    variant: Mapped["ProductVariant"] = relationship(
        "ProductVariant",
        back_populates="return_items"
    )
    
    def __repr__(self) -> str:
        return f"<ReturnItem(id={self.id}, product_id={self.product_id}, quantity={self.quantity_returned})>"