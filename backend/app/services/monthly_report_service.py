"""Relatório mensal da loja: parte FINANCEIRA (dinheiro, contas, a pagar e a receber) e ANALÍTICA (vendas, estoque, comparação
com o mês anterior) e "pontos de atenção" em palavras simples.

Não calcula nada novo: junta as contas que já existem, para os números nunca discordarem das outras telas:
- receita, custo, lucro e despesas: `money_ledger.period_totals` + `ExpenseService._build_period_result` (Resultado do Mês)
- vendas por dia, forma de pagamento, categoria, vendedor e mais vendidos: `ReportService.get_sales_report` (mês exato)
- dinheiro das contas (entrou, saiu, deveria ter): `MonthClosingService.compute` (só depois da implantação do Financeiro)
- fiado e contas a pagar: `ReceivableService.summary` e `FinanceService.list_payables`
- estoque e giro: `MonthClosingService._stock_value` e o cartão "Saúde do Estoque" do início
"""
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import br_day_end_utc, br_day_start_utc, today_brazil
from app.models.customer import Customer
from app.models.receivable import Receivable
from app.models.store import Store
from app.models.user import User

MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
          "novembro", "dezembro"]


class MonthlyReportError(ValueError):
    """Mês inválido (futuro ou fora do intervalo)."""


def month_label(year: int, month: int) -> str:
    return f"{MONTHS[month - 1].capitalize()} de {year}"


def previous_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def change_percent(now: float, before: float) -> Optional[float]:
    """Variação em % contra o mês anterior; None quando não há base (mês anterior zerado)."""
    if not before:
        return None
    return round((float(now) - float(before)) / abs(float(before)) * 100, 1)


def brl(v: Any) -> str:
    """R$ 1.234,56 (só o número é trocado; o resto da frase não é mexido)."""
    return "R$ " + f"{float(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _num(v: Any) -> float:
    return float(v or 0)


def _result_dict(res: Any) -> Dict[str, Any]:
    return {
        "revenue": _num(res.revenue), "cost": _num(res.cmv), "gross_profit": _num(res.gross_profit),
        "gross_margin_pct": _num(res.gross_margin_pct), "expenses": _num(res.total_expenses),
        "stock_losses": _num(res.stock_losses_total), "net_profit": _num(res.net_profit),
        "net_margin_pct": _num(res.net_margin_pct), "sales_count": int(res.sales_count or 0),
        "units_sold": int(res.units_sold or 0),
        "average_ticket": round(_num(res.revenue) / res.sales_count, 2) if res.sales_count else 0.0,
        "expenses_by_category": [
            {"label": c.get("category") or "Sem categoria", "amount": _num(c.get("total"))}
            for c in (res.expenses_by_category or [])
        ],
    }


