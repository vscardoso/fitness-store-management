"""
Etiqueta do verso da tag em PDF (adesivo 50x60 mm por padrão), em 4 faixas:
nome | cor e tamanho | preço | QR e código curto (#0123).

Dois formatos do mesmo desenho:
- a4: folha A4 adesiva comum, 3 x 4 = 12 por folha, com marcas de corte (impressora de casa);
- roll: uma etiqueta por página, no tamanho da etiqueta (impressora térmica pelo driver).

Só entra o que a cliente pode ver: nada de custo, fornecedor, entrada ou data de compra.
Tudo em preto (térmica não imprime cor nem cinza sem pontilhar).
"""
import io
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, List, Optional

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


BOLD, REGULAR = "Helvetica-Bold", "Helvetica"
ZONES = (15, 13, 11, 21)  # proporção das faixas (somam 60)
A4_MARGIN_MM, A4_GAP_MM = 8, 4   # borda da folha e espaço entre etiquetas (cabem as marcas de corte)
MIN_MM, MAX_MM = 30, 100


def a4_grid(width_mm: float, height_mm: float) -> tuple[int, int]:
    """Quantas etiquetas cabem na folha A4 (colunas, linhas): 60x50 -> 3x5 = 15; 50x60 -> 3x4 = 12."""
    cols = int((210 - 2 * A4_MARGIN_MM + A4_GAP_MM) // (width_mm + A4_GAP_MM))
    rows = int((297 - 2 * A4_MARGIN_MM + A4_GAP_MM) // (height_mm + A4_GAP_MM))
    return max(1, cols), max(1, rows)


@dataclass
class LabelData:
    name: str
    color: Optional[str]
    size: Optional[str]
    price: Optional[Decimal]
    code: str      # o que está escrito na etiqueta, ex.: '#101-1'
    qr: str        # o que o QR leva, ex.: 'PV#101-1'


def format_price(value: Optional[Decimal]) -> str:
    if value is None:
        return "Consulte"
    s = f"{Decimal(value):,.2f}"  # 1,234.50
    return "R$ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def _fit(text: str, font: str, size: float, max_w: float, min_size: float) -> float:
    while size > min_size and stringWidth(text, font, size) > max_w:
        size -= 0.25
    return size


def _ellipsize(text: str, font: str, size: float, max_w: float) -> str:
    if stringWidth(text, font, size) <= max_w:
        return text
    while text and stringWidth(text + "…", font, size) > max_w:
        text = text[:-1]
    return text.rstrip() + "…"


def draw_label(c: canvas.Canvas, x: float, y: float, w: float, h: float, d: LabelData) -> None:
    """Desenha uma etiqueta com o canto inferior esquerdo em (x, y)."""
    pad = 3 * mm
    inner_w = w - 2 * pad
    unit = h / sum(ZONES)
    tops = []
    acc = y + h
    for z in ZONES:
        tops.append(acc)
        acc -= z * unit
    z1, z2, z3, z4 = tops
    c.setFillColorRGB(0, 0, 0)
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(0.6)
    for top in (z2, z3, z4):  # traços entre as faixas
        c.line(x + pad, top, x + w - pad, top)

    # 1. nome: até 2 linhas, centralizado
    name = (d.name or "").strip()
    size = 10.2
    lines = simpleSplit(name, BOLD, size, inner_w)
    while len(lines) > 2 and size > 7:
        size -= 0.25
        lines = simpleSplit(name, BOLD, size, inner_w)
    if len(lines) > 2:
        lines = lines[:1] + [_ellipsize(" ".join(lines[1:]), BOLD, size, inner_w)]
    zone_h = ZONES[0] * unit
    lead = size * 1.12
    block = lead * len(lines)
    base = z1 - (zone_h - block) / 2 - size * 0.85
    c.setFont(BOLD, size)
    for i, line in enumerate(lines):
        c.drawCentredString(x + w / 2, base - i * lead, line)

    # 2. cor (esquerda) e tamanho num quadrado (direita)
    zone_h = ZONES[1] * unit
    box = 8.5 * mm
    label_size = 5.4
    box_y = z2 - zone_h + (zone_h - box - label_size - 1) / 2
    box_x = x + w - pad - box
    c.setFont(BOLD, label_size)
    c.drawCentredString(box_x + box / 2, box_y + box + 1.2, "TAM")
    c.setLineWidth(1.1)
    c.roundRect(box_x, box_y, box, box, 1.6 * mm, stroke=1, fill=0)
    size_text = (d.size or "U").strip().upper()
    fs = _fit(size_text, BOLD, 14.7, box - 1.6 * mm, 6)
    c.setFont(BOLD, fs)
    c.drawCentredString(box_x + box / 2, box_y + box / 2 - fs * 0.35, size_text)
    color_w = box_x - (x + pad) - 2 * mm
    color_text = (d.color or "Única").strip()
    cs = _fit(color_text, BOLD, 9, color_w, 6.5)
    color_text = _ellipsize(color_text, BOLD, cs, color_w)
    mid = z2 - zone_h / 2
    c.setFont(BOLD, label_size)
    c.drawString(x + pad, mid + 1.6, "COR")
    c.setFont(BOLD, cs)
    c.drawString(x + pad, mid - cs * 0.95, color_text)

    # 3. preço
    zone_h = ZONES[2] * unit
    price = format_price(d.price)
    ps = _fit(price, BOLD, 18, inner_w, 10)
    c.setFont(BOLD, ps)
    c.drawCentredString(x + w / 2, z3 - zone_h / 2 - ps * 0.35, price)

    # 4. QR (esquerda) e código curto (direita)
    zone_h = ZONES[3] * unit
    qr_size = min(17 * mm, zone_h - 2 * mm)
    widget = QrCodeWidget(d.qr, barLevel="M", barBorder=1)
    bx1, by1, bx2, by2 = widget.getBounds()
    drawing = Drawing(qr_size, qr_size, transform=[qr_size / (bx2 - bx1), 0, 0, qr_size / (by2 - by1), 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, c, x + pad - 0.6 * mm, z4 - zone_h + (zone_h - qr_size) / 2)
    code = d.code
    code_w = inner_w - qr_size - 2 * mm
    cs = _fit(code, BOLD, 19.8, code_w, 10)
    mid = z4 - zone_h / 2
    c.setFont(BOLD, label_size)
    c.drawRightString(x + w - pad, mid + cs * 0.55, "CÓDIGO")
    c.setFont(BOLD, cs)
    c.drawRightString(x + w - pad, mid - cs * 0.6, code)


def _crop_marks(c: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    gap, ln = 1.2 * mm, 3 * mm
    c.setStrokeColorRGB(0.55, 0.55, 0.55)
    c.setLineWidth(0.3)
    for cx, cy, sx, sy in ((x, y, -1, -1), (x + w, y, 1, -1), (x, y + h, -1, 1), (x + w, y + h, 1, 1)):
        c.line(cx + sx * gap, cy, cx + sx * (gap + ln), cy)
        c.line(cx, cy + sy * gap, cx, cy + sy * (gap + ln))
    c.setStrokeColorRGB(0, 0, 0)


def build_pdf(labels: List[LabelData], layout: str = "a4", start_position: int = 1,
              width_mm: float = 60, height_mm: float = 50, title: str = "Etiquetas") -> bytes:
    """Gera o PDF. `start_position` pula posições já usadas da primeira folha A4 (1 até o total da grade)."""
    if layout not in ("a4", "roll"):
        raise ValueError("Formato inválido: use 'a4' ou 'roll'.")
    if not (MIN_MM <= width_mm <= MAX_MM and MIN_MM <= height_mm <= MAX_MM):
        raise ValueError(f"Tamanho inválido: use de {MIN_MM} a {MAX_MM} mm.")
    w, h = width_mm * mm, height_mm * mm
    buf = io.BytesIO()
    if layout == "roll":
        # uma etiqueta por página, página = etiqueta (é o arquivo para a gráfica ou para a térmica)
        c = canvas.Canvas(buf, pagesize=(w, h))
        c.setTitle(title)
        for d in labels:
            draw_label(c, 0, 0, w, h, d)
            c.showPage()
        c.save()
        return buf.getvalue()

    pw, ph = A4
    cols, rows = a4_grid(width_mm, height_mm)
    per_page = cols * rows
    if not 1 <= start_position <= per_page:
        raise ValueError(f"Posição inicial deve ser de 1 a {per_page}.")
    gap = A4_GAP_MM * mm
    x0 = (pw - (cols * w + (cols - 1) * gap)) / 2      # grade centralizada na folha
    y0 = (ph - (rows * h + (rows - 1) * gap)) / 2
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(title)
    slot = start_position - 1
    for d in labels:
        if slot == per_page:
            c.showPage()
            slot = 0
        row, col = divmod(slot, cols)
        x = x0 + col * (w + gap)
        y = ph - y0 - (row + 1) * h - row * gap
        _crop_marks(c, x, y, w, h)
        draw_label(c, x, y, w, h, d)
        slot += 1
    c.showPage()
    c.save()
    return buf.getvalue()


def expand(items: Iterable[tuple[LabelData, int]]) -> List[LabelData]:
    out: List[LabelData] = []
    for d, qty in items:
        out.extend([d] * max(0, int(qty)))
    return out
