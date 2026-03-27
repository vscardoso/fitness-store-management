"""
Endpoint para listar produtos agrupados por variantes
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from collections import defaultdict

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User

router = APIRouter(prefix="/products", tags=["Produtos Agrupados"])


@router.get(
    "/grouped-debug",
    summary="Debug: Listar produtos com contagem de variantes",
    description="Endpoint de debug para verificar discrepância na contagem de variantes"
)
async def list_grouped_products_debug(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Debug: Lista produtos com contagem de variantes para verificar discrepância.
    """
    try:
        from app.services.product_variant_service import ProductVariantService
        from app.repositories.product_repository import ProductRepository
        
        variant_service = ProductVariantService(db)
        product_repo = ProductRepository(db)
        
        # Buscar produtos
        products_query = """
            SELECT p.id, p.name
            FROM products p
            WHERE p.tenant_id = :tid AND p.is_catalog = false AND p.is_active = true
            ORDER BY p.name
            LIMIT :limit OFFSET :skip
        """
        result = await db.execute(text(products_query), {
            "tid": tenant_id,
            "limit": limit,
            "skip": skip
        })
        products = result.fetchall()
        
        # Para cada produto, buscar variantes de duas formas
        debug_data = []
        for row in products:
            product_id = row[0]
            product_name = row[1]
            
            # Método 1: Via service (usado nos detalhes)
            variants_service = await variant_service.get_product_variants(product_id, tenant_id)
            
            # Método 2: Via SQL direto (usado no grouped)
            sql_query = """
                SELECT COUNT(*)
                FROM product_variants v
                WHERE v.product_id = :pid AND v.tenant_id = :tid AND v.is_active = true
            """
            result2 = await db.execute(text(sql_query), {"pid": product_id, "tid": tenant_id})
            count_sql = result2.scalar()
            
            debug_data.append({
                "product_id": product_id,
                "product_name": product_name,
                "service_variants_count": len(variants_service),
                "sql_variants_count": count_sql or 0,
                "service_variants": [{"id": v.id, "sku": v.sku, "size": v.size, "color": v.color, "is_active": v.is_active} for v in variants_service]
            })
        
        return {
            "total_products": len(debug_data),
            "discrepancies": [d for d in debug_data if d["service_variants_count"] != d["sql_variants_count"]],
            "data": debug_data
        }
        
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro no debug: {str(e)}\n{traceback.format_exc()}"
        )


