"""
Schemas Pydantic para envios condicionais.
"""
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List
from decimal import Decimal
from app.models.enums import ShipmentStatus
from app.models.sale import PaymentMethod


# ============================================================================
# Item Schemas
# ============================================================================

class ConditionalShipmentItemBase(BaseModel):
    """Base schema para item de envio condicional"""
    product_id: int = Field(..., gt=0, description="ID do produto")
    quantity_sent: int = Field(..., gt=0, description="Quantidade enviada")
    unit_price: Decimal = Field(..., gt=0, description="Preço unitário se cliente comprar")
    notes: Optional[str] = Field(None, max_length=500, description="Observações sobre o item")


class ConditionalShipmentItemCreate(ConditionalShipmentItemBase):
    """Schema para criação de item"""
    pass


class ConditionalShipmentItemUpdate(BaseModel):
    """Schema para atualização de item durante processamento de devolução"""
    id: int = Field(..., gt=0, description="ID do item")
    quantity_kept: int = Field(0, ge=0, description="Quantidade que cliente ficou")
    quantity_returned: int = Field(0, ge=0, description="Quantidade devolvida")
    status: str = Field("SENT", description="SENT, KEPT, RETURNED, DAMAGED, LOST")
    notes: Optional[str] = Field(None, max_length=500)
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = ["SENT", "KEPT", "RETURNED", "DAMAGED", "LOST"]
        if v not in allowed:
            raise ValueError(f"Status deve ser um de: {', '.join(allowed)}")
        return v


class ConditionalShipmentItemResponse(ConditionalShipmentItemBase):
    """Schema de resposta para item"""
    id: int
    shipment_id: int
    quantity_kept: int
    quantity_returned: int
    quantity_pending: int  # Calculado
    status: str
    total_value: float  # Calculado
    kept_value: float  # Calculado
    created_at: datetime
    updated_at: datetime
    
    # Dados do produto (nested)
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    
    model_config = {"from_attributes": True}


# ============================================================================
# Shipment Schemas
# ============================================================================

class ConditionalShipmentBase(BaseModel):
    """Base schema para envio condicional"""
    customer_id: int = Field(..., gt=0, description="ID do cliente")
    shipping_address: str = Field(..., min_length=10, max_length=500, description="Endereço de entrega")
    scheduled_ship_date: Optional[datetime] = Field(None, description="Data/hora planejada para envio")
    
    # Datas de ida e devolução (NOVO)
    departure_datetime: Optional[datetime] = Field(None, description="Data/hora de ida ao cliente")
    return_datetime: Optional[datetime] = Field(None, description="Data/hora prevista para devolução")
    
    # LEGACY - manter por compatibilidade
    deadline_type: str = Field("days", description="Tipo de prazo: 'days' ou 'hours'")
    deadline_value: int = Field(7, ge=1, description="Valor do prazo (ex: 7 dias, 48 horas)")
    
    carrier: Optional[str] = Field(None, max_length=100, description="Transportadora")
    tracking_code: Optional[str] = Field(None, max_length=100, description="Código de rastreio")
    notes: Optional[str] = Field(None, max_length=1000, description="Observações gerais")

    @field_validator('scheduled_ship_date', 'departure_datetime', 'return_datetime')
    @classmethod
    def remove_timezone(cls, v: Optional[datetime]) -> Optional[datetime]:
        """Remove timezone para compatibilidade com TIMESTAMP WITHOUT TIME ZONE"""
        if v and v.tzinfo is not None:
            return v.replace(tzinfo=None)
        return v

    @field_validator('deadline_type')
    @classmethod
    def validate_deadline_type(cls, v: str) -> str:
        if v not in ["days", "hours"]:
            raise ValueError("deadline_type deve ser 'days' ou 'hours'")
        return v


class ConditionalShipmentCreate(ConditionalShipmentBase):
    """Schema para criação de envio condicional"""
    items: List[ConditionalShipmentItemCreate] = Field(
        ..., 
        min_length=1, 
        description="Lista de itens a enviar (mínimo 1)"
    )
    deadline_days: int = Field(
        7, 
        ge=1, 
        le=30, 
        description="Prazo em dias para devolução (padrão 7)"
    )
    
    @field_validator('items')
    @classmethod
    def validate_items_not_empty(cls, v: List[ConditionalShipmentItemCreate]) -> List[ConditionalShipmentItemCreate]:
        if not v:
            raise ValueError("Envio deve ter pelo menos 1 item")
        return v


