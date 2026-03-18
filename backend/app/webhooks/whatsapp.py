"""
Webhook WhatsApp — recebe mensagens do bot Baileys e responde.

Fluxo:
    POST /webhooks/whatsapp
        ← { from, body, type, timestamp }
        → { reply: "texto da resposta" }

O bot Node.js (whatsapp_bot/index.js) chama este endpoint para
cada mensagem recebida e envia a resposta de volta ao cliente.

Menu principal:
    1 - Buscar produto
    2 - Ver catálogo
    3 - Minha wishlist (nova funcionalidade)
    4 - Horários da loja
    5 - Falar com vendedora
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
import logging
import os

from app.core.database import get_db
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

# Token estático para autenticar o bot (definido em .env como WHATSAPP_BOT_TOKEN)
BOT_TOKEN = os.getenv("WHATSAPP_BOT_TOKEN", "")


# ── Schemas ───────────────────────────────────────────────────────────────────

class WhatsAppMessage(BaseModel):
    """Payload enviado pelo bot Baileys ao webhook."""
    from_number: str       # ex: "5511999999999"
    body: str              # Texto digitado pelo cliente
    message_type: str = "text"   # "text", "image", etc.
    timestamp: Optional[int] = None
    # Contexto de sessão (opcional, gerenciado pelo bot)
    session_state: Optional[str] = None  # ex: "awaiting_product_search"


class WhatsAppReply(BaseModel):
    """Resposta enviada de volta ao bot."""
    reply: str
    next_state: Optional[str] = None  # Estado da "conversa" para o bot controlar
    media_url: Optional[str] = None   # URL de imagem, se aplicável


# ── Helpers ───────────────────────────────────────────────────────────────────

def _menu_principal() -> str:
    store = settings.APP_NAME or "Fitness Store"
    return (
        f"👟 Olá! Bem-vindo à *{store}*!\n\n"
        "Como posso ajudar?\n\n"
        "1️⃣  Buscar produto\n"
        "2️⃣  Ver catálogo online\n"
        "3️⃣  Minha wishlist\n"
        "4️⃣  Horários da loja\n"
        "5️⃣  Falar com vendedora\n\n"
        "_Digite o número da opção desejada_"
    )


def _catalog_url() -> str:
    site = os.getenv("NEXT_PUBLIC_SITE_URL", "https://fitness-store-management.vercel.app")
    return f"🛍️ Acesse nosso catálogo completo:\n{site}\n\nLá você encontra todos os produtos, looks e pode adicionar itens à sua wishlist! 💜"


def _horarios() -> str:
    return (
        "🕐 *Horários de atendimento:*\n\n"
        "Seg–Sex: 9h às 20h\n"
        "Sábado: 9h às 18h\n"
        "Domingo: fechado\n\n"
        "WhatsApp: atendimento em horário comercial 📲"
    )


def _transfer_vendedora() -> str:
    return (
        "👩‍💼 Transferindo para uma de nossas vendedoras...\n\n"
        "Em instantes alguém vai te atender!\n\n"
        "_Aguarde um momento por favor_ 🙏"
    )


def _not_found() -> str:
    return (
        "😕 Não entendi sua mensagem.\n\n"
        "Digite *menu* ou *0* para ver as opções novamente."
    )


# ── Endpoint principal ────────────────────────────────────────────────────────

@router.post("/whatsapp", response_model=WhatsAppReply)
async def whatsapp_webhook(
    msg: WhatsAppMessage,
    x_bot_token: Optional[str] = Header(None, alias="X-Bot-Token"),
    db: AsyncSession = Depends(get_db),
):
    """
    Processa mensagem recebida do WhatsApp e retorna resposta.
    Autenticado via header X-Bot-Token.
    """
    # Autenticação do bot
    if BOT_TOKEN and x_bot_token != BOT_TOKEN:
        raise HTTPException(status_code=401, detail="Token inválido")

    body = msg.body.strip().lower()
    state = msg.session_state or "idle"

    logger.info(f"WhatsApp [{msg.from_number}] state={state}: {msg.body[:50]}")

    # ── Comandos sempre disponíveis ─────────────────────────
    if body in ("menu", "0", "oi", "ola", "olá", "hello", "hi", "início", "inicio"):
        return WhatsAppReply(reply=_menu_principal(), next_state="menu")

    # ── Estado: aguardando busca de produto ─────────────────
    if state == "awaiting_product_search":
        return await _handle_product_search(db, msg.from_number, msg.body)

    # ── Menu principal ───────────────────────────────────────
    if body == "1" or "buscar" in body or "produto" in body:
        return WhatsAppReply(
            reply="🔍 Qual produto você está buscando?\n\nDigite o nome (ex: legging, camiseta, tênis):",
            next_state="awaiting_product_search",
        )

    if body == "2" or "catálogo" in body or "catalogo" in body:
        return WhatsAppReply(reply=_catalog_url(), next_state="menu")

    if body == "3" or "wishlist" in body:
        return await _handle_wishlist(db, msg.from_number)

    if body == "4" or "horário" in body or "horario" in body:
        return WhatsAppReply(reply=_horarios(), next_state="menu")

    if body == "5" or "vendedora" in body or "atendente" in body or "humano" in body:
        return WhatsAppReply(reply=_transfer_vendedora(), next_state="transfer")

    # ── Fallback ─────────────────────────────────────────────
    return WhatsAppReply(reply=_not_found(), next_state="menu")


# ── Handlers internos ─────────────────────────────────────────────────────────

async def _handle_product_search(
    db: AsyncSession, from_number: str, search_term: str
) -> WhatsAppReply:
    """Busca produtos pelo nome e retorna lista formatada."""
    from sqlalchemy import select
    from app.models.product import Product

    term = f"%{search_term.strip()}%"
    stmt = (
        select(Product)
        .where(Product.is_active == True, Product.name.ilike(term))
        .limit(5)
    )
    result = await db.execute(stmt)
    products = result.scalars().all()

    if not products:
        site = os.getenv("NEXT_PUBLIC_SITE_URL", "https://fitness-store-management.vercel.app")
        return WhatsAppReply(
            reply=(
                f'😕 Não encontrei "{search_term}" no estoque.\n\n'
                f"Quer adicionar à sua *wishlist* e receber alerta quando chegar?\n"
                f"Acesse: {site}\n\nOu digite *menu* para voltar."
            ),
            next_state="menu",
        )

    lines = ["🛍️ *Produtos encontrados:*\n"]
    for p in products:
        price = f"R$ {p.sale_price:.2f}" if p.sale_price else "Consulte preço"
        lines.append(f"• *{p.name}* — {price}")

    site = os.getenv("NEXT_PUBLIC_SITE_URL", "https://fitness-store-management.vercel.app")
    lines.append(f"\n🔗 Ver detalhes: {site}/produtos")
    lines.append("\nDigite *menu* para voltar ou *5* para falar com vendedora.")

    return WhatsAppReply(reply="\n".join(lines), next_state="menu")


async def _handle_wishlist(db: AsyncSession, from_number: str) -> WhatsAppReply:
    """Mostra wishlist do cliente pelo número de telefone."""
    from sqlalchemy import select
    from app.models.customer import Customer
    from app.models.wishlist import Wishlist
    from sqlalchemy.orm import selectinload

    # Normalizar número (remover +, espaços)
    phone_clean = from_number.replace("+", "").replace(" ", "").replace("-", "")
    # Tentar últimos 11 dígitos para comparação
    phone_suffix = phone_clean[-11:] if len(phone_clean) >= 11 else phone_clean

    stmt = select(Customer).where(
        Customer.is_active == True,
        Customer.phone.like(f"%{phone_suffix}%"),
    )
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if not customer:
        site = os.getenv("NEXT_PUBLIC_SITE_URL", "https://fitness-store-management.vercel.app")
        return WhatsAppReply(
            reply=(
                "📋 Você ainda não está cadastrado no nosso sistema.\n\n"
                f"Acesse {site} para criar sua wishlist ou\n"
                "fale com nossa vendedora digitando *5*. 😊"
            ),
            next_state="menu",
        )

    # Buscar wishlist
    stmt2 = (
        select(Wishlist)
        .where(Wishlist.customer_id == customer.id, Wishlist.is_active == True, Wishlist.notified == False)
        .options(selectinload(Wishlist.product))
        .limit(10)
    )
    result2 = await db.execute(stmt2)
    items = result2.scalars().all()

    if not items:
        return WhatsAppReply(
            reply=(
                f"👋 Oi *{customer.full_name.split()[0]}*!\n\n"
                "Sua wishlist está vazia por enquanto.\n\n"
                "Quando encontrar algo que gostar no nosso catálogo, é só adicionar! 🛒"
            ),
            next_state="menu",
        )

    lines = [f"💜 Oi *{customer.full_name.split()[0]}*! Sua wishlist:\n"]
    for item in items:
        pname = item.product.name if item.product else f"Produto #{item.product_id}"
        lines.append(f"• {pname}")

    lines.append("\nVou te avisar assim que chegar no estoque! 🔔")
    return WhatsAppReply(reply="\n".join(lines), next_state="menu")


# ── Endpoint de verificação (GET para Webhook Verification do Meta) ───────────

@router.get("/whatsapp")
async def whatsapp_verify(
    hub_mode: Optional[str] = None,
    hub_challenge: Optional[str] = None,
    hub_verify_token: Optional[str] = None,
):
    """
    Endpoint de verificação do webhook da Meta Business API.
    Necessário para registrar o webhook na plataforma oficial.
    """
    verify_token = os.getenv("WHATSAPP_VERIFY_TOKEN", "fitness_store_verify")
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        return int(hub_challenge) if hub_challenge else 0
    raise HTTPException(status_code=403, detail="Token de verificação inválido")
