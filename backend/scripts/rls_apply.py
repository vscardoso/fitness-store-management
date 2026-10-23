"""
Liga (ou desliga) o RLS por loja no Postgres. NÃO roda sozinho no deploy: é manual.

Uso (local):
  python scripts/rls_apply.py --url postgresql+asyncpg://postgres@127.0.0.1:55432/provador_rls \
      --app-role provador_app --app-role-password XXXX
  python scripts/rls_apply.py --url ... --dry-run     # só imprime o SQL
  python scripts/rls_apply.py --url ... --rollback    # desfaz tudo

Recusa banco que não seja local, a menos que se passe --allow-remote (produção).
A aplicação só fica protegida se conectar com --app-role: superusuário ignora RLS.
"""
import argparse
import asyncio
import os
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.core.rls import disable_statements, enable_statements  # noqa: E402

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

TABLES_SQL = """
SELECT c.table_name
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND t.table_type = 'BASE TABLE'
ORDER BY c.table_name
"""


def role_statements(role: str, password: str | None, db_name: str) -> list[str]:
    stmts = []
    if password:
        stmts.append(
            f"DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{role}') "
            f"THEN CREATE ROLE {role} LOGIN PASSWORD '{password}' NOSUPERUSER NOBYPASSRLS; END IF; END $$"
        )
    stmts += [
        f"GRANT CONNECT ON DATABASE {db_name} TO {role}",
        f"GRANT USAGE ON SCHEMA public TO {role}",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}",
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {role}",
    ]
    return stmts


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--app-role")
    ap.add_argument("--app-role-password")
    ap.add_argument("--rollback", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--allow-remote", action="store_true")
    a = ap.parse_args()

    parsed = urlparse(a.url.replace("+asyncpg", ""))
    if parsed.hostname not in LOCAL_HOSTS and not a.allow_remote:
        print(f"RECUSADO: host {parsed.hostname!r} não é local. Use --allow-remote só com autorização.")
        return 2

    engine = create_async_engine(a.url)
    try:
        async with engine.begin() as conn:  # tudo-ou-nada: uma transação só
            tables = [r[0] for r in (await conn.execute(text(TABLES_SQL))).all()]
            stmts = disable_statements(tables) if a.rollback else enable_statements(tables)
            if a.app_role and not a.rollback:
                stmts += role_statements(a.app_role, a.app_role_password, (parsed.path or "/").lstrip("/"))
            print(f"{len(tables)} tabelas com tenant_id: {', '.join(tables)}")
            for s in stmts:
                if a.dry_run:
                    print(s + ";")
                else:
                    await conn.execute(text(s))
            if a.dry_run:
                await conn.rollback()
        print("OK (simulação)" if a.dry_run else ("RLS desligado" if a.rollback else "RLS ligado"))
        return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