def attention_points(data: Dict[str, Any]) -> List[Dict[str, str]]:
    """Pontos de atenção em frase pronta. `level`: bad (agir), warn (olhar), good (tudo certo)."""
    out: List[Dict[str, str]] = []
    cur, prev, ch = data["result"]["current"], data["result"]["previous"], data["result"]["change"]

    if cur["sales_count"] == 0:
        out.append({"level": "warn", "text": "Nenhuma venda registrada neste mês."})
    else:
        if cur["net_profit"] < 0:
            out.append({"level": "bad", "text": f"A loja fechou o mês no prejuízo: perdeu {brl(abs(cur['net_profit']))}."})
        elif cur["net_profit"] > 0:
            out.append({"level": "good", "text": "A loja teve lucro depois de pagar o custo das peças e as despesas."})
        if ch["revenue"] is not None and ch["revenue"] <= -20 and prev["sales_count"]:
            out.append({"level": "warn", "text": f"O faturamento caiu {abs(ch['revenue']):.0f}% em relação ao mês anterior."})
        if prev["sales_count"] and cur["gross_margin_pct"] and prev["gross_margin_pct"] and \
                cur["gross_margin_pct"] < prev["gross_margin_pct"] - 5:
            out.append({"level": "warn", "text": "A margem de lucro das vendas caiu mais de 5 pontos em relação ao mês anterior."})
        if cur["revenue"] > 0 and cur["expenses"] / cur["revenue"] > 0.4:
            out.append({"level": "warn", "text": "As despesas passaram de 40% do faturamento do mês."})

    fin = data["finance"]
    rec = data["to_receive"]
    if rec["fiado_overdue"] > 0:
        out.append({"level": "bad", "text": f"Há {brl(rec['fiado_overdue'])} de fiado vencido para cobrar."})
    pay = data["to_pay"]
    if pay["overdue_count"] > 0:
        out.append({"level": "bad", "text": f"Há {pay['overdue_count']} conta(s) a pagar vencida(s), somando {brl(pay['overdue_total'])}."})
    if fin.get("started"):
        diff = fin.get("closed", {}).get("difference") if fin.get("closed") else None
        if diff is not None and abs(diff) >= 50:
            out.append({"level": "warn", "text": f"No fechamento do mês o dinheiro contado diferiu {brl(abs(diff))} do esperado."})
        if not fin["check_ok"]:
            out.append({"level": "bad", "text": "A conta do dinheiro das contas não bate: revise os lançamentos do mês."})
        if fin["expenses_without_account"]["count"]:
            out.append({"level": "warn", "text": f"{fin['expenses_without_account']['count']} despesa(s) sem conta de pagamento "
                        "não entraram no dinheiro das contas."})
    else:
        out.append({"level": "warn", "text": "O Financeiro (contas e saldos) ainda não foi implantado: o dinheiro das contas não aparece aqui."})

    st = data["stock"]
    if st.get("stagnant_units", 0) > 0 and st["pieces"] > 0 and st["stagnant_units"] / st["pieces"] > 0.5:
        out.append({"level": "warn", "text": f"Mais da metade do estoque ({st['stagnant_units']} peças) está parada há mais de 30 dias."})
    if st.get("other_out", 0) > 0:
        out.append({"level": "warn", "text": f"{st['other_out']} peça(s) saíram do estoque sem venda (baixa, perda ou ajuste)."})
    if not out:
        out.append({"level": "good", "text": "Nada fora do normal neste mês."})
    return out


class MonthlyReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def build(self, tenant_id: int, year: int, month: int, user: Optional[User] = None) -> Dict[str, Any]:
        from app.services.expense_service import ExpenseService
        from app.services.finance_service import FinanceError, FinanceService
        from app.services.month_closing_service import MonthClosingService
        from app.services.receivable_service import ReceivableService
        from app.services.report_service import ReportService

        if not (2000 <= year <= 2100 and 1 <= month <= 12):
            raise MonthlyReportError("Mês inválido.")
        today = today_brazil()
        first = date(year, month, 1)
        last = date(year, month, monthrange(year, month)[1])
        if first > today:
            raise MonthlyReportError("Este mês ainda não começou.")
        end = min(last, today)                      # mês em andamento: até hoje
        py, pm = previous_month(year, month)
        pfirst, plast = date(py, pm, 1), date(py, pm, monthrange(py, pm)[1])

        exp = ExpenseService(self.db)
        cur = _result_dict(await exp._build_period_result(first, end, tenant_id, month_label(year, month)))
        prv = _result_dict(await exp._build_period_result(pfirst, plast, tenant_id, month_label(py, pm)))
        change = {k: change_percent(cur[k], prv[k]) for k in
                  ("revenue", "gross_profit", "net_profit", "expenses", "sales_count", "units_sold", "average_ticket")}

        sales = (await ReportService().get_sales_report(
            self.db, tenant_id, custom_range=(first, end))).model_dump(mode="json")
        sales_part = {k: sales[k] for k in (
            "pieces_sold", "discount_total", "sales_with_customer", "sales_without_customer", "returns_count",
            "returns_total", "cancelled_count", "cancelled_total", "payment_breakdown", "top_products", "daily",
            "by_weekday", "by_category", "by_seller")}

        # fiado do mês: vendas a prazo lançadas e dinheiro de fiado recebido
        rec_svc = ReceivableService(self.db)
        s_utc, e_utc = br_day_start_utc(first), br_day_end_utc(end)
        launched = (await self.db.execute(select(func.count(Receivable.id), func.coalesce(func.sum(Receivable.amount), 0)).where(
            Receivable.tenant_id == tenant_id, Receivable.is_active == True,  # noqa: E712
            Receivable.created_at >= s_utc, Receivable.created_at < e_utc))).one()
        received = await rec_svc.received_by_method(tenant_id, first, end + timedelta(days=1))
        rec_sum = await rec_svc.summary(tenant_id)
        to_receive = {
            "fiado_open": rec_sum["open_total"], "fiado_overdue": rec_sum["overdue_total"],
            "due_this_week": rec_sum["due_this_week"], "customers": rec_sum["customers"],
            "installments": rec_sum["installments"],
            "launched_in_month": float(launched[1] or 0), "launched_count": int(launched[0] or 0),
            "received_in_month": float(sum(received.values(), Decimal(0))),
        }
        fin_svc = FinanceService(self.db)
        pays = await fin_svc.list_payables(tenant_id)
        to_pay = {"open_total": pays["open_total"], "overdue_total": pays["overdue_total"], "overdue_count": pays["overdue_count"]}

        # financeiro: dinheiro nas contas (só depois da implantação)
        store = await self.db.get(Store, tenant_id)
        started = bool(store and store.finance_start_date)
        finance: Dict[str, Any] = {"started": started}
        if started:
            try:
                comp = await MonthClosingService(self.db).get(tenant_id, year, month)
                finance.update({
                    "start_total": comp["start_total"], "entered": comp["entered"], "left": comp["left"],
                    "expected_total": comp["expected_total"], "check_ok": comp["check_ok"], "accounts": comp["accounts"],
                    "expenses_without_account": comp["left"]["expenses_without_account"],
                    "to_receive_loans": comp["to_receive"]["loans"], "to_pay_loans": comp["to_pay"]["loans"],
                    "closed": comp.get("closed"), "partial_start": comp.get("partial_start", False),
                })
            except FinanceError as e:
                finance.update({"started": True, "unavailable": str(e), "check_ok": True,
                                "expenses_without_account": {"count": 0, "amount": 0.0}})

        projection = None
        if started:
            projection = await fin_svc.projection(tenant_id)

        # estoque de hoje e giro (mesma conta do cartão Saúde do Estoque do início)
        from app.api.v1.endpoints.dashboard import get_fifo_performance
        stock = await MonthClosingService(self.db)._stock_value(tenant_id)
        health = await get_fifo_performance(tenant_id=tenant_id, db=self.db, current_user=user)
        st = health.get("sell_through", {}) if isinstance(health, dict) else {}
        stock.update({
            "sold_net": st.get("total_sold", 0), "received": st.get("total_received", 0), "turnover_pct": st.get("rate", 0),
            "other_out": st.get("other_out", 0),
            "avg_margin": (health.get("roi", {}) or {}).get("avg_margin", 0),
            "stagnant_units": (health.get("stagnant", {}) or {}).get("units", 0),
        })

        new_customers = int((await self.db.execute(select(func.count(Customer.id)).where(
            Customer.tenant_id == tenant_id, Customer.created_at >= s_utc, Customer.created_at < e_utc))).scalar() or 0)

        data: Dict[str, Any] = {
            "year": year, "month": month, "label": month_label(year, month),
            "period_start": first.isoformat(), "period_end": end.isoformat(),
            "month_finished": last < today,
            "previous_label": month_label(py, pm),
            "result": {"current": cur, "previous": prv, "change": change},
            "sales": sales_part,
            "new_customers": new_customers,
            "finance": finance, "to_receive": to_receive, "to_pay": to_pay, "projection": projection,
            "stock": stock,
        }
        data["attention"] = attention_points(data)
        return data
