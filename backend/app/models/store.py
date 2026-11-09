"""
Modelo de loja/tenant para multi-tenancy.
"""
from sqlalchemy import Date, String, DateTime, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from decimal import Decimal
from typing import List, Optional, TYPE_CHECKING
from datetime import date, datetime
from .base import BaseModel

if TYPE_CHECKING:
    from .subscription import Subscription
    from .conditional_shipment import ConditionalShipment


class Store(BaseModel):
    """
    Representa um tenant (loja/empresa) no sistema.
    Cada store possui uma subscription que gerencia planos e limites.
    """
    __tablename__ = "stores"

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
        comment="Nome da loja/tenant"
    )

    slug: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        index=True,
        comment="Identificador curto (ex.: loja-x)"
    )
    
    # Novo: subdomain para URL única (ex: loja-fitness-123.seuapp.com)
    subdomain: Mapped[Optional[str]] = mapped_column(
        String(100),
        unique=True,
        index=True,
        nullable=True,
        comment="Subdomínio único para a loja"
    )

    domain: Mapped[str | None] = mapped_column(
        String(255),
        comment="Domínio dedicado (opcional)"
    )

    is_default: Mapped[bool] = mapped_column(
        default=False,
        comment="Marca se é o tenant padrão"
    )

    catalog_feed_token: Mapped[Optional[str]] = mapped_column(
        String(64),
        unique=True,
        nullable=True,
        comment="Token da URL do feed de catálogo para a Meta (nulo = feed desligado)"
    )

    return_window_days: Mapped[int] = mapped_column(
        Integer,
        default=7,
        server_default="7",
        nullable=False,
        comment="Prazo, em dias, para o cliente devolver ou trocar uma compra"
    )

    allow_stock_writeoff: Mapped[bool] = mapped_column(
        default=False,
        server_default="false",
        nullable=False,
        comment="Admin liga: permite dar baixa no estoque pela Conferência de Estoque"
    )

    # Programa de fidelidade (cada loja escolhe se tem e como funciona)
    loyalty_enabled: Mapped[bool] = mapped_column(
        default=False, server_default="false", nullable=False, comment="Programa de fidelidade ligado"
    )
    loyalty_spend_per_point: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=10, server_default="10", nullable=False, comment="Quantos reais gastos dão 1 ponto"
    )
    loyalty_point_value: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), default=Decimal("0.10"), server_default="0.10", nullable=False,
        comment="Quanto 1 ponto vale em reais de desconto (cashback) ao usar"
    )
    loyalty_min_redeem: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=0, server_default="0", nullable=False, comment="Mínimo de pontos para poder usar"
    )
    loyalty_expiry_days: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Dias de validade de cada ganho de pontos; nulo = não vence"
    )

    allow_money_refund: Mapped[bool] = mapped_column(
        default=True,
        server_default="true",
        nullable=False,
        comment="False = a loja só troca peça, não devolve dinheiro"
    )

    # Branding da loja
    tagline: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Slogan da loja"
    )
    primary_color: Mapped[str] = mapped_column(
        String(7),
        default="#7C3AED",
        comment="Cor principal (hex)"
    )
    secondary_color: Mapped[str] = mapped_column(
        String(7),
        default="#DB2777",
        comment="Cor secundária (hex)"
    )
    accent_color: Mapped[str] = mapped_column(
        String(7),
        default="#10B981",
        comment="Cor de destaque (hex)"
    )
    # Financeiro: dia do corte da implantação (loja que já funcionava). Nulo = financeiro ainda não implantado.
    finance_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Repasse automático da maquininha (cartão cai no próximo dia útil): interruptor, banco de destino e até que dia
    # esperado o sistema já lançou (apagar um repasse automático NÃO o refaz: ele só olha dias depois deste).
    card_auto_settlement: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    card_auto_account_id: Mapped[Optional[int]] = mapped_column(nullable=True)
    card_auto_through: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    logo_path: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="Caminho do logo no servidor"
    )
    
    # Novo: plano atual (denormalizado para queries rápidas)
    plan: Mapped[Optional[str]] = mapped_column(
        String(20),
        default="trial",
        comment="Plano atual: trial, free, pro, enterprise"
    )
    
    # Novo: trial tracking
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Data de expiração do trial"
    )

    # Mercado Pago In-Store
    mp_user_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="ID do usuário no Mercado Pago"
    )
    mp_store_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        comment="ID da loja criada no MP (/users/{id}/stores)"
    )

    # MP Connect OAuth — cada lojista conecta sua própria conta MP
    mp_access_token: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="Access token OAuth do lojista no Mercado Pago"
    )
    mp_refresh_token: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="Refresh token OAuth do lojista no Mercado Pago"
    )
    mp_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Expiração do access token MP OAuth"
    )
    pix_provider: Mapped[str] = mapped_column(
        String(50),
        default="mock",
        server_default="mock",
        nullable=False,
        comment="Provider PIX ativo para este tenant: mock, mercadopago, generic"
    )
    pix_key: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Chave PIX do lojista (CPF, CNPJ, email, telefone ou chave aleatória)"
    )
    pix_key_type: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Tipo da chave PIX: cpf, cnpj, email, phone, random"
    )

    # Endereço da loja
    zip_code: Mapped[Optional[str]] = mapped_column(
        String(10),
        nullable=True,
        comment="CEP da loja"
    )
    street: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Rua/Avenida"
    )
    number: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="Número"
    )
    complement: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Complemento"
    )
    neighborhood: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Bairro"
    )
    city: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Cidade"
    )
    state: Mapped[Optional[str]] = mapped_column(
        String(2),
        nullable=True,
        comment="UF do estado"
    )

    # Relationships
    subscription: Mapped["Subscription"] = relationship(
        "Subscription",
        back_populates="tenant",
        uselist=False,
        cascade="all, delete-orphan"
    )
    
    conditional_shipments: Mapped[List["ConditionalShipment"]] = relationship(
        "ConditionalShipment",
        back_populates="tenant",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Store(id={self.id}, name='{self.name}', slug='{self.slug}', plan='{self.plan}')>"
