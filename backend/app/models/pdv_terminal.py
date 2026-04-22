"""
Modelo de terminal PDV (caixa) — agnóstico ao provedor de pagamento.

Suporta: Mercado Pago, Cielo, Stone, Rede, GetNet, PagSeguro, SumUp, manual.
"""
from sqlalchemy import String, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
from .base import BaseModel


class PDVTerminal(BaseModel):
    """
    Representa um terminal/caixa PDV vinculado a um tenant.

    O campo `provider` determina qual integração de pagamento é usada.
    Providers com integração cloud (ex: mercadopago) usam os campos mp_*
    e/ou provider_config. Providers manuais (cielo, stone, etc.) não precisam
    de setup externo — o operador confirma pagamentos manualmente.
    """
    __tablename__ = "pdv_terminals"

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Nome do caixa (ex.: 'Caixa 1')"
    )

    external_id: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="ID externo único do terminal (ex.: 'LOJ001POS001')"
    )

    # Provider de pagamento — determina qual integração usar
    provider: Mapped[str] = mapped_column(
        String(50),
        default="mercadopago",
        server_default="mercadopago",
        nullable=False,
        comment="Provider: mercadopago, cielo, stone, rede, getnet, pagseguro, sumup, manual"
    )

    # Config genérica por provider (JSONB para dados arbitrários)
    provider_config: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        server_default="{}",
        nullable=False,
        comment="Configurações específicas do provider (JSON)"
    )

    # Preenchido após POST /pos
    mp_pos_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        comment="ID numérico do POS retornado pelo MP"
    )
    mp_qr_image: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="URL da imagem do QR Code estático do POS"
    )
    mp_qr_template_document: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="URL do template PDF do QR Code"
    )

    # Preenchido após associação física + ativação PDV
    mp_terminal_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="ID único do dispositivo físico no MP (ex.: 'NEWLAND_N950__N950NCB801293324')"
    )
    operating_mode: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Modo de operação atual: PDV | STANDALONE | UNDEFINED"
    )

    is_configured: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        comment="True quando o POS foi criado no MP com sucesso"
    )
    is_pdv_active: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        comment="True quando o modo PDV foi ativado no terminal físico"
    )

    def __repr__(self) -> str:
        return (
            f"<PDVTerminal(id={self.id}, name='{self.name}', "
            f"external_id='{self.external_id}', mode={self.operating_mode})>"
        )
