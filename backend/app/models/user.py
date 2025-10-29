"""
Modelo de usuário com autenticação e permissões.
"""
from sqlalchemy import String, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum
from typing import List, TYPE_CHECKING
from .base import BaseModel

if TYPE_CHECKING:
    from .sale import Sale


class UserRole(str, Enum):
    """User roles in the system."""
    ADMIN = "admin"
    MANAGER = "manager"
    SELLER = "seller"
    CASHIER = "cashier"


class User(BaseModel):
    """
    User model for authentication and authorization.
    
    Represents system users with different roles and permissions.
    """
    __tablename__ = "users"
    
    email: Mapped[str] = mapped_column(
        String(255), 
        unique=True, 
        index=True, 
        nullable=False,
        comment="User email address (unique)"
    )
    
    hashed_password: Mapped[str] = mapped_column(
        String(255), 
        nullable=False,
        comment="Bcrypt hashed password"
    )
    
    full_name: Mapped[str] = mapped_column(
        String(255), 
        nullable=False,
        comment="User full name"
    )
    
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole), 
        default=UserRole.SELLER,
        comment="User role in the system"
    )
    
    phone: Mapped[str | None] = mapped_column(
        String(20),
        comment="User phone number"
    )
    
    # Relacionamentos
    sales: Mapped[List["Sale"]] = relationship(
        "Sale",
        back_populates="seller",
        foreign_keys="Sale.seller_id"
    )
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"
    
    def has_permission(self, action: str) -> bool:
        """
        Check if user has permission for specific action.
        
        Args:
            action: Action to check permission for
            
        Returns:
            True if user has permission
        """
        permissions = {
            UserRole.ADMIN: ["*"],
            UserRole.MANAGER: ["read", "write", "manage_inventory", "manage_sales"],
            UserRole.SELLER: ["read", "create_sale", "manage_customers"],
            UserRole.CASHIER: ["read", "create_sale"]
        }
        
        user_permissions = permissions.get(self.role, [])
        return "*" in user_permissions or action in user_permissions