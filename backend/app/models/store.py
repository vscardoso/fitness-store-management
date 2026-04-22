"""
Modelo de loja/tenant para multi-tenancy.
"""
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional
from datetime import datetime
from .base import BaseModel


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

    # Branding da loja
    tagline: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Slogan da loja"
    )
    primary_color: Mapped[str] = mapped_column(
        String(7),
        default="#667eea",
        comment="Cor principal (hex)"
    )
    secondary_color: Mapped[str] = mapped_column(
        String(7),
        default="#764ba2",
        comment="Cor secundária (hex)"
    )
    accent_color: Mapped[str] = mapped_column(
        String(7),
        default="#10B981",
        comment="Cor de destaque (hex)"
    )
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
        comment="Provider PIX ativo para este tenant: mock, mercadopago"
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
