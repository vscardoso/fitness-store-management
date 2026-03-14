"""
Modelo de Wishlist — produto desejado por cliente com alerta de disponibilidade.
"""
from sqlalchemy import Column, Integer, ForeignKey, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Wishlist(BaseModel):
    """
    Item na lista de desejos de um cliente.
    Quando o produto/variante fica disponível, sistema notifica automaticamente.
    """
    __tablename__ = "wishlists"

    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=True, index=True)

    # Associação com um look (opcional)
    look_id = Column(Integer, ForeignKey("looks.id"), nullable=True, index=True)

    # Controle de notificação
    notified = Column(Boolean, default=False, nullable=False)
    notified_at = Column(DateTime, nullable=True)

    notes = Column(Text, nullable=True)

    # Relacionamentos
    customer = relationship("Customer")
    product = relationship("Product")
    variant = relationship("ProductVariant")
    look = relationship("Look")
