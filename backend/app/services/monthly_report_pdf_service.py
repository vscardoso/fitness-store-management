"""Relatório mensal da loja em PDF (reportlab), a partir do dicionário de `MonthlyReportService.build`.
Todo número vem com uma palavra que diz o que é."""
import io
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.sales_report_pdf_service import PAYMENTS, _esc, brl

LEVEL_COLOR = {"bad": colors.HexColor("#B91C1C"), "warn": colors.HexColor("#B45309"), "good": colors.HexColor("#15803D")}
LEVEL_TAG = {"bad": "AGIR", "warn": "OLHAR", "good": "OK"}
ACCOUNT_KIND = {"drawer": "Gaveta", "bank": "Banco", "card_machine": "Maquininha"}


def pct(v: Any) -> str:
    return "sem base" if v is None else f"{v:+.1f}%".replace(".", ",")


def _grid(rows: List[List[Any]], widths: List[float], right_cols: List[int]) -> Table:
    tb = Table(rows, colWidths=widths, repeatRows=1)
    tb.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke), ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ] + [("ALIGN", (c, 0), (c, -1), "RIGHT") for c in right_cols]))
    return tb


def build_monthly_report_pdf(d: Dict[str, Any], store_name: str = "") -> bytes:
    styles = getSampleStyleSheet()
    h1, h2, body, small = styles["Title"], styles["Heading2"], styles["BodyText"], styles["BodyText"].clone("small", fontSize=8, textColor=colors.grey)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title=f"Relatório mensal - {d['label']}")
    cur, prv, ch = d["result"]["current"], d["result"]["previous"], d["result"]["change"]
    story: List[Any] = [Paragraph("Relatório mensal da loja", h1)]
    sub = f"{_esc(store_name)} · " if store_name else ""
    status = "mês fechado" if d["month_finished"] else "mês em andamento, até " + d["period_end"][8:10] + "/" + d["period_end"][5:7]
    story += [Paragraph(f"{sub}{_esc(d['label'])} ({status})", body), Spacer(1, 5 * mm)]

    # 1. saúde da loja
    story.append(Paragraph("Saúde da loja: o que olhar", h2))
    for a in d["attention"]:
        story.append(Paragraph(f"<font color='{LEVEL_COLOR[a['level']].hexval().replace('0x', '#')}'><b>{LEVEL_TAG[a['level']]}</b></font> &nbsp;{_esc(a['text'])}", body))
    story.append(Spacer(1, 4 * mm))

    # 2. resultado
    rows = [["", d["label"].split(" de ")[0], d["previous_label"].split(" de ")[0], "Variação"]]
    for label, key in (("Faturamento (vendas menos devoluções)", "revenue"), ("Custo das peças vendidas", "cost"),
                       ("Lucro das vendas", "gross_profit"), ("Despesas do mês", "expenses"), ("Lucro do mês (depois das despesas)", "net_profit")):
        rows.append([label, brl(cur[key]), brl(prv[key]), pct(ch.get(key))])
    rows.append(["Margem de lucro das vendas", f"{cur['gross_margin_pct']:.1f}%".replace(".", ","), f"{prv['gross_margin_pct']:.1f}%".replace(".", ","), ""])
    rows.append(["Vendas realizadas", str(cur["sales_count"]), str(prv["sales_count"]), pct(ch.get("sales_count"))])
    rows.append(["Peças vendidas", str(cur["units_sold"]), str(prv["units_sold"]), pct(ch.get("units_sold"))])
    rows.append(["Ticket médio (valor por venda)", brl(cur["average_ticket"]), brl(prv["average_ticket"]), pct(ch.get("average_ticket"))])
    story += [Paragraph("Resultado do mês", h2), _grid(rows, [72 * mm, 34 * mm, 34 * mm, 34 * mm], [1, 2, 3])]
    story.append(Paragraph("Variação = quanto mudou em relação ao mês anterior." + (
        "" if d["month_finished"] else " Mês em andamento: a comparação é com o mês anterior inteiro."), small))
    if cur["expenses_by_category"]:
        er = [["Despesas por categoria", "Valor"]] + [[_esc(c["label"]), brl(c["amount"])] for c in cur["expenses_by_category"]]
        story += [Spacer(1, 3 * mm), _grid(er, [120 * mm, 40 * mm], [1])]

    # 3. vendas
    s = d["sales"]
    story += [Spacer(1, 5 * mm), Paragraph("Vendas do mês", h2)]
    info = (f"{s['pieces_sold']} peças vendidas · descontos dados {brl(s['discount_total'])} · "
            f"{s['sales_with_customer']} vendas com cliente cadastrada e {s['sales_without_customer']} sem · "
            f"{d['new_customers']} cliente(s) nova(s) cadastrada(s) · "
            f"devoluções e trocas: {s['returns_count']} ({brl(s['returns_total'])}) · canceladas: {s['cancelled_count']} ({brl(s['cancelled_total'])})")
    story.append(Paragraph(_esc(info), body))
    pay = [["Forma de pagamento", "Vendas", "Total", "% do total"]] + [
        [PAYMENTS.get(p["method"], p["method"]), str(p["count"]), brl(p["total"]), f"{float(p['percentage'] or 0):.1f}%".replace(".", ",")]
        for p in s["payment_breakdown"]] or []
    if len(pay) > 1:
        story += [Spacer(1, 3 * mm), _grid(pay, [70 * mm, 25 * mm, 40 * mm, 25 * mm], [1, 2, 3])]
    if s["by_category"]:
        rows = [["Categoria", "Peças", "Faturamento", "Lucro", "% do faturamento"]] + [
            [_esc(c["category"]), str(c["pieces"]), brl(c["revenue"]), brl(c["profit"]), f"{float(c['percentage'] or 0):.0f}%"] for c in s["by_category"]]
        story += [Spacer(1, 3 * mm), _grid(rows, [56 * mm, 18 * mm, 34 * mm, 32 * mm, 30 * mm], [1, 2, 3, 4])]
    if s["by_seller"]:
        rows = [["Vendedor", "Vendas", "Faturamento", "Ticket médio", "% do faturamento"]] + [
            [_esc(v["seller_name"]), str(v["sales"]), brl(v["revenue"]), brl(v["average_ticket"]), f"{float(v['percentage'] or 0):.0f}%"] for v in s["by_seller"]]
        story += [Spacer(1, 3 * mm), _grid(rows, [56 * mm, 18 * mm, 34 * mm, 32 * mm, 30 * mm], [1, 2, 3, 4])]
    if s["top_products"]:
        rows = [["Mais vendidos", "Peças", "Faturamento", "Lucro"]]
        for p in s["top_products"][:10]:
            label = p.get("variant_label") or " · ".join(x for x in (p.get("variant_color"), p.get("variant_size")) if x)
            code = p.get("variant_display_code") or ""
            extra = " ".join(x for x in (label, code) if x)
            name = _esc(p["product_name"]) + (f"<br/><font size=7 color='grey'>{_esc(extra)}</font>" if extra else "")
            rows.append([Paragraph(name, body), str(p["quantity_sold"]), brl(p["revenue"]), brl(p["profit"])])
        story += [Spacer(1, 3 * mm), _grid(rows, [86 * mm, 20 * mm, 34 * mm, 30 * mm], [1, 2, 3])]

    # 4. dinheiro
    fin = d["finance"]
    story += [Spacer(1, 5 * mm), Paragraph("Financeiro: o dinheiro do mês", h2)]
    if not fin.get("started"):
        story.append(Paragraph("O Financeiro (contas e saldos) ainda não foi implantado nesta loja.", body))
    elif fin.get("unavailable"):
        story.append(Paragraph(_esc(fin["unavailable"]), body))
    else:
        en, le = fin["entered"], fin["left"]
        rows = [["Dinheiro nas contas", "Valor"], ["Tinha no começo do mês", brl(fin["start_total"])]]
        for x in en["sales"]:
            rows.append([f"Entrou: vendas em {_esc(x['label']).lower()}", brl(x["amount"])])
        rows.append(["Entrou: fiado recebido", brl(en["receivables_received"])])
        for x in en["other"]:
            rows.append([f"Entrou: {_esc(x['label']).lower()}", brl(x["amount"])])
        if en["cash_register_in"]:
            rows.append(["Entrou: reforço do caixa", brl(en["cash_register_in"])])
        rows.append(["Total que entrou", brl(en["total"])])
        for x in le["expenses"]:
            rows.append([f"Saiu: despesa de {_esc(x['label']).lower()}", brl(x["amount"])])
        rows.append(["Saiu: compras de mercadoria e dívidas pagas", brl(le["purchases_and_debts"])])
        rows.append(["Saiu: devoluções ao cliente", brl(le["refunds"])])
        for x in le["other"]:
            rows.append([f"Saiu: {_esc(x['label']).lower()}", brl(x["amount"])])
        if le["cash_register_out"]:
            rows.append(["Saiu: sangria do caixa", brl(le["cash_register_out"])])
        rows.append(["Total que saiu", brl(le["total"])])
        rows.append(["Deveria ter no fim do mês", brl(fin["expected_total"])])
        story.append(_grid(rows, [120 * mm, 40 * mm], [1]))
        acc = [["Conta", "Tipo", "Começo do mês", "Deveria ter"]] + [
            [_esc(a["name"]), ACCOUNT_KIND.get(a["kind"], a["kind"]), brl(a["start"]), brl(a["expected"])] for a in fin["accounts"]]
        story += [Spacer(1, 3 * mm), _grid(acc, [60 * mm, 30 * mm, 35 * mm, 35 * mm], [2, 3])]
        cl = fin.get("closed")
        if cl:
            story.append(Paragraph(f"Fechado em {cl['closed_at'][:10]}: contado {brl(cl['counted_total'])}, diferença do caixa {brl(cl['difference'])}.", body))
        else:
            story.append(Paragraph("Este mês ainda não foi fechado.", small))

    # 5. a receber e a pagar (hoje)
    r, p = d["to_receive"], d["to_pay"]
    rows = [["Hoje", "Valor"],
            ["Fiado a receber (total em aberto)", brl(r["fiado_open"])],
            ["Fiado vencido", brl(r["fiado_overdue"])],
            ["Fiado que vence nos próximos 7 dias", brl(r["due_this_week"])],
            [f"Fiado lançado neste mês ({r['launched_count']} parcela(s))", brl(r["launched_in_month"])],
            ["Fiado recebido neste mês", brl(r["received_in_month"])],
            ["Despesas e contas a pagar em aberto", brl(p["open_total"])],
            [f"Contas a pagar vencidas ({p['overdue_count']})", brl(p["overdue_total"])]]
    story += [Spacer(1, 5 * mm), KeepTogether([Paragraph("A receber e a pagar", h2), _grid(rows, [120 * mm, 40 * mm], [1])])]

    # 6. estoque
    st = d["stock"]
    rows = [["Estoque hoje", "Valor"], ["Peças em estoque", str(st["pieces"])],
            ["Valor do estoque a preço de venda", brl(st["sale_value"])], ["Valor do estoque a preço de custo", brl(st["cost_value"])],
            ["Giro: peças vendidas sobre as recebidas", f"{st['turnover_pct']:.0f}%"],
            ["Peças paradas há mais de 30 dias", str(st["stagnant_units"])],
            ["Peças que saíram sem venda (baixa, perda, ajuste)", str(st["other_out"])]]
    story += [Spacer(1, 5 * mm), KeepTogether([Paragraph("Estoque", h2), _grid(rows, [120 * mm, 40 * mm], [1])]),
              Spacer(1, 6 * mm), Paragraph("Receita, custo e lucro seguem a mesma conta das telas do app: devolução abate no dia em que aconteceu e venda cancelada fica de fora.", small)]
    doc.build(story)
    return buf.getvalue()
