"""
Comprovante da venda para a cliente: PDF (térmica 58 mm, 80 mm ou A6) e texto para o WhatsApp.

Só entra o que a cliente pode ver: nada de custo, lucro, margem, fornecedor ou código interno de estoque.
NÃO é documento fiscal (a loja não emite NFC-e por este app) e o texto diz isso.
O mesmo dicionário (`build_receipt_data`) alimenta o PDF e o texto, para os dois nunca discordarem.
"""
import io
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import to_brazil_tz
from app.models.customer import Customer
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.receivable import Receivable
from app.models.sale import Sale
from app.models.sale_return import SaleReturn
from app.models.store import Store
from app.models.whatsapp_cloud import WhatsAppCloudNumber

BOLD, REGULAR = "Helvetica-Bold", "Helvetica"
PAYMENT_LABELS = {
    "cash": "Dinheiro", "credit_card": "Cartão de crédito", "debit_card": "Cartão de débito", "pix": "PIX",
    "bank_transfer": "Transferência", "installments": "Parcelado", "on_account": "Fiado",
    "loyalty_points": "Pontos de fidelidade",
}
# largura do papel (mm) por formato; a altura é calculada pelo conteúdo
WIDTHS_MM = {"58": 58.0, "80": 80.0, "a6": 105.0}


def _enum(v: Any) -> str:
    return str(getattr(v, "value", v) or "").lower()


def brl(value: Any) -> str:
    n = float(value or 0)
    return "R$ " + f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _dec(v: Any) -> Decimal:
    return Decimal(str(v or 0))


def _fmt_phone(digits: str) -> str:
    d = "".join(c for c in (digits or "") if c.isdigit())
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return digits or ""


def wa_phone(digits: Optional[str]) -> Optional[str]:
    """Telefone da cliente só com números e com o 55 na frente (formato do wa.me). Inválido = None."""
    d = "".join(c for c in (digits or "") if c.isdigit())
    if d.startswith("55") and len(d) in (12, 13):
        return d
    if len(d) in (10, 11):
        return "55" + d
    return None


def _variant_text(v: Any) -> str:
    return " · ".join(x for x in (getattr(v, "color", None), getattr(v, "size", None)) if x)


async def _returns_data(db: AsyncSession, sale: Any, tenant_id: int) -> Dict[str, Any]:
    """Devoluções, trocas e pontos da venda, do jeito que a cliente entende (sem motivo interno, sem custo)."""
    rets = (await db.execute(
        select(SaleReturn).where(SaleReturn.sale_id == sale.id, SaleReturn.tenant_id == tenant_id,
                                 SaleReturn.is_active == True, SaleReturn.status == "completed")  # noqa: E712
        .options(selectinload(SaleReturn.items)).order_by(SaleReturn.id)
    )).scalars().all()
    earned = float(sale.loyalty_points_earned or 0)
    if not rets:
        return {"returns": [], "refunded": 0.0, "net_total": float(sale.total_amount), "points_earned": int(earned),
                "points_kept": int(earned)}
    product_ids = {i.product_id for r in rets for i in r.items if i.product_id}
    variant_ids = {i.variant_id for r in rets for i in r.items if i.variant_id}
    names = dict((await db.execute(select(Product.id, Product.name).where(Product.id.in_(product_ids or {0})))).all())
    variants = {v.id: v for v in (await db.execute(select(ProductVariant).where(ProductVariant.id.in_(variant_ids or {0})))).scalars().all()}
    exchange_ids = [r.exchange_sale_id for r in rets if r.exchange_sale_id]
    exchanges = {}
    if exchange_ids:
        for ex in (await db.execute(
            select(Sale).where(Sale.id.in_(exchange_ids)).options(selectinload(Sale.items))
        )).scalars().all():
            exchanges[ex.id] = ex
    ex_item_products = {i.product_id for ex in exchanges.values() for i in ex.items if i.product_id}
    ex_item_variants = {i.variant_id for ex in exchanges.values() for i in ex.items if i.variant_id}
    if ex_item_products:
        names.update(dict((await db.execute(select(Product.id, Product.name).where(Product.id.in_(ex_item_products)))).all()))
    if ex_item_variants:
        variants.update({v.id: v for v in (await db.execute(select(ProductVariant).where(ProductVariant.id.in_(ex_item_variants)))).scalars().all()})

    total = float(sale.total_amount or 0)
    out = []
    refunded = 0.0
    exchange_points = 0.0
    for r in rets:
        refund = float(r.total_refund or 0)
        refunded += refund
        ex = exchanges.get(r.exchange_sale_id) if r.exchange_sale_id else None
        if ex is not None:
            exchange_points += float(ex.loyalty_points_earned or 0)
        out.append({
            "number": r.return_number,
            "date": to_brazil_tz(r.created_at).strftime("%d/%m/%Y %H:%M") if r.created_at else "",
            "items": [{"name": names.get(i.product_id, "Produto"), "variant": _variant_text(variants.get(i.variant_id)),
                       "quantity": int(i.quantity_returned), "refund": float(i.refund_amount or 0)} for i in r.items],
            "refund": round(refund, 2),
            "exchange": None if ex is None else {
                "sale_number": ex.sale_number,
                "items": [{"name": names.get(i.product_id, "Produto"), "variant": _variant_text(variants.get(i.variant_id)),
                           "quantity": int(i.quantity), "total": float(i.subtotal or 0)} for i in ex.items if getattr(i, "is_active", True)],
                "net_amount": float(r.net_amount) if r.net_amount is not None else None,
                "settlement": PAYMENT_LABELS.get(str(r.settlement_method or ""), str(r.settlement_method or "")),
            },
            "method": {"original": "mesma forma do pagamento", "cash": "dinheiro", "store_credit": "crédito na loja"}.get(
                str(r.refund_method or "original"), "mesma forma do pagamento"),
        })
    revoked = earned * (refunded / total) if total > 0 else 0.0
    kept = max(0.0, earned - revoked) + exchange_points
    return {"returns": out, "refunded": round(refunded, 2), "net_total": round(total - refunded, 2),
            "points_earned": int(earned), "points_kept": int(kept)}


