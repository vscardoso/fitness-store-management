"""
Script para corrigir tenant_id de EntryItems que estão NULL.

Problema:
- EntryItems criados sem tenant_id (valor NULL)
- Causa erro 400: "EntryItem X não pertence a este tenant"

Solução:
- Buscar EntryItems com tenant_id NULL
- Atualizar com tenant_id da StockEntry relacionada
"""

import asyncio
from sqlalchemy import select, update, text
from app.core.database import async_session_maker
from app.models.entry_item import EntryItem
from app.models.stock_entry import StockEntry


async def fix_entry_items_tenant():
    """Corrige tenant_id de EntryItems que estão NULL."""
    
    async with async_session_maker() as db:
        try:
            # Buscar EntryItems com tenant_id NULL
            result = await db.execute(
                text("""
                    SELECT 
                        ei.id,
                        ei.entry_id,
                        ei.product_id,
                        se.tenant_id as correct_tenant_id
                    FROM entry_items ei
                    JOIN stock_entries se ON ei.entry_id = se.id
                    WHERE ei.tenant_id IS NULL
                    ORDER BY ei.id
                """)
            )
            items = result.fetchall()
            
            if not items:
                print("\n✅ Nenhum EntryItem com tenant_id NULL encontrado")
                return
            
            print(f"\n📋 Encontrados {len(items)} EntryItems com tenant_id NULL:\n")
            print(f"{'ID':<6} {'Entry':<8} {'Product':<10} {'Correct Tenant':<15}")
            print("-" * 50)
            
            for item in items:
                print(f"{item[0]:<6} {item[1]:<8} {item[2]:<10} {item[3]:<15}")
            
            print(f"\n⚠️  Deseja corrigir esses {len(items)} EntryItems? (S/N): ", end="")
            confirmation = input().strip().upper()
            
            if confirmation != 'S':
                print("\n❌ Operação cancelada")
                return
            
            # Atualizar cada EntryItem
            updated = 0
            for item in items:
                await db.execute(
                    update(EntryItem)
                    .where(EntryItem.id == item[0])
                    .values(tenant_id=item[3])
                )
                updated += 1
            
            await db.commit()
            
            print(f"\n✅ {updated} EntryItems corrigidos com sucesso!")
            print("\n🔍 Validando correção...\n")
            
            # Validar que não há mais NULL
            result = await db.execute(
                text("SELECT COUNT(*) FROM entry_items WHERE tenant_id IS NULL")
            )
            remaining = result.scalar()
            
            if remaining == 0:
                print("✅ Validação OK: Nenhum EntryItem com tenant_id NULL")
            else:
                print(f"⚠️  Ainda existem {remaining} EntryItems com tenant_id NULL")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ Erro ao corrigir EntryItems: {e}")
            raise


if __name__ == "__main__":
    print("=" * 50)
    print("  CORREÇÃO DE TENANT_ID EM ENTRYITEMS")
    print("=" * 50)
    asyncio.run(fix_entry_items_tenant())
