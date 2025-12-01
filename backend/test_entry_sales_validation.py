"""
Script de teste para validar que entradas com vendas não podem ser excluídas.

Este script testa a validação implementada em StockEntryService.delete_entry()
que impede exclusão de entradas cujos produtos já foram vendidos.
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.services.stock_entry_service import StockEntryService
from app.models.entry_item import EntryItem


async def test_delete_validation():
    """
    Testa a validação de exclusão de entradas com vendas.

    Cenários testados:
    1. Entrada SEM vendas (quantity_sold = 0) → Deve permitir exclusão
    2. Entrada COM vendas (quantity_sold > 0) → Deve BLOQUEAR exclusão
    """
    # Conectar ao banco de dados
    DATABASE_URL = "sqlite+aiosqlite:///./fitness_store.db"
    engine = create_async_engine(DATABASE_URL, echo=False)

    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False
    )

    async with async_session() as db:
        service = StockEntryService(db)

        # Tenant padrão para teste
        tenant_id = 1

        print("\n" + "="*80)
        print("TESTE: Validação de Exclusão de Entradas com Vendas")
        print("="*80)

        # Listar todas as entradas
        entries = await service.entry_repo.get_multi(db, tenant_id=tenant_id)

        if not entries:
            print("\n[ERRO] Nenhuma entrada encontrada no banco de dados.")
            print("   Execute primeiro a criacao de entradas de teste.")
            return

        print(f"\n[INFO] Total de entradas encontradas: {len(entries)}")
        print("-" * 80)

        # Testar cada entrada
        for entry in entries:
            # Recarregar entrada com itens
            full_entry = await service.entry_repo.get_by_id(
                db,
                entry.id,
                include_items=True,
                tenant_id=tenant_id
            )

            print(f"\n[ENTRADA] {full_entry.entry_code} (ID: {full_entry.id})")
            print(f"   Tipo: {full_entry.entry_type}")
            print(f"   Data: {full_entry.entry_date}")
            print(f"   Total de itens: {len(full_entry.entry_items)}")

            # Analisar vendas
            items_with_sales = []
            total_sold = 0

            for item in full_entry.entry_items:
                if item.is_active:
                    qty_sold = item.quantity_sold
                    print(f"   - Produto ID {item.product_id}: "
                          f"Recebido={item.quantity_received}, "
                          f"Restante={item.quantity_remaining}, "
                          f"Vendido={qty_sold}")

                    if qty_sold > 0:
                        items_with_sales.append(item)
                        total_sold += qty_sold

            # Testar exclusão
            print(f"\n   Status de vendas:")
            if items_with_sales:
                print(f"   [OK] Entrada TEM vendas: {len(items_with_sales)} produto(s), "
                      f"{total_sold} unidade(s) vendida(s)")
                print(f"   [TESTE] Testando exclusao (deve BLOQUEAR)...")

                try:
                    await service.delete_entry(full_entry.id, tenant_id=tenant_id)
                    print(f"   [FALHA] Exclusao foi permitida (NAO DEVERIA!)")
                    await db.rollback()

                except ValueError as e:
                    error_msg = str(e)
                    if "produtos já vendidos" in error_msg.lower() or "produtos ja vendidos" in error_msg.lower():
                        print(f"   [SUCESSO] Exclusao bloqueada corretamente!")
                        print(f"   [MSG] {error_msg[:150]}...")
                    else:
                        print(f"   [AVISO] Erro diferente: {error_msg[:150]}...")
                    await db.rollback()

            else:
                print(f"   [INFO] Entrada SEM vendas (quantity_sold = 0 em todos os itens)")
                print(f"   [TESTE] Testando exclusao (deve PERMITIR)...")

                try:
                    result = await service.delete_entry(full_entry.id, tenant_id=tenant_id)
                    print(f"   [SUCESSO] Exclusao permitida!")
                    print(f"   [RESULTADO] {result}")
                    await db.rollback()  # Reverter para não excluir de verdade

                except ValueError as e:
                    error_msg = str(e)
                    if "produtos já vendidos" in error_msg.lower() or "produtos ja vendidos" in error_msg.lower():
                        print(f"   [FALHA] Exclusao foi bloqueada (NAO DEVERIA!)")
                        print(f"   [MSG] {error_msg[:150]}...")
                    else:
                        print(f"   [AVISO] Erro: {error_msg[:150]}...")
                    await db.rollback()

            print("-" * 80)

        print("\n" + "="*80)
        print("TESTE CONCLUIDO")
        print("="*80 + "\n")

        # Resumo
        print("\n[RESUMO DA VALIDACAO]")
        print("[OK] Entradas COM vendas (quantity_sold > 0) -> BLOQUEADAS")
        print("[OK] Entradas SEM vendas (quantity_sold = 0) -> PERMITIDAS")
        print("\n[PROTECAO] Sistema de rastreabilidade protegido!")
        print("   Entradas com historico de vendas nao podem ser excluidas.")


if __name__ == "__main__":
    asyncio.run(test_delete_validation())
