"""
Schemas Pydantic para PDV — agnóstico ao provedor de pagamento.

Suporta: Mercado Pago, Cielo, Stone, Rede, GetNet, PagSeguro, SumUp, manual.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ── Providers ────────────────────────────────────────────────────────────────

class ProviderListResponse(BaseModel):
    terminal_providers: List[str]
    pix_providers: List[str]


# ── Terminais locais ──────────────────────────────────────────────────────────

class PDVTerminalCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, json_schema_extra={"example": "Caixa 1"})
    external_id: str = Field(..., min_length=1, max_length=50, json_schema_extra={"example": "LOJ001POS001"})
    provider: str = Field(
        default="mercadopago",
        json_schema_extra={"example": "mercadopago"},
        description="Provider: mercadopago, cielo, stone, rede, getnet, pagseguro, sumup, manual",
    )


class PDVTerminalResponse(BaseModel):
    id: int
    name: str
    external_id: str
    provider: str
    provider_config: dict = {}
    mp_pos_id: Optional[str] = None
    mp_qr_image: Optional[str] = None
    mp_qr_template_document: Optional[str] = None
    mp_terminal_id: Optional[str] = None
    operating_mode: Optional[str] = None
    is_configured: bool
    is_pdv_active: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Setup Store (provider-specific) ──────────────────────────────────────────

class MPStoreSetupRequest(BaseModel):
    """Setup de loja — específico do Mercado Pago."""
    mp_user_id: str = Field(..., description="ID do usuário no Mercado Pago")
    store_name: str = Field(..., json_schema_extra={"example": "Loja Fitness"})
    external_id: str = Field(..., json_schema_extra={"example": "LOJ001"})
    street_number: str = Field(..., json_schema_extra={"example": "123"})
    street_name: str = Field(..., json_schema_extra={"example": "Rua das Flores"})
    city_name: str = Field(..., json_schema_extra={"example": "São Paulo"})
    state_name: str = Field(..., json_schema_extra={"example": "São Paulo"})
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class MPStoreSetupResponse(BaseModel):
    mp_store_id: str
    mp_user_id: str
    message: str


# ── Setup POS (caixa) ─────────────────────────────────────────────────────────

class MPPOSSetupResponse(BaseModel):
    terminal_id: int
    mp_pos_id: Optional[str] = None
    qr_image: Optional[str] = None
    message: str


# ── Listar terminais físicos (maquininhas) no provider ─────────────────────

class MPDeviceTerminal(BaseModel):
    """Terminal físico retornado pela API do provider."""
    id: str
    pos_id: Optional[str] = None
    store_id: Optional[str] = None
    external_pos_id: Optional[str] = None
    operating_mode: str


class MPDeviceListResponse(BaseModel):
    terminals: List[MPDeviceTerminal]
    total: int


# ── Ativar modo PDV no terminal físico ───────────────────────────────────────

class ActivatePDVRequest(BaseModel):
    mp_terminal_id: str = Field(
        default=None,
        description="ID do dispositivo (backward compat)",
    )
    terminal_device_id: str = Field(
        default=None,
        description="ID do dispositivo retornado por GET /pdv/devices",
        json_schema_extra={"example": "NEWLAND_N950__N950NCB801293324"},
    )

    def get_device_id(self) -> str:
        """Retorna device_id, priorizando campo genérico."""
        return self.terminal_device_id or self.mp_terminal_id or ""


class ActivatePDVResponse(BaseModel):
    terminal_id: int
    terminal_device_id: Optional[str] = None
    mp_terminal_id: Optional[str] = None  # backward compat
    operating_mode: str
    message: str


# ── Order (pagamento via terminal) ───────────────────────────────────────────

class PDVOrderRequest(BaseModel):
    sale_id: int
    terminal_id: int
    total_amount: float
    description: Optional[str] = "Venda"
    expiration_time: Optional[str] = "PT15M"
    payment_type: Optional[str] = "credit_card"
    installments: Optional[int] = 1
    installments_cost: Optional[str] = "seller"


class PDVOrderResponse(BaseModel):
    sale_id: int
    terminal_id: Optional[int] = None
    order_id: Optional[str] = None
    mp_order_id: Optional[str] = None  # backward compat
    mp_payment_id: Optional[str] = None
    status: str
    external_reference: Optional[str] = None
    message: str


# ── Status da order ───────────────────────────────────────────────────────────

class PDVPaymentStatusResponse(BaseModel):
    sale_id: int
    order_id: Optional[str] = None
    mp_order_id: Optional[str] = None  # backward compat
    status: str
    paid: bool
    message: str


# ── Cancel / Refund ───────────────────────────────────────────────────────────

class PDVOrderActionResponse(BaseModel):
    sale_id: int
    order_id: Optional[str] = None
    mp_order_id: Optional[str] = None  # backward compat
    status: str
    refund_id: Optional[str] = None
    message: str


# ── Confirmação manual ────────────────────────────────────────────────────────

class ManualConfirmResponse(BaseModel):
    sale_id: int
    status: str
    message: str


# ── Compat: mantido para não quebrar imports antigos ─────────────────────────
PDVPaymentRequest = PDVOrderRequest
PDVPaymentResponse = PDVOrderResponse


# ── PIX QR Code ───────────────────────────────────────────────────────────────

class PixPaymentResponse(BaseModel):
    sale_id: int
    payment_id: str
    qr_code: str
    qr_code_base64: str
    expires_at: Optional[str] = None
    status: str
    message: str


class PixStatusResponse(BaseModel):
    sale_id: Optional[int] = None
    payment_id: str
    status: str
    paid: bool
    message: str


# ── PIX Start (cria venda PENDING + QR Code atomicamente) ─────────────────────

class PixStartRequest(BaseModel):
    customer_id: Optional[int] = None
    payment_method: str = "PIX"
    items: List[dict]
    payments: List[dict]
    discount_amount: float = 0.0
    tax_amount: float = 0.0
    notes: Optional[str] = None
    payer_email: Optional[str] = None


class PixStartResponse(BaseModel):
    sale_id: int
    sale_number: str
    total_amount: float
    payment_id: str
    qr_code: str
    qr_code_base64: str
    expires_at: Optional[str] = None
    status: str
    message: str


class PixRefundResponse(BaseModel):
    payment_id: str
    refund_id: str
    sale_id: int
    status: str
    message: str


# ── Terminal Start (cria venda PENDING + envia para terminal atomicamente) ────

class TerminalStartRequest(BaseModel):
    terminal_id: int
    payment_type: Optional[str] = "credit_card"
    installments: Optional[int] = 1
    items: List[dict]
    payments: List[dict]
    customer_id: Optional[int] = None
    discount_amount: float = 0.0
    tax_amount: float = 0.0
    notes: Optional[str] = None


class TerminalStartResponse(BaseModel):
    sale_id: int
    sale_number: str
    total_amount: float
    terminal_id: int
    terminal_name: str
    provider: str
    status: str
    message: str


# ── Webhook ──────────────────────────────────────────────────────────────────

class MPWebhookPayload(BaseModel):
    id: Optional[int] = None
    type: Optional[str] = None
    action: Optional[str] = None
    data: Optional[dict] = None
