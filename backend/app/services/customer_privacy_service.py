"""
LGPD: direitos do titular (cliente da loja) que a loja atende pelo Provador.

- Exportar: tudo que a loja guarda sobre a pessoa, num JSON legível (cadastro, compras, devoluções,
  envios condicionais, lista de desejos, looks e conversas do WhatsApp oficial). Sem custo, margem ou
  fonte FIFO: isso é dado da loja, não da pessoa.
- Anonimizar: apaga os dados pessoais e mantém os números (vendas, estoque, caixa) para a contabilidade
  da loja. Irreversível. Recusa enquanto houver envio condicional em aberto (peças com a cliente).
- Registro de acesso: cada leitura, alteração, exportação e anonimização vira uma linha em audit_logs
  (entity="customer"), que o admin consulta em GET /customers/{id}/access-log.

A loja é a controladora dos dados; o Provador é o operador (Termos, versão 2026-10-26).
"""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.conditional_shipment import ConditionalShipment, ConditionalShipmentItem
from app.models.customer import Customer
from app.models.look import Look
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.sale import Sale, SaleItem
from app.models.sale_return import SaleReturn
from app.models.store import Store
from app.models.whatsapp_cloud import WhatsAppConversation, WhatsAppMessage
from app.models.wishlist import Wishlist
from app.services.audit_service import AuditService

OPEN_SHIPMENT_STATUSES = ("PENDING", "SENT", "OVERDUE")
ANONYMIZED_ADDRESS = "Endereço removido (LGPD)"

# Campos pessoais do cadastro: viram nulo na anonimização
PERSONAL_FIELDS = (
    "email", "phone", "document_number", "birth_date", "address", "address_number",
    "neighborhood", "city", "state", "zip_code", "preferred_contact_method", "notes",
)


class CustomerPrivacyError(ValueError):
    pass


def _phone_key(value: Optional[str]) -> Optional[tuple[str, str]]:
    """(DDD, 8 últimos dígitos) para casar o telefone do cadastro com o do WhatsApp (com ou sem 55 e o 9)."""
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if digits.startswith("55") and len(digits) >= 12:
        digits = digits[2:]
    if len(digits) not in (10, 11):
        return None
    return digits[:2], digits[-8:]


def _iso(value: Any) -> Any:
    return value.isoformat() if hasattr(value, "isoformat") else value


def _num(value: Any) -> Any:
    return float(value) if value is not None else None


