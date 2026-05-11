"""
Model de job de impressão de etiquetas.
"""
import enum
from sqlalchemy import String, Integer, Text, Boolean, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class PrintJobStatus(str, enum.Enum):
    QUEUED = "queued"
    PRINTING = "printing"
    DONE = "done"
    ERROR = "error"
    CANCELLED = "cancelled"


class PrintJob(BaseModel):
    """Registro de job de impressão enviado à impressora de etiquetas."""

    __tablename__ = "print_jobs"

    printer_id: Mapped[int] = mapped_column(ForeignKey("label_printers.id", ondelete="RESTRICT"))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)

    quantity: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[PrintJobStatus] = mapped_column(
        SAEnum(PrintJobStatus, name="printjobstatus"), default=PrintJobStatus.QUEUED
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    zpl_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Snapshot dos dados no momento da impressão
    product_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(50), nullable=True)
    variant_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    price: Mapped[str | None] = mapped_column(String(20), nullable=True)

    show_price: Mapped[bool] = mapped_column(Boolean, default=True)
    show_sku: Mapped[bool] = mapped_column(Boolean, default=True)

    printer = relationship("LabelPrinter", foreign_keys=[printer_id], lazy="joined")
