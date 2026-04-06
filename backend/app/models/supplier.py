"""
Modelo de Fornecedor.
"""
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .supplier_product import SupplierProduct


class Supplier(BaseModel):
    """
    Fornecedor — entidade que vende produtos para a loja.

    Mantém histórico de quais produtos foram comprados de cada fornecedor
    via SupplierProduct (tabela pivot com métricas de compra).
    """

    __tablename__ = "suppliers"

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
        comment="Nome do fornecedor",
    )

    cnpj: Mapped[Optional[str]] = mapped_column(
        String(18),
        nullable=True,
        comment="CNPJ do fornecedor (formato XX.XXX.XXX/XXXX-XX)",
    )

    phone: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Telefone de contato",
    )

    email: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="E-mail de contato",
    )

    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Observações livres sobre o fornecedor",
    )

    # Relacionamentos
    supplier_products: Mapped[List["SupplierProduct"]] = relationship(
        "SupplierProduct",
        back_populates="supplier",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Supplier(id={self.id}, name={self.name!r})>"
