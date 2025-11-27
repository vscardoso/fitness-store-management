"""
Script para testar fluxo completo de entrada de estoque:
1. Criar entrada com produto
2. Vincular ao tenant do usuário vscardoso2005@gmail.com
3. Validar criação
4. Excluir entrada
5. Validar exclusão e limpeza
"""

import asyncio
from datetime import date, datetime
from sqlalchemy import select, func
from app.core.database import async_session_maker
from app.models.user import User
from app.models.product import Product
from app.models.stock_entry import StockEntry
from app.models.entry_item import EntryItem
from app.models.inventory import Inventory
from app.services.stock_entry_service import StockEntryService
from app.schemas.stock_entry import StockEntryCreate
from app.schemas.entry_item import EntryItemCreate
from app.models.stock_entry import EntryType


def get_test_entry_code():
    """Gera código único para entrada de teste"""
    return f"TEST-{datetime.now().strftime('%Y%m%d-%H%M%S')}"


async def get_user_tenant() -> tuple[int, str, int]:
    """Buscar tenant_id e user_id do usuário vscardoso2005@gmail.com"""
    async with async_session_maker() as db:
        result = await db.execute(
            select(User).where(User.email == "vscardoso2005@gmail.com")
        )
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("Usuário vscardoso2005@gmail.com não encontrado")
        return user.tenant_id, user.full_name, user.id


async def get_or_create_test_product(tenant_id: int) -> int:
    """Buscar ou criar produto de teste"""
    async with async_session_maker() as db:
        # Buscar produto de teste existente (mesmo inativo)
        result = await db.execute(
            select(Product).where(
                Product.sku == "TEST-FLOW-001",
                Product.tenant_id == tenant_id
            )
        )
        product = result.scalar_one_or_none()
        
        if product:
            # Se estiver inativo, reativar
            if not product.is_active:
                product.is_active = True
                await db.commit()
                print(f"   ✅ Produto reativado: {product.name} (ID: {product.id})")
            else:
                print(f"   ✅ Produto existente encontrado: {product.name} (ID: {product.id})")
            return product.id
        
        # Criar novo produto
        product = Product(
            name="Produto Teste Flow",
            sku="TEST-FLOW-001",
            barcode="TEST-FLOW-001",
            price=100.00,
            cost_price=50.00,
            category_id=1,  # Categoria padrão
            tenant_id=tenant_id,
            is_catalog=False
        )
        db.add(product)
        await db.commit()
        await db.refresh(product)
        
        print(f"   ✅ Produto criado: {product.name} (ID: {product.id})")
        return product.id


async def validate_before_creation(tenant_id: int):
    """Validar estado antes da criação"""
    async with async_session_maker() as db:
        # Contar entries ativas
        result = await db.execute(
            select(func.count(StockEntry.id)).where(
                StockEntry.tenant_id == tenant_id,
                StockEntry.is_active == True
            )
        )
        entries_count = result.scalar()
        
        # Contar entry_items ativos
        result = await db.execute(
            select(func.count(EntryItem.id)).where(
                EntryItem.tenant_id == tenant_id,
                EntryItem.is_active == True
            )
        )
        items_count = result.scalar()
        
        print(f"   📊 Entries ativas: {entries_count}")
        print(f"   📊 Entry items ativos: {items_count}")
        
        return entries_count, items_count


async def create_test_entry(tenant_id: int, product_id: int, user_id: int) -> tuple[int, str]:
    """Criar entrada de teste - retorna (entry_id, entry_code)"""
    async with async_session_maker() as db:
        service = StockEntryService(db)
        
        # Gerar código único para evitar conflitos
        entry_code = get_test_entry_code()
        
        entry_data = StockEntryCreate(
            entry_code=entry_code,
            entry_date=date.today(),
            entry_type=EntryType.LOCAL,
            supplier_name="Fornecedor Teste Flow",
            supplier_cnpj="12.345.678/0001-90",
            payment_method="PIX",
            notes="Entrada criada para teste de fluxo"
        )
        
        items_data = [
            EntryItemCreate(
                product_id=product_id,
                quantity_received=10,
                unit_cost=50.00,
                notes="Item de teste"
            )
        ]
        
        entry = await service.create_entry(
            entry_data, 
            items=items_data,
            user_id=user_id,
            tenant_id=tenant_id
        )
        await db.commit()
        
        return entry.id, entry_code


