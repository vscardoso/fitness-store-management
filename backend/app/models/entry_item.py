"""
Modelo de item de entrada de estoque.
"""
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, ForeignKey, Integer, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from .base import BaseModel

if TYPE_CHECKING:
    from .stock_entry import StockEntry
    from .product import Product


class EntryItem(BaseModel):
    """
    Entry Item model - Item individual de uma entrada de estoque.
    
    Representa um produto específico dentro de uma entrada de estoque,
    controlando quantidade recebida, quantidade restante (FIFO) e custo unitário.
    """
    __tablename__ = "entry_items"
    
    # Relacionamentos (Foreign Keys)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("stock_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="ID da entrada de estoque"
    )
    
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="ID do produto"
    )
    
    # Quantidades
    quantity_received: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Quantidade comprada/recebida inicialmente"
    )
    
    quantity_remaining: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Quantidade atual restante (para controle FIFO)"
    )
    
    # Custo
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Custo unitário do produto nesta entrada"
    )
    
    # Observações
    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Observações sobre este item"
    )
    
    # Relacionamentos
    stock_entry: Mapped["StockEntry"] = relationship(
        "StockEntry",
        back_populates="entry_items",
        lazy="selectin"
    )
    
    product: Mapped["Product"] = relationship(
        "Product",
        lazy="selectin"
    )
    
    # Constraints
    __table_args__ = (
        CheckConstraint(
            "quantity_received > 0",
            name="check_quantity_received_positive"
        ),
        CheckConstraint(
            "quantity_remaining >= 0",
            name="check_quantity_remaining_non_negative"
        ),
        CheckConstraint(
            "quantity_remaining <= quantity_received",
            name="check_remaining_lte_received"
        ),
        CheckConstraint(
            "unit_cost >= 0",
            name="check_unit_cost_non_negative"
        ),
    )
    
    def __repr__(self) -> str:
        """String representation of the entry item."""
        return (
            f"<EntryItem(entry_id={self.entry_id}, product_id={self.product_id}, "
            f"received={self.quantity_received}, remaining={self.quantity_remaining})>"
        )
    
    @property
    def total_cost(self) -> Decimal:
        """
        Calcula o custo total deste item (quantidade recebida × custo unitário).
        
        Returns:
            Decimal: Custo total do item
        """
        return Decimal(str(self.quantity_received)) * self.unit_cost
    
    @property
    def quantity_sold(self) -> int:
        """
        Calcula a quantidade já vendida deste item.
        
        Returns:
            int: Quantidade vendida (recebida - restante)
        """
        return self.quantity_received - self.quantity_remaining
    
    @property
    def is_depleted(self) -> bool:
        """
        Verifica se o item está totalmente esgotado.
        
        Returns:
            bool: True se quantity_remaining == 0
        """
        return self.quantity_remaining == 0
    
    @property
    def depletion_percentage(self) -> float:
        """
        Calcula a porcentagem de depleção do item.
        
        Returns:
            float: Porcentagem de 0 a 100
        """
        if self.quantity_received == 0:
            return 0.0
        return (self.quantity_sold / self.quantity_received) * 100
    
    def reduce_quantity(self, amount: int) -> bool:
        """
        Reduz a quantidade restante (usado em vendas - FIFO).
        
        Args:
            amount: Quantidade a reduzir
            
        Returns:
            bool: True se conseguiu reduzir, False se não há quantidade suficiente
            
        Raises:
            ValueError: Se amount for negativo
        """
        if amount < 0:
            raise ValueError("Amount must be non-negative")
        
        if amount > self.quantity_remaining:
            return False
        
        self.quantity_remaining -= amount
        return True
    
    def can_fulfill(self, quantity: int) -> bool:
        """
        Verifica se este item pode atender uma quantidade solicitada.
        
        Args:
            quantity: Quantidade solicitada
            
        Returns:
            bool: True se quantity_remaining >= quantity
        """
        return self.quantity_remaining >= quantity
    
    def get_product_info(self) -> dict:
        """
        Retorna informações básicas do produto associado.
        
        Returns:
            dict: Dados do produto
        """
        if self.product:
            return {
                "product_id": self.product.id,
                "name": self.product.name,
                "sku": self.product.sku,
                "barcode": self.product.barcode,
            }
        return {}
