"""Contador do código curto das etiquetas, um por loja."""
from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint

from app.models.base import BaseModel


class CatalogCounter(BaseModel):
    __tablename__ = "catalog_counters"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_catalog_counter_tenant"),)

    tenant_id = Column(Integer, ForeignKey("stores.id"), nullable=False, index=True)
    # Próximo número a entregar. A linha fica travada até o fim da transação (UPDATE),
    # então duas criações ao mesmo tempo nunca pegam o mesmo número; rollback devolve o número.
    next_short_code = Column(Integer, nullable=False, default=1)