async def validate_after_creation(tenant_id: int, entry_id: int, product_id: int):
    """Validar estado após criação"""
    async with async_session_maker() as db:
        # Verificar entrada
        result = await db.execute(
            select(StockEntry).where(
                StockEntry.id == entry_id,
                StockEntry.tenant_id == tenant_id
            )
        )
        entry = result.scalar_one_or_none()
        if not entry or not entry.is_active:
            raise ValueError("❌ Entrada não encontrada ou inativa")
        print(f"   ✅ Entrada criada: {entry.entry_code}")
        
        # Verificar entry_items
        result = await db.execute(
            select(EntryItem).where(
                EntryItem.entry_id == entry_id,
                EntryItem.tenant_id == tenant_id,
                EntryItem.is_active == True
            )
        )
        items = result.scalars().all()
        if len(items) != 1:
            raise ValueError(f"❌ Esperado 1 item, encontrado {len(items)}")
        
        item = items[0]
        print(f"   ✅ Entry item criado: Qty={item.quantity_received}, Remaining={item.quantity_remaining}")
        
        # Verificar inventário
        result = await db.execute(
            select(Inventory).where(
                Inventory.product_id == product_id,
                Inventory.tenant_id == tenant_id
            )
        )
        inventory = result.scalar_one_or_none()
        if not inventory:
            raise ValueError("❌ Inventário não criado")
        
        print(f"   ✅ Inventário atualizado: Quantity={inventory.quantity}")
        
        if inventory.quantity != 10:
            raise ValueError(f"❌ Quantidade incorreta no inventário: {inventory.quantity} (esperado: 10)")
        
        return item.id


async def delete_test_entry(tenant_id: int, entry_id: int):
    """Deletar entrada de teste"""
    async with async_session_maker() as db:
        service = StockEntryService(db)
        result = await service.delete_entry(entry_id, tenant_id=tenant_id)
        await db.commit()
        return result


