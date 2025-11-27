"""
Script para limpar TUDO exceto usuários.
Mantém apenas: users
Remove: products, entries, inventory, sales, customers, categories, etc.
"""
import asyncio
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from sqlalchemy import text
from app.core.database import async_session_maker


async def clean_database():
    """Limpa todas as tabelas exceto users."""

    async with async_session_maker() as db:
        try:
            print('=' * 80)
            print('LIMPANDO BANCO DE DADOS (mantendo usuários)')
            print('=' * 80)
            print()

            # Lista de tabelas para limpar (ORDEM IMPORTA - foreign keys!)
            tables_to_clean = [
                "inventory_movements",
                "entry_items",
                "stock_entries",
                "inventory",
                "payments",
                "sale_items",
                "sales",
                "trips",
                "products",
                "categories",
                "customers",
                "subscriptions",
                # NÃO vamos limpar: users, stores, tenants
            ]

            # Desabilitar foreign key checks (SQLite)
            await db.execute(text("PRAGMA foreign_keys = OFF"))

            deleted_counts = {}
            for table in tables_to_clean:
                try:
                    # Contar registros antes
                    count_result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                    count = count_result.scalar()

                    if count > 0:
                        # Deletar registros
                        await db.execute(text(f"DELETE FROM {table}"))
                        deleted_counts[table] = count
                        print(f"  [OK] {table}: {count} registros removidos")
                    else:
                        print(f"  [--] {table}: já estava vazio")

                except Exception as e:
                    print(f"  [ERRO] {table}: {e}")

            # Reabilitar foreign key checks
            await db.execute(text("PRAGMA foreign_keys = ON"))

            await db.commit()

            print()
            print('=' * 80)
            print('RESUMO')
            print('=' * 80)
            total_deleted = sum(deleted_counts.values())
            print(f"Total de registros deletados: {total_deleted}")
            print()

            # Contar usuários restantes
            users_result = await db.execute(text("SELECT COUNT(*) FROM users WHERE is_active = 1"))
            users_count = users_result.scalar()
            print(f"Usuários mantidos: {users_count}")
            print()
            print('[OK] Banco limpo! Sistema pronto para começar do zero.')
            print('     Usuários foram preservados.')

        except Exception as e:
            await db.rollback()
            print(f"\n[ERRO] Falha ao limpar banco: {e}")
            raise


if __name__ == '__main__':
    print()
    print('Este script vai DELETAR todos os dados, EXCETO usuários.')
    print()
    asyncio.run(clean_database())
