"""
Schemas Pydantic para impressoras de etiqueta e jobs de impressão.
"""
from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

from app.models.label_printer import ConnectionType, PrinterProtocol
from app.models.print_job import PrintJobStatus


# ============================================================================
# IMPRESSORA
# ============================================================================

class LabelPrinterBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    model: str = "Elgin L42 Pro"
    connection_type: ConnectionType = ConnectionType.ETHERNET
    protocol: PrinterProtocol = PrinterProtocol.ZPL
    ip_address: Optional[str] = None
    port: int = 9100
    serial_port: Optional[str] = None
    baud_rate: int = 9600
    usb_device: Optional[str] = None
    label_width_mm: int = 55
    label_height_mm: int = 65
    dpi: int = 203
    is_default: bool = False


class LabelPrinterCreate(LabelPrinterBase):
    pass


class LabelPrinterUpdate(BaseModel):
    name: Optional[str] = None
    connection_type: Optional[ConnectionType] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    serial_port: Optional[str] = None
    baud_rate: Optional[int] = None
    usb_device: Optional[str] = None
    label_width_mm: Optional[int] = None
    label_height_mm: Optional[int] = None
    dpi: Optional[int] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class LabelPrinterResponse(LabelPrinterBase):
    id: int
    tenant_id: Optional[int]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LabelPrinterListResponse(BaseModel):
    items: List[LabelPrinterResponse]
    total: int


class PrinterTestResponse(BaseModel):
    success: bool
    message: str
    printer_id: int


# ============================================================================
# PRINT JOB
# ============================================================================

class PrintJobCreate(BaseModel):
    printer_id: int
    product_id: Optional[int] = None
    variant_id: Optional[int] = None
    quantity: int = Field(1, ge=1, le=999)
    show_price: bool = True
    show_sku: bool = True


class PrintJobBatchItem(BaseModel):
    variant_id: int
    quantity: int = Field(1, ge=1, le=999)
    show_price: bool = True
    show_sku: bool = True


class PrintJobBatchCreate(BaseModel):
    printer_id: int
    product_id: int
    items: List[PrintJobBatchItem]


class PrintJobResponse(BaseModel):
    id: int
    printer_id: int
    product_id: Optional[int]
    variant_id: Optional[int]
    quantity: int
    status: PrintJobStatus
    error_message: Optional[str]
    product_name: Optional[str]
    sku: Optional[str]
    variant_label: Optional[str]
    price: Optional[str]
    show_price: bool
    show_sku: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PrintJobListResponse(BaseModel):
    items: List[PrintJobResponse]
    total: int


class ZplPreviewResponse(BaseModel):
    zpl: str
    width_dots: int
    height_dots: int
    label_width_mm: int
    label_height_mm: int
    dpi: int
