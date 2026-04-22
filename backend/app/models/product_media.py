"""
Modelo de mídia do produto (galeria de fotos).

Cada registro representa uma foto do produto (nível produto ou variação).
- variant_id = null → foto de nível do produto (galeria geral)
- variant_id = X → foto específica de uma variação
- is_cover = true → foto principal (exibida como image_url do produto)
"""
from sqlalchemy import String, ForeignKey, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING
from .base import BaseModel

if TYPE_CHECKING:
    from .product import Product
    from .product_variant import ProductVariant


class ProductMedia(BaseModel):
    """
    Galeria de mídia de um produto.

    Permite múltiplas fotos por produto e por variação.
    O campo is_cover marca a foto principal, que é sincronizada
    com product.image_url / variant.image_url para compatibilidade.
    """
    __tablename__ = "product_media"

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="ID do produto pai"
    )

    variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="ID da variação (null = foto de nível produto)"
    )

    url: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        comment="URL ou path do arquivo de mídia no storage"
    )

    position: Mapped[int] = mapped_column(
        Integer,
        default=0,
        comment="Ordem de exibição na galeria (0 = primeiro)"
    )

    is_cover: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        comment="Se é a foto principal (capa) do produto/variação"
    )

    media_type: Mapped[str] = mapped_column(
        String(20),
        default="photo",
        comment="Tipo de mídia: photo | gif"
    )

    # Relacionamentos
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="media",
        foreign_keys=[product_id],
    )

    variant: Mapped["ProductVariant | None"] = relationship(
        "ProductVariant",
        back_populates="media",
        foreign_keys=[variant_id],
    )

    def __repr__(self) -> str:
        scope = f"variant={self.variant_id}" if self.variant_id else "product"
        return f"<ProductMedia(id={self.id}, {scope}, cover={self.is_cover})>"
