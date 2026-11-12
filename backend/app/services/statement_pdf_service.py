"""Extrato financeiro completo em PDF (reportlab), gerado no servidor: dia a dia, desde o começo da contagem até hoje.

Recebe as páginas que `FinanceService.statement` devolve (7 a 14 dias cada, do mais novo para o mais antigo) e imprime em ordem
cronológica (o mais antigo primeiro), que é a ordem de quem confere "passo a passo": saldo no começo do dia, cada movimento,
saldo no fim do dia. No fim, a conferência com o saldo de agora.
"""
import io
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

GREEN = colors.HexColor("#15803D")
RED = colors.HexColor("#B91C1C")
GRAY = colors.HexColor("#6B7280")
LIGHT = colors.HexColor("#F3F4F6")
WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def brl(value: Any, sign: bool = False) -> str:
    n = float(value or 0)
    text = "R$ " + f"{abs(n):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if n < 0:
        return "-" + text
    return ("+" + text) if sign and n > 0 else text


def _esc(text: Any) -> str:
    return str(text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _day_title(iso: str) -> str:
    d = date.fromisoformat(iso[:10])
    return f"{WEEKDAYS[d.weekday()]}, {d:%d/%m/%Y}"


def merge_pages(pages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Junta as páginas do extrato num só: dias em ordem cronológica, sem repetir dia, com a conferência da página mais nova."""
    days: Dict[str, Dict[str, Any]] = {}
    for p in pages:
        for d in p.get("days") or []:
            days[d["date"]] = d
    first = pages[0] if pages else {}
    return {
        "started": first.get("started", False), "start_date": first.get("start_date"), "account": first.get("account"),
        "days": [days[k] for k in sorted(days)], "reconciliation": first.get("reconciliation"),
    }


def build_statement_pdf(data: Dict[str, Any], store_name: str = "", generated_at: Optional[datetime] = None) -> bytes:
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=10, textColor=GRAY)
    day_style = ParagraphStyle("day", parent=styles["Heading3"], fontSize=11, leading=14, spaceAfter=2, textTransform="capitalize")
    account = (data.get("account") or {}).get("name") or "Todas as contas"
    days = data.get("days") or []
    when = generated_at or datetime.now()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title="Extrato financeiro")
    story: List[Any] = [
        Paragraph("Extrato financeiro", styles["Title"]),
        Paragraph(f"{_esc(store_name)} · {_esc(account)}" if store_name else _esc(account), body),
        Paragraph(f"Contando desde {date.fromisoformat(data['start_date']):%d/%m/%Y} até hoje · gerado em {when:%d/%m/%Y às %H:%M}"
                  if data.get("start_date") else "Financeiro ainda não implantado", small),
        Spacer(1, 4 * mm),
    ]
    if not days:
        story.append(Paragraph("Nenhum movimento encontrado neste período.", body))
    rec = data.get("reconciliation") or {}
    if days:
        first_open = days[0]["opening"]
        last_close = days[-1]["closing"]
        total_net = sum(d["net"] for d in days)
        summary = [
            ["Saldo no começo do primeiro dia com movimento", brl(first_open)],
            ["Resultado de todos os dias (entrou menos saiu)", brl(total_net, sign=True)],
            ["Saldo no fim do último dia com movimento", brl(last_close)],
        ]
        if rec.get("difference") is not None:
            ok = abs(float(rec["difference"])) < 0.005
            summary += [
                ["Saldo da conta agora", brl(rec.get("balance_now"))],
                ["Conferência", "Bate com o saldo da conta" if ok else f"NÃO BATE: diferença de {brl(rec['difference'], sign=True)}"],
            ]
        t = Table(summary, colWidths=[110 * mm, 66 * mm])
        t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 4)]))
        story += [Paragraph("Resumo", styles["Heading2"]), t, Spacer(1, 5 * mm), Paragraph("Dia a dia", styles["Heading2"])]

    for d in days:
        rows: List[List[Any]] = [[Paragraph(f"<b>Começou o dia com</b>", body), "", Paragraph(f"<b>{brl(d['opening'])}</b>", body)]]
        styles_cmds: List[Any] = [("BACKGROUND", (0, 0), (-1, 0), LIGHT)]
        for ln in d.get("lines") or []:
            amount = float(ln["amount"])
            label = _esc(ln["label"]) + (f" ({ln['count']})" if ln.get("count") and not ln.get("items") else "")
            rows.append([Paragraph(label, body), "", Paragraph(f'<font color="{"#15803D" if amount >= 0 else "#B91C1C"}">{brl(amount, sign=True)}</font>', body)])
            for it in ln.get("items") or []:
                ia = float(it["amount"])
                rows.append(["", Paragraph(_esc(it["label"]), small), Paragraph(f'<font color="{"#15803D" if ia >= 0 else "#B91C1C"}">{brl(ia, sign=True)}</font>', small)])
        rows.append([Paragraph(f"<b>Terminou o dia com</b> (resultado do dia {brl(d['net'], sign=True)})", body), "", Paragraph(f"<b>{brl(d['closing'])}</b>", body)])
        styles_cmds += [("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), LIGHT), ("ALIGN", (2, 0), (2, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2), ("LEFTPADDING", (1, 0), (1, -1), 10)]
        table = Table(rows, colWidths=[78 * mm, 66 * mm, 32 * mm], repeatRows=0)
        table.setStyle(TableStyle(styles_cmds))
        story.append(KeepTogether([Paragraph(_day_title(d["date"]), day_style), table, Spacer(1, 3 * mm)]) if len(rows) <= 22
                     else Paragraph(_day_title(d["date"]), day_style))
        if len(rows) > 22:
            story += [table, Spacer(1, 3 * mm)]

    doc.build(story)
    return buf.getvalue()
