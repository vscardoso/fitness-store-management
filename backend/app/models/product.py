"""
Modelo de produto com variações e preços.
"""
from sqlalchemy import String, Text, Numeric, ForeignKey, Boolean, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from decimal import Decimal
from typing import List, TYPE_CHECKING
from .base import BaseModel

if TYPE_CHECKING:
    from .category import Category
    from .inventory import Inventory
    from .sale import SaleItem


class Product(BaseModel):
    """
    Product model with variations and pricing.
    
    Represents fitness equipment, supplements, accessories, etc.
    """
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint('tenant_id', 'sku', name='uq_products_tenant_sku'),
        UniqueConstraint('tenant_id', 'barcode', name='uq_products_tenant_barcode'),
    )
    
    name: Mapped[str] = mapped_column(
        String(255), 
        nullable=False,
        comment="Product name"
    )
    
    description: Mapped[str | None] = mapped_column(
        Text,
        comment="Product description"
    )
    
    sku: Mapped[str] = mapped_column(
        String(50), 
        index=True,
        comment="Stock Keeping Unit (unique per tenant)"
    )
    
    barcode: Mapped[str | None] = mapped_column(
        String(50),
        index=True,
        comment="Product barcode (unique per tenant)"
    )
    
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), 
        nullable=False,
        comment="Product selling price"
    )
    
    cost_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        comment="Product cost price"
    )
    
    brand: Mapped[str | None] = mapped_column(
        String(100),
        comment="Brand name (e.g., 'Nike', 'Adidas', 'Under Armour')"
    )
    
    color: Mapped[str | None] = mapped_column(
        String(50),
        comment="Product color (e.g., 'Preto', 'Rosa', 'Azul Marinho')"
    )
    
    size: Mapped[str | None] = mapped_column(
        String(20),
        comment="Product size (PP, P, M, G, GG, 36, 38, 40, etc.)"
    )
    
    gender: Mapped[str | None] = mapped_column(
        String(20),
        comment="Target gender (Feminino, Masculino, Unissex)"
    )
    
    material: Mapped[str | None] = mapped_column(
        String(100),
        comment="Fabric/material (e.g., 'Poliamida', 'Algodão', 'Dri-FIT')"
    )
    
    is_digital: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        comment="Whether product is digital (e-books, training plans)"
    )
    
    is_activewear: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        comment="Whether it's activewear/fitness clothing"
    )

    is_catalog: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        comment="Whether this is a catalog template (true) or active product (false)"
    )

    # Chaves estrangeiras
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"),
        comment="Product category ID"
    )

    # Campos de Batch foram removidos: batch_id, initial_quantity, batch_position
    
    # Relacionamentos
    category: Mapped["Category"] = relationship(
        "Category",
        back_populates="products"
    )

    inventory: Mapped[List["Inventory"]] = relationship(
        "Inventory",
        back_populates="product",
        cascade="all, delete-orphan"
    )
    
    sale_items: Mapped[List["SaleItem"]] = relationship(
        "SaleItem",
        back_populates="product"
    )
    
    def __repr__(self) -> str:
        return f"<Product(id={self.id}, sku='{self.sku}', name='{self.name}')>"
    
    def get_current_stock(self) -> int:
        """
        Get current stock quantity from active inventory records.
        
        Returns:
            Current stock quantity
        """
        if self.is_digital:
            return float('inf')  # Digital products have unlimited stock
        
        active_inventory = [inv for inv in self.inventory if inv.is_active]
        return sum(inv.quantity for inv in active_inventory)
    
    def calculate_profit_margin(self) -> Decimal:
        """
        Calculate profit margin percentage.
        
        Returns:
            Profit margin as percentage
        """
        if not self.cost_price or self.cost_price == 0:
            return Decimal(0)
        
        profit = Decimal(str(self.price)) - Decimal(str(self.cost_price))
        margin = (profit / Decimal(str(self.price))) * Decimal(100)
        return margin.quantize(Decimal('0.01'))
    
    def is_low_stock(self, threshold: int = 5) -> bool:
        """
        Check if product is low in stock.
        
        Args:
            threshold: Minimum stock threshold (default 5 for clothing items)
            
        Returns:
            True if stock is below threshold
        """
        if self.is_digital:
            return False
        
        return self.get_current_stock() <= threshold
    
    def get_full_name(self) -> str:
        """
        Get full product name with brand, color and size.
        
        Returns:
            Formatted product name (e.g., 'Nike Legging Feminina - Preta - Tamanho M')
        """
        parts = []
        if self.brand:
            parts.append(self.brand)
        parts.append(self.name)
        if self.gender:
            parts.append(self.gender)
        if self.color:
            parts.append(f"- {self.color}")
        if self.size:
            parts.append(f"- Tamanho {self.size}")
        
        return " ".join(parts)