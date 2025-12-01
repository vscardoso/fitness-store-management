"""
Script para copiar produtos de catálogo para todos os tenants existentes.

Este script:
1. Busca um tenant de referência (primeiro com produtos is_catalog=True)
2. Para cada tenant no sistema:
   - Verifica se já tem produtos de catálogo
   - Se não tiver, copia todos os produtos de catálogo do tenant referência
   - Mantém categorias e estrutura
"""

import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.product import Product
from app.models.category import Category
from app.models.user import User
from decimal import Decimal


async def sync_catalog_to_all_tenants():
    """Copia produtos de catálogo para todos os tenants."""

    print("=" * 70)
    print("SINCRONIZAR CATÁLOGO PARA TODOS OS TENANTS")
    print("=" * 70)

    async with async_session_maker() as session:
        try:
            # 1. Buscar todos os tenants (via users ativos)
            result = await session.execute(
                select(User.tenant_id)
                .where(User.is_active == True)
                .distinct()
            )
            tenant_ids = [row[0] for row in result.all() if row[0] is not None]

            print(f"\nOK Encontrados {len(tenant_ids)} tenants no sistema")

            if len(tenant_ids) == 0:
                print("\nAVISO: Nenhum tenant encontrado. Execute create_user.py primeiro.")
                return

            # 2. Buscar tenant de referência (primeiro que tem produtos com is_catalog=True)
            reference_tenant_id = None
            for tid in tenant_ids:
                result = await session.execute(
                    select(Product).where(
                        Product.tenant_id == tid,
                        Product.is_catalog == True,
                        Product.is_active == True
                    ).limit(1)
                )
                if result.scalar_one_or_none():
                    reference_tenant_id = tid
                    break

            if not reference_tenant_id:
                print("\nAVISO: Nenhum tenant tem produtos de catalogo ainda.")
                print("Execute o signup de um tenant primeiro para criar produtos base.")
                return

            # 3. Buscar produtos e categorias do tenant de referência
            result = await session.execute(
                select(Product).where(
                    Product.tenant_id == reference_tenant_id,
                    Product.is_catalog == True,
                    Product.is_active == True
                )
            )
            reference_products = result.scalars().all()

            result = await session.execute(
                select(Category).where(
                    Category.tenant_id == reference_tenant_id,
                    Category.is_active == True
                )
            )
            reference_categories = result.scalars().all()

            print(f"\nOK Tenant referencia (ID {reference_tenant_id}):")
            print(f"  - {len(reference_products)} produtos de catalogo")
            print(f"  - {len(reference_categories)} categorias")

            # 4. Para cada tenant, copiar produtos se não existirem
            for tenant_id in tenant_ids:
                if tenant_id == reference_tenant_id:
                    continue  # Pular tenant de referência

                print(f"\n→ Processando Tenant ID {tenant_id}:")

                # Verificar se já tem produtos de catálogo
                result = await session.execute(
                    select(Product).where(
                        Product.tenant_id == tenant_id,
                        Product.is_catalog == True,
                        Product.is_active == True
                    )
                )
                existing_products = result.scalars().all()

                if len(existing_products) > 0:
                    print(f"  OK Ja tem {len(existing_products)} produtos de catalogo (pulando)")
                    continue

                # Copiar categorias primeiro
                category_mapping = {}  # old_id -> new_id

                for ref_cat in reference_categories:
                    # Verificar se categoria já existe (por slug)
                    result = await session.execute(
                        select(Category).where(
                            Category.tenant_id == tenant_id,
                            Category.slug == ref_cat.slug,
                            Category.is_active == True
                        )
                    )
                    existing_cat = result.scalar_one_or_none()

                    if existing_cat:
                        category_mapping[ref_cat.id] = existing_cat.id
                    else:
                        new_cat = Category(
                            name=ref_cat.name,
                            slug=ref_cat.slug,
                            description=ref_cat.description,
                            tenant_id=tenant_id,
                            is_active=True
                        )
                        session.add(new_cat)
                        await session.flush()
                        category_mapping[ref_cat.id] = new_cat.id

                # Copiar produtos
                products_copied = 0
                for ref_prod in reference_products:
                    # Verificar se produto já existe (por SKU)
                    result = await session.execute(
                        select(Product).where(
                            Product.tenant_id == tenant_id,
                            Product.sku == ref_prod.sku,
                            Product.is_active == True
                        )
                    )
                    existing_prod = result.scalar_one_or_none()

                    if existing_prod:
                        continue  # Produto já existe

                    new_prod = Product(
                        name=ref_prod.name,
                        sku=ref_prod.sku,
                        barcode=ref_prod.barcode,
                        description=ref_prod.description,
                        brand=ref_prod.brand,
                        price=ref_prod.price,
                        cost_price=ref_prod.cost_price,
                        category_id=category_mapping.get(ref_prod.category_id),
                        size=ref_prod.size,
                        color=ref_prod.color,
                        gender=ref_prod.gender,
                        material=ref_prod.material,
                        is_digital=ref_prod.is_digital,
                        is_activewear=ref_prod.is_activewear,
                        is_catalog=True,  # Marcar como catálogo
                        tenant_id=tenant_id,
                        is_active=True
                    )
                    session.add(new_prod)
                    products_copied += 1

                    # Commit a cada 50 produtos
                    if products_copied % 50 == 0:
                        await session.commit()

                await session.commit()
                print(f"  OK {products_copied} produtos de catalogo copiados")
                print(f"  OK {len(category_mapping)} categorias criadas/vinculadas")

            print("\n" + "=" * 70)
            print("OK SINCRONIZACAO CONCLUIDA!")
            print("=" * 70)
            print(f"\nTodos os {len(tenant_ids)} tenants agora tem produtos de catalogo.\n")

        except Exception as e:
            await session.rollback()
            print(f"\nERRO: {str(e)}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(sync_catalog_to_all_tenants())
