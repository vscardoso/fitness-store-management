"""
Script de migracao: Criar entradas iniciais para produtos existentes.

Este script cria entradas do tipo INITIAL_INVENTORY para todos os produtos
que ja existem no sistema mas nao estao vinculados a nenhuma entrada.

Garante que TODO produto tenha rastreabilidade desde o inicio.
"""
import asyncio
import sys
from datetime import date
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from app.core.database import async_session_maker
from app.models.product import Product
from app.models.inventory import Inventory
from app.models.stock_entry import StockEntry, EntryType
from app.models.entry_item import EntryItem
from app.repositories.stock_entry_repository import StockEntryRepository
from app.repositories.entry_item_repository import EntryItemRepository


async def migrate_products_to_entries():
    """
    Migra produtos existentes para o novo sistema de entradas.

    Para cada produto que tem estoque mas nao tem entry_item:
    1. Cria uma entrada do tipo INITIAL_INVENTORY
    2. Cria um entry_item vinculando o produto a entrada
    3. Registra a quantidade atual como quantity_received e quantity_remaining
    """
    print("Iniciando migracao de produtos para sistema de entradas...")
    print("=" * 70)

    async with async_session_maker() as db:
        try:
            # Buscar todos os produtos ativos
            result = await db.execute(
                select(Product)
                .where(Product.is_active == True)
                .order_by(Product.id)
            )
            products = result.scalars().all()

            print(f"[*] Encontrados {len(products)} produtos ativos")
            print()

            migrated = 0
            skipped = 0
            errors = 0

            for product in products:
                try:
                    # Buscar inventario do produto
                    inv_result = await db.execute(
                        select(Inventory).where(Inventory.product_id == product.id)
                    )
                    inventory = inv_result.scalar_one_or_none()

                    if not inventory or inventory.quantity == 0:
                        print(f"[SKIP] [{product.sku}] Sem estoque - pulando")
                        skipped += 1
                        continue

                    # Verificar se ja existe entry_item para este produto
                    existing_items = await db.execute(
                        select(EntryItem).where(EntryItem.product_id == product.id)
                    )
                    if existing_items.scalars().first():
                        print(f"[OK] [{product.sku}] Ja tem entrada vinculada - pulando")
                        skipped += 1
                        continue

                    # Produto tem estoque mas nao tem entrada - MIGRAR!
                    print(f"[MIGRATE] [{product.sku}] Criando entrada inicial...")
                    print(f"   Nome: {product.name}")
                    print(f"   Estoque atual: {inventory.quantity} unidades")
                    print(f"   Custo: {product.cost_price or 'Nao informado'}")

                    # Criar entrada inicial
                    entry_code = f"INIT-{product.sku}-MIGRATION"
                    entry = StockEntry(
                        entry_code=entry_code,
                        entry_date=date.today(),
                        entry_type=EntryType.INITIAL_INVENTORY,
                        supplier_name="Migracao do Sistema",
                        notes=(
                            f"Entrada automatica criada na migracao para o novo sistema.\n"
                            f"Produto: {product.name} (SKU: {product.sku})\n"
                            f"Estoque existente: {inventory.quantity} unidades"
                        ),
                        total_cost=Decimal("0.00"),
                        tenant_id=product.tenant_id,
                    )
                    db.add(entry)
                    await db.flush()  # Para obter o entry.id

                    # Criar entry_item
                    unit_cost = product.cost_price or Decimal("0.00")
                    item = EntryItem(
                        entry_id=entry.id,
                        product_id=product.id,
                        quantity_received=inventory.quantity,
                        quantity_remaining=inventory.quantity,
                        unit_cost=unit_cost,
                        notes="Item de migracao - estoque inicial",
                        tenant_id=product.tenant_id,
                    )
                    db.add(item)

                    # Atualizar total_cost da entrada
                    entry.total_cost = item.total_cost

                    await db.commit()

                    print(f"   [OK] Entrada criada: {entry_code}")
                    print(f"   [OK] Item vinculado - ID: {item.id}")
                    print(f"   [$$] Custo total: R$ {item.total_cost}")
                    print()

                    migrated += 1

                except Exception as e:
                    print(f"   [ERROR] ERRO: {str(e)}")
                    print()
                    errors += 1
                    await db.rollback()
                    continue

            # Sumario
            print("=" * 70)
            print("RESUMO DA MIGRACAO")
            print("=" * 70)
            print(f"[OK] Produtos migrados: {migrated}")
            print(f"[SKIP] Produtos pulados: {skipped}")
            print(f"[ERROR] Erros: {errors}")
            print()

            if migrated > 0:
                print("[SUCCESS] Migracao concluida com sucesso!")
                print("   Todos os produtos com estoque agora tem entrada vinculada.")
            else:
                print("[INFO] Nenhum produto precisou ser migrado.")

        except Exception as e:
            print(f"[FATAL] ERRO FATAL: {str(e)}")
            await db.rollback()
            sys.exit(1)


if __name__ == "__main__":
    print("""
    ==================================================================
         MIGRACAO: Produtos -> Sistema de Entradas com Rastreabilidade
    ==================================================================

    Este script cria entradas do tipo INITIAL_INVENTORY para produtos
    que ja existem no sistema mas nao estao vinculados a entradas.

    [!] ATENCAO: Execute este script APENAS UMA VEZ!

    """)

    response = input("Deseja continuar? (sim/nao): ").strip().lower()
    if response not in ['sim', 's', 'yes', 'y']:
        print("[X] Migracao cancelada pelo usuario.")
        sys.exit(0)

    asyncio.run(migrate_products_to_entries())
