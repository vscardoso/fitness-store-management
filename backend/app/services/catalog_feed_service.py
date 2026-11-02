"""Feed de catálogo para a Meta (WhatsApp, Instagram Shopping e anúncios).

Um item por variação (cor + tamanho) dos produtos publicados (`is_catalog`) e ativos. A Meta lê a URL do feed
sozinha a cada hora ou dia, então marcar ou desmarcar "publicar" no app reflete no catálogo sem enviar nada.
Nunca expõe custo nem quantidade: só se a variação tem estoque (`in stock` / `out of stock`).
"""
import csv
import io
import re
import secrets
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

COLUMNS = [
    "id", "title", "description", "availability", "condition", "price", "link", "image_link",
    "brand", "color", "size", "item_group_id",
]
TITLE_MAX = 200
DESCRIPTION_MAX = 5000
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


@dataclass
class FeedResult:
    items: list = field(default_factory=list)
    products: int = 0                # produtos publicados e ativos
    skipped_no_photo: int = 0        # variações fora do feed por falta de foto
    skipped_no_price: int = 0        # variações fora do feed por preço zerado
    products_no_variants: int = 0    # produtos publicados sem nenhuma variação ativa
    skipped_no_name: int = 0         # variações sem nome depois de tirar marca
    brand_removed: int = 0           # variações em que um nome de marca foi tirado do título ou da descrição
    missing_photo_products: list = field(default_factory=list)  # [{"id", "name"}] de quem ficou fora por falta de foto


def new_token() -> str:
    return secrets.token_urlsafe(24)


def feed_url(token: str) -> str:
    return f"{settings.PUBLIC_API_URL.rstrip('/')}/api/v1/public/catalog-feed/{token}.csv"


def _clean(value: Optional[str], limit: int) -> str:
    s = _CONTROL.sub("", (value or "")).strip()
    s = re.sub(r"[ \t]+", " ", s)
    return s[:limit]


# Nome de marca de terceiros no catálogo leva a banimento na Meta: nunca vai no feed.
# Além da marca cadastrada em cada produto, tiramos estas do título e da descrição.
BLOCKED_BRANDS = [
    "nike", "adidas", "puma", "lupo", "olympikus", "fila", "mizuno", "asics", "under armour", "new balance",
    "reebok", "hering", "colcci", "live", "alto giro", "selene", "trifil", "gymshark", "lululemon", "oakley",
    "skechers", "vans", "converse", "umbro", "kappa", "hoka", "on running", "vestem", "kanui", "demillus",
]


def _brand_regex(extra: list) -> re.Pattern:
    names = {n.strip().lower() for n in BLOCKED_BRANDS + [e for e in extra if e and len(e.strip()) >= 2]}
    alt = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(rf"(?<![\w]){alt}(?![\w])", re.IGNORECASE)


def _strip_brands(value: str, rx: re.Pattern) -> str:
    out = rx.sub("", value)
    out = re.sub(r"\s{2,}", " ", out)
    return re.sub(r"\s+([,.;:!?])", r"\1", out).strip(" -–,;:")


def _absolute(url: Optional[str]) -> Optional[str]:
    url = (url or "").strip()
    if not url:
        return None
    if url.startswith(("http://", "https://")):
        return url
    return f"{settings.PUBLIC_API_URL.rstrip('/')}/{url.lstrip('/')}"


def _product_link(store, product_id: int) -> str:
    domain = (store.domain or "").strip()
    if domain:
        return f"https://{domain}/produtos/{product_id}"
    return f"{settings.PUBLIC_SITE_URL.rstrip('/')}/produtos/{product_id}?store={store.slug}"


async def build_feed(db: AsyncSession, store) -> FeedResult:
    tid = store.id
    res = FeedResult()

    rows = (await db.execute(text("""
        SELECT pv.id, p.id, p.name, p.description, p.brand, p.image_url, pv.color, pv.size, pv.price,
               COALESCE((SELECT SUM(ei.quantity_remaining) FROM entry_items ei JOIN stock_entries se ON se.id = ei.entry_id
                         WHERE ei.variant_id = pv.id AND ei.tenant_id = :tid AND ei.is_active = true AND se.is_active = true), 0)
        FROM products p
        LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = true
        WHERE p.tenant_id = :tid AND p.is_active = true AND p.is_catalog = true
        ORDER BY p.id, pv.id
    """), {"tid": tid})).fetchall()

    media = (await db.execute(text("""
        SELECT pm.product_id, pm.variant_id, pm.url, pm.is_cover, pm.position
        FROM product_media pm JOIN products p ON p.id = pm.product_id
        WHERE p.tenant_id = :tid AND pm.is_active = true AND pm.media_type = 'photo'
    """), {"tid": tid})).fetchall()

    # Capa da variação, depois capa do produto, depois a primeira foto da galeria
    by_variant: dict = {}
    by_product: dict = {}
    for product_id, variant_id, url, is_cover, position in sorted(media, key=lambda m: (not m[3], m[4] or 0)):
        if variant_id:
            by_variant.setdefault(variant_id, url)
        else:
            by_product.setdefault(product_id, url)

    seen_products = set()
    missing: dict = {}
    for variant_id, product_id, name, description, brand, image_url, color, size, price, qty in rows:
        seen_products.add(product_id)
        if variant_id is None:
            res.products_no_variants += 1
            continue
        if price is None or float(price) <= 0:
            res.skipped_no_price += 1
            continue
        photo = _absolute(by_variant.get(variant_id) or by_product.get(product_id) or image_url)
        if not photo:
            res.skipped_no_photo += 1
            if product_id not in missing:
                missing[product_id] = {"id": product_id, "name": _clean(name, TITLE_MAX)}
            continue
        rx = _brand_regex([brand or ""])
        clean_name = _strip_brands(_clean(name, TITLE_MAX), rx)
        clean_desc = _strip_brands(_clean(description, DESCRIPTION_MAX), rx)
        if (name and clean_name != _clean(name, TITLE_MAX)) or (description and clean_desc != _clean(description, DESCRIPTION_MAX)):
            res.brand_removed += 1
        title = clean_name
        if not title:
            res.skipped_no_name += 1
            continue
        res.items.append({
            "id": f"v{variant_id}",
            "title": title,
            "description": clean_desc or title,
            "availability": "in stock" if (qty or 0) > 0 else "out of stock",
            "condition": "new",
            "price": f"{float(price):.2f} BRL",
            "link": _product_link(store, product_id),
            "image_link": photo,
            "brand": _strip_brands(_clean(store.name, 100), rx) or "Loja",   # marca do produto nunca vai: só o nome da loja
            "color": _clean(color, 60),
            "size": _clean(size, 30),
            "item_group_id": f"p{product_id}",
        })

    res.products = len(seen_products)
    res.missing_photo_products = list(missing.values())[:50]
    return res


def render_csv(items: list) -> str:
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=COLUMNS, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    w.writeheader()
    w.writerows(items)
    return out.getvalue()
