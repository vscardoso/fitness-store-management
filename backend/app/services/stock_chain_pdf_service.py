"""
Estoque atual em PDF com a cadeia completa: entrada > fornecedor > produto (cor, tamanho, código).

Cada linha é um lote do FIFO com peças restantes (`entry_items.quantity_remaining > 0`, item e entrada ativos).
Custo = custo posto (peça + frete/viagem - desconto), o mesmo do valor do estoque. Só gerente e admin
(rota em /reports). Entradas na ordem do FIFO (mais antiga primeiro).
"""
import io
from collections import OrderedDict
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_entry import StockEntry
from app.models.supplier import Supplier
from app.services.sales_report_pdf_service import _esc, brl
from app.utils.variant_code import format_variant_code
from app.utils.variant_grid import size_sort_key

ENTRY_TYPES = {
    "trip": "Viagem", "online": "Online", "local": "Local", "initial": "Estoque inicial",
    "adjustment": "Ajuste", "return": "Devolução", "donation": "Doação",
}


async def load_stock_chain(db: AsyncSession, tenant_id: int, supplier_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Entradas com peças restantes, cada uma com os itens (produto, variação, fornecedor do item)."""
    item_sup = aliased(Supplier)
    entry_sup = aliased(Supplier)
    stmt = (
        select(
            StockEntry.id, StockEntry.entry_code, StockEntry.entry_date, StockEntry.entry_type, StockEntry.supplier_name,
            entry_sup.name, item_sup.name,
            Product.name, ProductVariant.color, ProductVariant.size, ProductVariant.sku,
            ProductVariant.product_code, ProductVariant.variant_number, ProductVariant.price,
            EntryItem.quantity_received, EntryItem.quantity_remaining, EntryItem.unit_cost, EntryItem.extra_unit_cost,
        )
        .join(StockEntry, StockEntry.id == EntryItem.entry_id)
        .join(Product, Product.id == EntryItem.product_id)
        .outerjoin(ProductVariant, ProductVariant.id == EntryItem.variant_id)
        .outerjoin(item_sup, item_sup.id == EntryItem.supplier_id)
        .outerjoin(entry_sup, entry_sup.id == StockEntry.supplier_id)
        .where(
            EntryItem.tenant_id == tenant_id,
            EntryItem.is_active == True,  # noqa: E712
            StockEntry.is_active == True,  # noqa: E712
            EntryItem.quantity_remaining > 0,
        )
        .order_by(StockEntry.entry_date, StockEntry.id)
    )
    if supplier_id:
        stmt = stmt.where((EntryItem.supplier_id == supplier_id) | ((EntryItem.supplier_id.is_(None)) & (StockEntry.supplier_id == supplier_id)))
    rows = (await db.execute(stmt)).all()

    entries: "OrderedDict[int, Dict[str, Any]]" = OrderedDict()
    for (eid, code, edate, etype, esupname, esup, isup, pname, color, size, sku, pcode, vnum, price,
         received, remaining, unit_cost, extra) in rows:
        entry_supplier = esup or (esupname or "").strip() or "Sem fornecedor"
        e = entries.setdefault(eid, {
            "code": code, "date": edate, "type": ENTRY_TYPES.get(getattr(etype, "value", etype), str(etype)),
            "supplier": entry_supplier, "items": [],
        })
        cost = Decimal(unit_cost or 0) + Decimal(extra or 0)
        e["items"].append({
            "supplier": isup or entry_supplier,
            "product": pname,
            "variant": " · ".join(x for x in [color, size] if x) or "-",
            "size_key": size_sort_key(size or ""),
            "color": color or "",
            "code": format_variant_code(pcode, vnum) or (sku or "-"),
            "received": int(received or 0),
            "remaining": int(remaining or 0),
            "base_cost": max(Decimal(unit_cost or 0), Decimal(0)),   # pago na peça
            "unit_cost": max(cost, Decimal(0)),                       # custo final: pago + rateio de frete/viagem/desconto
            "price": Decimal(price or 0),
        })
    out = list(entries.values())
    for e in out:
        e["items"].sort(key=lambda i: (i["supplier"].lower(), i["product"].lower(), i["color"].lower(), i["size_key"]))
    return out


def build_stock_chain_pdf(entries: List[Dict[str, Any]], store_name: str = "") -> bytes:
    styles = getSampleStyleSheet()
    h1, body = styles["Title"], styles["BodyText"]
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=10)
    head = ParagraphStyle("head", parent=body, fontSize=11, leading=14, fontName="Helvetica-Bold")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm, title="Estoque atual")

    total_pcs = sum(i["remaining"] for e in entries for i in e["items"])
    total_cost = sum(i["remaining"] * i["unit_cost"] for e in entries for i in e["items"])
    total_sale = sum(i["remaining"] * i["price"] for e in entries for i in e["items"])
    story: list = [
        Paragraph("Estoque atual: entrada, fornecedor e produto", h1),
        Paragraph(f"{_esc(store_name)}{' · ' if store_name else ''}Gerado em {datetime.now(ZoneInfo('America/Sao_Paulo')):%d/%m/%Y %H:%M}", body),
        Spacer(1, 3 * mm),
        Paragraph(
            f"<b>{len(entries)}</b> entradas com peças · <b>{total_pcs}</b> peças · custo em estoque <b>{brl(total_cost)}</b>"
            f" · valor de venda <b>{brl(total_sale)}</b>", body),
        Paragraph("<font size=8 color='#666666'>Custo: o que foi pago na peça. Custo final: com a parte do frete, da viagem"
                  " e do desconto da compra. Venda: preço de venda de hoje.</font>", body),
        Spacer(1, 5 * mm),
    ]
    if not entries:
        story.append(Paragraph("Nenhuma peça em estoque.", body))

    widths = [40 * mm, 58 * mm, 34 * mm, 20 * mm, 15 * mm, 15 * mm, 21 * mm, 22 * mm, 21 * mm, 25 * mm]
    for e in entries:
        pcs = sum(i["remaining"] for i in e["items"])
        val = sum(i["remaining"] * i["unit_cost"] for i in e["items"])
        title = Paragraph(
            f"{_esc(e['code'])} · {e['date']:%d/%m/%Y} · {_esc(e['type'])} · Fornecedor: {_esc(e['supplier'])}"
            f" <font size=9 color='#666666'>({pcs} peças, {brl(val)})</font>", head)
        data = [["Fornecedor", "Produto", "Cor · Tamanho", "Código", "Recebido", "Restante", "Custo", "Custo final", "Venda",
                 "Custo restante"]]
        for i in e["items"]:
            data.append([
                Paragraph(_esc(i["supplier"]), small), Paragraph(_esc(i["product"]), small),
                Paragraph(_esc(i["variant"]), small), i["code"], str(i["received"]), str(i["remaining"]),
                brl(i["base_cost"]), brl(i["unit_cost"]), brl(i["price"]), brl(i["remaining"] * i["unit_cost"]),
            ])
        t = Table(data, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F0FA")),
            ("ALIGN", (4, 0), (-1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.lightgrey),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story += [KeepTogether([title, Spacer(1, 1.5 * mm), t]) if len(data) < 25 else title, ]
        if len(data) >= 25:
            story += [Spacer(1, 1.5 * mm), t]
        story.append(Spacer(1, 5 * mm))

    doc.build(story)
    return buf.getvalue()
