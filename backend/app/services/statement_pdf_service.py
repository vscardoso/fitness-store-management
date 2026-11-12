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


def _day_movements(d: Dict[str, Any], all_mode: bool):
    """Movimentos do dia como linhas simples {account, text, amount}. Em "todas as contas" a transferência aparece UMA vez
    (de uma conta para a outra), separada, porque entra numa conta e sai da outra e não muda o total."""
    movs: List[Dict[str, Any]] = []
    transfers: Dict[str, Dict[str, Any]] = {}
    for ln in d.get("lines") or []:
        if all_mode:
            # cada linha é uma conta (kind "account"): os itens são os movimentos dela
            for it in ln.get("items") or []:
                ref = it.get("ref") or ""
                if ref.startswith("transfer:"):
                    t = transfers.setdefault(ref, {"text": it["label"], "amount": abs(float(it["amount"])), "from": "", "to": ""})
                    t["from" if float(it["amount"]) < 0 else "to"] = ln["label"]
                else:
                    movs.append({"account": ln["label"], "text": it["label"], "amount": float(it["amount"])})
        else:
            items = ln.get("items") or []
            if not items:
                text = ln["label"] + (f" ({ln['count']})" if ln.get("count") else "")
                movs.append({"account": "", "text": text, "amount": float(ln["amount"])})
            for it in items:
                text = ln["label"] if str(it["label"]).startswith("Transferência #") else f"{ln['label']} · {it['label']}"
                movs.append({"account": "", "text": text, "amount": float(it["amount"])})
    trs = [{"text": f"{t['text']}: {t['from'] or '?'} para {t['to'] or '?'}", "amount": t["amount"]} for t in transfers.values()]
    return movs, trs


def build_statement_pdf(data: Dict[str, Any], store_name: str = "", generated_at: Optional[datetime] = None) -> bytes:
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=10, textColor=GRAY)
    right = ParagraphStyle("right", parent=body, alignment=2)
    right_small = ParagraphStyle("right_small", parent=small, alignment=2)
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

    all_mode = not data.get("account")
    for d in days:
        movs, transfers = _day_movements(d, all_mode)
        entrou = sum(m["amount"] for m in movs if m["amount"] > 0)
        saiu = -sum(m["amount"] for m in movs if m["amount"] < 0)
        # faixa do dia: começou, entrou, saiu, terminou (o resultado do dia = entrou - saiu)
        band = Table([[Paragraph("Começou o dia com", small), Paragraph("Entrou", small), Paragraph("Saiu", small), Paragraph("Terminou o dia com", small)],
                      [Paragraph(f"<b>{brl(d['opening'])}</b>", body), Paragraph(f'<font color="#15803D"><b>{brl(entrou)}</b></font>', body),
                       Paragraph(f'<font color="#B91C1C"><b>{brl(saiu)}</b></font>', body), Paragraph(f"<b>{brl(d['closing'])}</b>", body)]],
                     colWidths=[44 * mm, 44 * mm, 44 * mm, 44 * mm])
        band.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LIGHT), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                                  ("LINEAFTER", (0, 0), (-2, -1), 0.5, colors.white)]))
        head = ["Conta", "O que foi", "Entrou", "Saiu"] if all_mode else ["", "O que foi", "Entrou", "Saiu"]
        rows: List[List[Any]] = [[Paragraph(f"<b>{h}</b>", right_small if h in ("Entrou", "Saiu") else small) if h else "" for h in head]]
        last_acc = None
        for m in movs:
            acc_cell = Paragraph(f"<b>{_esc(m['account'])}</b>", body) if all_mode and m["account"] != last_acc else ""
            last_acc = m["account"]
            pos, neg = m["amount"] > 0, m["amount"] < 0
            rows.append([acc_cell, Paragraph(_esc(m["text"]), body),
                         Paragraph(f'<font color="#15803D">{brl(m["amount"])}</font>', right) if pos else "",
                         Paragraph(f'<font color="#B91C1C">{brl(-m["amount"])}</font>', right) if neg else ""])
        for t in transfers:
            rows.append(["", Paragraph(f'<font color="#6B7280">{_esc(t["text"])} <i>(entre contas, não muda o total)</i></font>', body),
                         Paragraph(f'<font color="#6B7280">{brl(t["amount"])}</font>', right), ""])
        if all_mode:
            widths, right_from = [34 * mm, 82 * mm, 30 * mm, 30 * mm], 2
        else:   # uma conta só: sem a coluna "Conta"
            rows = [r[1:] for r in rows]
            widths, right_from = [116 * mm, 30 * mm, 30 * mm], 1
        table = Table(rows, colWidths=widths, repeatRows=1)
        table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (right_from, 0), (-1, -1), "RIGHT"), ("TOPPADDING", (0, 0), (-1, -1), 2),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 2), ("LINEBELOW", (0, 0), (-1, 0), 0.5, GRAY),
                                   ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#E5E7EB"))]))
        block = [Paragraph(_day_title(d["date"]), day_style), band, Spacer(1, 2 * mm), table, Spacer(1, 5 * mm)]
        story.append(KeepTogether(block) if len(rows) <= 22 else block[0])
        if len(rows) > 22:
            story += block[1:]

    doc.build(story)
    return buf.getvalue()
