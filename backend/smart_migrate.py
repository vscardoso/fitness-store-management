#!/usr/bin/env python3
"""
Smart Migration Script

Gerencia migrations de forma inteligente:
1. Detecta se tabelas ja existem no banco
2. Se existem mas Alembic nao sabe, marca como aplicadas (stamp)
3. Se nao existem, aplica normalmente (upgrade)

Resolve o erro: "relation already exists" em deploys
"""

import asyncio
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from alembic.config import Config
from alembic import command
from alembic.script import ScriptDirectory


async def check_table_exists(engine, table_name: str) -> bool:
    """Verifica se uma tabela existe no banco."""
    async with engine.connect() as conn:
        # PostgreSQL
        result = await conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = :table_name
            )
        """), {"table_name": table_name})
        row = result.fetchone()
        return row[0] if row else False


async def get_alembic_version(engine) -> str | None:
    """Retorna a versao atual do Alembic no banco."""
    try:
        async with engine.connect() as conn:
            # Verifica se tabela alembic_version existe
            exists = await conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'alembic_version'
                )
            """))
            if not exists.fetchone()[0]:
                return None

            # Busca versao atual
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            row = result.fetchone()
            return row[0] if row else None
    except Exception as e:
        print(f"[WARN] Erro ao verificar alembic_version: {e}")
        return None


async def main():
    from app.core.config import settings

    print("=" * 60)
    print("[SMART MIGRATION]")
    print("=" * 60)

    # Conectar ao banco
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    # Tabelas criticas que indicam que o schema ja foi criado
    critical_tables = ["trips", "stock_entries", "entry_items", "users", "products"]

    # Verificar estado atual
    print("\n[INFO] Verificando estado do banco...")

    alembic_version = await get_alembic_version(engine)
    print(f"   Alembic version: {alembic_version or 'Nao encontrada'}")

    tables_exist = {}
    for table in critical_tables:
        exists = await check_table_exists(engine, table)
        tables_exist[table] = exists
        status = "[OK]" if exists else "[--]"
        print(f"   Tabela '{table}': {status}")

    await engine.dispose()

    # Configurar Alembic
    alembic_cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(alembic_cfg)
    head_revision = script.get_current_head()

    print(f"\n   Head revision: {head_revision}")

    # Decidir acao
    any_table_exists = any(tables_exist.values())
    all_tables_exist = all(tables_exist.values())

    print("\n" + "=" * 60)

    if alembic_version == head_revision:
        # Ja esta atualizado
        print("[OK] Banco ja esta na versao mais recente!")
        print("   Nenhuma acao necessaria.")

    elif alembic_version is None and all_tables_exist:
        # Tabelas existem mas Alembic nao sabe - STAMP
        print("[INFO] Tabelas existem mas Alembic nao tem registro.")
        print("   Executando: alembic stamp head")
        print("   (Marca migrations como ja aplicadas)")
        try:
            command.stamp(alembic_cfg, "head")
            print("\n[OK] Migrations marcadas como aplicadas!")
        except Exception as e:
            print(f"\n[ERROR] Erro ao fazer stamp: {e}")
            sys.exit(1)

    elif alembic_version is None and any_table_exists:
        # Algumas tabelas existem - situacao parcial, tentar stamp
        print("[WARN] Situacao parcial: algumas tabelas existem.")
        print("   Tentando: alembic stamp head")
        try:
            command.stamp(alembic_cfg, "head")
            print("\n[OK] Migrations marcadas como aplicadas!")
            print("   AVISO: Verifique manualmente se todas as tabelas estao corretas.")
        except Exception as e:
            print(f"\n[ERROR] Erro: {e}")
            sys.exit(1)

    elif alembic_version is not None and alembic_version != head_revision:
        # Tem versao mas nao e a mais recente - UPGRADE
        print(f"[INFO] Atualizando de {alembic_version} para {head_revision}")
        print("   Executando: alembic upgrade head")
        try:
            command.upgrade(alembic_cfg, "head")
            print("\n[OK] Migrations aplicadas com sucesso!")
        except Exception as e:
            print(f"\n[ERROR] Erro ao aplicar migrations: {e}")
            # Tentar stamp como fallback
            print("   Tentando stamp como fallback...")
            try:
                command.stamp(alembic_cfg, "head")
                print("   [OK] Stamp realizado como fallback")
            except:
                sys.exit(1)

    else:
        # Banco vazio - aplicar migrations normalmente
        print("[INFO] Banco vazio ou novo. Aplicando migrations...")
        print("   Executando: alembic upgrade head")
        try:
            command.upgrade(alembic_cfg, "head")
            print("\n[OK] Migrations aplicadas com sucesso!")
        except Exception as e:
            print(f"\n[ERROR] Erro: {e}")
            # Se falhou por tabelas existirem, tentar stamp
            if "already exists" in str(e).lower():
                print("   Tabelas ja existem, fazendo stamp...")
                try:
                    command.stamp(alembic_cfg, "head")
                    print("   [OK] Stamp realizado!")
                except:
                    sys.exit(1)
            else:
                sys.exit(1)

    print("=" * 60)
    print()


if __name__ == "__main__":
    asyncio.run(main())
