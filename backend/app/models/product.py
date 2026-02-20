"""
Modelo de produto com variações e preços.

IMPORTANTE: Após a migração para o sistema de variantes:
- Os campos sku, barcode, size, color, price, cost_price foram movidos para ProductVariant
- Este modelo agora representa o "produto pai" que agrupa variações
- O campo base_price serve como preço de referência
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
    from .sale_return import ReturnItem
    from .product_variant import ProductVariant


class Product(BaseModel):
    """
    Product model - Produto pai que agrupa variações.
    
    Representa um produto que pode ter múltiplas variações (tamanho/cor).
    Por exemplo: "Legging Nike" pode ter variantes "Roxo P", "Roxo M", "Preto G", etc.
    
    Campos movidos para ProductVariant:
    - sku, barcode, size, color, price, cost_price
    
    Campos mantidos no produto pai:
    - name, description, brand, category, gender, material
    - base_price (preço de referência)
    - image_url (imagem principal)
    """
    __tablename__ = "products"
    
    name: Mapped[str] = mapped_column(
        String(255), 
        nullable=False,
        comment="Product name"
    )
    
    description: Mapped[str | None] = mapped_column(
        Text,
        comment="Product description"
    )
    
    # Preço base de referência (variantes podem ter preços diferentes)
    base_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        comment="Base price for reference (variants may have different prices)"
    )
    
    brand: Mapped[str | None] = mapped_column(
        String(100),
        comment="Brand name (e.g., 'Nike', 'Adidas', 'Under Armour')"
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

    image_url: Mapped[str | None] = mapped_column(
        String(500),
        comment="URL or path to product main image"
    )

    # Chaves estrangeiras
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"),
        comment="Product category ID"
    )
    
    # Relacionamentos
    category: Mapped["Category"] = relationship(
        "Category",
        back_populates="products"
    )
    
    # Novo relacionamento com variantes
    variants: Mapped[List["ProductVariant"]] = relationship(
        "ProductVariant",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductVariant.size, ProductVariant.color"
    )

    # Relacionamentos legados (mantidos para compatibilidade durante migração)
    # Estes serão atualizados para apontar para variantes
    inventory: Mapped[List["Inventory"]] = relationship(
        "Inventory",
        back_populates="product",
        cascade="all, delete-orphan"
    )
    
    sale_items: Mapped[List["SaleItem"]] = relationship(
        "SaleItem",
        back_populates="product"
    )
    
    return_items: Mapped[List["ReturnItem"]] = relationship(
        "ReturnItem",
        back_populates="product"
    )
    
    def __repr__(self) -> str:
        return f"<Product(id={self.id}, name='{self.name}')>"
    
    def get_current_stock(self) -> int:
        """
        Get total stock quantity from all variants.
        
        Returns:
            Total stock quantity across all variants
        """
        if self.is_digital:
            return float('inf')  # Digital products have unlimited stock
        
        return sum(variant.get_current_stock() for variant in self.variants if variant.is_active)
    
    def get_variant_count(self) -> int:
        """
        Get number of active variants.
        
        Returns:
            Number of active variants
        """
        return len([v for v in self.variants if v.is_active])
    
    def get_price_range(self) -> tuple[Decimal | None, Decimal | None]:
        """
        Get min and max prices across variants.
        
        Returns:
            Tuple of (min_price, max_price) or (None, None) if no variants
        """
        active_variants = [v for v in self.variants if v.is_active]
        if not active_variants:
            return (self.base_price, self.base_price)
        
        prices = [v.price for v in active_variants]
        return (min(prices), max(prices))
    
    def get_full_name(self) -> str:
        """
        Get full product name with brand.
        
        Returns:
            Formatted product name (e.g., 'Nike Legging Feminina')
        """
        parts = []
        if self.brand:
            parts.append(self.brand)
        parts.append(self.name)
        if self.gender:
            parts.append(self.gender)
        
        return " ".join(parts)
    
    def has_variants(self) -> bool:
        """
        Check if product has multiple variants.
        
        Returns:
            True if product has more than one variant
        """
        return len([v for v in self.variants if v.is_active]) > 1
    
    # ========================================
    # Propriedades de compatibilidade (legado)
    # Estes campos foram movidos para ProductVariant
    # ========================================
    
    @property
    def sku(self) -> str | None:
        """SKU da primeira variante ativa (compatibilidade)."""
        active_variants = [v for v in self.variants if v.is_active]
        return active_variants[0].sku if active_variants else None
    
    @property
    def price(self) -> Decimal | None:
        """Preço da primeira variante ativa (compatibilidade)."""
        active_variants = [v for v in self.variants if v.is_active]
        return active_variants[0].price if active_variants else self.base_price
    
    @property
    def cost_price(self) -> Decimal | None:
        """Custo da primeira variante ativa (compatibilidade)."""
        active_variants = [v for v in self.variants if v.is_active]
        return active_variants[0].cost_price if active_variants else None
    
    @property
    def size(self) -> str | None:
        """Tamanho da primeira variante ativa (compatibilidade)."""
        active_variants = [v for v in self.variants if v.is_active]
        return active_variants[0].size if active_variants else None
    
    @property
    def color(self) -> str | None:
        """Cor da primeira variante ativa (compatibilidade)."""
        active_variants = [v for v in self.variants if v.is_active]
        return active_variants[0].color if active_variants else None
    
    @property
    def barcode(self) -> str | None:
        """Barcode legado (não mais usado)."""
        return None
