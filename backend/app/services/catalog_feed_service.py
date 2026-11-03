"""Feed de catálogo para a Meta (WhatsApp, Instagram Shopping e anúncios).

Um item por PRODUTO publicado (`is_catalog`) e ativo, sem variações na Meta (decisão do Victor, 2026-11-03): as cores e
os tamanhos com estoque vão escritos no fim da descrição e a cliente escolhe na conversa. Preço = o menor das variações.
A Meta lê a URL do feed sozinha a cada hora, então marcar ou desmarcar "publicar" no app reflete no catálogo sem enviar
nada. Nunca expõe custo nem quantidade: só se há peça (`in stock` / `out of stock`).
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
from app.utils.variant_grid import size_sort_key

COLUMNS = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand"]
TITLE_MAX = 200
DESCRIPTION_MAX = 5000
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


@dataclass
class FeedResult:
    items: list = field(default_factory=list)
    products: int = 0                # produtos publicados e ativos
    skipped_no_photo: int = 0        # produtos fora do feed por falta de foto
    skipped_no_price: int = 0        # produtos fora do feed sem nenhuma variação com preço
    products_no_variants: int = 0    # produtos publicados sem nenhuma variação ativa
    skipped_no_name: int = 0         # produtos sem nome depois de tirar marca
    brand_removed: int = 0           # produtos em que um nome de marca foi tirado do título ou da descrição
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


# Foto que vai para a Meta: a versão de 1200 px gerada pelo /uploads, já em pé. As fotos antigas foram gravadas deitadas
# com a rotação só na marcação da câmera (EXIF), que a Meta ignora: o catálogo mostrava uma faixa da foto deitada.
FEED_IMAGE_WIDTH = 1200


def _feed_image(url: Optional[str]) -> Optional[str]:
    full = _absolute(url)
    if not full:
        return None
    base = settings.PUBLIC_API_URL.rstrip('/') + "/uploads/"
    if full.startswith(base) and "?" not in full:
        return f"{full}?w={FEED_IMAGE_WIDTH}"
    return full


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

    # agrupa as variações por produto, na ordem da consulta
    produtos: dict = {}
    for variant_id, product_id, name, description, brand, image_url, color, size, price, qty in rows:
        g = produtos.setdefault(product_id, {"name": name, "description": description, "brand": brand,
                                             "image_url": image_url, "variants": []})
        if variant_id is not None:
            g["variants"].append((variant_id, color, size, price, qty or 0))

    missing: dict = {}
    for product_id, g in produtos.items():
        name = g["name"]
        if not g["variants"]:
            res.products_no_variants += 1
            continue
        com_preco = [v for v in g["variants"] if v[3] is not None and float(v[3]) > 0]
        if not com_preco:
            res.skipped_no_price += 1
            continue
        # capa do produto, depois a foto principal, depois a capa de uma variação
        photo = _feed_image(by_product.get(product_id) or g["image_url"]
                            or next((by_variant[v[0]] for v in com_preco if v[0] in by_variant), None))
        if not photo:
            res.skipped_no_photo += 1
            missing.setdefault(product_id, {"id": product_id, "name": _clean(name, TITLE_MAX)})
            continue
        rx = _brand_regex([g["brand"] or ""])
        clean_name = _strip_brands(_clean(name, TITLE_MAX), rx)
        clean_desc = _strip_brands(_clean(g["description"], DESCRIPTION_MAX), rx)
        if (name and clean_name != _clean(name, TITLE_MAX)) or (
                g["description"] and clean_desc != _clean(g["description"], DESCRIPTION_MAX)):
            res.brand_removed += 1
        if not clean_name:
            res.skipped_no_name += 1
            continue
        em_estoque = [v for v in com_preco if v[4] > 0]
        cores = list(dict.fromkeys(_clean(v[1], 60) for v in em_estoque if (v[1] or "").strip()))
        tamanhos = sorted({_clean(v[2], 30) for v in em_estoque if (v[2] or "").strip()}, key=size_sort_key)
        partes = []
        if cores:
            partes.append("Cores disponíveis: " + ", ".join(cores) + ".")
        if tamanhos:
            partes.append("Tamanhos disponíveis: " + ", ".join(tamanhos) + ".")
        grade = " ".join(partes)
        base = clean_desc or clean_name
        if grade:
            base = base[: DESCRIPTION_MAX - len(grade) - 2].rstrip()
        res.items.append({
            "id": f"p{product_id}",
            "title": clean_name,
            "description": f"{base}\n\n{grade}" if grade else base,
            "availability": "in stock" if em_estoque else "out of stock",
            "condition": "new",
            "price": f"{min(float(v[3]) for v in com_preco):.2f} BRL",
            "link": _product_link(store, product_id),
            "image_link": photo,
            "brand": _strip_brands(_clean(store.name, 100), rx) or "Loja",   # marca do produto nunca vai: só o nome da loja
        })

    seen_products = set(produtos)
    res.products = len(seen_products)
    res.missing_photo_products = list(missing.values())[:50]
    return res


def render_csv(items: list) -> str:
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=COLUMNS, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    w.writeheader()
    w.writerows(items)
    return out.getvalue()


# ── Vitrine pública do produto (link do catálogo da Meta) ────────────────────────────────────────────────────────
# A cliente toca em "ver no site" no catálogo do WhatsApp e cai em /produtos/{id}?store={slug} do app web, sem login.
# Mesmas regras do feed: só produto publicado e ativo, sem marca, sem custo nem quantidade; cores e tamanhos só com peça.


async def build_showcase(db: AsyncSession, store, product_id: int) -> Optional[dict]:
    tid = store.id
    rows = (await db.execute(text("""
        SELECT pv.id, p.name, p.description, p.brand, p.image_url, pv.color, pv.size, pv.price,
               COALESCE((SELECT SUM(ei.quantity_remaining) FROM entry_items ei JOIN stock_entries se ON se.id = ei.entry_id
                         WHERE ei.variant_id = pv.id AND ei.tenant_id = :tid AND ei.is_active = true AND se.is_active = true), 0),
               p.code_number
        FROM products p
        LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = true
        WHERE p.id = :pid AND p.tenant_id = :tid AND p.is_active = true AND p.is_catalog = true
        ORDER BY pv.id
    """), {"tid": tid, "pid": product_id})).fetchall()
    if not rows:
        return None
    _vid, name, description, brand, image_url, *_rest = rows[0]
    code_number = rows[0][9]
    rx = _brand_regex([brand or ""])
    title = _strip_brands(_clean(name, TITLE_MAX), rx)
    if not title:
        return None
    variants = [(r[0], r[5], r[6], r[7], r[8] or 0) for r in rows if r[0] is not None and r[7] is not None and float(r[7]) > 0]
    if not variants:
        return None
    em_estoque = [v for v in variants if v[4] > 0]

    media = (await db.execute(text("""
        SELECT pm.url, pm.variant_id, pm.is_cover, pm.position FROM product_media pm
        WHERE pm.product_id = :pid AND pm.tenant_id = :tid AND pm.is_active = true AND pm.media_type = 'photo'
        ORDER BY pm.is_cover DESC, pm.position ASC, pm.id ASC
    """), {"pid": product_id, "tid": tid})).fetchall()
    fotos = []
    for url in [image_url] + [m[0] for m in media if m[1] is None] + [m[0] for m in media if m[1] is not None]:
        foto = _feed_image(url)
        if foto and foto not in fotos:
            fotos.append(foto)

    numero = (await db.execute(text("""
        SELECT display_phone_number FROM whatsapp_cloud_numbers
        WHERE tenant_id = :tid AND is_active = true AND display_phone_number IS NOT NULL
        ORDER BY id LIMIT 1
    """), {"tid": tid})).scalar()
    whatsapp = "".join(ch for ch in (numero or "") if ch.isdigit()) or None

    precos = sorted({float(v[3]) for v in variants})
    return {
        "id": product_id,
        "code": f"#{code_number}" if code_number else None,
        "name": title,
        "description": _strip_brands(_clean(description, DESCRIPTION_MAX), rx) or None,
        "price_min": precos[0],
        "price_max": precos[-1],
        "in_stock": bool(em_estoque),
        "colors": list(dict.fromkeys(_clean(v[1], 60) for v in em_estoque if (v[1] or "").strip())),
        "sizes": sorted({_clean(v[2], 30) for v in em_estoque if (v[2] or "").strip()}, key=size_sort_key),
        "photos": fotos,
        "store": {
            "name": _clean(store.name, 100),
            "logo_url": _absolute(f"/uploads/{store.logo_path}") if store.logo_path else None,
            "primary_color": store.primary_color,
            "whatsapp": whatsapp,
        },
    }