async def build_receipt_data(db: AsyncSession, sale: Any, tenant_id: int, change: Optional[float] = None) -> Dict[str, Any]:
    """Monta o comprovante a partir da venda JÁ carregada com itens, produtos, variações, pagamentos, cliente e vendedora."""
    store = (await db.execute(select(Store).where(Store.id == tenant_id))).scalar_one_or_none()
    number = (await db.execute(
        select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.tenant_id == tenant_id,
                                          WhatsAppCloudNumber.is_active == True)  # noqa: E712
        .order_by(WhatsAppCloudNumber.id)
    )).scalars().first()

    address = ""
    if store is not None:
        line1 = ", ".join(x for x in (store.street, store.number) if x)
        line2 = " - ".join(x for x in (store.neighborhood, "/".join(x for x in (store.city, store.state) if x)) if x)
        address = " · ".join(x for x in (line1, line2) if x)

    items: List[Dict[str, Any]] = []
    for it in sale.items:
        if getattr(it, "is_active", True) is False:
            continue
        name = (it.product.name if getattr(it, "product", None) is not None else None) or "Produto"
        items.append({
            "name": name,
            "variant": it.variant_label,
            "quantity": int(it.quantity),
            "unit_price": float(it.unit_price),
            "discount": float(it.discount_amount or 0),
            "subtotal": float(it.subtotal),
        })

    payments = []
    for p in sale.payments:
        if _enum(p.status) != "confirmed":
            continue
        payments.append({
            "method": _enum(p.payment_method),
            "label": PAYMENT_LABELS.get(_enum(p.payment_method), _enum(p.payment_method)),
            "amount": float(p.amount),
            "installments": int(p.installments or 1),
        })

    fiado = []
    if any(p["method"] == "on_account" for p in payments):
        rows = (await db.execute(
            select(Receivable).where(Receivable.sale_id == sale.id, Receivable.tenant_id == tenant_id,
                                     Receivable.is_active == True)  # noqa: E712
            .order_by(Receivable.installment_number)
        )).scalars().all()
        fiado = [{"number": r.installment_number, "total": r.installments_total, "amount": float(r.amount),
                  "due": r.due_date.strftime("%d/%m/%Y")} for r in rows]

    ret = await _returns_data(db, sale, tenant_id)
    loyalty = None
    if getattr(sale, "customer", None) is not None:
        from app.services.loyalty_service import LoyaltyService
        info = await LoyaltyService(db).peek(sale.customer.id, tenant_id)
        loyalty = info if info["enabled"] else None
    customer: Optional[Customer] = getattr(sale, "customer", None)
    created = sale.created_at
    if isinstance(created, datetime):
        created = to_brazil_tz(created)  # sem fuso = UTC
    status = _enum(sale.status)
    return {
        "store_name": (store.name if store else "") or "",
        "store_tagline": (store.tagline if store else "") or "",
        "store_address": address,
        "store_phone": _fmt_phone(number.display_phone_number) if number and number.display_phone_number else "",
        "sale_number": sale.sale_number,
        "date": created.strftime("%d/%m/%Y %H:%M") if isinstance(created, datetime) else "",
        "seller": sale.seller_name,
        "customer": customer.full_name if customer else None,
        "customer_phone": customer.phone if customer else None,
        "items": items,
        "pieces": sum(i["quantity"] for i in items),
        "subtotal": float(sale.subtotal),
        "discount": float(sale.discount_amount or 0),
        "total": float(sale.total_amount),
        "payments": payments,
        "fiado": fiado,
        "change": float(change) if change and change > 0 else 0.0,
        "loyalty": loyalty,
        "points_earned": ret["points_earned"],
        "points_kept": ret["points_kept"],
        "returns": ret["returns"],
        "refunded": ret["refunded"],
        "net_total": ret["net_total"],
        "cancelled": status == "cancelled",
        "return_window_days": int(store.return_window_days) if store is not None and store.return_window_days else 0,
        "exchange_only": bool(store is not None and not store.allow_money_refund),
    }


