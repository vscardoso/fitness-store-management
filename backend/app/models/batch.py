"""
Batch = Lote de Compra
Representa uma compra de fornecedor em uma data específica.
"""
from sqlalchemy import String, Date, Float, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import date
from typing import List, TYPE_CHECKING
from .base import BaseModel

if TYPE_CHECKING:
    from .product import Product


class Batch(BaseModel):
    """
    Batch model representing a supplier purchase batch.

    A batch represents a purchase from a supplier on a specific date,
    tracking all products bought together and their financial performance.
    """
    __tablename__ = "batches"

    # Info da Compra
    batch_code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        comment="Unique batch code (e.g., LOTE-2025-01)"
    )

    purchase_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Purchase date (invoice date)"
    )

    invoice_number: Mapped[str | None] = mapped_column(
        String(100),
        comment="Invoice number"
    )

    # Fornecedor
    supplier_name: Mapped[str | None] = mapped_column(
        String(200),
        comment="Supplier name"
    )

    supplier_cnpj: Mapped[str | None] = mapped_column(
        String(20),
        comment="Supplier CNPJ"
    )

    # Financeiro
    total_cost: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        comment="Total cost of the entire batch"
    )

    # Observações
    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Additional notes about the batch"
    )

    # Relacionamentos
    products: Mapped[List["Product"]] = relationship(
        "Product",
        back_populates="batch"
    )

    def __repr__(self) -> str:
        return f"<Batch(id={self.id}, batch_code='{self.batch_code}', supplier='{self.supplier_name}')>"

    @property
    def total_items(self) -> int:
        """Total de itens comprados neste lote"""
        return sum(p.initial_quantity for p in self.products if p.is_active)

    @property
    def items_sold(self) -> int:
        """Total de itens vendidos deste lote"""
        return sum(p.initial_quantity - (p.inventory.quantity if p.inventory else 0)
                  for p in self.products if p.is_active)

    @property
    def items_remaining(self) -> int:
        """Total de itens restantes deste lote"""
        return sum(p.inventory.quantity if p.inventory else 0
                  for p in self.products if p.is_active)

    @property
    def sell_through_rate(self) -> float:
        """Taxa de venda do lote (%)"""
        if self.total_items == 0:
            return 0.0
        return (self.items_sold / self.total_items) * 100

    @property
    def total_revenue(self) -> float:
        """Receita total gerada pelo lote"""
        # Receita real das vendas deste lote
        from app.models.sale import SaleItem
        revenue = 0.0
        for product in self.products:
            if product.is_active:
                # Somar apenas vendas reais deste produto
                sold_qty = product.initial_quantity - (product.inventory[0].quantity if product.inventory else 0)
                revenue += float(product.price) * sold_qty
        return revenue

    @property
    def roi(self) -> float:
        """Return on Investment do lote (%)"""
        if self.total_cost == 0:
            return 0.0
        return ((self.total_revenue - self.total_cost) / self.total_cost) * 100

    @property
    def profit(self) -> float:
        """Lucro absoluto do lote (receita - custo)."""
        return float(self.total_revenue) - float(self.total_cost or 0)

    @property
    def days_since_purchase(self) -> int:
        """Dias desde a compra"""
        return (date.today() - self.purchase_date).days

    def get_product_count(self) -> int:
        """
        Get number of products in this batch.

        Returns:
            Count of active products in batch
        """
        return len([p for p in self.products if p.is_active])