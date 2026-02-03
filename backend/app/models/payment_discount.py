"""
Modelo de descontos por forma de pagamento.
"""
from sqlalchemy import String, ForeignKey, Numeric, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from decimal import Decimal
from .base import BaseModel
from .sale import PaymentMethod


class PaymentDiscount(BaseModel):
    """
    Payment discount configuration per tenant.
    
    Define descontos específicos por forma de pagamento para cada tenant.
    
    Exemplos:
    - PIX: 10% de desconto
    - Dinheiro: 12% de desconto
    - Débito: 5% de desconto
    - Crédito: 0% de desconto (sem desconto)
    """
    __tablename__ = "payment_discounts"
    __table_args__ = (
        UniqueConstraint(
            'tenant_id', 
            'payment_method', 
            name='uq_payment_discounts_tenant_method'
        ),
    )
    
    # Forma de pagamento
    payment_method: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Payment method (PIX, CASH, DEBIT_CARD, etc)"
    )
    
    # Percentual de desconto
    discount_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        comment="Discount percentage (10.00 = 10%)"
    )
    
    # Descrição (opcional)
    description: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Optional description"
    )
    
    def __repr__(self) -> str:
        return f"<PaymentDiscount(tenant_id={self.tenant_id}, method={self.payment_method}, discount={self.discount_percentage}%)>"
    
    def calculate_discount(self, amount: Decimal) -> Decimal:
        """
        Calcula o valor do desconto baseado no percentual.
        
        Args:
            amount: Valor base para cálculo
            
        Returns:
            Valor do desconto
        """
        if not self.is_active or self.discount_percentage <= 0:
            return Decimal(0)
        
        discount = (amount * self.discount_percentage) / Decimal(100)
        return discount.quantize(Decimal('0.01'))  # Arredondar para 2 casas decimais