def _exchange_line(d: Dict[str, Any]) -> Optional[str]:
    days = d["return_window_days"]
    if not days:
        return None
    how = "troca" if d["exchange_only"] else "troca ou devolução"
    return f"{how.capitalize()} em até {days} dias com este comprovante e a etiqueta da peça."


def build_receipt_text(d: Dict[str, Any]) -> str:
    """Texto para mandar pelo WhatsApp (negrito com asteriscos)."""
    out: List[str] = []
    out.append(f"*{d['store_name'] or 'Comprovante'}*")
    out.append(f"Comprovante da venda {d['sale_number']}")
    if d["date"]:
        out.append(d["date"])
    if d["cancelled"]:
        out.append("*VENDA CANCELADA*")
    if d["customer"]:
        out.append(f"Cliente: {d['customer']}")
    out.append("")
    for it in d["items"]:
        label = it["name"] + (f" ({it['variant']})" if it["variant"] else "")
        out.append(f"{it['quantity']}x {label} - {brl(it['subtotal'])}")
    out.append("")
    if d["discount"] > 0:
        out.append(f"Subtotal: {brl(d['subtotal'])}")
        out.append(f"Desconto: -{brl(d['discount'])}")
    out.append(f"*Total: {brl(d['total'])}*")
    for p in d["payments"]:
        extra = f" em {p['installments']}x" if p["installments"] > 1 and p["method"] == "credit_card" else ""
        out.append(f"{p['label']}{extra}: {brl(p['amount'])}")
    if d["change"] > 0:
        out.append(f"Troco: {brl(d['change'])}")
    if d["fiado"]:
        out.append("")
        out.append("Fiado, vencimentos:")
        for f in d["fiado"]:
            out.append(f"{f['number']}/{f['total']}: {brl(f['amount'])} em {f['due']}")
    for r in d["returns"]:
        out.append("")
        out.append(f"*Devolução em {r['date']}*")
        for it in r["items"]:
            label = it["name"] + (f" ({it['variant']})" if it["variant"] else "")
            out.append(f"- {it['quantity']}x {label}: {brl(it['refund'])}")
        if r["exchange"]:
            out.append("Levou no lugar:")
            for it in r["exchange"]["items"]:
                label = it["name"] + (f" ({it['variant']})" if it["variant"] else "")
                out.append(f"- {it['quantity']}x {label}: {brl(it['total'])}")
            net = r["exchange"]["net_amount"]
            if net:
                out.append(f"Diferença {'paga' if net > 0 else 'devolvida'}: {brl(abs(net))}")
        else:
            out.append(f"Estornado: {brl(r['refund'])} ({r['method']})")
    if d["returns"]:
        out.append(f"*Ficou da venda: {brl(d['net_total'])}*")
    if d["points_earned"] > 0 or d["points_kept"] > 0:
        out.append("")
        if d["returns"] and d["points_kept"] != d["points_earned"]:
            out.append(f"Pontos de fidelidade desta compra: ganhou {d['points_earned']}, ficou com {d['points_kept']} depois da devolução.")
        else:
            out.append(f"Você ganhou {d['points_earned']} pontos de fidelidade.")
    lo = d.get("loyalty")
    if lo:
        linha = f"Seu saldo de pontos: {lo['balance']:.0f} (vale {brl(lo['value'])} de desconto)."
        if lo["expiring_soon"] > 0 and lo["next_expiry"]:
            linha += f" {lo['expiring_soon']:.0f} vencem em {lo['next_expiry']}."
        out.append("")
        out.append(linha)
    ex = _exchange_line(d)
    if ex:
        out.append("")
        out.append(ex)
    out.append("")
    out.append("Obrigada pela preferência!")
    out.append("_Comprovante sem valor fiscal._")
    return "\n".join(out)


