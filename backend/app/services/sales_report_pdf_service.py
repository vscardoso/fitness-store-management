"""Relatório de vendas em PDF (reportlab), gerado no servidor: no app web do iPhone não há impressão nem arquivo local."""
import io
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

PERIODS = {
    "this_month": "Este mês",
    "last_30_days": "Últimos 30 dias",
    "last_2_months": "Últimos 2 meses",
    "last_3_months": "Últimos 3 meses",
    "last_6_months": "Últimos 6 meses",
    "this_year": "Este ano",
}
PAYMENTS = {
    "cash": "Dinheiro",
    "credit_card": "Cartão de crédito",
    "debit_card": "Cartão de débito",
    "pix": "PIX",
    "bank_transfer": "Transferência",
    "installments": "Parcelado",
    "loyalty_points": "Pontos",
}


def brl(value: Any) -> str:
    n = float(value or 0)
    return "R$ " + f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _esc(text: Any) -> str:
    return str(text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_sales_report_pdf(report: Any) -> bytes:
    """`report` é o SalesReportResponse (ou dict igual)."""
    get = (lambda k: report[k]) if isinstance(report, dict) else (lambda k: getattr(report, k))
    styles = getSampleStyleSheet()
    h1, h2, body = styles["Title"], styles["Heading2"], styles["BodyText"]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title="Relatório de Vendas")
    period = PERIODS.get(get("period"), str(get("period")))
    story = [
        Paragraph("Relatório de Vendas", h1),
        Paragraph(f"{_esc(period)} · {get('start_date'):%d/%m/%Y} a {get('end_date'):%d/%m/%Y}", body),
        Spacer(1, 8 * mm),
    ]

    kpis = [
        ["Receita", brl(get("total_revenue")), "Vendas", str(get("total_sales"))],
        ["Ticket médio", brl(get("average_ticket")), "Lucro", brl(get("total_profit"))],
        ["Custo das peças vendidas", brl(get("total_cost")), "Margem", f"{float(get('profit_margin') or 0):.1f}%"],
    ]
    t = Table(kpis, colWidths=[44 * mm, 40 * mm, 30 * mm, 40 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"), ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"), ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.grey), ("TEXTCOLOR", (2, 0), (2, -1), colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.lightgrey),
    ]))
    story += [t, Spacer(1, 8 * mm), Paragraph("Formas de pagamento", h2)]

    def grid(rows, widths, right_cols):
        tb = Table(rows, colWidths=widths, repeatRows=1)
        style = [
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke), ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ] + [("ALIGN", (c, 0), (c, -1), "RIGHT") for c in right_cols]
        tb.setStyle(TableStyle(style))
        return tb

    pay = [["Forma", "Vendas", "Total", "%"]]
    for p in get("payment_breakdown") or []:
        m = p["method"] if isinstance(p, dict) else p.method
        total = p["total"] if isinstance(p, dict) else p.total
        count = p["count"] if isinstance(p, dict) else p.count
        pct = p["percentage"] if isinstance(p, dict) else p.percentage
        pay.append([PAYMENTS.get(m, m), str(count), brl(total), f"{float(pct or 0):.1f}%"])
    if len(pay) == 1:
        pay.append(["Nenhuma venda no período", "", "", ""])
    story += [grid(pay, [70 * mm, 25 * mm, 40 * mm, 20 * mm], [1, 2, 3]), Spacer(1, 8 * mm), Paragraph("Produtos mais vendidos", h2)]

    top = [["#", "Produto", "Qtd", "Receita", "Lucro"]]
    for i, p in enumerate(get("top_products") or [], 1):
        g = (lambda k: p[k]) if isinstance(p, dict) else (lambda k: getattr(p, k))
        label = g("variant_label") or " · ".join(x for x in (g("variant_color"), g("variant_size")) if x)
        name = _esc(g("product_name")) + (f"<br/><font size=7 color='grey'>{_esc(label)}</font>" if label else "")
        top.append([str(i), Paragraph(name, body), str(g("quantity_sold")), brl(g("revenue")), brl(g("profit"))])
    if len(top) == 1:
        top.append(["", "Nenhuma venda no período", "", "", ""])
    story += [grid(top, [10 * mm, 75 * mm, 18 * mm, 32 * mm, 30 * mm], [0, 2, 3, 4])]
    story += [Spacer(1, 10 * mm), Paragraph(f"<font size=8 color='grey'>Gerado pelo Provador em {datetime.now():%d/%m/%Y %H:%M}</font>", body)]

    doc.build(story)
    return buf.getvalue()
