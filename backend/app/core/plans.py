"""Limite de usuários por plano (fonte única; o campo subscriptions.max_users é só informativo)."""

# Suposição de produto: no teste de 30 dias a dona precisa conseguir cadastrar caixa e vendedora,
# então trial permite 3 (dona + 2). Mude aqui e rode tests/test_team_limit.py.
PLAN_MAX_USERS = {
    "trial": 3,
    "free": 1,
    "pro": 5,
    "enterprise": 999999,
}
DEFAULT_PLAN = "trial"


def max_users_for(plan: str | None) -> int:
    return PLAN_MAX_USERS.get((plan or DEFAULT_PLAN).strip().lower(), PLAN_MAX_USERS[DEFAULT_PLAN])