async def validate_after_deletion(tenant_id: int, entry_id: int, item_id: int, product_id: int, initial_orphans: int):
    """Validar estado após exclusão"""
    async with async_session_maker() as db:
        # Verificar entrada (deve estar inativa)
        result = await db.execute(
            select(StockEntry).where(StockEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if not entry:
            raise ValueError("❌ Entrada não encontrada")
        if entry.is_active:
            raise ValueError("❌ Entrada ainda está ativa")
        print(f"   ✅ Entrada desativada: {entry.entry_code}")
        
        # Verificar entry_item (deve estar inativo e com quantity_remaining = 0)
        result = await db.execute(
            select(EntryItem).where(EntryItem.id == item_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("❌ Entry item não encontrado")
        if item.is_active:
            raise ValueError("❌ Entry item ainda está ativo")
        if item.quantity_remaining != 0:
            raise ValueError(f"❌ Entry item ainda tem estoque: {item.quantity_remaining}")
        print(f"   ✅ Entry item desativado e zerado")
        
        # Verificar inventário (deve estar zerado)
        result = await db.execute(
            select(Inventory).where(
                Inventory.product_id == product_id,
                Inventory.tenant_id == tenant_id
            )
        )
        inventory = result.scalar_one_or_none()
        if not inventory:
            print(f"   ⚠️  Inventário não encontrado (pode ter sido excluído)")
        else:
            if inventory.quantity != 0:
                raise ValueError(f"❌ Inventário não foi zerado: {inventory.quantity}")
            print(f"   ✅ Inventário zerado: Quantity={inventory.quantity}")
        
        # Verificar que não há entry_items órfãos NOVOS
        result = await db.execute(
            select(func.count(EntryItem.id)).where(
                EntryItem.tenant_id == tenant_id,
                EntryItem.is_active == True,
                EntryItem.quantity_remaining > 0
            )
        )
        orphan_count = result.scalar()
        if orphan_count > initial_orphans:
            raise ValueError(f"❌ Existem {orphan_count - initial_orphans} entry_items órfãos NOVOS (total: {orphan_count}, inicial: {initial_orphans})")
        print(f"   ✅ Nenhum entry_item órfão novo (total atual: {orphan_count}, inicial: {initial_orphans})")


async def main():
    """Executar teste completo"""
    print("=" * 70)
    print("🧪 TESTE DE FLUXO: CRIAR E EXCLUIR ENTRADA")
    print("=" * 70)
    
    try:
        # 1. Buscar tenant
        print("\n📍 ETAPA 1: Buscar tenant do usuário")
        tenant_id, user_name, user_id = await get_user_tenant()
        print(f"   ✅ Tenant ID: {tenant_id} ({user_name})")
        
        # 2. Validar estado inicial
        print("\n📍 ETAPA 2: Validar estado inicial")
        initial_entries, initial_items = await validate_before_creation(tenant_id)
        
        # Contar entry_items órfãos iniciais
        async with async_session_maker() as db:
            result = await db.execute(
                select(func.count(EntryItem.id)).where(
                    EntryItem.tenant_id == tenant_id,
                    EntryItem.is_active == True,
                    EntryItem.quantity_remaining > 0
                )
            )
            initial_orphans = result.scalar()
        print(f"   📊 Entry items órfãos iniciais: {initial_orphans}")
        
        # 3. Criar ou buscar produto
        print("\n📍 ETAPA 3: Preparar produto de teste")
        product_id = await get_or_create_test_product(tenant_id)
        
        # 4. Criar entrada
        print("\n📍 ETAPA 4: Criar entrada de estoque")
        entry_id, entry_code = await create_test_entry(tenant_id, product_id, user_id)
        print(f"   ✅ Entrada criada com código: {entry_code} (ID: {entry_id})")
        
        # 5. Validar criação
        print("\n📍 ETAPA 5: Validar criação")
        item_id = await validate_after_creation(tenant_id, entry_id, product_id)
        
        # 6. Validar estado intermediário
        print("\n📍 ETAPA 6: Validar estado após criação")
        current_entries, current_items = await validate_before_creation(tenant_id)
        if current_entries != initial_entries + 1:
            raise ValueError(f"❌ Número de entries incorreto: {current_entries} (esperado: {initial_entries + 1})")
        if current_items != initial_items + 1:
            raise ValueError(f"❌ Número de items incorreto: {current_items} (esperado: {initial_items + 1})")
        
        # 7. Deletar entrada
        print("\n📍 ETAPA 7: Excluir entrada")
        delete_result = await delete_test_entry(tenant_id, entry_id)
        print(f"   ✅ Entrada excluída com sucesso")
        print(f"   📊 Produtos órfãos excluídos: {delete_result['orphan_products_deleted']}")
        print(f"   📊 Estoque removido: {delete_result['total_stock_removed']} unidades")
        
        # 8. Validar exclusão
        print("\n📍 ETAPA 8: Validar exclusão")
        await validate_after_deletion(tenant_id, entry_id, item_id, product_id, initial_orphans)
        
        # 9. Validar estado final
        print("\n📍 ETAPA 9: Validar estado final")
        final_entries, final_items = await validate_before_creation(tenant_id)
        if final_entries != initial_entries:
            raise ValueError(f"❌ Número de entries não voltou ao inicial: {final_entries} (esperado: {initial_entries})")
        if final_items != initial_items:
            raise ValueError(f"❌ Número de items não voltou ao inicial: {final_items} (esperado: {initial_items})")
        
        print("\n" + "=" * 70)
        print("✅ TESTE COMPLETO: TODOS OS PASSOS EXECUTADOS COM SUCESSO!")
        print("=" * 70)
        print("\n📋 Resumo:")
        print(f"   • Entrada criada e excluída: TEST-FLOW-001")
        print(f"   • Produto: {product_id}")
        print(f"   • Tenant: {tenant_id} ({user_name})")
        print(f"   • Entry items: criado e desativado corretamente")
        print(f"   • Inventário: atualizado e zerado corretamente")
        print(f"   • Sem entry_items órfãos")
        print("\n✅ Sistema funcionando corretamente!")
        
        return 0
        
    except Exception as e:
        print("\n" + "=" * 70)
        print(f"❌ TESTE FALHOU: {e}")
        print("=" * 70)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
