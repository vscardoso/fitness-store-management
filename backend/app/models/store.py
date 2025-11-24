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

    # Relationships
    subscription: Mapped["Subscription"] = relationship(
        "Subscription",
        back_populates="tenant",
        uselist=False,
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Store(id={self.id}, name='{self.name}', slug='{self.slug}', plan='{self.plan}')>"
