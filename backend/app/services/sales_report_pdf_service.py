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


def _g(obj: Any, key: str) -> Any:
    return obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)


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
    story += [t, Spacer(1, 3 * mm)]

    cmp = _g(report, "comparison")
    if cmp is not None and float(_g(cmp, "previous_total") or 0) > 0:
        pct = float(_g(cmp, "percentage_change") or 0)
        story.append(Paragraph(
            f"Vendeu <b>{abs(pct):.0f}% {'a mais' if pct >= 0 else 'a menos'}</b> que no período anterior "
            f"({brl(_g(cmp, 'previous_total'))}, {_g(cmp, 'previous_sales')} vendas).", body))
        story.append(Spacer(1, 3 * mm))

    pieces = int(_g(report, "pieces_sold") or 0)
    n_sales = int(_g(report, "total_sales") or 0)
    resumo = [
        ["Peças vendidas", f"{pieces} un", "Peças por venda", f"{(pieces / n_sales):.1f}" if n_sales else "0"],
        ["Descontos dados", brl(_g(report, "discount_total")), "Vendas com cliente cadastrado",
         f"{_g(report, 'sales_with_customer') or 0} de {n_sales}"],
        ["Devoluções e trocas", f"{_g(report, 'returns_count') or 0} ({brl(_g(report, 'returns_total'))})",
         "Vendas canceladas (fora dos totais)", f"{_g(report, 'cancelled_count') or 0} ({brl(_g(report, 'cancelled_total'))})"],
    ]
    rt = Table(resumo, colWidths=[38 * mm, 38 * mm, 52 * mm, 36 * mm])
    rt.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"), ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.grey), ("TEXTCOLOR", (2, 0), (2, -1), colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 4), ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.lightgrey),
    ]))
    story += [rt, Spacer(1, 8 * mm), Paragraph("Formas de pagamento", h2)]

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
        code = g("variant_display_code") or (f"#{int(g('variant_short_code')):04d}" if g("variant_short_code") else "")
        label = " ".join(x for x in (label, code) if x)
        name = _esc(g("product_name")) + (f"<br/><font size=7 color='grey'>{_esc(label)}</font>" if label else "")
        top.append([str(i), Paragraph(name, body), str(g("quantity_sold")), brl(g("revenue")), brl(g("profit"))])
    if len(top) == 1:
        top.append(["", "Nenhuma venda no período", "", "", ""])
    story += [grid(top, [10 * mm, 75 * mm, 18 * mm, 32 * mm, 30 * mm], [0, 2, 3, 4])]

    cats = _g(report, "by_category") or []
    if cats:
        rows = [["Categoria", "Peças", "Receita", "Lucro", "% da receita"]]
        for c in cats:
            rows.append([_esc(_g(c, "category")), str(_g(c, "pieces")), brl(_g(c, "revenue")), brl(_g(c, "profit")), f"{float(_g(c, 'percentage') or 0):.0f}%"])
        story += [Spacer(1, 8 * mm), Paragraph("Vendas por categoria", h2), grid(rows, [60 * mm, 20 * mm, 32 * mm, 32 * mm, 25 * mm], [1, 2, 3, 4])]

    sellers = _g(report, "by_seller") or []
    if sellers:
        rows = [["Vendedor", "Vendas", "Receita", "Ticket médio", "% do total"]]
        for v in sellers:
            rows.append([_esc(_g(v, "seller_name")), str(_g(v, "sales")), brl(_g(v, "revenue")), brl(_g(v, "average_ticket")), f"{float(_g(v, 'percentage') or 0):.0f}%"])
        story += [Spacer(1, 8 * mm), Paragraph("Vendas por vendedor", h2), grid(rows, [60 * mm, 20 * mm, 32 * mm, 32 * mm, 25 * mm], [1, 2, 3, 4])]

    wk = _g(report, "by_weekday") or []
    if any(float(_g(w, "revenue") or 0) > 0 for w in wk):
        nomes = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
        rows = [["Dia da semana", "Vendas", "Receita"]]
        for w in wk:
            rows.append([nomes[int(_g(w, "weekday"))], str(_g(w, "sales")), brl(_g(w, "revenue"))])
        story += [Spacer(1, 8 * mm), Paragraph("Vendas por dia da semana", h2), grid(rows, [60 * mm, 25 * mm, 40 * mm], [1, 2])]

    days = _g(report, "daily") or []
    if days:
        rows = [["Dia", "Vendas", "Receita", "Lucro"]]
        for d in days:
            iso = str(_g(d, "date"))
            rows.append([f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}", str(_g(d, "sales")), brl(_g(d, "revenue")), brl(_g(d, "profit"))])
        story += [Spacer(1, 8 * mm), Paragraph("Dia a dia", h2), grid(rows, [40 * mm, 25 * mm, 40 * mm, 40 * mm], [1, 2, 3])]

    story += [Spacer(1, 10 * mm), Paragraph(f"<font size=8 color='grey'>Gerado pelo Provador em {datetime.now():%d/%m/%Y %H:%M}</font>", body)]

    doc.build(story)
    return buf.getvalue()
