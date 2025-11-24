"""
Modelo base abstrato com campos comuns e métodos auxiliares.
"""
from datetime import datetime
from typing import Any, Dict
from sqlalchemy import DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


class BaseModel(Base):
    """
    Abstract base model with common fields and utility methods.
    
    Provides:
    - Primary key
    - Timestamps (created_at, updated_at)
    - Soft delete flag (is_active)
    - Common utility methods
    """
    __abstract__ = True
    
    id: Mapped[int] = mapped_column(
        Integer, 
        primary_key=True, 
        index=True,
        comment="Primary key"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(),
        comment="Record creation timestamp"
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        onupdate=func.now(),
        comment="Record last update timestamp"
    )
    
    is_active: Mapped[bool] = mapped_column(
        Boolean, 
        default=True,
        comment="Soft delete flag"
    )

    # Multi-tenancy: cada registro pertence a uma loja/tenant
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("stores.id", ondelete="RESTRICT"),
        index=True,
        nullable=True,
        comment="Tenant/Store identifier"
    )
    
    def __repr__(self) -> str:
        """String representation of the model."""
        return f"<{self.__class__.__name__}(id={self.id})>"
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert model to dictionary.
        
        Returns:
            Dict with all column values
        """
        return {
            column.name: getattr(self, column.name) 
            for column in self.__table__.columns
        }
    
    def update_from_dict(self, data: Dict[str, Any]) -> None:
        """
        Update model fields from dictionary.
        
        Args:
            data: Dictionary with field values
        """
        for key, value in data.items():
            if hasattr(self, key):
                setattr(self, key, value)