"""
Script de migração de dados: sincroniza is_catalog para todos os produtos existentes.

Para cada produto: se FIFO sum > 0 → is_catalog=False, senão is_catalog=True.

Uso:
    python sync_is_catalog.py
"""
import asyncio
from sqlalchemy import select, text
from app.core.database import async_session_maker as AsyncSessionLocal
from app.models.product import Product
from app.services.inventory_service import InventoryService


async def main():
    async with AsyncSessionLocal() as db:
        # Buscar todos os tenants ativos
        result = await db.execute(text("SELECT DISTINCT tenant_id FROM products WHERE is_active = true"))
        tenant_ids = [row[0] for row in result.fetchall() if row[0]]

        print(f"Sincronizando is_catalog para {len(tenant_ids)} tenants...")

        svc = InventoryService(db)
        total_with_stock = 0
        total_without_stock = 0

        for tenant_id in tenant_ids:
            deltas = await svc.rebuild_all_from_fifo(tenant_id=tenant_id)
            # Contar produtos
            result = await db.execute(
                select(Product.id, Product.is_catalog)
                .where(Product.tenant_id == tenant_id, Product.is_active == True)
            )
            rows = result.fetchall()
            with_stock = sum(1 for _, is_cat in rows if not is_cat)
            without_stock = sum(1 for _, is_cat in rows if is_cat)
            total_with_stock += with_stock
            total_without_stock += without_stock
            print(f"  Tenant {tenant_id}: {with_stock} com estoque, {without_stock} sem estoque")

        print(f"\nTotal: {total_with_stock} produtos ativos (com estoque), {total_without_stock} sem estoque")
        print("Sincronização concluída.")


if __name__ == "__main__":
    asyncio.run(main())
