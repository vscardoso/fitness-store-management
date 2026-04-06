"""
Modelo de vínculo entre Fornecedor e Produto (histórico de compras).
"""
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .supplier import Supplier
    from .product import Product


class SupplierProduct(BaseModel):
    """
    Tabela pivot Fornecedor ↔ Produto com métricas de compra.

    Criada/atualizada automaticamente sempre que um EntryItem com
    supplier_id é registrado (via SupplierService.upsert_supplier_product).
    """

    __tablename__ = "supplier_products"

    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Fornecedor",
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Produto",
    )

    last_unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Último custo unitário pago a este fornecedor por este produto",
    )

    purchase_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        comment="Número de vezes que este produto foi comprado deste fornecedor",
    )

    last_purchase_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Data da última compra",
    )

    # Relacionamentos
    supplier: Mapped["Supplier"] = relationship(
        "Supplier",
        back_populates="supplier_products",
        lazy="selectin",
    )

    product: Mapped["Product"] = relationship(
        "Product",
        lazy="selectin",
    )

    # Unique por (supplier_id, product_id, tenant_id) para que a query
    # ON CONFLICT / upsert funcione corretamente
    __table_args__ = (
        UniqueConstraint(
            "supplier_id",
            "product_id",
            "tenant_id",
            name="uq_supplier_product_tenant",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<SupplierProduct(supplier_id={self.supplier_id}, "
            f"product_id={self.product_id}, cost={self.last_unit_cost})>"
        )
