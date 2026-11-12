"""
Etiqueta do verso da tag em PDF (adesivo 47x42 mm por padrão, qualquer medida de 30 a 100 mm), em 4 faixas:
nome | cor e tamanho | preço | QR e código curto (#0123).

Dois formatos do mesmo desenho:
- a4: folha A4 adesiva lisa (sem pré-corte): etiquetas encostadas, cada uma com a linha de corte no tamanho exato
  (uma linha serve às duas vizinhas); quantas cabem depende da medida (`a4_grid`);
- roll: uma etiqueta por página, no tamanho exato da etiqueta (arquivo para a gráfica ou térmica pelo driver).
Letras, quadrado do tamanho e QR crescem ou diminuem com a etiqueta (`scale_for`), tendo 50 mm como base.

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
# proporção das faixas (somam 60): nome, cor/tamanho, preço, QR+código. A do QR cresceu de 21 para 25 (05/11/2026):
# no adesivo de 4,7 x 4,2 o QR tinha só 11,5 mm e o iPhone sofria para ler; agora 13,8 mm
ZONES = (13, 12, 10, 25)
A4_MARGIN_MM, A4_GAP_MM = 5, 2   # borda da folha (área que a impressora alcança) e espaço MÍNIMO entre etiquetas no corte
# A sobra da folha vira espaço entre as etiquetas (até 8 mm), sem perder nenhuma por folha: o corte que sai torto cai
# na faixa em branco e não pega a etiqueta do lado (pedido do Victor, 05/11/2026)
A4_SPACING_MAX_MM = 8
MIN_MM, MAX_MM = 30, 100
# folha de etiqueta térmica grande (ex.: 10 x 15 cm) com várias etiquetas pequenas para cortar: a térmica imprime a folha inteira
SHEET_W_MM, SHEET_H_MM = 100, 150
SHEET_MARGIN_MM, SHEET_GAP_MM = 1.5, 2
# tag da W.A tem 5 x 4,5 cm; o adesivo é 3 mm menor em cada medida para sobrar borda e o erro de corte/colagem não aparecer (Victor, 05/11/2026)
DEFAULT_W_MM, DEFAULT_H_MM = 50, 40   # igual ao DEFAULT_STICKER do app (mobile/utils/stickerSize.ts): 5 de largura x 4 de altura


def scale_for(width_mm: float, height_mm: float) -> float:
    """Fator das letras e do QR: 1 numa etiqueta com o lado menor de 50 mm (o desenho foi medido nela)."""
    return max(0.6, min(1.6, min(width_mm, height_mm) / 50))


def a4_grid(width_mm: float, height_mm: float) -> tuple[int, int]:
    """Quantas etiquetas cabem na folha A4 (colunas, linhas), com pelo menos A4_GAP_MM entre elas:
    47x42 -> 4x6 = 24; 50x45 -> 3x6 = 18; 60x50 -> 3x5 = 15; 50x60 -> 3x4 = 12; 65x55 -> 3x5 = 15."""
    cols = int((210 - 2 * A4_MARGIN_MM + A4_GAP_MM) // (width_mm + A4_GAP_MM))
    rows = int((297 - 2 * A4_MARGIN_MM + A4_GAP_MM) // (height_mm + A4_GAP_MM))
    return max(1, cols), max(1, rows)


def sheet_grid(width_mm: float, height_mm: float, sheet_w: float = SHEET_W_MM, sheet_h: float = SHEET_H_MM) -> tuple[int, int]:
    """Quantas etiquetas cabem na folha térmica (colunas, linhas): 47x42 em 100x150 -> 2x3 = 6."""
    cols = int((sheet_w - 2 * SHEET_MARGIN_MM + SHEET_GAP_MM) // (width_mm + SHEET_GAP_MM))
    rows = int((sheet_h - 2 * SHEET_MARGIN_MM + SHEET_GAP_MM) // (height_mm + SHEET_GAP_MM))
    return max(0, cols), max(0, rows)


def a4_spacing(width_mm: float, height_mm: float) -> tuple[float, float]:
    """Espaço entre colunas e entre linhas (mm): a sobra da folha dividida pelos vãos, no máximo A4_SPACING_MAX_MM.
    50x45 -> (8, 3.4); 60x50 -> (8, 8); nunca menos que A4_GAP_MM nem tira etiqueta da folha."""
    cols, rows = a4_grid(width_mm, height_mm)
    free_w = 210 - 2 * A4_MARGIN_MM - cols * width_mm
    free_h = 297 - 2 * A4_MARGIN_MM - rows * height_mm
    gx = min(A4_SPACING_MAX_MM, free_w / (cols - 1)) if cols > 1 else 0
    gy = min(A4_SPACING_MAX_MM, free_h / (rows - 1)) if rows > 1 else 0
    return round(max(0.0, gx), 2), round(max(0.0, gy), 2)


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
    k = scale_for(w / mm, h / mm)
    # margem: foto da etiqueta impressa (11/11/2026) mostrou texto e QR colados na borda do adesivo (a impressora e o corte
    # comem ~1 mm); lateral maior e uma folga em cima e embaixo, que antes não existia
    pad = max(2.5, 3.6 * k) * mm
    vpad = max(1.6, 2.0 * k) * mm
    inner_w = w - 2 * pad
    unit = (h - 2 * vpad) / sum(ZONES)
    tops = []
    acc = y + h - vpad
    for z in ZONES:
        tops.append(acc)
        acc -= z * unit
    z1, z2, z3, z4 = tops
    c.setFillColorRGB(0, 0, 0)
    c.setStrokeColorRGB(0, 0, 0)
    # 1 pt (~0,35 mm): com 0,6 pt a impressora comum desenhava a linha falhada e com espessura variando (foto de 05/11)
    c.setLineWidth(1.0)
    for top in (z2, z3, z4):  # traços entre as faixas
        c.line(x + pad, top, x + w - pad, top)

    # 1. nome: até 2 linhas, centralizado
    name = (d.name or "").strip()
    size = 10.2 * k
    lines = simpleSplit(name, BOLD, size, inner_w)
    while len(lines) > 2 and size > 7 * k:
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
    box = min(8.5 * k * mm, ZONES[1] * unit - 3 * mm)   # cabe na faixa com o "TAM" em cima
    label_size = 5.4 * k
    box_y = z2 - zone_h + (zone_h - box - label_size - 1) / 2
    size_text = (d.size or "U").strip().upper()
    # Tamanho de 1 ou 2 letras (P, M, GG) cabe no quadrado. Tamanho longo (ÚNICO, P/M, G/GG) ganha um retângulo mais largo, do
    # tamanho do texto: antes o texto passava das bordas do quadrado (foto de 10/11/2026).
    fs0 = (14.7 if len(size_text) <= 2 else 10.5) * k
    box_w = min(max(box, stringWidth(size_text, BOLD, fs0) + 3.4 * mm), inner_w * 0.46)
    box_x = x + w - pad - box_w
    c.setFont(BOLD, label_size)
    c.drawCentredString(box_x + box_w / 2, box_y + box + 1.2, "TAM")
    c.setLineWidth(1.1)
    c.roundRect(box_x, box_y, box_w, box, 1.6 * mm, stroke=1, fill=0)
    fs = _fit(size_text, BOLD, fs0, box_w - 1.8 * mm, 6)
    c.setFont(BOLD, fs)
    c.drawCentredString(box_x + box_w / 2, box_y + box / 2 - fs * 0.35, size_text)
    color_w = box_x - (x + pad) - 2 * mm
    color_text = (d.color or "Única").strip()
    cs = _fit(color_text, BOLD, 9 * k, color_w, 6.5 * k)
    color_text = _ellipsize(color_text, BOLD, cs, color_w)
    mid = z2 - zone_h / 2
    c.setFont(BOLD, label_size)
    c.drawString(x + pad, mid + 1.6, "COR")
    c.setFont(BOLD, cs)
    c.drawString(x + pad, mid - cs * 0.95, color_text)

    # 3. preço
    zone_h = ZONES[2] * unit
    price = format_price(d.price)
    ps = _fit(price, BOLD, min(18 * k, zone_h * 0.8), inner_w, 10 * k)   # zone_h em pontos, como a fonte
    c.setFont(BOLD, ps)
    c.drawCentredString(x + w / 2, z3 - zone_h / 2 - ps * 0.35, price)

    # 4. QR (esquerda) e código curto (direita)
    zone_h = ZONES[3] * unit
    # QR o maior possível na faixa e com 2 quadradinhos de margem branca: com 1, o leitor da câmera perdia o QR
    # (colado na linha de corte e no texto). Medido com OpenCV em 5 x 4,5 cm: ver tests/test_fase3_dinheiro_relatorios.py
    qr_size = min(21 * k * mm, zone_h - 1 * mm)
    widget = QrCodeWidget(d.qr, barLevel="M", barBorder=2)
    bx1, by1, bx2, by2 = widget.getBounds()
    drawing = Drawing(qr_size, qr_size, transform=[qr_size / (bx2 - bx1), 0, 0, qr_size / (by2 - by1), 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, c, x + pad - 0.6 * mm, z4 - zone_h + (zone_h - qr_size) / 2)
    code = d.code
    code_w = inner_w - qr_size - 2 * mm
    cs = _fit(code, BOLD, 19.8 * k, code_w, 10 * k)
    mid = z4 - zone_h / 2
    c.setFont(BOLD, label_size)
    c.drawRightString(x + w - pad, mid + cs * 0.55, "CÓDIGO")
    c.setFont(BOLD, cs)
    c.drawRightString(x + w - pad, mid - cs * 0.6, code)


def _cut_lines(c: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    """Linha de corte no tamanho exato da etiqueta (cinza fino); entre vizinhas fica a faixa em branco do a4_spacing."""
    # tracejada e cinza médio: guia a tesoura sem parecer parte da etiqueta (0,25 pt cinza claro quase sumia)
    c.setStrokeColorRGB(0.45, 0.45, 0.45)
    c.setLineWidth(0.6)
    c.setDash(3, 2)
    c.rect(x, y, w, h, stroke=1, fill=0)
    c.setDash()
    c.setStrokeColorRGB(0, 0, 0)


def _sheet_cut_lines(c: canvas.Canvas, pw: float, ph: float, x0: float, y0: float, w: float, h: float,
                     gx: float, gy: float, cols: int, rows: int, used: int) -> None:
    """Linhas de corte de ponta a ponta da folha (guilhotina ou tesoura em linha reta): uma no meio de cada espaço entre
    as etiquetas e uma em cada borda de fora. Só onde há etiqueta ao lado."""
    c.setStrokeColorRGB(0.35, 0.35, 0.35)
    c.setLineWidth(0.5)
    c.setDash(3, 2)
    # linhas em TODAS as bordas da grade (inclusive as de fora), cada uma a meio espaço da etiqueta: todo recorte sai do
    # mesmo tamanho (etiqueta + meio espaço de cada lado), inclusive as das pontas
    for k in range(0, cols + 1):                              # k = 0 é a borda esquerda, k = cols a direita
        if used > max(k - 1, 0):                              # só se há etiqueta ao lado dessa linha
            x = x0 + k * (w + gx) - gx / 2
            c.line(x, 0, x, ph)
    for k in range(0, rows + 1):                              # k = 0 é a borda de cima, k = rows a de baixo
        if used > max(k - 1, 0) * cols:
            y = ph - y0 - k * (h + gy) + gy / 2
            c.line(0, y, pw, y)
    c.setDash()
    c.setStrokeColorRGB(0, 0, 0)


def build_pdf(labels: List[LabelData], layout: str = "a4", start_position: int = 1,
              width_mm: float = DEFAULT_W_MM, height_mm: float = DEFAULT_H_MM, title: str = "Etiquetas") -> bytes:
    """Gera o PDF. `start_position` pula posições já usadas da primeira folha A4 (1 até o total da grade)."""
    if layout not in ("a4", "roll", "sheet"):
        raise ValueError("Formato inválido: use 'a4', 'roll' ou 'sheet'.")
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

    if layout == "sheet":
        cols, rows = sheet_grid(width_mm, height_mm)
        if cols < 1 or rows < 1:
            raise ValueError("Esta etiqueta não cabe na folha de 10 x 15 cm. Use uma menor (até 9,5 cm de largura e 14,5 de altura).")
        per_page = cols * rows
        if not 1 <= start_position <= per_page:
            raise ValueError(f"Posição inicial deve ser de 1 a {per_page}.")
        pw, ph = SHEET_W_MM * mm, SHEET_H_MM * mm
        gx, gy = SHEET_GAP_MM * mm, SHEET_GAP_MM * mm
        x0 = (pw - (cols * w + (cols - 1) * gx)) / 2
        y0 = (ph - (rows * h + (rows - 1) * gy)) / 2
        c = canvas.Canvas(buf, pagesize=(pw, ph))
        c.setTitle(title)
        slot = start_position - 1
        for i, d in enumerate(labels):
            if slot == per_page:
                c.showPage()
                slot = 0
            row, col = divmod(slot, cols)
            x = x0 + col * (w + gx)
            y = ph - y0 - (row + 1) * h - row * gy
            draw_label(c, x, y, w, h, d)
            slot += 1
            used = slot
            if slot == per_page or i == len(labels) - 1:
                _sheet_cut_lines(c, pw, ph, x0, y0, w, h, gx, gy, cols, rows, used)
        c.showPage()
        c.save()
        return buf.getvalue()

    pw, ph = A4
    cols, rows = a4_grid(width_mm, height_mm)
    per_page = cols * rows
    if not 1 <= start_position <= per_page:
        raise ValueError(f"Posição inicial deve ser de 1 a {per_page}.")
    gap_x, gap_y = (s * mm for s in a4_spacing(width_mm, height_mm))
    x0 = (pw - (cols * w + (cols - 1) * gap_x)) / 2      # grade centralizada na folha
    y0 = (ph - (rows * h + (rows - 1) * gap_y)) / 2
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(title)
    slot = start_position - 1
    for d in labels:
        if slot == per_page:
            c.showPage()
            slot = 0
        row, col = divmod(slot, cols)
        x = x0 + col * (w + gap_x)
        y = ph - y0 - (row + 1) * h - row * gap_y
        draw_label(c, x, y, w, h, d)
        _cut_lines(c, x, y, w, h)
        slot += 1
    c.showPage()
    c.save()
    return buf.getvalue()


def expand(items: Iterable[tuple[LabelData, int]]) -> List[LabelData]:
    out: List[LabelData] = []
    for d, qty in items:
        out.extend([d] * max(0, int(qty)))
    return out