def whatsapp_link(d: Dict[str, Any]) -> Optional[str]:
    phone = wa_phone(d.get("customer_phone"))
    if not phone:
        return None
    return f"https://wa.me/{phone}?text={quote(build_receipt_text(d))}"


# ---------------------------------------------------------------- PDF

class _Page:
    """Desenha de cima para baixo em duas passadas: mede a altura, depois desenha no papel do tamanho certo."""

    def __init__(self, width_mm: float):
        self.w = width_mm * mm
        self.margin = (3 if width_mm <= 80 else 7) * mm
        self.inner = self.w - 2 * self.margin
        self.scale = 0.9 if width_mm <= 58 else (1.0 if width_mm <= 80 else 1.25)
        self.ops: List[tuple] = []
        self.y = 0.0
        self.title = "Comprovante da venda"

    def fs(self, size: float) -> float:
        return size * self.scale

    def gap(self, pts: float) -> None:
        self.y += pts

    def text(self, s: str, size: float = 8, bold: bool = False, align: str = "left", wrap: bool = True) -> None:
        font = BOLD if bold else REGULAR
        size = self.fs(size)
        lines = simpleSplit(s, font, size, self.inner) if wrap else [s]
        for ln in lines:
            self.y += size * 1.2
            self.ops.append(("text", ln, font, size, align, self.y))

    def pair(self, left: str, right: str, size: float = 8, bold: bool = False) -> None:
        """Esquerda e direita na mesma linha; se não couber, a esquerda quebra e o valor fica na última linha."""
        font = BOLD if bold else REGULAR
        size = self.fs(size)
        rw = stringWidth(right, font, size)
        lines = simpleSplit(left, font, size, max(self.inner - rw - 4 * mm, self.inner * 0.4))
        for i, ln in enumerate(lines):
            self.y += size * 1.2
            self.ops.append(("text", ln, font, size, "left", self.y))
            if i == len(lines) - 1:
                self.ops.append(("text", right, font, size, "right", self.y))

    def rule(self, dashed: bool = True) -> None:
        self.y += 3
        self.ops.append(("rule", dashed, self.y))
        self.y += 3

    def render(self) -> bytes:
        height = self.y + 2 * self.margin
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(self.w, height))
        c.setTitle(self.title)
        for op in self.ops:
            top = height - self.margin - op[-1]
            if op[0] == "text":
                _, s, font, size, align, _y = op
                c.setFont(font, size)
                if align == "center":
                    c.drawCentredString(self.w / 2, top, s)
                elif align == "right":
                    c.drawRightString(self.w - self.margin, top, s)
                else:
                    c.drawString(self.margin, top, s)
            else:
                c.setLineWidth(0.5)
                c.setDash(*( (2, 2) if op[1] else (1, 0) ))
                c.line(self.margin, top, self.w - self.margin, top)
                c.setDash(1, 0)
        c.showPage()
        c.save()
        return buf.getvalue()


