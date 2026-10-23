"""Confere o limite de usuários do plano antes de criar ou reativar membro da equipe."""
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