class ConditionalShipmentUpdate(BaseModel):
    """Schema para atualização básica do envio"""
    status: Optional[str] = Field(
        None,
        description="PENDING, SENT, RETURNED_NO_SALE, COMPLETED_PARTIAL_SALE, COMPLETED_FULL_SALE"
    )
    shipping_address: Optional[str] = Field(None, min_length=10, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = ShipmentStatus.get_all_values()
            if v not in allowed:
                raise ValueError(f"Status deve ser um de: {', '.join(allowed)}")
        return v


class MarkAsSentRequest(BaseModel):
    """Schema para marcar envio como enviado"""
    carrier: Optional[str] = Field(None, max_length=100, description="Nome da transportadora")
    tracking_code: Optional[str] = Field(None, max_length=100, description="Código de rastreio")
    sent_notes: Optional[str] = Field(None, max_length=500, description="Observações sobre o envio")


class ProcessReturnRequest(BaseModel):
    """Schema para processar devolução de itens"""
    items: List[ConditionalShipmentItemUpdate] = Field(
        ...,
        min_length=1,
        description="Lista de itens com quantidades processadas"
    )
    create_sale: bool = Field(
        True,
        description="Se True, cria venda automaticamente para itens mantidos"
    )
    payment_method: PaymentMethod | None = Field(
        PaymentMethod.PIX,
        description="Forma de pagamento para venda gerada (cash, credit_card, debit_card, pix, bank_transfer, installments, loyalty_points)"
    )
    notes: Optional[str] = Field(None, max_length=1000, description="Observações sobre a devolução")

    @field_validator('payment_method')
    @classmethod
    def validate_payment_method(cls, v: PaymentMethod | None) -> PaymentMethod | None:
        return v


class ConditionalShipmentResponse(ConditionalShipmentBase):
    """Schema de resposta para envio condicional"""
    id: int
    tenant_id: int
    status: str
    scheduled_ship_date: Optional[datetime]
    sent_at: Optional[datetime]
    
    # Datas de ida e devolução
    departure_datetime: Optional[datetime]
    return_datetime: Optional[datetime]
    
    deadline_type: str
    deadline_value: int
    deadline: Optional[datetime]
    returned_at: Optional[datetime]
    completed_at: Optional[datetime]
    carrier: Optional[str]
    tracking_code: Optional[str]

    # Propriedades calculadas
    is_overdue: bool
    days_remaining: int
    total_items_sent: int
    total_items_kept: int
    total_items_returned: int
    total_value_sent: float
    total_value_kept: float

    # Dados aninhados
    items: List[ConditionalShipmentItemResponse] = []
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None

    created_at: datetime
    updated_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


class ConditionalShipmentListResponse(BaseModel):
    """Schema de resposta para lista de envios (sem itens detalhados)"""
    id: int
    customer_id: int
    customer_name: Optional[str]
    customer_phone: Optional[str]
    status: str
    deadline: Optional[datetime]
    is_overdue: bool
    days_remaining: int
    total_items_sent: int
    total_items_kept: int
    total_items_returned: int
    total_value_sent: float
    total_value_kept: float
    created_at: datetime

    # Agendamento de envio e retorno
    departure_datetime: Optional[datetime] = None
    return_datetime: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ConditionalShipmentFilters(BaseModel):
    """Schema para filtros de listagem"""
    status: Optional[str] = Field(None, description="Filtrar por status")
    customer_id: Optional[int] = Field(None, gt=0, description="Filtrar por cliente")
    is_overdue: Optional[bool] = Field(None, description="Mostrar apenas atrasados")
    skip: int = Field(0, ge=0, description="Paginação: offset")
    limit: int = Field(100, ge=1, le=1000, description="Paginação: limite")

    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = ShipmentStatus.get_all_values()
            if v not in allowed:
                raise ValueError(f"Status deve ser um de: {', '.join(allowed)}")
        return v


# ============================================================================
# WhatsApp Message Schemas
# ============================================================================

class WhatsAppShipmentMessage(BaseModel):
    """Schema para mensagem de WhatsApp de envio"""
    customer_name: str
    total_items: int
    items_description: List[str]  # Ex: ["4x Legging fitness", "3x Top esportivo"]
    total_value: float
    deadline_date: str  # Formatado
    shipping_address: str


class WhatsAppConfirmationMessage(BaseModel):
    """Schema para mensagem de confirmação de compra"""
    customer_name: str
    items_purchased: List[dict]  # {"name": "Legging Preta (P)", "qty": 2, "price": 180}
    total_value: float
    items_returned_count: int
