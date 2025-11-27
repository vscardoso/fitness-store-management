"""
Teste de fluxo completo: Catálogo → Entrada → Exclusão → Catálogo
"""
import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.product import Product
from app.models.stock_entry import StockEntry
from app.services.stock_entry_service import StockEntryService
from app.schemas.stock_entry import StockEntryCreate
from app.schemas.entry_item import EntryItemCreate
from app.models.stock_entry import EntryType
from datetime import date, datetime


def get_test_code():
    return f"TEST-CATALOG-{datetime.now().strftime('%H%M%S')}"


async def test():
    print("=" * 70)
    print("TESTE: CATÁLOGO → ENTRADA → EXCLUSÃO → CATÁLOGO")
    print("=" * 70)
    
    tenant_id = 2
    user_id = 1
    
    async with async_session_maker() as db:
        # 1. Buscar produto de catálogo
        print("\n📦 ETAPA 1: Buscar produto de catálogo")
        result = await db.execute(
            select(Product).where(
                Product.tenant_id == tenant_id,
                Product.is_catalog == True,
                Product.is_active == True
            ).limit(1)
        )
        catalog_product = result.scalar_one_or_none()
        
        if not catalog_product:
            print("❌ Nenhum produto de catálogo encontrado")
            return
        
        print(f"   Produto: {catalog_product.name} (ID: {catalog_product.id})")
        print(f"   is_catalog: {catalog_product.is_catalog}")
        print(f"   is_active: {catalog_product.is_active}")
        
        # 2. Criar entrada com este produto
        print("\n📥 ETAPA 2: Criar entrada com produto do catálogo")
        service = StockEntryService(db)
        
        entry_code = get_test_code()
        entry_data = StockEntryCreate(
            entry_code=entry_code,
            entry_date=date.today(),
            entry_type=EntryType.LOCAL,
            supplier_name="Teste Catálogo",
            supplier_cnpj="12.345.678/0001-90",
            payment_method="PIX",
            notes="Teste de roundtrip catálogo"
        )
        
        items_data = [
            EntryItemCreate(
                product_id=catalog_product.id,
                quantity_received=50,
                unit_cost=30.00,
                notes="Teste"
            )
        ]
        
        entry = await service.create_entry(
            entry_data,
            items=items_data,
            user_id=user_id,
            tenant_id=tenant_id
        )
        await db.commit()
        await db.refresh(catalog_product)
        
        print(f"   Entrada criada: {entry.entry_code} (ID: {entry.id})")
        print(f"   Produto is_catalog: {catalog_product.is_catalog} (deve ser False)")
        print(f"   Produto is_active: {catalog_product.is_active} (deve ser True)")
        
        if catalog_product.is_catalog:
            print("   ❌ ERRO: Produto ainda está marcado como catálogo!")
            return
        
        # 3. Excluir entrada
        print("\n🗑️  ETAPA 3: Excluir entrada")
        result = await service.delete_entry(entry.id, tenant_id=tenant_id)
        await db.commit()
        await db.refresh(catalog_product)
        
        print(f"   Entrada excluída: {result['entry_code']}")
        print(f"   Produtos órfãos: {result['orphan_products_deleted']}")
        print(f"   Produto is_catalog: {catalog_product.is_catalog} (deve ser True)")
        print(f"   Produto is_active: {catalog_product.is_active} (deve ser True)")
        
        if not catalog_product.is_catalog:
            print("   ❌ ERRO: Produto não voltou para o catálogo!")
            return
        
        if not catalog_product.is_active:
            print("   ❌ ERRO: Produto foi desativado em vez de voltar ao catálogo!")
            return
        
        print("\n" + "=" * 70)
        print("✅ TESTE PASSOU! Produto voltou corretamente para o catálogo")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(test())