def build_receipt_pdf(d: Dict[str, Any], size: str = "80") -> bytes:
    p = _Page(WIDTHS_MM.get(size, WIDTHS_MM["80"]))
    p.text(d["store_name"] or "Comprovante", 12, bold=True, align="center")
    if d["store_tagline"]:
        p.text(d["store_tagline"], 7.5, align="center")
    if d["store_address"]:
        p.text(d["store_address"], 7, align="center")
    if d["store_phone"]:
        p.text(d["store_phone"], 7, align="center")
    p.rule()
    p.text("COMPROVANTE DE VENDA", 8, bold=True, align="center")
    p.text("Sem valor fiscal", 7, align="center")
    if d["cancelled"]:
        p.gap(2)
        p.text("*** VENDA CANCELADA ***", 10, bold=True, align="center")
    p.gap(3)
    p.pair("Venda", d["sale_number"], 8, bold=True)
    if d["date"]:
        p.pair("Data", d["date"], 8)
    if d["seller"]:
        p.pair("Vendedora", d["seller"], 8)
    if d["customer"]:
        p.pair("Cliente", d["customer"], 8)
    p.rule()
    for it in d["items"]:
        label = it["name"] + (f" · {it['variant']}" if it["variant"] else "")
        p.text(label, 8.5, bold=True)
        detail = f"{it['quantity']} x {brl(it['unit_price'])}"
        if it["discount"] > 0:
            detail += f"  (desc. {brl(it['discount'])})"
        p.pair(detail, brl(it["subtotal"]), 8)
        p.gap(2)
    p.rule()
    p.pair(f"Peças: {d['pieces']}", "", 8)
    if d["discount"] > 0:
        p.pair("Subtotal", brl(d["subtotal"]), 8)
        p.pair("Desconto", "-" + brl(d["discount"]), 8)
    p.pair("TOTAL", brl(d["total"]), 11, bold=True)
    p.gap(3)
    for pay in d["payments"]:
        extra = f" em {pay['installments']}x" if pay["installments"] > 1 and pay["method"] == "credit_card" else ""
        p.pair(pay["label"] + extra, brl(pay["amount"]), 8)
    if d["change"] > 0:
        p.pair("Troco", brl(d["change"]), 8)
    if d["fiado"]:
        p.gap(3)
        p.text("Vencimentos do fiado", 8, bold=True)
        for f in d["fiado"]:
            p.pair(f"{f['number']}/{f['total']} em {f['due']}", brl(f["amount"]), 8)
    for r in d["returns"]:
        p.rule()
        p.text("DEVOLUÇÃO" if not r["exchange"] else "TROCA", 8.5, bold=True, align="center")
        p.text(r["date"], 7, align="center")
        p.gap(2)
        for it in r["items"]:
            label = it["name"] + (f" · {it['variant']}" if it["variant"] else "")
            p.pair(f"{it['quantity']} x {label}", "-" + brl(it["refund"]), 8)
        if r["exchange"]:
            p.gap(2)
            p.text("Levou no lugar:", 8, bold=True)
            for it in r["exchange"]["items"]:
                label = it["name"] + (f" · {it['variant']}" if it["variant"] else "")
                p.pair(f"{it['quantity']} x {label}", brl(it["total"]), 8)
            net = r["exchange"]["net_amount"]
            if net:
                p.pair("Diferença " + ("paga" if net > 0 else "devolvida"), brl(abs(net)), 8)
        else:
            p.pair("Estornado (" + r["method"] + ")", brl(r["refund"]), 8, bold=True)
    if d["returns"]:
        p.gap(3)
        p.pair("FICOU DA VENDA", brl(d["net_total"]), 10, bold=True)
    if d["points_earned"] > 0 or d["points_kept"] > 0:
        p.gap(3)
        if d["returns"] and d["points_kept"] != d["points_earned"]:
            p.text(f"Pontos desta compra: ganhou {d['points_earned']}, ficou com {d['points_kept']} depois da devolução.", 7.5, align="center")
        else:
            p.text(f"Você ganhou {d['points_earned']} pontos de fidelidade.", 7.5, align="center")
    lo = d.get("loyalty")
    if lo:
        p.gap(3)
        p.text(f"Saldo de pontos: {lo['balance']:.0f} (vale {brl(lo['value'])})", 7.5, bold=True, align="center")
        if lo["expiring_soon"] > 0 and lo["next_expiry"]:
            p.text(f"{lo['expiring_soon']:.0f} pontos vencem em {lo['next_expiry']}", 7, align="center")
    p.rule()
    ex = _exchange_line(d)
    if ex:
        p.text(ex, 7, align="center")
        p.gap(2)
    p.text("Obrigada pela preferência!", 9, bold=True, align="center")
    return p.render()


