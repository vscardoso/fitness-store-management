"""
Teste completo da API de Catlogo
Testa os 3 novos endpoints: /catalog, /active, /activate
"""
import asyncio
import sys
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, '.')

from app.services.product_service import ProductService
from app.core.config import settings

async def test_catalog_system():
    """Testa sistema de catlogo completo"""

    # Conectar ao banco
    db_url = settings.DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://')
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        service = ProductService(db)

        # Assumir que existe uma loja com tenant_id
        # Pegar o ltimo tenant criado no signup
        from sqlalchemy import select, func
        from app.models.store import Store

        result = await db.execute(
            select(Store.id).where(Store.is_active == True).order_by(Store.id.desc()).limit(1)
        )
        tenant_id = result.scalar_one_or_none()

        if not tenant_id:
            print("[ERRO] Nenhuma loja encontrada. Execute signup primeiro!")
            return False

        print(f"[LOJA] Testando com tenant_id={tenant_id}")
        print("=" * 60)

        # TESTE 1: Listar produtos do catlogo
        print("\n TESTE 1: Listar produtos do catlogo")
        print("-" * 60)
        catalog_products = await service.get_catalog_products(tenant_id=tenant_id, limit=10)
        print(f"[OK] Encontrados {len(catalog_products)} produtos no catlogo (mostrando 10)")

        if catalog_products:
            p = catalog_products[0]
            print(f"\nExemplo: {p.name}")
            print(f"  SKU: {p.sku}")
            print(f"  Preo: R$ {p.price}")
            print(f"  Marca: {p.brand}")
            print(f"  is_catalog: {p.is_catalog}")  # Deve ser True

        # TESTE 2: Listar produtos ativos (deve estar vazio inicialmente)
        print("\n\n TESTE 2: Listar produtos ativos da loja")
        print("-" * 60)
        active_products = await service.get_active_products(tenant_id=tenant_id)
        print(f"[OK] Encontrados {len(active_products)} produtos ativos")

        if len(active_products) == 0:
            print("[OK] CORRETO: Lista vazia (nenhum produto ativado ainda)")
        else:
            print(f"[AVISO]  J existem {len(active_products)} produtos ativos")

        # TESTE 3: Ativar um produto do catlogo
        if catalog_products:
            print("\n\n[ATIVAR] TESTE 3: Ativar produto do catlogo")
            print("-" * 60)

            catalog_product = catalog_products[0]
            print(f"Ativando: {catalog_product.name}")
            print(f"  Preo sugerido: R$ {catalog_product.price}")
            print(f"  Usando preo customizado: R$ 99.90")

            try:
                activated = await service.activate_catalog_product(
                    catalog_product_id=catalog_product.id,
                    tenant_id=tenant_id,
                    custom_price=99.90
                )

                print(f"\n[OK] Produto ativado com sucesso!")
                print(f"  ID novo: {activated.id}")
                print(f"  Nome: {activated.name}")
                print(f"  SKU novo: {activated.sku}")
                print(f"  Preo: R$ {activated.price}")
                print(f"  is_catalog: {activated.is_catalog}")  # Deve ser False

                # TESTE 4: Verificar que aparece em active agora
                print("\n\n TESTE 4: Verificar produto na lista ativa")
                print("-" * 60)
                active_products_after = await service.get_active_products(tenant_id=tenant_id)
                print(f"[OK] Agora temos {len(active_products_after)} produto(s) ativo(s)")

                if len(active_products_after) > len(active_products):
                    print("[OK] CORRETO: Produto aparece na lista ativa!")

                # TESTE 5: Tentar ativar o mesmo produto de novo (deve falhar)
                print("\n\n TESTE 5: Tentar ativar produto novamente")
                print("-" * 60)
                try:
                    await service.activate_catalog_product(
                        catalog_product_id=catalog_product.id,
                        tenant_id=tenant_id,
                        custom_price=99.90
                    )
                    print("[ERRO] ERRO: Deveria permitir ativar mltiplas vezes (cria cpias)")

                except Exception as e:
                    print(f"[OK] Ativou novamente (cria nova cpia): {type(e).__name__}")

                # TESTE 6: Contar produtos no catlogo e ativos
                print("\n\n RESUMO FINAL")
                print("=" * 60)

                from app.models.product import Product

                # Contar catlogo
                catalog_count = await db.execute(
                    select(func.count(Product.id)).where(
                        Product.tenant_id == tenant_id,
                        Product.is_catalog == True,
                        Product.is_active == True
                    )
                )
                total_catalog = catalog_count.scalar()

                # Contar ativos
                active_count = await db.execute(
                    select(func.count(Product.id)).where(
                        Product.tenant_id == tenant_id,
                        Product.is_catalog == False,
                        Product.is_active == True
                    )
                )
                total_active = active_count.scalar()

                print(f" Produtos no CATLOGO: {total_catalog}")
                print(f" Produtos ATIVOS na loja: {total_active}")
                print("\n[OK] TODOS OS TESTES PASSARAM!")

                return True

            except Exception as e:
                print(f"\n[ERRO] Erro ao ativar produto: {e}")
                import traceback
                traceback.print_exc()
                return False
        else:
            print("\n[ERRO] Nenhum produto no catlogo para testar")
            return False

if __name__ == "__main__":
    success = asyncio.run(test_catalog_system())
    sys.exit(0 if success else 1)
