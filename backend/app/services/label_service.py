"""
Serviço de geração de comandos de impressão para etiquetas.

Arquitetura: dispatcher + geradores por protocolo.
  LabelService.generate() → seleciona gerador pelo printer.protocol
    ZplGenerator   — ZPL II  (Elgin L42 Pro, Zebra, Argox, TSC)
    CpclGenerator  — CPCL    (Zebra antigos, Datamax, Honeywell)
    EscPosGenerator— ESC/POS (Bematech, Epson TM, Elgin i9, impressoras de recibo)

Para adicionar um novo protocolo:
  1. Criar uma subclasse de BaseLabelGenerator
  2. Implementar back_label(), front_label(), test_label()
  3. Adicionar uma entrada em _GENERATORS
  4. Adicionar o valor no enum PrinterProtocol (models/label_printer.py)
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from decimal import Decimal
from typing import Optional, TYPE_CHECKING, Union

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.label_printer import LabelPrinter

from app.models.label_printer import PrinterProtocol

# Tipo de saída: str para ZPL/CPCL, bytes para ESC/POS
LabelOutput = Union[str, bytes]


# ============================================================================
# BASE — helpers compartilhados por todos os geradores
# ============================================================================

class BaseLabelGenerator(ABC):
    DEFAULT_DPI = 203
    DEFAULT_WIDTH_MM = 55
    DEFAULT_HEIGHT_MM = 65

    def dims(self, printer: Optional["LabelPrinter"]) -> tuple[int, int, int]:
        """Retorna (width_mm, height_mm, dpi)."""
        return (
            printer.label_width_mm if printer else self.DEFAULT_WIDTH_MM,
            printer.label_height_mm if printer else self.DEFAULT_HEIGHT_MM,
            printer.dpi if printer else self.DEFAULT_DPI,
        )

    def mm_to_dots(self, mm: int, dpi: int) -> int:
        return round(mm * dpi / 25.4)

    def build_qr_payload(self, product: "Product", variant: "ProductVariant") -> str:
        return json.dumps(
            {"sku": variant.sku or "", "id": product.id, "vid": variant.id, "type": "product"},
            ensure_ascii=True,
            separators=(",", ":"),
        )

    def format_variant_label(self, variant: "ProductVariant") -> str:
        parts = []
        if getattr(variant, "color", None):
            parts.append(self.safe_text(variant.color))
        if getattr(variant, "size", None):
            parts.append(self.safe_text(variant.size))
        return " | ".join(parts)

    def format_price(self, value) -> str:
        try:
            v = Decimal(str(value))
            return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        except Exception:
            return str(value)

    def get_price(self, variant: "ProductVariant") -> Optional[Decimal]:
        val = getattr(variant, "price", None) or getattr(variant, "sale_price", None)
        if val is None:
            return None
        try:
            return Decimal(str(val))
        except Exception:
            return None

    def safe_text(self, text: str) -> str:
        return (text or "").replace("^", "").replace("~", "").strip()

    def truncate(self, text: str, max_chars: int = 20) -> str:
        safe = self.safe_text(text)
        return safe if len(safe) <= max_chars else safe[: max_chars - 1] + "."

    @abstractmethod
    def back_label(
        self,
        product: "Product",
        variant: "ProductVariant",
        quantity: int,
        show_price: bool,
        show_sku: bool,
        printer: Optional["LabelPrinter"],
    ) -> LabelOutput: ...

    @abstractmethod
    def front_label(
        self,
        store_name: str,
        product: "Product",
        variant: "ProductVariant",
        quantity: int,
        printer: Optional["LabelPrinter"],
    ) -> LabelOutput: ...

    @abstractmethod
    def test_label(self, printer: Optional["LabelPrinter"]) -> LabelOutput: ...


# ============================================================================
# ZPL II — Elgin L42 Pro, Zebra (ZD/ZT/LP), Argox, TSC
# ============================================================================

class ZplGenerator(BaseLabelGenerator):
    """
    ZPL II (Zebra Programming Language).
    Protocolo texto enviado via TCP:9100, USB ou Serial.
    Suporta posicionamento absoluto e QR Code nativo (^BQ).
    """

    QR_MAGNIFICATION = 6  # 41 módulos × 6 dots ≈ 246 dots

    def back_label(self, product, variant, quantity, show_price, show_sku, printer):
        w_mm, h_mm, dpi = self.dims(printer)
        w = self.mm_to_dots(w_mm, dpi)
        h = self.mm_to_dots(h_mm, dpi)

        qr_data = self.build_qr_payload(product, variant)
        qr_size = 41 * self.QR_MAGNIFICATION
        qr_x = max(10, (w - qr_size) // 2)
        qr_y = 15

        y = qr_y + qr_size + 12
        name = self.truncate(product.name, 20)
        variant_label = self.format_variant_label(variant)

        lines = [
            "^XA",
            f"^PW{w}",
            f"^LL{h}",
            "^CI28",
            f"^FO{qr_x},{qr_y}^BQN,2,{self.QR_MAGNIFICATION}^FDMA,{qr_data}^FS",
            f"^FO10,{y - 6}^GB{w - 20},1,1^FS",
            f"^FO10,{y}^A0N,22,22^FD{name}^FS",
        ]
        y += 28
        if variant_label:
            lines.append(f"^FO10,{y}^A0N,19,19^FD{variant_label}^FS")
            y += 25
        if show_sku and variant.sku:
            lines.append(f"^FO10,{y}^A0N,17,17^FDSKU: {self.safe_text(variant.sku)}^FS")
            y += 23
        if show_price:
            price = self.get_price(variant)
            if price is not None:
                lines.append(f"^FO10,{y}^A0N,24,24^FD{self.format_price(price)}^FS")
        lines += [f"^PQ{quantity}", "^XZ"]
        return "\n".join(lines)

    def front_label(self, store_name, product, variant, quantity, printer):
        w_mm, h_mm, dpi = self.dims(printer)
        w = self.mm_to_dots(w_mm, dpi)
        h = self.mm_to_dots(h_mm, dpi)

        store = self.truncate(store_name, 18)
        name = self.truncate(product.name, 18)
        variant_label = self.format_variant_label(variant)
        price = self.get_price(variant)

        lines = [
            "^XA",
            f"^PW{w}",
            f"^LL{h}",
            "^CI28",
            f"^FO0,30^FB{w},1,,C^A0N,26,26^FD{store}^FS",
            f"^FO10,65^GB{w - 20},1,1^FS",
            f"^FO0,80^FB{w},2,,C^A0N,22,22^FD{name}^FS",
        ]
        y = 140
        if variant_label:
            lines.append(f"^FO0,{y}^FB{w},1,,C^A0N,19,19^FD{variant_label}^FS")
            y += 28
        if price is not None:
            lines.append(f"^FO0,{y}^FB{w},1,,C^A0N,32,32^FD{self.format_price(price)}^FS")
        lines += [f"^PQ{quantity}", "^XZ"]
        return "\n".join(lines)

    def test_label(self, printer):
        w_mm, h_mm, dpi = self.dims(printer)
        w = self.mm_to_dots(w_mm, dpi)
        h = self.mm_to_dots(h_mm, dpi)
        return "\n".join([
            "^XA",
            f"^PW{w}",
            f"^LL{h}",
            "^CI28",
            f"^FO0,60^FB{w},1,,C^A0N,28,28^FDTeste de Impressao^FS",
            f"^FO0,100^FB{w},1,,C^A0N,20,20^FDZPL II^FS",
            f"^FO0,130^FB{w},1,,C^A0N,18,18^FD{w_mm}mm x {h_mm}mm | {dpi}dpi^FS",
            f"^FO10,165^GB{w - 20},1,1^FS",
            f"^FO0,178^FB{w},1,,C^A0N,16,16^FDConexao OK^FS",
            "^PQ1",
            "^XZ",
        ])


# ============================================================================
# CPCL — Zebra (modelos antigos), Datamax, Honeywell, Intermec
# ============================================================================

class CpclGenerator(BaseLabelGenerator):
    """
    CPCL (Common Printer Control Language).
    Header: ! {offset} {hdpi} {vdpi} {height_dots} {quantity}
    Protocolo texto, suporta QR Code nativo e posicionamento absoluto.
    """

    def back_label(self, product, variant, quantity, show_price, show_sku, printer):
        w_mm, h_mm, dpi = self.dims(printer)
        h = self.mm_to_dots(h_mm, dpi)
        w = self.mm_to_dots(w_mm, dpi)

        qr_data = self.build_qr_payload(product, variant)
        qr_mag = 6
        qr_size = 41 * qr_mag
        qr_x = max(10, (w - qr_size) // 2)
        qr_y = 15

        name = self.truncate(product.name, 20)
        variant_label = self.format_variant_label(variant)

        lines = [
            f"! 0 {dpi} {dpi} {h} {quantity}",
            f"B QR {qr_x} {qr_y} M 2 U {qr_mag}",
            f"MA,{qr_data}",
            "ENDQR",
        ]
        y = qr_y + qr_size + 15
        lines.append(f"TEXT 4 0 10 {y} {name}")
        y += 30
        if variant_label:
            lines.append(f"TEXT 3 0 10 {y} {variant_label}")
            y += 26
        if show_sku and variant.sku:
            lines.append(f"TEXT 3 0 10 {y} SKU: {self.safe_text(variant.sku)}")
            y += 24
        if show_price:
            price = self.get_price(variant)
            if price is not None:
                lines.append(f"TEXT 4 0 10 {y} {self.format_price(price)}")
        lines.append("PRINT")
        return "\r\n".join(lines)

    def front_label(self, store_name, product, variant, quantity, printer):
        w_mm, h_mm, dpi = self.dims(printer)
        h = self.mm_to_dots(h_mm, dpi)
        w = self.mm_to_dots(w_mm, dpi)

        store = self.truncate(store_name, 18)
        name = self.truncate(product.name, 18)
        variant_label = self.format_variant_label(variant)
        price = self.get_price(variant)

        lines = [
            f"! 0 {dpi} {dpi} {h} {quantity}",
            "CENTER",
            f"TEXT 5 0 0 30 {store}",
            f"LINE 10 70 {w - 10} 71 1",
            f"TEXT 4 0 0 90 {name}",
        ]
        y = 140
        if variant_label:
            lines.append(f"TEXT 3 0 0 {y} {variant_label}")
            y += 30
        if price is not None:
            lines.append(f"TEXT 5 0 0 {y} {self.format_price(price)}")
        lines.append("PRINT")
        return "\r\n".join(lines)

    def test_label(self, printer):
        w_mm, h_mm, dpi = self.dims(printer)
        h = self.mm_to_dots(h_mm, dpi)
        w = self.mm_to_dots(w_mm, dpi)
        lines = [
            f"! 0 {dpi} {dpi} {h} 1",
            "CENTER",
            "TEXT 5 0 0 60 Teste de Impressao",
            "TEXT 4 0 0 100 CPCL",
            f"TEXT 3 0 0 130 {w_mm}mm x {h_mm}mm | {dpi}dpi",
            f"LINE 10 165 {w - 10} 166 1",
            "TEXT 3 0 0 178 Conexao OK",
            "PRINT",
        ]
        return "\r\n".join(lines)


# ============================================================================
# ESC/POS — Bematech, Epson TM, Elgin i9, impressoras de recibo
# ============================================================================

class EscPosGenerator(BaseLabelGenerator):
    """
    ESC/POS (Epson Standard Code for Point of Sale).
    Protocolo binário — retorna bytes em vez de str.
    Impressão sequencial em linhas (sem posicionamento X,Y absoluto).
    QR Code via GS (k — suportado em impressoras com firmware moderno).
    """

    ESC = b"\x1b"
    GS = b"\x1d"
    LF = b"\x0a"
    INIT = b"\x1b\x40"
    ALIGN_CENTER = b"\x1b\x61\x01"
    ALIGN_LEFT = b"\x1b\x61\x00"
    BOLD_ON = b"\x1b\x45\x01"
    BOLD_OFF = b"\x1b\x45\x00"
    FONT_LARGE = b"\x1b\x21\x30"
    FONT_NORMAL = b"\x1b\x21\x00"
    FONT_SMALL = b"\x1b\x21\x01"

    def _text(self, s: str) -> bytes:
        return s.encode("cp850", errors="replace") + self.LF

    def _qr(self, data: str) -> bytes:
        """QR Code via GS (k Model 2, tamanho 6, correção M)."""
        payload = data.encode("ascii", errors="replace")
        n = len(payload) + 3
        pL, pH = n & 0xFF, (n >> 8) & 0xFF
        return (
            self.GS + b"(k\x03\x0049C\x06"              # tamanho módulo 6
            + self.GS + b"(k\x03\x0049E0"               # erro M (48='0')
            + self.GS + b"(k" + bytes([pL, pH]) + b"49P0" + payload  # armazenar
            + self.GS + b"(k\x03\x0049Q0"               # imprimir
        )

    def back_label(self, product, variant, quantity, show_price, show_sku, printer):
        name = self.truncate(product.name, 24)
        variant_label = self.format_variant_label(variant)
        qr_data = self.build_qr_payload(product, variant)

        buf = bytearray()
        buf += self.INIT + self.ALIGN_CENTER
        buf += self._qr(qr_data) + self.LF
        buf += self.ALIGN_LEFT + self.BOLD_ON + self.FONT_LARGE
        buf += self._text(name)
        buf += self.BOLD_OFF + self.FONT_NORMAL
        if variant_label:
            buf += self._text(variant_label)
        if show_sku and variant.sku:
            buf += self.FONT_SMALL + self._text(f"SKU: {self.safe_text(variant.sku)}") + self.FONT_NORMAL
        if show_price:
            price = self.get_price(variant)
            if price is not None:
                buf += self.BOLD_ON + self._text(self.format_price(price)) + self.BOLD_OFF
        buf += self.LF * 3
        return bytes(buf) * quantity

    def front_label(self, store_name, product, variant, quantity, printer):
        store = self.truncate(store_name, 24)
        name = self.truncate(product.name, 24)
        variant_label = self.format_variant_label(variant)
        price = self.get_price(variant)

        buf = bytearray()
        buf += self.INIT + self.ALIGN_CENTER
        buf += self.BOLD_ON + self.FONT_LARGE + self._text(store) + self.BOLD_OFF + self.FONT_NORMAL
        buf += self._text("-" * 32)
        buf += self.FONT_LARGE + self._text(name) + self.FONT_NORMAL
        if variant_label:
            buf += self._text(variant_label)
        if price is not None:
            buf += self.BOLD_ON + self.FONT_LARGE + self._text(self.format_price(price)) + self.BOLD_OFF + self.FONT_NORMAL
        buf += self.LF * 3
        return bytes(buf) * quantity

    def test_label(self, printer):
        w_mm, h_mm, dpi = self.dims(printer)
        buf = bytearray()
        buf += self.INIT + self.ALIGN_CENTER
        buf += self.BOLD_ON + self.FONT_LARGE + self._text("Teste de Impressao") + self.BOLD_OFF + self.FONT_NORMAL
        buf += self._text("ESC/POS")
        buf += self._text(f"{w_mm}mm x {h_mm}mm | {dpi}dpi")
        buf += self._text("-" * 32)
        buf += self._text("Conexao OK")
        buf += self.LF * 3
        return bytes(buf)


# ============================================================================
# DISPATCHER
# ============================================================================

_GENERATORS: dict[PrinterProtocol, BaseLabelGenerator] = {
    PrinterProtocol.ZPL: ZplGenerator(),
    PrinterProtocol.CPCL: CpclGenerator(),
    PrinterProtocol.ESC_POS: EscPosGenerator(),
}


class LabelService:
    """
    Dispatcher: seleciona o gerador correto pelo printer.protocol.
    A API pública é idêntica independente do protocolo.
    """

    DEFAULT_DPI = 203
    DEFAULT_WIDTH_MM = 55
    DEFAULT_HEIGHT_MM = 65

    def _gen(self, printer: Optional["LabelPrinter"]) -> BaseLabelGenerator:
        if printer is None:
            return _GENERATORS[PrinterProtocol.ZPL]
        return _GENERATORS.get(printer.protocol, _GENERATORS[PrinterProtocol.ZPL])

    def generate(
        self,
        product: "Product",
        variant: "ProductVariant",
        quantity: int = 1,
        show_price: bool = True,
        show_sku: bool = True,
        printer: Optional["LabelPrinter"] = None,
    ) -> LabelOutput:
        """Verso da etiqueta: QR Code + dados da peça."""
        return self._gen(printer).back_label(product, variant, quantity, show_price, show_sku, printer)

    def generate_front_label(
        self,
        store_name: str,
        product: "Product",
        variant: "ProductVariant",
        quantity: int = 1,
        printer: Optional["LabelPrinter"] = None,
    ) -> LabelOutput:
        """Frente da etiqueta: marca + produto + preço."""
        return self._gen(printer).front_label(store_name, product, variant, quantity, printer)

    def generate_test_label(
        self, printer: Optional["LabelPrinter"] = None
    ) -> LabelOutput:
        """Etiqueta de diagnóstico para testar a conexão."""
        return self._gen(printer).test_label(printer)

    # ------------------------------------------------------------------
    # Aliases para compatibilidade com print_job_service (nomes antigos)
    # ------------------------------------------------------------------
    def generate_back_label_zpl(self, product, variant, quantity=1, show_price=True, show_sku=True, printer=None):
        return self.generate(product, variant, quantity, show_price, show_sku, printer)

    def generate_front_label_zpl(self, store_name, product, variant, quantity=1, printer=None):
        return self.generate_front_label(store_name, product, variant, quantity, printer)

    def generate_test_zpl(self, printer=None):
        return self.generate_test_label(printer)

    # Usado por print_job_service para formatar preço no snapshot
    def _format_price(self, value) -> str:
        if value is None:
            return ""
        try:
            v = Decimal(str(value))
            return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        except Exception:
            return str(value)

    def _mm_to_dots(self, mm: int, dpi: int) -> int:
        return round(mm * dpi / 25.4)


label_service = LabelService()
