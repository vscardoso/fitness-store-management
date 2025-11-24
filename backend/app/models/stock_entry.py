"""
Modelo de entrada de estoque (substituição do Batch).
"""
from datetime import date
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, Date, ForeignKey, Enum as SQLEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, TYPE_CHECKING, Optional
import enum

from .base import BaseModel

if TYPE_CHECKING:
    from .trip import Trip
    from .entry_item import EntryItem


class EntryType(str, enum.Enum):
    """Tipos de entrada de estoque."""
    TRIP = "trip"          # Compra em viagem
    ONLINE = "online"      # Compra online
    LOCAL = "local"        # Compra local


class StockEntry(BaseModel):
    """
    Stock Entry model - Nova versão do Batch.
    
    Representa uma entrada de estoque no sistema, podendo ser de uma viagem,
    compra online ou compra local. Agrupa vários itens de produto.
    """
    __tablename__ = "stock_entries"
    __table_args__ = (
        UniqueConstraint('tenant_id', 'entry_code', name='uq_stock_entries_tenant_code'),
    )
    
    # Identificação da entrada
    entry_code: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
        comment="Código único da entrada por tenant (ex: ENTRY-2025-001)"
    )
    
    entry_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Data da entrada no estoque"
    )
    
    entry_type: Mapped[EntryType] = mapped_column(
        SQLEnum(EntryType, native_enum=False, length=20),
        nullable=False,
        comment="Tipo de entrada (trip/online/local)"
    )
    
    # Relacionamento com viagem (opcional)
    trip_id: Mapped[int | None] = mapped_column(
        ForeignKey("trips.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="ID da viagem associada (se entry_type = 'trip')"
    )
    
    # Informações do fornecedor
    supplier_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Nome do fornecedor"
    )
    
    supplier_cnpj: Mapped[str | None] = mapped_column(
        String(18),
        comment="CNPJ do fornecedor (formato: 00.000.000/0000-00)"
    )
    
    supplier_contact: Mapped[str | None] = mapped_column(
        String(255),
        comment="Contato do fornecedor (telefone, email, etc)"
    )
    
    # Informações da compra
    invoice_number: Mapped[str | None] = mapped_column(
        String(100),
        comment="Número da nota fiscal"
    )
    
    payment_method: Mapped[str | None] = mapped_column(
        String(50),
        comment="Forma de pagamento (dinheiro, cartão, pix, etc)"
    )
    
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        default=Decimal("0.00"),
        nullable=False,
        comment="Custo total da entrada (soma dos itens)"
    )
    
    # Observações
    notes: Mapped[str | None] = mapped_column(
        Text,
        comment="Observações sobre a entrada"
    )
    
    # Relacionamentos
    trip: Mapped[Optional["Trip"]] = relationship(
        "Trip",
        back_populates="stock_entries",
        lazy="selectin"
    )
    
    entry_items: Mapped[List["EntryItem"]] = relationship(
        "EntryItem",
        back_populates="stock_entry",
        lazy="selectin",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        """String representation of the stock entry."""
        return f"<StockEntry(code={self.entry_code}, type={self.entry_type}, supplier={self.supplier_name})>"
    
    def calculate_total_cost(self) -> Decimal:
        """
        Calcula o custo total da entrada baseado nos itens.
        
        Returns:
            Decimal: Soma do custo de todos os itens (quantity * unit_cost)
        """
        if not self.entry_items:
            return Decimal("0.00")
        
        total = sum(
            item.quantity * item.unit_cost
            for item in self.entry_items
            if item.is_active
        )
        return Decimal(str(total))
    
    def update_total_cost(self) -> None:
        """
        Atualiza o campo total_cost com o valor calculado.
        """
        self.total_cost = self.calculate_total_cost()
    
    @property
    def item_count(self) -> int:
        """
        Retorna o número de itens ativos nesta entrada.
        
        Returns:
            int: Quantidade de itens
        """
        if not self.entry_items:
            return 0
        return len([item for item in self.entry_items if item.is_active])
    
    @property
    def total_quantity(self) -> int:
        """
        Retorna a quantidade total de produtos nesta entrada.
        
        Returns:
            int: Soma das quantidades de todos os itens
        """
        if not self.entry_items:
            return 0
        return sum(item.quantity for item in self.entry_items if item.is_active)
    
    @property
    def is_from_trip(self) -> bool:
        """Verifica se a entrada é de uma viagem."""
        return self.entry_type == EntryType.TRIP and self.trip_id is not None
    
    @property
    def is_online_purchase(self) -> bool:
        """Verifica se a entrada é de compra online."""
        return self.entry_type == EntryType.ONLINE
    
    @property
    def is_local_purchase(self) -> bool:
        """Verifica se a entrada é de compra local."""
        return self.entry_type == EntryType.LOCAL
    
    def get_trip_details(self) -> Optional[dict]:
        """
        Retorna detalhes da viagem associada, se houver.
        
        Returns:
            dict | None: Dados da viagem ou None
        """
        if self.trip:
            return {
                "trip_code": self.trip.trip_code,
                "destination": self.trip.destination,
                "trip_date": self.trip.trip_date,
                "status": self.trip.status,
                "travel_cost_total": float(self.trip.travel_cost_total)
            }
        return None
