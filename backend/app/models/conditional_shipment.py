from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Numeric, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
from app.models.base import BaseModel
from app.models.enums import ShipmentStatus


class ConditionalShipment(BaseModel):
    """
    Modelo de envio condicional (try before you buy).
    Cliente recebe pacote de roupas, escolhe o que quer e devolve o restante.
    """
    __tablename__ = "conditional_shipments"

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)

    # Status: PENDING, SENT, RETURNED_NO_SALE, COMPLETED_PARTIAL_SALE, COMPLETED_FULL_SALE
    status = Column(String(30), default=ShipmentStatus.PENDING.value, nullable=False, index=True)

    # Agendamento de envio
    scheduled_ship_date = Column(DateTime, nullable=True)  # Data/hora planejada para envio
    sent_at = Column(DateTime, nullable=True)  # Data/hora real do envio

    # Datas de ida e devolução (NOVO)
    departure_datetime = Column(DateTime, nullable=True)  # Data/hora de ida ao cliente
    return_datetime = Column(DateTime, nullable=True)  # Data/hora de devolução prevista

    # Prazo de devolução (LEGACY - manter por compatibilidade)
    deadline_type = Column(String(10), default="days", nullable=False)  # "days" ou "hours"
    deadline_value = Column(Integer, default=7, nullable=False)  # Quantidade (7 dias, 48 horas, etc)
    deadline = Column(DateTime, nullable=True)  # Data/hora limite calculada

    returned_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Informações de transporte
    carrier = Column(String(100), nullable=True)  # Transportadora
    tracking_code = Column(String(100), nullable=True)  # Código de rastreio

    notes = Column(Text, nullable=True)
    shipping_address = Column(Text, nullable=False)
    
    # Relacionamentos
    tenant = relationship("Store", back_populates="conditional_shipments")
    customer = relationship("Customer", back_populates="conditional_shipments")
    items = relationship(
        "ConditionalShipmentItem",
        back_populates="shipment",
        cascade="all, delete-orphan"
    )
    
    @property
    def is_overdue(self) -> bool:
        """Verifica se o envio está atrasado (só se SENT e passou do deadline)"""
        if self.deadline and self.status == ShipmentStatus.SENT.value:
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
        try:
            return sum(item.quantity_sent for item in self.items)
        except:
            return 0

    @property
    def total_items_kept(self) -> int:
        """Total de itens que o cliente ficou"""
        try:
            return sum(item.quantity_kept for item in self.items)
        except:
            return 0

    @property
    def total_items_returned(self) -> int:
        """Total de itens devolvidos"""
        try:
            return sum(item.quantity_returned for item in self.items)
        except:
            return 0

    @property
    def total_value_sent(self) -> float:
        """Valor total dos itens enviados"""
        try:
            return sum(item.quantity_sent * float(item.unit_price) for item in self.items)
        except:
            return 0.0

    @property
    def total_value_kept(self) -> float:
        """Valor total dos itens que o cliente comprou"""
        try:
            return sum(item.quantity_kept * float(item.unit_price) for item in self.items)
        except:
            return 0.0


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