# ---------------------------------------------------------------- envio pelo WhatsApp OFICIAL da loja (o número fixo)

async def store_whatsapp_info(db: AsyncSession, tenant_id: int) -> Dict[str, Any]:
    """A loja tem número oficial ligado? (o botão do app só aparece com ele)"""
    number = (await db.execute(
        select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.tenant_id == tenant_id,
                                          WhatsAppCloudNumber.is_active == True)  # noqa: E712
        .order_by(WhatsAppCloudNumber.id)
    )).scalars().first()
    return {
        "connected": number is not None,
        "number": _fmt_phone(number.display_phone_number) if number and number.display_phone_number else None,
    }


def _first_name(full: Optional[str]) -> str:
    return (full or "").strip().split(" ")[0] or "cliente"


async def send_via_store_whatsapp(db: AsyncSession, sale: Any, data: Dict[str, Any], tenant_id: int) -> Dict[str, Any]:
    """Manda o comprovante pelo número oficial da loja (nunca pelo WhatsApp pessoal de quem está vendendo).

    Dentro de 24 h da última mensagem da cliente: o PDF (A6) com o resumo. Fora da janela a Meta só aceita modelo
    aprovado: usa `WHATSAPP_RECEIPT_TEMPLATE` (cliente, loja, venda, total); sem modelo configurado, explica o que falta.
    """
    from app.core.config import settings
    from app.services import whatsapp_cloud_service as wa

    customer = getattr(sale, "customer", None)
    if customer is None or not wa.customer_phone_key(customer.phone):
        raise wa.SendError("Esta venda não tem cliente com telefone válido. Cadastre o telefone ou use outro envio.", 409)
    conv = await wa.start_conversation(db, tenant_id, customer.id)
    info = await store_whatsapp_info(db, tenant_id)
    if wa.window_open(conv):
        pdf = build_receipt_pdf(data, "a6")
        if data["returns"]:
            caption = (f"Atualizamos o comprovante da venda {sale.sale_number}: devolução registrada ({brl(data['refunded'])}). "
                       f"Ficou da venda: {brl(data['net_total'])}.")
            if data["points_kept"] != data["points_earned"]:
                caption += f" Pontos desta compra: {data['points_kept']}."
        else:
            caption = f"Comprovante da venda {sale.sale_number} - {brl(data['total'])}. Obrigada pela preferência!"
        await wa.send_media(db, tenant_id, conv.id, data=pdf, filename=f"comprovante-{sale.sale_number}.pdf", caption=caption)
        mode = "pdf"
    elif data["returns"] and settings.WHATSAPP_RETURN_TEMPLATE:
        # fora da janela de 24 h só vale modelo aprovado: o da devolução (cliente, loja, venda, valor estornado)
        await wa.send_template(
            db, tenant_id, conv.id, name=settings.WHATSAPP_RETURN_TEMPLATE, language=settings.WHATSAPP_RECEIPT_TEMPLATE_LANG,
            body_params=[_first_name(customer.full_name), data["store_name"] or "nossa loja", sale.sale_number, brl(data["refunded"])],
        )
        mode = "template"
    elif settings.WHATSAPP_RECEIPT_TEMPLATE and not data["returns"]:
        await wa.send_template(
            db, tenant_id, conv.id, name=settings.WHATSAPP_RECEIPT_TEMPLATE, language=settings.WHATSAPP_RECEIPT_TEMPLATE_LANG,
            body_params=[_first_name(customer.full_name), data["store_name"] or "nossa loja", sale.sale_number, brl(data["total"])],
        )
        mode = "template"
    else:
        raise wa.SendError(
            "Esta cliente não escreveu para a loja nas últimas 24 horas, e o WhatsApp só permite mandar para ela um "
            "modelo aprovado. O modelo do comprovante ainda não foi configurado.", 409,
        )
    await db.commit()
    return {"mode": mode, "store_number": info["number"], "customer": customer.full_name}
