"""
Model de impressora de etiquetas (Elgin L42 Pro e compatíveis ZPL).
"""
import enum
from sqlalchemy import String, Integer, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from .base import BaseModel


class ConnectionType(str, enum.Enum):
    USB = "usb"
    ETHERNET = "ethernet"
    SERIAL = "serial"


class PrinterProtocol(str, enum.Enum):
    ZPL = "zpl"
    CPCL = "cpcl"
    ESC_POS = "esc_pos"


class LabelPrinter(BaseModel):
    """Impressora de etiquetas térmica (padrão: Elgin L42 Pro)."""

    __tablename__ = "label_printers"

    name: Mapped[str] = mapped_column(String(100), comment="Nome de identificação")
    model: Mapped[str] = mapped_column(String(100), default="Elgin L42 Pro")
    connection_type: Mapped[ConnectionType] = mapped_column(
        SAEnum(ConnectionType, name="connectiontype"), default=ConnectionType.ETHERNET
    )
    protocol: Mapped[PrinterProtocol] = mapped_column(
        SAEnum(PrinterProtocol, name="printerprotocol"), default=PrinterProtocol.ZPL
    )

    # Ethernet
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    port: Mapped[int] = mapped_column(Integer, default=9100)

    # Serial (RS-232)
    serial_port: Mapped[str | None] = mapped_column(String(50), nullable=True)
    baud_rate: Mapped[int] = mapped_column(Integer, default=9600)

    # USB — dispositivo em /dev/usb/lp0 (Linux) ou porta RAW (Windows)
    usb_device: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Dimensões da etiqueta em mm
    label_width_mm: Mapped[int] = mapped_column(Integer, default=55)
    label_height_mm: Mapped[int] = mapped_column(Integer, default=65)
    dpi: Mapped[int] = mapped_column(Integer, default=203)

    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
