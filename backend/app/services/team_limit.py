"""Confere o limite de usuários do plano antes de criar ou reativar membro da equipe."""
import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plans import DEFAULT_PLAN, max_users_for
from app.models.subscription import Subscription
from app.models.user import User


async def ensure_can_add_user(db: AsyncSession, tenant_id: int) -> None:
    """Levanta 403 se a loja já está no limite de usuários ATIVOS do plano."""
    plan = (await db.execute(
        select(Subscription.plan).where(Subscription.tenant_id == tenant_id)
    )).scalar_one_or_none() or DEFAULT_PLAN
    limit = max_users_for(plan)
    active = (await db.execute(
        select(func.count(User.id)).where(User.tenant_id == tenant_id, User.is_active == True)  # noqa: E712
    )).scalar_one()
    if active >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Limite de {limit} usuário(s) do plano {str(plan).lower()} atingido. "
                "Desative um membro ou faça upgrade do plano para adicionar mais."
            ),
        )


_LOCAIS: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)


@asynccontextmanager
async def user_slot_lock(db: AsyncSession, tenant_id: int):
    """Serializa "conferir limite + criar/reativar usuário + commit" por loja.

    Use assim, com o commit DENTRO do bloco:
        async with user_slot_lock(db, tenant_id):
            await ensure_can_add_user(db, tenant_id)
            ... cria o usuário ...
            await db.commit()

    Postgres: trava a linha da loja (`FOR UPDATE`) até o commit/rollback, valendo entre processos.
    Qualquer banco: trava em memória por loja no processo (é o que protege no SQLite, onde
    `FOR UPDATE` não existe). Só o Postgres prova a trava entre 2 processos/workers.
    """
    from app.models.store import Store

    async with _LOCAIS[tenant_id]:
        if db.get_bind().dialect.name == "postgresql":
            await db.execute(select(Store.id).where(Store.id == tenant_id).with_for_update())
        yield