async def _customer(db: AsyncSession, tenant_id: int, customer_id: int) -> Customer:
    # Inclui inativo: o titular de um cadastro desativado continua tendo direito à exportação e à anonimização
    customer = (await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if customer is None:
        raise LookupError("Cliente não encontrado nesta loja.")
    return customer


async def _whatsapp_conversations(db: AsyncSession, tenant_id: int, phone: Optional[str]) -> list[WhatsAppConversation]:
    key = _phone_key(phone)
    if key is None:
        return []
    rows = (await db.execute(
        select(WhatsAppConversation).where(
            WhatsAppConversation.tenant_id == tenant_id,
            WhatsAppConversation.phone.like(f"%{key[1]}"),
        )
    )).scalars().all()
    return [c for c in rows if _phone_key(c.phone) == key]


async def _variant_labels(db: AsyncSession, product_ids: set[int], variant_ids: set[int]) -> tuple[dict, dict]:
    products = {}
    if product_ids:
        products = dict((await db.execute(select(Product.id, Product.name).where(Product.id.in_(product_ids)))).all())
    variants = {}
    if variant_ids:
        for vid, color, size in (await db.execute(
            select(ProductVariant.id, ProductVariant.color, ProductVariant.size).where(ProductVariant.id.in_(variant_ids))
        )).all():
            variants[vid] = " · ".join(p for p in (color, size) if p) or None
    return products, variants


async def export_customer(db: AsyncSession, tenant_id: int, customer_id: int) -> dict:
    customer = await _customer(db, tenant_id, customer_id)
    store = (await db.execute(select(Store.name).where(Store.id == tenant_id))).scalar_one_or_none()

    sales = (await db.execute(
        select(Sale).where(Sale.tenant_id == tenant_id, Sale.customer_id == customer_id).order_by(Sale.id)
    )).scalars().all()
    sale_ids = [s.id for s in sales]
    items = (await db.execute(
        select(SaleItem).where(SaleItem.sale_id.in_(sale_ids)).order_by(SaleItem.id)
    )).scalars().all() if sale_ids else []
    returns = (await db.execute(
        select(SaleReturn).where(SaleReturn.sale_id.in_(sale_ids)).order_by(SaleReturn.id)
    )).scalars().all() if sale_ids else []

    shipments = (await db.execute(
        select(ConditionalShipment).where(
            ConditionalShipment.tenant_id == tenant_id, ConditionalShipment.customer_id == customer_id
        ).order_by(ConditionalShipment.id)
    )).scalars().all()
    ship_ids = [s.id for s in shipments]
    ship_items = (await db.execute(
        select(ConditionalShipmentItem).where(ConditionalShipmentItem.shipment_id.in_(ship_ids))
    )).scalars().all() if ship_ids else []

    wishes = (await db.execute(
        select(Wishlist).where(Wishlist.tenant_id == tenant_id, Wishlist.customer_id == customer_id)
    )).scalars().all()
    looks = (await db.execute(
        select(Look).where(Look.tenant_id == tenant_id, Look.customer_id == customer_id)
    )).scalars().all()

    conversations = await _whatsapp_conversations(db, tenant_id, customer.phone)
    conv_ids = [c.id for c in conversations]
    messages = (await db.execute(
        select(WhatsAppMessage).where(WhatsAppMessage.conversation_id.in_(conv_ids)).order_by(WhatsAppMessage.id)
    )).scalars().all() if conv_ids else []

    product_ids = {i.product_id for i in items} | {i.product_id for i in ship_items} | {w.product_id for w in wishes if w.product_id}
    variant_ids = {i.variant_id for i in items if i.variant_id} | {i.variant_id for i in ship_items if i.variant_id} | {
        w.variant_id for w in wishes if w.variant_id}
    product_names, variant_labels = await _variant_labels(db, product_ids, variant_ids)

    def peca(product_id, variant_id):
        return {"produto": product_names.get(product_id), "variacao": variant_labels.get(variant_id)}

    return {
        "sobre": (
            "Dados pessoais que a loja guarda sobre você no sistema Provador (LGPD, art. 18). "
            "A loja é a responsável (controladora) por estes dados."
        ),
        "gerado_em": _iso(datetime.utcnow()) + "Z",
        "loja": store,
        "cadastro": {
            "nome": customer.full_name,
            "email": customer.email,
            "telefone": customer.phone,
            "cpf": customer.document_number,
            "nascimento": _iso(customer.birth_date),
            "endereco": customer.address,
            "numero": customer.address_number,
            "bairro": customer.neighborhood,
            "cidade": customer.city,
            "uf": customer.state,
            "cep": customer.zip_code,
            "contato_preferido": customer.preferred_contact_method,
            "aceita_marketing": customer.marketing_consent,
            "observacoes": customer.notes,
            "tipo": getattr(customer.customer_type, "value", customer.customer_type),
            "pontos_fidelidade": _num(customer.loyalty_points),
            "total_comprado": _num(customer.total_spent),
            "numero_de_compras": customer.total_purchases,
            "cadastrado_em": _iso(customer.created_at),
            "anonimizado_em": _iso(customer.anonymized_at),
        },
        "compras": [
            {
                "numero": s.sale_number,
                "data": _iso(s.created_at),
                "situacao": s.status,
                "forma_de_pagamento": s.payment_method,
                "total": _num(s.total_amount),
                "desconto": _num(s.discount_amount),
                "pontos_ganhos": _num(s.loyalty_points_earned),
                "pecas": [
                    {**peca(i.product_id, i.variant_id), "quantidade": i.quantity, "preco": _num(i.unit_price),
                     "subtotal": _num(i.subtotal)}
                    for i in items if i.sale_id == s.id
                ],
            }
            for s in sales
        ],
        "devolucoes_e_trocas": [
            {"numero": r.return_number, "data": _iso(r.created_at), "situacao": r.status, "motivo": r.reason,
             "valor": _num(r.total_refund)}
            for r in returns
        ],
        "envios_condicionais": [
            {
                "numero": s.id,
                "criado_em": _iso(s.created_at),
                "situacao": s.status,
                "endereco_de_entrega": s.shipping_address,
                "enviado_em": _iso(s.sent_at),
                "devolver_ate": _iso(s.deadline),
                "pecas": [
                    {**peca(i.product_id, i.variant_id), "enviadas": i.quantity_sent, "ficou": i.quantity_kept,
                     "devolveu": i.quantity_returned, "preco": _num(i.unit_price)}
                    for i in ship_items if i.shipment_id == s.id
                ],
            }
            for s in shipments
        ],
        "lista_de_desejos": [
            {**peca(w.product_id, w.variant_id), "criado_em": _iso(w.created_at), "observacoes": w.notes}
            for w in wishes
        ],
        "looks": [{"nome": lk.name, "descricao": lk.description, "criado_em": _iso(lk.created_at)} for lk in looks],
        "whatsapp": [
            {
                "telefone": c.phone,
                "nome_no_whatsapp": c.profile_name,
                "mensagens": [
                    {"data": _iso(m.sent_at or m.created_at), "de": "cliente" if m.direction == "in" else "loja",
                     "tipo": m.msg_type, "texto": m.text}
                    for m in messages if m.conversation_id == c.id
                ],
            }
            for c in conversations
        ],
    }


async def anonymize_customer(db: AsyncSession, tenant_id: int, customer_id: int) -> dict:
    """Apaga os dados pessoais. Não faz commit (a rota grava junto com o registro de acesso)."""
    customer = await _customer(db, tenant_id, customer_id)
    if customer.anonymized_at is not None:
        raise CustomerPrivacyError("Este cliente já foi anonimizado.")

    open_shipment = (await db.execute(
        select(ConditionalShipment.id).where(
            ConditionalShipment.tenant_id == tenant_id,
            ConditionalShipment.customer_id == customer_id,
            ConditionalShipment.is_active == True,  # noqa: E712
            ConditionalShipment.status.in_(OPEN_SHIPMENT_STATUSES),
        ).limit(1)
    )).scalar_one_or_none()
    if open_shipment is not None:
        raise CustomerPrivacyError(
            f"A cliente tem o envio condicional #{open_shipment} em aberto. Finalize ou cancele o envio antes de anonimizar."
        )

    conversations = await _whatsapp_conversations(db, tenant_id, customer.phone)

    for field in PERSONAL_FIELDS:
        setattr(customer, field, None)
    customer.full_name = f"Cliente anonimizado #{customer.id}"
    customer.marketing_consent = False
    customer.loyalty_points = 0
    customer.is_active = False
    customer.anonymized_at = datetime.utcnow()

    ships = (await db.execute(
        update(ConditionalShipment)
        .where(ConditionalShipment.tenant_id == tenant_id, ConditionalShipment.customer_id == customer_id)
        .values(shipping_address=ANONYMIZED_ADDRESS, notes=None, carrier=None, tracking_code=None)
    )).rowcount
    ship_ids = select(ConditionalShipment.id).where(
        ConditionalShipment.tenant_id == tenant_id, ConditionalShipment.customer_id == customer_id
    )
    await db.execute(update(ConditionalShipmentItem).where(ConditionalShipmentItem.shipment_id.in_(ship_ids)).values(notes=None))
    wishes = (await db.execute(
        update(Wishlist).where(Wishlist.tenant_id == tenant_id, Wishlist.customer_id == customer_id)
        .values(is_active=False, notes=None)
    )).rowcount
    looks = (await db.execute(
        update(Look).where(Look.tenant_id == tenant_id, Look.customer_id == customer_id).values(customer_id=None)
    )).rowcount
    for conv in conversations:
        conv.phone = None
        conv.wa_id = None
        conv.bsuid = None
        conv.profile_name = None
        conv.contact_key = f"anonimizado-{conv.id}"
        await db.execute(
            update(WhatsAppMessage).where(WhatsAppMessage.conversation_id == conv.id).values(text=None, payload=None)
        )
    await db.flush()
    # Contagens sem nenhum dado pessoal: vão para o registro de acesso
    return {"envios_condicionais": ships, "lista_de_desejos": wishes, "looks": looks, "conversas_whatsapp": len(conversations)}


async def log_access(db: AsyncSession, action: str, *, tenant_id: int, user, customer_id: int,
                     detail: Optional[dict] = None, ip: Optional[str] = None) -> None:
    await AuditService.log(
        db, action, tenant_id=tenant_id, user_id=user.id, user_email=user.email,
        entity="customer", entity_id=customer_id, detail=detail, ip_address=ip,
    )


ACTION_LABELS = {
    "CUSTOMER_VIEWED": "Abriu o cadastro",
    "CUSTOMER_UPDATED": "Alterou o cadastro",
    "CUSTOMER_DELETED": "Desativou o cadastro",
    "CUSTOMER_EXPORTED": "Exportou os dados (LGPD)",
    "CUSTOMER_ANONYMIZED": "Anonimizou o cliente (LGPD)",
}


async def access_log(db: AsyncSession, tenant_id: int, customer_id: int, limit: int = 100) -> list[dict]:
    await _customer(db, tenant_id, customer_id)
    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.tenant_id == tenant_id, AuditLog.entity == "customer", AuditLog.entity_id == customer_id
        ).order_by(AuditLog.id.desc()).limit(limit)
    )).scalars().all()
    return [
        {"data": r.created_at, "acao": ACTION_LABELS.get(r.action, r.action), "codigo": r.action,
         "usuario": r.user_email, "ip": r.ip_address}
        for r in rows
    ]
