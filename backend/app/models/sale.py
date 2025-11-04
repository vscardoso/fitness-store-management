"""
Modelo de vendas com itens e pagamentos.
"""
from sqlalchemy import String, ForeignKey, Numeric, Enum as SQLEnum, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from enum import Enum
from decimal import Decimal
from typing import List, Dict, Any, TYPE_CHECKING
from .base import BaseModel

if TYPE_CHECKING:
    from .customer import Customer
    from .user import User
    from .product import Product


class SaleStatus(str, Enum):
    """Sale status options."""
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class PaymentMethod(str, Enum):
    """Payment method options."""
    CASH = "cash"
    CREDIT_CARD = "credit_card"
    DEBIT_CARD = "debit_card"
    PIX = "pix"
    BANK_TRANSFER = "bank_transfer"
    INSTALLMENTS = "installments"
    LOYALTY_POINTS = "loyalty_points"


class Sale(BaseModel):
    """
    Sale transaction model with items and payments.
    
    Represents complete sales transactions with customer and payment information.
    """
    __tablename__ = "sales"
    
    # Informações da venda
    sale_number: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        comment="Unique sale number"
    )
    
    status: Mapped[SaleStatus] = mapped_column(
        SQLEnum(SaleStatus),
        default=SaleStatus.PENDING,
        comment="Sale status"
    )
    
    # Valores
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Subtotal before discounts and taxes"
    )
    
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal(0),
        comment="Total discount applied"
    )
    
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal(0),
        comment="Total tax amount"
    )
    
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Final total amount"
    )
    
    # Pagamento
    payment_method: Mapped[PaymentMethod] = mapped_column(
        SQLEnum(PaymentMethod),
        nullable=False,
        comment="Payment method used"
    )
    
    payment_reference: Mapped[str | None] = mapped_column(
        String(100),
        comment="Payment reference (transaction ID, check number, etc.)"
    )
    
    loyalty_points_used: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal(0),
        comment="Loyalty points used in this sale"
    )
    
    loyalty_points_earned: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal(0),
        comment="Loyalty points earned from this sale"
    )
    
    # Observações
    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Sale notes or comments"
    )
    
    # Chaves estrangeiras
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"),
        comment="Customer ID (optional for walk-in sales)"
    )
    
    seller_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        comment="Seller/User ID who made the sale"
    )
    
    # Relacionamentos
    customer: Mapped["Customer | None"] = relationship(
        "Customer",
        back_populates="sales"
    )
    
    seller: Mapped["User"] = relationship(
        "User",
        back_populates="sales",
        foreign_keys=[seller_id]
    )
    
    items: Mapped[List["SaleItem"]] = relationship(
        "SaleItem",
        back_populates="sale",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Sale(id={self.id}, number='{self.sale_number}', total={self.total_amount})>"
    
    def calculate_totals(self) -> None:
        """
        Calculate sale totals based on items.
        """
        self.subtotal = sum(item.subtotal for item in self.items)
        self.total_amount = self.subtotal - self.discount_amount + self.tax_amount
    
    def add_item(self, product: "Product", quantity: int, unit_price: Decimal | None = None) -> "SaleItem":
        """
        Add an item to the sale.
        
        Args:
            product: Product to add
            quantity: Quantity to sell
            unit_price: Override price (uses product price if None)
            
        Returns:
            Created SaleItem
        """
        if unit_price is None:
            unit_price = product.price
            
        item = SaleItem(
            sale=self,
            product=product,
            quantity=quantity,
            unit_price=unit_price,
            subtotal=quantity * unit_price
        )
        
        self.items.append(item)
        self.calculate_totals()
        return item
    
    def apply_customer_discount(self) -> None:
        """
        Apply customer-specific discount.
        """
        if self.customer:
            discount_percentage = self.customer.calculate_discount_percentage()
            if discount_percentage > 0:
                self.discount_amount = (self.subtotal * discount_percentage / 100).quantize(Decimal('0.01'))
                self.calculate_totals()
    
    def get_item_count(self) -> int:
        """
        Get total number of items in sale.
        
        Returns:
            Total quantity of all items
        """
        return sum(item.quantity for item in self.items)


class SaleItem(BaseModel):
    """
    Sale item model representing individual products in a sale.
    
    Links products to sales with quantities and pricing.
    """
    __tablename__ = "sale_items"
    
    quantity: Mapped[int] = mapped_column(
        nullable=False,
        comment="Quantity sold"
    )
    
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Unit price at time of sale"
    )
    
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Item subtotal (quantity * unit_price)"
    )
    
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal(0),
        comment="Discount applied to this item"
    )
    
    # FIFO Tracking - Rastreabilidade de origem (de quais entradas saiu)
    sale_sources: Mapped[Dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
        comment="JSON with FIFO sources: [{entry_id, entry_item_id, quantity_taken, unit_cost, total_cost, entry_code, entry_date}]"
    )
    
    # Chaves estrangeiras
    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="CASCADE"),
        comment="Sale ID"
    )
    
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"),
        comment="Product ID"
    )
    
    # Relacionamentos
    sale: Mapped["Sale"] = relationship(
        "Sale",
        back_populates="items"
    )
    
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="sale_items"
    )
    
    def __repr__(self) -> str:
        return f"<SaleItem(id={self.id}, product_id={self.product_id}, quantity={self.quantity})>"
    
    def calculate_subtotal(self) -> None:
        """
        Calculate item subtotal.
        """
        self.subtotal = (self.quantity * self.unit_price) - self.discount_amount


# Classe Payment separada para pagamentos
class Payment(BaseModel):
    """
    Payment model for tracking sale payments.
    
    Supports multiple payments per sale (installments, partial payments).
    """
    __tablename__ = "payments"
    
    amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Payment amount"
    )
    
    payment_method: Mapped[PaymentMethod] = mapped_column(
        SQLEnum(PaymentMethod),
        nullable=False,
        comment="Payment method"
    )
    
    payment_reference: Mapped[str | None] = mapped_column(
        String(100),
        comment="Payment reference"
    )
    
    status: Mapped[str] = mapped_column(
        String(20),
        default="confirmed",
        comment="Payment status"
    )
    
    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Payment notes"
    )
    
    # Chave estrangeira
    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="CASCADE"),
        comment="Sale ID"
    )
    
    # Relacionamentos
    sale: Mapped["Sale"] = relationship(
        "Sale",
        back_populates="payments"
    )
    
    def __repr__(self) -> str:
        return f"<Payment(id={self.id}, sale_id={self.sale_id}, amount={self.amount})>"


# Adicionar relacionamento de volta no Sale
Sale.payments = relationship(
    "Payment",
    back_populates="sale",
    cascade="all, delete-orphan"
)