@router.get(
    "/grouped",
    summary="Listar produtos agrupados por variantes",
    description="Agrupa produtos que compartilham o mesmo nome, mostrando todas as variantes (tamanhos/cores) em um único item"
)
async def list_grouped_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    category_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    has_stock: bool = Query(False),
    tenant_id: int = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lista produtos agrupados por nome principal com variantes.
    
    Ao invés de retornar "Legging - P", "Legging - M" como itens separados,
    retorna um item "Legging" com array de variantes.
    """
    try:
        params: dict = {"tid": tenant_id}
        
        # ── Passo 1: paginar product_ids (DISTINCT, sem multiplicar por variantes) ───
        id_query = """
            SELECT DISTINCT p.id
            FROM products p
            WHERE p.tenant_id = :tid AND p.is_catalog = false AND p.is_active = true
        """
        
        if category_id:
            id_query += " AND p.category_id = :cat_id"
            params["cat_id"] = category_id
        
        if search:
            id_query += " AND (p.name LIKE :search OR p.brand LIKE :search)"
            params["search"] = f"%{search}%"
        
        if has_stock:
            id_query += """
                AND EXISTS (
                    SELECT 1 FROM entry_items ei2
                    JOIN stock_entries se2 ON se2.id = ei2.entry_id
                    JOIN product_variants pv2 ON pv2.id = ei2.variant_id
                    WHERE pv2.product_id = p.id AND pv2.tenant_id = :tid
                    AND ei2.is_active = true AND se2.is_active = true AND ei2.quantity_remaining > 0
                )
            """
        
        id_query += " ORDER BY p.name LIMIT :limit OFFSET :skip"
        params["limit"] = limit
        params["skip"] = skip
        
        id_result = await db.execute(text(id_query), params)
        product_ids = [row[0] for row in id_result.fetchall()]
        
        if not product_ids:
            return []
        
        # ── Passo 2: buscar dados completos only para os IDs paginados ──────────────
        ids_placeholder = ",".join(str(i) for i in product_ids)
        data_query = f"""
            SELECT p.id, p.name, p.description, p.category_id, p.brand, p.gender, p.material,
                   p.is_digital, p.is_activewear, p.image_url, p.base_price,
                   p.created_at, p.updated_at,
                   v.id as variant_id, v.sku, v.size, v.color, v.price, v.cost_price,
                   COALESCE((
                       SELECT SUM(ei.quantity_remaining)
                       FROM entry_items ei
                       JOIN stock_entries se ON se.id = ei.entry_id
                       WHERE ei.variant_id = v.id AND ei.is_active = true AND se.is_active = true
                   ), 0) as variant_stock,
                   i.min_stock
            FROM products p
            LEFT JOIN product_variants v
                   ON p.id = v.product_id AND v.is_active = true AND v.tenant_id = :tid
            LEFT JOIN inventory i ON v.id = i.variant_id AND i.tenant_id = :tid
            WHERE p.id IN ({ids_placeholder})
            ORDER BY p.name, v.size, v.color
        """
        
        result = await db.execute(text(data_query), {"tid": tenant_id})
        rows = result.fetchall()
        
        # Agrupar por product_id (pai) para consolidar todas as variantes
        grouped = {}
        
        for row in rows:
            product_id = row[0]
            name = row[1]
            
            # Se ainda não existe grupo para este produto, criar
            if product_id not in grouped:
                grouped[product_id] = {
                    "id": product_id,
                    "name": name,
                    "description": row[2],
                    "category_id": row[3],
                    "brand": row[4],
                    "gender": row[5],
                    "material": row[6],
                    "is_digital": bool(row[7]),
                    "is_activewear": bool(row[8]),
                    "image_url": row[9],
                    "base_price": float(row[10]) if row[10] else None,
                    "created_at": row[11],
                    "updated_at": row[12],
                    "variants": [],
                    "variant_count": 0,
                    # total_stock acumulado a partir das variantes (FIFO real)
                    "total_stock": 0,
                    "min_price": None,
                    "max_price": None,
                    "min_stock_threshold": row[20] if row[20] is not None else None
                }
            
            # Adicionar variante se existir
            if row[13]:  # variant_id existe
                variant_stock = int(row[19]) if row[19] is not None else 0
                variant = {
                    "id": row[13],
                    "sku": row[14],
                    "size": row[15],
                    "color": row[16],
                    "price": float(row[17]) if row[17] else 0.0,
                    "cost_price": float(row[18]) if row[18] else None,
                    "current_stock": variant_stock,
                }
                grouped[product_id]["variants"].append(variant)
                grouped[product_id]["total_stock"] += variant_stock
                grouped[product_id]["min_stock_threshold"] = row[20] if row[20] is not None else grouped[product_id]["min_stock_threshold"]
                
                price = float(row[17]) if row[17] else 0.0
                if grouped[product_id]["min_price"] is None or price < grouped[product_id]["min_price"]:
                    grouped[product_id]["min_price"] = price
                if grouped[product_id]["max_price"] is None or price > grouped[product_id]["max_price"]:
                    grouped[product_id]["max_price"] = price
        
        # Converter para lista e contagem de variantes
        result_list = []
        for key, data in grouped.items():
            data["variant_count"] = len(data["variants"])
            # Se não tem min/max, usar base_price
            if data["min_price"] is None:
                data["min_price"] = data["base_price"] or 0
                data["max_price"] = data["base_price"] or 0
            result_list.append(data)
        
        return result_list
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao listar produtos agrupados: {str(e)}"
        )