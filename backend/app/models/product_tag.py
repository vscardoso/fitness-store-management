"""
Tags de produto para sugestões de combinação (lookbook).
Ex: tag_type='color', tag_value='preto'
    tag_type='style', tag_value='athleisure'
"""
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class ProductTag(BaseModel):
    """
    Tag associada a um produto para alimentar o motor de sugestões.

    tag_type: 'color' | 'style' | 'occasion' | 'season'
    tag_value: 'preto' | 'athleisure' | 'treino' | 'verao' | ...
    """
    __tablename__ = "product_tags"

    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    tag_type = Column(String(30), nullable=False, index=True)
    tag_value = Column(String(100), nullable=False, index=True)

    product = relationship("Product")
