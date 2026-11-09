"""
Fila de etiquetas e histórico de impressão.

`label_queue_items`: peças que a loja quer etiquetar e ainda NÃO imprimiu (uma linha por variação e entrada de origem).
`label_print_jobs`: cada impressão que a pessoa CONFIRMOU ("Salvar impressão"): o que saiu, em que papel e onde a folha
parou (`next_position`), para a próxima impressão continuar da primeira posição livre.
Gerar o PDF não grava nada aqui: só o "Salvar impressão" tira da fila e anda a folha.
"""
from typing import Optional

from sqlalchemy import JSON, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class LabelPrintJob(BaseModel):
    __tablename__ = "label_print_jobs"

    layout: Mapped[str] = mapped_column(String(10), nullable=False)
    width_mm: Mapped[float] = mapped_column(Float, nullable=False)
    height_mm: Mapped[float] = mapped_column(Float, nullable=False)
    start_position: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    next_position: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    # [{"variant_id": 1, "quantity": 3, "entry_id": 7|null}]
    items: Mapped[list] = mapped_column(JSON, nullable=False)
    printed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    printed_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


class LabelQueueItem(BaseModel):
    __tablename__ = "label_queue_items"

    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True)
    entry_id: Mapped[Optional[int]] = mapped_column(ForeignKey("stock_entries.id", ondelete="SET NULL"), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    added_by_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
