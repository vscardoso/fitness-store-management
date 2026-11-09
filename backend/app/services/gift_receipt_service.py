"""
Comprovante do brinde para a pessoa que recebeu: serve para ela validar o que ganhou (texto para o WhatsApp, PDF e envio pelo
número oficial da loja). Reaproveita o desenho do comprovante de venda (`sale_receipt_service`).

Nunca sai custo, fornecedor, SKU nem código interno: só o que a pessoa recebeu e o "valor de vitrine" (informativo, é cortesia
da loja). Diz "sem valor fiscal". Brinde cancelado sai marcado.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import to_brazil_tz
from app.models.customer import Customer
from app.models.store import Store
from app.models.whatsapp_cloud import WhatsAppCloudNumber
from app.services.sale_receipt_service import WIDTHS_MM, _fmt_phone, _Page, brl, store_whatsapp_info, wa_phone

# como o motivo aparece para a pessoa (o motivo interno nunca é mostrado com as palavras do dono)
REASON_FOR_CUSTOMER = {
    "with_sale": "Brinde da sua compra",
    "courtesy": "Cortesia da loja",
    "promotion": "Parceria com a loja",
    "other": "Cortesia da loja",
}


async def build_gift_receipt_data(db: AsyncSession, tenant_id: int, gift: Dict[str, Any]) -> Dict[str, Any]:
    """`gift` é o dicionário público do GiftService (já com itens). Monta o que sai no comprovante."""
    store = (await db.execute(select(Store).where(Store.id == tenant_id))).scalar_one_or_none()
    number = (await db.execute(
        select(WhatsAppCloudNumber).where(WhatsAppCloudNumber.tenant_id == tenant_id, WhatsAppCloudNumber.is_active == True)  # noqa: E712
        .order_by(WhatsAppCloudNumber.id)
    )).scalars().first()
    address = ""
    if store is not None:
        line1 = ", ".join(x for x in (store.street, store.number) if x)
        line2 = " - ".join(x for x in (store.neighborhood, "/".join(x for x in (store.city, store.state) if x)) if x)
        address = " · ".join(x for x in (line1, line2) if x)
    customer: Optional[Customer] = None
    if gift.get("customer_id"):
        customer = (await db.execute(select(Customer).where(Customer.id == gift["customer_id"], Customer.tenant_id == tenant_id))).scalar_one_or_none()
    created = None
    if gift.get("created_at"):
        created = to_brazil_tz(datetime.fromisoformat(gift["created_at"]))
    items = [{"name": i["product_name"] or "Produto", "variant": i["variant_label"], "quantity": int(i["quantity"]),
              "list_price": float(i["list_price"])} for i in gift["items"]]
    return {
        "store_name": (store.name if store else "") or "",
        "store_tagline": (store.tagline if store else "") or "",
        "store_address": address,
        "store_phone": _fmt_phone(number.display_phone_number) if number and number.display_phone_number else "",
        "gift_number": gift["gift_number"],
        "date": created.strftime("%d/%m/%Y %H:%M") if created else "",
        "recipient": (customer.full_name if customer else None) or gift.get("recipient_name") or "",
        "customer_phone": customer.phone if customer else None,
        "given_by": gift.get("given_by_name"),
        "reason": REASON_FOR_CUSTOMER.get(gift.get("reason_type") or "", "Cortesia da loja"),
        "related_sale_id": gift.get("related_sale_id"),
        "items": items,
        "pieces": sum(i["quantity"] for i in items),
        "list_value": float(gift.get("list_value") or 0),
        "cancelled": gift.get("status") == "cancelled",
    }


def build_gift_receipt_text(d: Dict[str, Any]) -> str:
    out = [f"*{d['store_name']}*" if d["store_name"] else "", "*BRINDE, SEM VALOR*", "Sem valor fiscal", ""]
    if d["cancelled"]:
        out += ["*** BRINDE CANCELADO ***", ""]
    out.append(f"Brinde: {d['gift_number']}")
    if d["date"]:
        out.append(f"Data: {d['date']}")
    if d["recipient"]:
        out.append(f"Para: {d['recipient']}")
    out.append(d["reason"])
    out.append("")
    for it in d["items"]:
        out.append(f"{it['quantity']}x {it['name']}" + (f" ({it['variant']})" if it["variant"] else ""))
    out.append("")
    out.append(f"Valor de vitrine: {brl(d['list_value'])} (cortesia da loja)")
    out.append("Obrigada pela preferência!")
    return "\n".join(x for i, x in enumerate(out) if x or (i and out[i - 1]))


def gift_whatsapp_link(d: Dict[str, Any]) -> Optional[str]:
    phone = wa_phone(d.get("customer_phone"))
    return f"https://wa.me/{phone}?text={quote(build_gift_receipt_text(d))}" if phone else None


def build_gift_receipt_pdf(d: Dict[str, Any], size: str = "80") -> bytes:
    p = _Page(WIDTHS_MM.get(size, WIDTHS_MM["80"]))
    p.title = f"Comprovante do brinde {d['gift_number']}"
    p.text(d["store_name"] or "Comprovante", 12, bold=True, align="center")
    if d["store_tagline"]:
        p.text(d["store_tagline"], 7.5, align="center")
    if d["store_address"]:
        p.text(d["store_address"], 7, align="center")
    if d["store_phone"]:
        p.text(d["store_phone"], 7, align="center")
    p.rule()
    p.text("BRINDE, SEM VALOR", 10, bold=True, align="center")
    p.text("Sem valor fiscal", 7, align="center")
    if d["cancelled"]:
        p.gap(2)
        p.text("*** BRINDE CANCELADO ***", 10, bold=True, align="center")
    p.gap(3)
    p.pair("Brinde", d["gift_number"], 8, bold=True)
    if d["date"]:
        p.pair("Data", d["date"], 8)
    if d["recipient"]:
        p.pair("Para", d["recipient"], 8)
    if d["given_by"]:
        p.pair("Entregue por", d["given_by"], 8)
    p.text(d["reason"], 8, align="center")
    p.rule()
    for it in d["items"]:
        label = it["name"] + (f" · {it['variant']}" if it["variant"] else "")
        p.text(label, 8.5, bold=True)
        p.pair(f"{it['quantity']} x {brl(it['list_price'])}", "SEM COBRANÇA", 8)
        p.gap(2)
    p.rule()
    p.pair("Valor de vitrine", brl(d["list_value"]), 9, bold=True)
    p.text("Cortesia da loja. Não é venda e não tem troca por dinheiro.", 7, align="center")
    p.gap(4)
    p.text("Obrigada pela preferência!", 8, bold=True, align="center")
    return p.render()


async def send_gift_via_store_whatsapp(db: AsyncSession, tenant_id: int, gift: Dict[str, Any], data: Dict[str, Any], user: Any) -> Dict[str, Any]:
    """Manda o comprovante pelo WhatsApp OFICIAL da loja. Dentro de 24 h da última mensagem da pessoa vai o PDF; fora disso o
    WhatsApp só aceita modelo aprovado e o do brinde não existe, então a mensagem explica e sugere o PDF ou o link."""
    from app.services import whatsapp_cloud_service as wa
    from app.services.audit_service import AuditService

    if not gift.get("customer_id"):
        raise wa.SendError("Este brinde não é de uma cliente cadastrada com telefone. Baixe o PDF e envie como preferir.", 409)
    customer = (await db.execute(select(Customer).where(Customer.id == gift["customer_id"], Customer.tenant_id == tenant_id))).scalar_one_or_none()
    if customer is None or not wa.customer_phone_key(customer.phone):
        raise wa.SendError("Esta cliente não tem telefone válido. Cadastre o telefone ou baixe o PDF.", 409)
    conv = await wa.start_conversation(db, tenant_id, customer.id)
    if not wa.window_open(conv):
        raise wa.SendError(
            "Esta cliente não escreveu para a loja nas últimas 24 horas, e o WhatsApp só permite mandar para ela um modelo "
            "aprovado (o do brinde ainda não existe). Use o PDF ou o botão “Abrir no meu WhatsApp”.", 409)
    pdf = build_gift_receipt_pdf(data, "a6")
    await wa.send_media(db, tenant_id, conv.id, data=pdf, filename=f"brinde-{gift['gift_number']}.pdf",
                        caption=f"Comprovante do seu brinde {gift['gift_number']}. Obrigada pela preferência!")
    info = await store_whatsapp_info(db, tenant_id)
    await AuditService.log(db, "GIFT_RECEIPT_SENT", tenant_id=tenant_id, user_id=getattr(user, "id", None),
                           user_email=getattr(user, "email", None), entity="gift", entity_id=gift["id"],
                           detail={"numero": gift["gift_number"], "para": customer.full_name, "canal": "whatsapp_oficial", "modo": "pdf"})
    await db.commit()
    return {"mode": "pdf", "store_number": info["number"], "customer": customer.full_name}
