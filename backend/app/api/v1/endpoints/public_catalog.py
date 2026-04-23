"""
Endpoints públicos do catálogo — sem autenticação.

Expõe apenas dados seguros para o site público (wamodafitness.com.br):
  - nome, preço de venda, foto, categoria, tamanhos, in_stock (bool)

Nunca expõe: custo, quantidade em estoque, SKU, dados internos.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import get_db

router = APIRouter(prefix="/public", tags=["Catálogo Público"])


# ── Schemas (apenas campos seguros) ─────────────────────────────────────────

class PublicCategory(BaseModel):
    id: int
    name: str

class PublicProduct(BaseModel):
    id: int
    name: str
    sale_price: float
    image_url: Optional[str] = None
    category: Optional[PublicCategory] = None
    in_stock: bool
    variant_count: int
    sizes: List[str]

class PublicProductDetail(PublicProduct):
    description: Optional[str] = None
    brand: Optional[str] = None
    gender: Optional[str] = None
    material: Optional[str] = None
    colors: List[str] = []

class PublicLook(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    items_count: int
    total_price: float


# ── Helper ───────────────────────────────────────────────────────────────────

async def _get_default_tenant(db: AsyncSession) -> int:
    # 1) Loja marcada como padrão
    row = (await db.execute(
        text("SELECT id FROM stores WHERE is_default = true AND is_active = true LIMIT 1")
    )).fetchone()
    if row:
        return row[0]

    # 2) Fallback: primeira loja ativa (menor id)
    row = (await db.execute(
        text("SELECT id FROM stores WHERE is_active = true ORDER BY id LIMIT 1")
    )).fetchone()
    if row:
        return row[0]

    raise HTTPException(status_code=503, detail="Loja não configurada")


# ── Produtos ─────────────────────────────────────────────────────────────────

@router.get("/products", response_model=List[PublicProduct])
async def list_public_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    category_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Lista produtos públicos da loja. Não expõe custo nem quantidade."""
    tenant_id = await _get_default_tenant(db)

    q = """
        SELECT
            p.id,
            p.name,
            COALESCE(
                (SELECT MIN(pv.price) FROM product_variants pv
                 WHERE pv.product_id = p.id AND pv.is_active = true),
                p.base_price, 0
            )                                    AS sale_price,
            p.image_url,
            p.category_id,
            c.name                               AS category_name,
            COALESCE((
                SELECT SUM(inv.quantity)
                FROM inventory inv WHERE inv.product_id = p.id
            ), 0) > 0                            AS in_stock,
            (
                SELECT COUNT(*) FROM product_variants pv
                WHERE pv.product_id = p.id AND pv.is_active = true
            )                                    AS variant_count,
            ARRAY(
                SELECT DISTINCT pv2.size
                FROM product_variants pv2
                WHERE pv2.product_id = p.id AND pv2.is_active = true
                  AND pv2.size IS NOT NULL
                ORDER BY pv2.size
            )                                    AS sizes
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.tenant_id  = :tid
          AND p.is_active  = true
          AND p.is_catalog = false
    """
    params: dict = {"tid": tenant_id}

    if category_id is not None:
        q += " AND p.category_id = :cat"
        params["cat"] = category_id
    if search:
        q += " AND p.name ILIKE :search"
        params["search"] = f"%{search}%"

    q += " ORDER BY in_stock DESC, p.name LIMIT :limit OFFSET :skip"
    params["limit"] = limit
    params["skip"] = skip

    rows = (await db.execute(text(q), params)).fetchall()

    return [
        PublicProduct(
            id=r[0],
            name=r[1],
            sale_price=float(r[2]),
            image_url=r[3],
            category=PublicCategory(id=r[4], name=r[5]) if r[4] and r[5] else None,
            in_stock=bool(r[6]),
            variant_count=int(r[7] or 0),
            sizes=list(r[8] or []),
        )
        for r in rows
    ]


@router.get("/products/{product_id}", response_model=PublicProductDetail)
async def get_public_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Detalhe de produto público. Não expõe custo nem quantidade."""
    tenant_id = await _get_default_tenant(db)

    row = (await db.execute(text("""
        SELECT
            p.id, p.name,
            COALESCE(
                (SELECT MIN(pv.price) FROM product_variants pv
                 WHERE pv.product_id = p.id AND pv.is_active = true),
                p.base_price, 0
            ) AS sale_price,
            p.image_url, p.category_id, c.name,
            COALESCE((
                SELECT SUM(inv.quantity)
                FROM inventory inv WHERE inv.product_id = p.id
            ), 0) > 0 AS in_stock,
            (SELECT COUNT(*) FROM product_variants pv
             WHERE pv.product_id = p.id AND pv.is_active = true) AS variant_count,
            ARRAY(
                SELECT DISTINCT pv2.size FROM product_variants pv2
                WHERE pv2.product_id = p.id AND pv2.is_active = true AND pv2.size IS NOT NULL
                ORDER BY pv2.size
            ) AS sizes,
            ARRAY(
                SELECT DISTINCT pv3.color FROM product_variants pv3
                WHERE pv3.product_id = p.id AND pv3.is_active = true AND pv3.color IS NOT NULL
                ORDER BY pv3.color
            ) AS colors,
            p.description, p.brand, p.gender, p.material
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = :pid AND p.tenant_id = :tid AND p.is_active = true AND p.is_catalog = false
    """), {"pid": product_id, "tid": tenant_id})).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    return PublicProductDetail(
        id=row[0], name=row[1], sale_price=float(row[2]),
        image_url=row[3],
        category=PublicCategory(id=row[4], name=row[5]) if row[4] and row[5] else None,
        in_stock=bool(row[6]),
        variant_count=int(row[7] or 0),
        sizes=list(row[8] or []),
        colors=list(row[9] or []),
        description=row[10], brand=row[11], gender=row[12], material=row[13],
    )


# ── Categorias ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[PublicCategory])
async def list_public_categories(db: AsyncSession = Depends(get_db)):
    """Categorias com pelo menos 1 produto ativo na loja."""
    tenant_id = await _get_default_tenant(db)

    rows = (await db.execute(text("""
        SELECT DISTINCT c.id, c.name
        FROM categories c
        JOIN products p ON p.category_id = c.id
        WHERE p.tenant_id = :tid AND p.is_active = true AND p.is_catalog = false
        ORDER BY c.name
    """), {"tid": tenant_id})).fetchall()

    return [PublicCategory(id=r[0], name=r[1]) for r in rows]


# ── Looks ─────────────────────────────────────────────────────────────────────

@router.get("/looks", response_model=List[PublicLook])
async def list_public_looks(
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Looks públicos da loja (is_public=true apenas)."""
    tenant_id = await _get_default_tenant(db)

    rows = (await db.execute(text("""
        SELECT l.id, l.name, l.description,
               COUNT(li.id) AS items_count,
               COALESCE(SUM(li.unit_price), 0) AS total_price
        FROM looks l
        LEFT JOIN look_items li ON li.look_id = l.id
        WHERE l.tenant_id = :tid AND l.is_public = true AND l.is_active = true
        GROUP BY l.id, l.name, l.description
        ORDER BY l.created_at DESC
        LIMIT :limit
    """), {"tid": tenant_id, "limit": limit})).fetchall()

    return [
        PublicLook(id=r[0], name=r[1], description=r[2],
                   items_count=int(r[3] or 0), total_price=float(r[4] or 0))
        for r in rows
    ]
