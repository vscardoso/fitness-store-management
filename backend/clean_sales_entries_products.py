"""
Script para limpar vendas, entradas e produtos, mantendo clientes e categorias.
Util para resetar dados operacionais e começar validação do zero.
"""

import asyncio
from sqlalchemy import delete
from app.core.database import async_session_maker
from app.models.sale import Sale, SaleItem, Payment
from app.models.inventory import Inventory, InventoryMovement
from app.models.stock_entry import StockEntry
from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.trip import Trip


async def clean_operational_data():
    """Limpa vendas, entradas, produtos e relacionados, mantendo clientes e categorias."""

    print("=" * 70)
    print("LIMPEZA DE DADOS OPERACIONAIS")
    print("=" * 70)
    print("\nAVISO: Este script vai deletar PERMANENTEMENTE (hard delete):")
    print("  - Todas as vendas e seus itens")
    print("  - Todos os pagamentos")
    print("  - Todas as movimentacoes de estoque")
    print("  - Todas as entradas e seus itens")
    print("  - Todo o inventario")
    print("  - Produtos NAO catalogos (is_catalog=False)")
    print("  - Todas as viagens")
    print("\nMANTENDO:")
    print("  - Clientes")
    print("  - Categorias")
    print("  - Usuarios")
    print("  - Produtos de catalogo (is_catalog=True)")
    print("\n" + "=" * 70)

    confirm = input("\nDeseja continuar? Digite 'SIM' para confirmar: ")

    if confirm != 'SIM':
        print("\nOK Operacao cancelada.")
        return

    async with async_session_maker() as session:
        try:
            print("\nOK Iniciando limpeza...")

            # 1. Deletar vendas e relacionados
            print("\n1. Deletando itens de venda...")
            result = await session.execute(delete(SaleItem))
            print(f"   OK {result.rowcount} itens de venda deletados")

            print("2. Deletando pagamentos...")
            result = await session.execute(delete(Payment))
            print(f"   OK {result.rowcount} pagamentos deletados")

            print("3. Deletando vendas...")
            result = await session.execute(delete(Sale))
            print(f"   OK {result.rowcount} vendas deletadas")

            # 2. Deletar movimentacoes de estoque
            print("4. Deletando movimentacoes de estoque...")
            result = await session.execute(delete(InventoryMovement))
            print(f"   OK {result.rowcount} movimentacoes deletadas")

            # 3. Deletar entradas e relacionados
            print("5. Deletando itens de entrada...")
            result = await session.execute(delete(EntryItem))
            print(f"   OK {result.rowcount} itens de entrada deletados")

            print("6. Deletando entradas...")
            result = await session.execute(delete(StockEntry))
            print(f"   OK {result.rowcount} entradas deletadas")

            # 4. Deletar inventario
            print("7. Deletando inventario...")
            result = await session.execute(delete(Inventory))
            print(f"   OK {result.rowcount} registros de inventario deletados")

            # 5. Deletar apenas produtos NAO catalogos
            print("8. Deletando produtos NAO catalogos (is_catalog=False)...")
            result = await session.execute(
                delete(Product).where(Product.is_catalog == False)
            )
            print(f"   OK {result.rowcount} produtos deletados")

            # Marcar produtos de catalogo como nao adicionados a loja
            print("9. Resetando produtos de catalogo (is_catalog=True)...")
            from sqlalchemy import update
            result = await session.execute(
                update(Product)
                .where(Product.is_catalog == True)
                .values(is_active=True)
            )
            print(f"   OK {result.rowcount} produtos de catalogo resetados")

            # 6. Deletar viagens
            print("10. Deletando viagens...")
            result = await session.execute(delete(Trip))
            print(f"   OK {result.rowcount} viagens deletadas")

            # Commit final
            await session.commit()

            print("\n" + "=" * 70)
            print("OK LIMPEZA CONCLUIDA COM SUCESSO!")
            print("=" * 70)
            print("\nVoce pode agora:")
            print("  1. Criar produtos do catalogo")
            print("  2. Criar viagens")
            print("  3. Criar entradas de estoque")
            print("  4. Validar FIFO e fluxo completo")
            print("\n")

        except Exception as e:
            await session.rollback()
            print(f"\nERRO: {str(e)}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(clean_operational_data())
