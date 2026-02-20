"""
Modelo de variante de produto (tamanho/cor).
"""
from sqlalchemy import String, Text, Numeric, ForeignKey, Boolean, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from decimal import Decimal
from typing import List, TYPE_CHECKING
from .base import BaseModel

if TYPE_CHECKING:
    from .product import Product
    from .inventory import Inventory
    from .sale import SaleItem
    from .sale_return import ReturnItem
    from .entry_item import EntryItem


class ProductVariant(BaseModel):
    """
    Product Variant model - Variações de produto (tamanho/cor).
    
    Cada variante representa uma combinação única de tamanho e cor
    de um produto pai. Por exemplo:
    - Produto: "Legging Nike"
    - Variantes: "Roxo P", "Roxo M", "Preto G", etc.
    
    Cada variante tem:
    - SKU único
    - Preço próprio (pode diferir do base_price do produto)
    - Estoque próprio (via EntryItems/FIFO)
    """
    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint('product_id', 'size', 'color', name='uq_variant_product_size_color'),
        UniqueConstraint('tenant_id', 'sku', name='uq_variants_tenant_sku'),
    )
    
    # Chave estrangeira para o produto pai
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="ID do produto pai"
    )
    
    # Identificação única
    sku: Mapped[str] = mapped_column(
        String(50), 
        index=True,
        comment="Stock Keeping Unit (único por tenant)"
    )
    
    # Variações
    size: Mapped[str | None] = mapped_column(
        String(20),
        comment="Tamanho (PP, P, M, G, GG, 36, 38, 40, etc.)"
    )
    
    color: Mapped[str | None] = mapped_column(
        String(50),
        comment="Cor (Roxo, Preto, Azul Marinho, etc.)"
    )
    
    # Preços (podem diferir por variação)
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), 
        nullable=False,
        comment="Preço de venda desta variação"
    )
    
    cost_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        comment="Preço de custo sugerido para novas entradas"
    )
    
    # Imagem específica da variação (opcional)
    image_url: Mapped[str | None] = mapped_column(
        String(500),
        comment="URL ou path para imagem específica desta variação"
    )
    
    # Status
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        comment="Se a variante está ativa"
    )
    
    # Relacionamentos
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="variants"
    )
    
    inventory: Mapped[List["Inventory"]] = relationship(
        "Inventory",
        back_populates="variant",
        cascade="all, delete-orphan"
    )
    
    entry_items: Mapped[List["EntryItem"]] = relationship(
        "EntryItem",
        back_populates="variant"
    )
    
    sale_items: Mapped[List["SaleItem"]] = relationship(
        "SaleItem",
        back_populates="variant"
    )
    
    return_items: Mapped[List["ReturnItem"]] = relationship(
        "ReturnItem",
        back_populates="variant"
    )
    
    def __repr__(self) -> str:
        return f"<ProductVariant(id={self.id}, sku='{self.sku}', size='{self.size}', color='{self.color}')>"
    
    def get_current_stock(self) -> int:
        """
        Get current stock quantity from active entry items (FIFO).
        
        Returns:
            Current stock quantity
        """
        from .entry_item import EntryItem
        active_items = [item for item in self.entry_items if item.is_active]
        return sum(item.quantity_remaining for item in active_items)
    
    def get_full_name(self) -> str:
        """
        Get full variant name with product name, color and size.
        
        Returns:
            Formatted name (e.g., 'Legging Nike - Roxo - Tamanho M')
        """
        parts = []
        if self.product:
            parts.append(self.product.name)
        if self.color:
            parts.append(f"- {self.color}")
        if self.size:
            parts.append(f"- Tamanho {self.size}")
        
        return " ".join(parts)
    
    def get_variant_label(self) -> str:
        """
        Get short variant label (color + size).
        
        Returns:
            Formatted label (e.g., 'Roxo · M')
        """
        parts = []
        if self.color:
            parts.append(self.color)
        if self.size:
            parts.append(self.size)
        return " · ".join(parts) if parts else "Único"