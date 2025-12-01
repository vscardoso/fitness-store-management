"""
Script para limpar todas as tabelas EXCETO customers.

AVISO: Este script deleta PERMANENTEMENTE:
- Todas as vendas (sales, sale_items, payments)
- Todas as entradas de estoque (stock_entries, entry_items)
- Todos os produtos (products)
- Todo o inventário (inventory)
- Todas as viagens (trips)
- Categorias (categories)

MANTÉM:
- Clientes (customers)
- Usuários (users)
"""

import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker


async def clean_database():
    """Limpa todas as tabelas exceto customers e users."""

    print("=" * 60)
    print("LIMPEZA DE BANCO DE DADOS")
    print("=" * 60)
    print("\nATENCAO: Este script vai DELETAR PERMANENTEMENTE:")
    print("  - Vendas")
    print("  - Entradas de estoque")
    print("  - Produtos")
    print("  - Inventario")
    print("  - Viagens")
    print("  - Categorias")
    print("\nMANTEM:")
    print("  - Clientes")
    print("  - Usuarios")
    print("\n" + "=" * 60)

    confirm = input("\nDigite 'CONFIRMAR' para continuar: ")
    if confirm != "CONFIRMAR":
        print("\nOperacao cancelada pelo usuario.")
        return

    async with async_session_maker() as session:
        try:
            print("\nIniciando limpeza...\n")

            # Ordem correta de exclusão (respeita foreign keys)

            # 1. Pagamentos (dependem de sales)
            result = await session.execute(text("DELETE FROM payments"))
            print(f"OK Deletados {result.rowcount} pagamentos")

            # 2. Items de venda (dependem de sales e products)
            result = await session.execute(text("DELETE FROM sale_items"))
            print(f"OK Deletados {result.rowcount} itens de venda")

            # 3. Vendas (dependem de customers e users)
            result = await session.execute(text("DELETE FROM sales"))
            print(f"OK Deletadas {result.rowcount} vendas")

            # 4. Items de entrada (dependem de stock_entries e products)
            result = await session.execute(text("DELETE FROM entry_items"))
            print(f"OK Deletados {result.rowcount} itens de entrada")

            # 5. Entradas de estoque (dependem de trips)
            result = await session.execute(text("DELETE FROM stock_entries"))
            print(f"OK Deletadas {result.rowcount} entradas de estoque")

            # 6. Inventario (depende de products)
            result = await session.execute(text("DELETE FROM inventory"))
            print(f"OK Deletados {result.rowcount} registros de inventario")

            # 7. Produtos (dependem de categories e batches)
            result = await session.execute(text("DELETE FROM products"))
            print(f"OK Deletados {result.rowcount} produtos")

            # 8. Viagens
            result = await session.execute(text("DELETE FROM trips"))
            print(f"OK Deletadas {result.rowcount} viagens")

            # 9. Categorias
            result = await session.execute(text("DELETE FROM categories"))
            print(f"OK Deletadas {result.rowcount} categorias")

            # Commit
            await session.commit()

            # Verificação final
            print("\n" + "=" * 60)
            print("VERIFICAÇÃO FINAL")
            print("=" * 60 + "\n")

            # Contar registros restantes
            customers_count = await session.execute(text("SELECT COUNT(*) FROM customers"))
            customers_count = customers_count.scalar()

            users_count = await session.execute(text("SELECT COUNT(*) FROM users"))
            users_count = users_count.scalar()

            products_count = await session.execute(text("SELECT COUNT(*) FROM products"))
            products_count = products_count.scalar()

            sales_count = await session.execute(text("SELECT COUNT(*) FROM sales"))
            sales_count = sales_count.scalar()

            entries_count = await session.execute(text("SELECT COUNT(*) FROM stock_entries"))
            entries_count = entries_count.scalar()

            print(f"OK Clientes restantes: {customers_count}")
            print(f"OK Usuarios restantes: {users_count}")
            print(f">> Produtos restantes: {products_count} (deve ser 0)")
            print(f">> Vendas restantes: {sales_count} (deve ser 0)")
            print(f">> Entradas restantes: {entries_count} (deve ser 0)")

            print("\n" + "=" * 60)
            print("LIMPEZA CONCLUIDA COM SUCESSO!")
            print("=" * 60)
            print("\nBanco de dados limpo e pronto para testes FIFO.\n")

        except Exception as e:
            await session.rollback()
            print(f"\nERRO durante limpeza: {str(e)}")
            raise


if __name__ == "__main__":
    asyncio.run(clean_database())
