"""
Row Level Security (RLS) do Postgres, segunda camada de isolamento entre lojas.

Hoje o isolamento é feito pelo código (filtro tenant_id nas queries). Com RLS ligado, o
próprio banco recusa linhas de outra loja, mesmo que alguma query esqueça o filtro.

Como funciona (SÓ vale com RLS_ENABLED=true e o script scripts/rls_apply.py aplicado):
- toda transação recebe `app.tenant_id` (set_config local) vindo de session.info["tenant_id"];
- fluxos sem usuário (login, cadastro, webhooks, agendador) pedem `bypass_rls` explicitamente;
- sem nenhum dos dois a sessão não enxerga NADA (falha fechada).

Com RLS_ENABLED=false (padrão) nada disto roda e o comportamento é o de sempre.
"""
from typing import Iterable, Optional

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.config import settings

POLICY_NAME = "tenant_isolation"

_CONDITION = (
    "current_setting('app.bypass_rls', true) = 'on' "
    "OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int"
)


def enable_statements(tables: Iterable[str]) -> list[str]:
    """SQL que liga o RLS (e a política de loja) nas tabelas informadas."""
    out: list[str] = []
    for t in tables:
        out += [
            f'ALTER TABLE "{t}" ENABLE ROW LEVEL SECURITY',
            f'ALTER TABLE "{t}" FORCE ROW LEVEL SECURITY',
            f'DROP POLICY IF EXISTS {POLICY_NAME} ON "{t}"',
            f'CREATE POLICY {POLICY_NAME} ON "{t}" USING ({_CONDITION}) WITH CHECK ({_CONDITION})',
        ]
    return out


def disable_statements(tables: Iterable[str]) -> list[str]:
    """SQL que desfaz o RLS nas tabelas informadas (rollback completo)."""
    out: list[str] = []
    for t in tables:
        out += [
            f'DROP POLICY IF EXISTS {POLICY_NAME} ON "{t}"',
            f'ALTER TABLE "{t}" NO FORCE ROW LEVEL SECURITY',
            f'ALTER TABLE "{t}" DISABLE ROW LEVEL SECURITY',
        ]
    return out


# ─── Contexto por transação ──────────────────────────────────────────────────

def _params(info: dict) -> dict:
    tid = info.get("tenant_id")
    return {"t": "" if tid is None else str(int(tid)), "b": "on" if info.get("bypass_rls") else "off"}


_SET_CONTEXT = text(
    "SELECT set_config('app.tenant_id', :t, true), set_config('app.bypass_rls', :b, true)"
)


@event.listens_for(Session, "after_begin")
def _apply_on_begin(session, transaction, connection) -> None:
    """Toda transação nova (inclusive depois de commit) reaplica o contexto da sessão."""
    if not settings.RLS_ENABLED or connection.dialect.name != "postgresql":
        return
    connection.execute(_SET_CONTEXT, _params(session.info))


async def _apply_now(db: AsyncSession) -> None:
    # A transação corrente já começou: o after_begin não roda de novo, então aplica agora.
    if settings.RLS_ENABLED and db.get_bind().dialect.name == "postgresql":
        await db.execute(_SET_CONTEXT, _params(db.sync_session.info))


async def bypass_on(db: AsyncSession) -> None:
    """Fluxo sem usuário autenticado (login, cadastro, webhook, agendador)."""
    db.sync_session.info["bypass_rls"] = True
    db.sync_session.info.pop("tenant_id", None)
    await _apply_now(db)


async def set_tenant(db: AsyncSession, tenant_id: Optional[int]) -> None:
    """Fixa a loja da requisição e desliga o bypass. tenant_id None = sessão sem acesso."""
    db.sync_session.info["bypass_rls"] = False
    if tenant_id is None:
        db.sync_session.info.pop("tenant_id", None)
    else:
        db.sync_session.info["tenant_id"] = int(tenant_id)
    await _apply_now(db)
