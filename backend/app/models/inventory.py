"""
Modelo de estoque com movimentações e controle.
"""
from sqlalchemy import String, ForeignKey, Enum as SQLEnum, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum
from datetime import datetime
from typing import TYPE_CHECKING
from .base import BaseModel

if TYPE_CHECKING:
    from .product import Product


class MovementType(str, Enum):
    """Types of inventory movements."""
    PURCHASE = "purchase"      # Compra de fornecedor
    SALE = "sale"             # Venda para cliente
    ADJUSTMENT = "adjustment" # Ajuste de estoque
    RETURN = "return"         # Devolução
    TRANSFER = "transfer"     # Transferência entre locais
    DAMAGE = "damage"         # Avaria/perda
    EXPIRY = "expiry"         # Vencimento


class Inventory(BaseModel):
    """
    Inventory control model with movement tracking.
    
    Tracks stock levels and movements for each product.
    """
    __tablename__ = "inventory"
    
    quantity: Mapped[int] = mapped_column(
        nullable=False,
        default=0,
        comment="Current quantity in stock"
    )
    
    min_stock: Mapped[int] = mapped_column(
        default=0,
        comment="Minimum stock level for alerts"
    )
    
    max_stock: Mapped[int | None] = mapped_column(
        comment="Maximum stock level"
    )
    
    location: Mapped[str | None] = mapped_column(
        String(100),
        comment="Storage location"
    )
    
    batch_number: Mapped[str | None] = mapped_column(
        String(50),
        comment="Batch or lot number"
    )
    
    expiry_date: Mapped[datetime | None] = mapped_column(
        DateTime,
        comment="Product expiry date"
    )
    
    # Chave estrangeira
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        comment="Product ID"
    )
    
    # Relacionamentos
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="inventory"
    )
    
    movements: Mapped[list["InventoryMovement"]] = relationship(
        "InventoryMovement",
        back_populates="inventory",
        cascade="all, delete-orphan",
        order_by="InventoryMovement.created_at.desc()"
    )
    
    def __repr__(self) -> str:
        return f"<Inventory(id={self.id}, product_id={self.product_id}, quantity={self.quantity})>"
    
    def is_low_stock(self) -> bool:
        """
        Check if current stock is below minimum level.
        
        Returns:
            True if stock is low
        """
        return self.quantity <= self.min_stock
    
    def is_expired(self) -> bool:
        """
        Check if product has expired.
        
        Returns:
            True if product is expired
        """
        if not self.expiry_date:
            return False
        return datetime.utcnow() > self.expiry_date
    
    def days_until_expiry(self) -> int | None:
        """
        Calculate days until product expires.
        
        Returns:
            Days until expiry or None if no expiry date
        """
        if not self.expiry_date:
            return None
        
        delta = self.expiry_date - datetime.utcnow()
        return max(0, delta.days)


class InventoryMovement(BaseModel):
    """
    Inventory movement tracking model.
    
    Records all stock movements for audit trail.
    """
    __tablename__ = "inventory_movements"
    
    movement_type: Mapped[MovementType] = mapped_column(
        SQLEnum(MovementType),
        nullable=False,
        comment="Type of inventory movement"
    )
    
    quantity_before: Mapped[int] = mapped_column(
        nullable=False,
        comment="Quantity before movement"
    )
    
    quantity_change: Mapped[int] = mapped_column(
        nullable=False,
        comment="Quantity change (positive or negative)"
    )
    
    quantity_after: Mapped[int] = mapped_column(
        nullable=False,
        comment="Quantity after movement"
    )
    
    reference_id: Mapped[str | None] = mapped_column(
        String(100),
        comment="Reference ID (sale ID, purchase order, etc.)"
    )
    
    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Additional notes about the movement"
    )
    
    # Chave estrangeira
    inventory_id: Mapped[int] = mapped_column(
        ForeignKey("inventory.id", ondelete="CASCADE"),
        comment="Inventory record ID"
    )
    
    # Relacionamentos
    inventory: Mapped["Inventory"] = relationship(
        "Inventory",
        back_populates="movements"
    )
    
    def __repr__(self) -> str:
        return f"<InventoryMovement(id={self.id}, type='{self.movement_type}', change={self.quantity_change})>"