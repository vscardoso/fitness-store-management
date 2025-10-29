"""
Modelo de categoria de produtos com hierarquia.
"""
from sqlalchemy import String, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, TYPE_CHECKING
from .base import BaseModel

if TYPE_CHECKING:
    from .product import Product


class Category(BaseModel):
    """
    Product category model with hierarchical structure.
    
    Supports parent-child relationships for category organization.
    """
    __tablename__ = "categories"
    
    name: Mapped[str] = mapped_column(
        String(100), 
        nullable=False,
        comment="Category name"
    )
    
    description: Mapped[str | None] = mapped_column(
        Text,
        comment="Category description"
    )
    
    slug: Mapped[str] = mapped_column(
        String(100), 
        unique=True, 
        index=True,
        comment="URL-friendly category identifier"
    )
    
    # Auto-relacionamento para hierarquia
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"),
        comment="Parent category ID for hierarchy"
    )
    
    # Relacionamentos
    parent: Mapped[Optional["Category"]] = relationship(
        "Category",
        remote_side="Category.id",
        back_populates="children"
    )
    
    children: Mapped[List["Category"]] = relationship(
        "Category",
        back_populates="parent",
        cascade="all, delete-orphan"
    )
    
    products: Mapped[List["Product"]] = relationship(
        "Product",
        back_populates="category"
    )
    
    def __repr__(self) -> str:
        return f"<Category(id={self.id}, name='{self.name}')>"
    
    def get_full_path(self) -> str:
        """
        Get full category path (e.g., 'Roupas > Feminino > Leggings').
        
        Returns:
            Full category path string
        """
        if self.parent:
            return f"{self.parent.get_full_path()} > {self.name}"
        return self.name
    
    def get_all_children_ids(self) -> List[int]:
        """
        Get all descendant category IDs recursively.
        
        Returns:
            List of all child category IDs
        """
        children_ids = [self.id]
        for child in self.children:
            children_ids.extend(child.get_all_children_ids())
        return children_ids
    
    def is_leaf_category(self) -> bool:
        """
        Check if this is a leaf category (no children).
        
        Returns:
            True if category has no children
        """
        return len(self.children) == 0