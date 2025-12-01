from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Numeric, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
from app.models.base import BaseModel


class ConditionalShipment(BaseModel):
    """
    Modelo de envio condicional (try before you buy).
    Cliente recebe pacote de roupas, escolhe o que quer e devolve o restante.
    """
    __tablename__ = "conditional_shipments"

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    
    # Status: PENDING, SENT, PARTIAL_RETURN, COMPLETED, CANCELLED, OVERDUE
    status = Column(String(20), default="PENDING", nullable=False, index=True)
    
    sent_at = Column(DateTime, nullable=True)
    deadline = Column(DateTime, nullable=True)  # Data limite para devolução
    returned_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    notes = Column(Text, nullable=True)
    shipping_address = Column(Text, nullable=False)
    
    # Relacionamentos
    tenant = relationship("Tenant", back_populates="conditional_shipments")
    customer = relationship("Customer", back_populates="conditional_shipments")
    items = relationship(
        "ConditionalShipmentItem",
        back_populates="shipment",
        cascade="all, delete-orphan"
    )
    
    @property
    def is_overdue(self) -> bool:
        """Verifica se o envio está atrasado"""
        if self.deadline and self.status in ["SENT", "PARTIAL_RETURN"]:
            return datetime.utcnow() > self.deadline
        return False
    
    @property
    def days_remaining(self) -> int:
        """Retorna quantos dias faltam para o prazo"""
        if self.deadline:
            delta = self.deadline - datetime.utcnow()
            return max(0, delta.days)
        return 0
    
    @property
    def total_items_sent(self) -> int:
        """Total de itens enviados"""
        return sum(item.quantity_sent for item in self.items)
    
    @property
    def total_items_kept(self) -> int:
        """Total de itens que o cliente ficou"""
        return sum(item.quantity_kept for item in self.items)
    
    @property
    def total_items_returned(self) -> int:
        """Total de itens devolvidos"""
        return sum(item.quantity_returned for item in self.items)
    
    @property
    def total_value_sent(self) -> float:
        """Valor total dos itens enviados"""
        return sum(item.quantity_sent * float(item.unit_price) for item in self.items)
    
    @property
    def total_value_kept(self) -> float:
        """Valor total dos itens que o cliente comprou"""
        return sum(item.quantity_kept * float(item.unit_price) for item in self.items)


class ConditionalShipmentItem(BaseModel):
    """
    Item de um envio condicional.
    Rastreia quantidade enviada, mantida e devolvida de cada produto.
    """
    __tablename__ = "conditional_shipment_items"

    shipment_id = Column(Integer, ForeignKey("conditional_shipments.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    
    quantity_sent = Column(Integer, nullable=False)  # Quantidade enviada
    quantity_kept = Column(Integer, default=0, nullable=False)  # Cliente ficou com
    quantity_returned = Column(Integer, default=0, nullable=False)  # Cliente devolveu
    
    # Status: SENT, KEPT, RETURNED, DAMAGED, LOST
    status = Column(String(20), default="SENT", nullable=False)
    
    unit_price = Column(Numeric(10, 2), nullable=False)  # Preço se cliente comprar
    notes = Column(Text, nullable=True)  # Ex: "voltou com mancha", "cliente adorou"
    
    # Relacionamentos
    shipment = relationship("ConditionalShipment", back_populates="items")
    product = relationship("Product")
    
    @property
    def quantity_pending(self) -> int:
        """Quantidade ainda não processada (nem devolvida nem mantida)"""
        return self.quantity_sent - self.quantity_kept - self.quantity_returned
    
    @property
    def total_value(self) -> float:
        """Valor total deste item se cliente comprar tudo"""
        return self.quantity_sent * float(self.unit_price)
    
    @property
    def kept_value(self) -> float:
        """Valor dos itens que cliente efetivamente comprou"""
        return self.quantity_kept * float(self.unit_price)
