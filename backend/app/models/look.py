"""
Modelos de Look (conjunto de produtos) e LookItem (produto no look).
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Float, Boolean, Text
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Look(BaseModel):
    """
    Look = conjunto de produtos montado pela loja ou pelo cliente.
    Ex: "Look Treino Perfeito" = Legging P + Top M + Jaqueta P
    """
    __tablename__ = "looks"

    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # NULL = look da loja; INT = look criado pelo cliente
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)

    is_public = Column(Boolean, default=True, nullable=False)

    # Desconto automático para looks com 3+ peças (ex: 10.0 = 10%)
    discount_percentage = Column(Float, default=0.0, nullable=False)

    # Relacionamentos
    customer = relationship("Customer", foreign_keys=[customer_id])
    items = relationship(
        "LookItem",
        back_populates="look",
        cascade="all, delete-orphan",
        order_by="LookItem.position",
    )

    @property
    def total_price(self) -> float:
        return sum(
            float(item.variant.price if item.variant else item.product.base_price or 0)
            for item in self.items
            if item.is_active
        )

    @property
    def items_count(self) -> int:
        return len([i for i in self.items if i.is_active])


class LookItem(BaseModel):
    """Produto dentro de um look."""
    __tablename__ = "look_items"

    look_id = Column(Integer, ForeignKey("looks.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=True, index=True)

    # Ordem de exibição no look
    position = Column(Integer, default=0, nullable=False)

    # Relacionamentos
    look = relationship("Look", back_populates="items")
    product = relationship("Product")
    variant = relationship("ProductVariant")
