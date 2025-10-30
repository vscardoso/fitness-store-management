"""
Modelo de cliente com programa de fidelidade.
"""
from sqlalchemy import String, Date, Enum as SQLEnum, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum
from datetime import date
from decimal import Decimal
from typing import List, TYPE_CHECKING
from .base import BaseModel

if TYPE_CHECKING:
    from .sale import Sale


class CustomerType(str, Enum):
    """Customer types for different pricing and benefits."""
    REGULAR = "regular"
    VIP = "vip"
    PREMIUM = "premium"
    CORPORATE = "corporate"


class Customer(BaseModel):
    """
    Customer model with loyalty program and contact information.
    
    Manages customer data, purchase history, and loyalty points.
    """
    __tablename__ = "customers"
    
    # Informações pessoais
    full_name: Mapped[str] = mapped_column(
        String(255), 
        nullable=False,
        comment="Customer full name"
    )
    
    email: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        index=True,
        comment="Customer email address"
    )
    
    phone: Mapped[str | None] = mapped_column(
        String(20),
        comment="Customer phone number"
    )
    
    document_number: Mapped[str | None] = mapped_column(
        String(20),
        unique=True,
        index=True,
        comment="CPF/CNPJ document number"
    )
    
    birth_date: Mapped[date | None] = mapped_column(
        Date,
        comment="Customer birth date"
    )
    
    # Endereço
    address: Mapped[str | None] = mapped_column(
        String(255),
        comment="Customer address"
    )
    
    address_number: Mapped[str | None] = mapped_column(
        String(20),
        comment="Address number"
    )
    
    city: Mapped[str | None] = mapped_column(
        String(100),
        comment="Customer city"
    )
    
    state: Mapped[str | None] = mapped_column(
        String(50),
        comment="Customer state"
    )
    
    zip_code: Mapped[str | None] = mapped_column(
        String(10),
        comment="Customer ZIP code"
    )
    
    # Programa de fidelidade
    customer_type: Mapped[CustomerType] = mapped_column(
        SQLEnum(CustomerType),
        default=CustomerType.REGULAR,
        comment="Customer type for benefits"
    )
    
    loyalty_points: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal(0),
        comment="Customer loyalty points balance"
    )
    
    total_spent: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal(0),
        comment="Total amount spent by customer"
    )
    
    total_purchases: Mapped[int] = mapped_column(
        default=0,
        comment="Total number of purchases"
    )
    
    # Preferências
    preferred_contact_method: Mapped[str | None] = mapped_column(
        String(20),
        comment="Preferred contact method (email, phone, sms)"
    )
    
    marketing_consent: Mapped[bool] = mapped_column(
        default=False,
        comment="Consent for marketing communications"
    )
    
    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Additional customer notes"
    )
    
    # Relacionamentos
    sales: Mapped[List["Sale"]] = relationship(
        "Sale",
        back_populates="customer",
        order_by="Sale.created_at.desc()"
    )
    
    def __repr__(self) -> str:
        return f"<Customer(id={self.id}, name='{self.full_name}', type='{self.customer_type}')>"
    
    def get_age(self) -> int | None:
        """
        Calculate customer age based on birth date.
        
        Returns:
            Customer age in years or None if birth date not set
        """
        if not self.birth_date:
            return None
        
        today = date.today()
        age = today.year - self.birth_date.year
        
        # Adjust if birthday hasn't occurred this year
        if today < date(today.year, self.birth_date.month, self.birth_date.day):
            age -= 1
            
        return age
    
    def calculate_discount_percentage(self) -> Decimal:
        """
        Calculate discount percentage based on customer type.
        
        Returns:
            Discount percentage
        """
        discount_rates = {
            CustomerType.REGULAR: Decimal(0),
            CustomerType.VIP: Decimal(5),
            CustomerType.PREMIUM: Decimal(10),
            CustomerType.CORPORATE: Decimal(15)
        }
        return discount_rates.get(self.customer_type, Decimal(0))
    
    def add_loyalty_points(self, amount: Decimal) -> None:
        """
        Add loyalty points based on purchase amount.
        
        Args:
            amount: Purchase amount to calculate points from
        """
        # 1 point per R$ 10 spent
        points_earned = amount / 10
        self.loyalty_points += points_earned.quantize(Decimal('0.01'))
    
    def redeem_loyalty_points(self, points: Decimal) -> bool:
        """
        Redeem loyalty points for discount.
        
        Args:
            points: Points to redeem
            
        Returns:
            True if redemption successful
        """
        if self.loyalty_points >= points:
            self.loyalty_points -= points
            return True
        return False
    
    def update_purchase_stats(self, sale_amount: Decimal) -> None:
        """
        Update customer purchase statistics.
        
        Args:
            sale_amount: Amount of the new sale
        """
        self.total_spent += sale_amount
        self.total_purchases += 1
        
        # Auto-upgrade customer type based on total spent
        if self.total_spent >= 10000 and self.customer_type == CustomerType.REGULAR:
            self.customer_type = CustomerType.VIP
        elif self.total_spent >= 25000 and self.customer_type == CustomerType.VIP:
            self.customer_type = CustomerType.PREMIUM
    
    def get_average_purchase_value(self) -> Decimal:
        """
        Calculate average purchase value.
        
        Returns:
            Average purchase value
        """
        if self.total_purchases == 0:
            return Decimal(0)
        
        return (self.total_spent / self.total_purchases).quantize(Decimal('0.01'))