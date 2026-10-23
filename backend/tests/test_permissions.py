"""Matriz de permissões por papel: cobertura de todas as rotas e chamadas reais por papel."""
import pytest
from fastapi.routing import APIRoute

from app.core import permissions as P
from app.core.security import create_access_token, get_password_hash

pytestmark = pytest.mark.asyncio

ROLES = ["cashier", "seller", "manager", "admin"]


def _auth_routes():
    from app.api import deps
    from app.main import app

    def has_auth(route):
        stack = [route.dependant]
        while stack:
            d = stack.pop()
            if d.call in (deps.get_current_user, deps.get_current_active_user, deps.get_current_tenant_id):
                return True
            stack.extend(d.dependencies)
        return False

    return [r for r in app.routes if isinstance(r, APIRoute) and has_auth(r)]


def test_toda_rota_autenticada_tem_regra_explicita():
    """Nenhuma rota cai no padrão 'gerente' por esquecimento: rota nova precisa de regra em RULES."""
    sem_regra = []
    for r in _auth_routes():
        path = r.path_format[len(P.API_PREFIX):]
        for m in r.methods - {"HEAD", "OPTIONS"}:
            if not any((ms is None or m in ms) and rx.search(path) for ms, rx, _ in P._COMPILED):
                sem_regra.append((m, r.path_format))
    assert sem_regra == []


def test_matriz_nunca_e_mais_frouxa_que_o_guard_da_rota():
    """O guard escrito na rota (require_role) não pode barrar um papel que a matriz libera."""
    from app.api import deps

    def walk(d):
        yield d
        for s in d.dependencies:
            yield from walk(s)

    erros = []
    for r in _auth_routes():
        existing = None
        for d in walk(r.dependant):
            n = getattr(d.call, "__name__", "")
            if n == "role_checker":
                for cell in d.call.__closure__ or ():
                    if isinstance(cell.cell_contents, list):
                        existing = set(cell.cell_contents)
            if n == "require_admin":
                existing = {P.ADMIN}
            if n == "require_seller_or_admin":
                existing = {P.ADMIN, P.SELLER}
        if existing is None:
            continue
        for m in r.methods - {"HEAD", "OPTIONS"}:
            if not P.allowed_roles(m, r.path_format) <= existing:
                erros.append((m, r.path_format))
    assert erros == []


@pytest.mark.parametrize("method,path,quem", [
    # (método, rota, papéis que PODEM)
    ("GET", "/api/v1/products/", ROLES),
    ("GET", "/api/v1/sales/", ROLES),
    ("POST", "/api/v1/sales/", ROLES),
    ("POST", "/api/v1/customers/", ROLES),
    ("PUT", "/api/v1/customers/1", ["seller", "manager", "admin"]),
    ("DELETE", "/api/v1/customers/1", ["manager", "admin"]),
    ("POST", "/api/v1/products/", ["manager", "admin"]),
    ("PUT", "/api/v1/products/1", ["manager", "admin"]),
    ("DELETE", "/api/v1/products/1", ["admin"]),
    ("POST", "/api/v1/product-variants/", ["manager", "admin"]),
    ("DELETE", "/api/v1/product-variants/1", ["manager", "admin"]),
    ("GET", "/api/v1/stock-entries/", ["manager", "admin"]),
    ("POST", "/api/v1/stock-entries/", ["manager", "admin"]),
    ("DELETE", "/api/v1/stock-entries/1", ["admin"]),
    ("GET", "/api/v1/trips/", ["manager", "admin"]),
    ("GET", "/api/v1/suppliers", ["manager", "admin"]),
    ("DELETE", "/api/v1/suppliers/1", ["admin"]),
    ("GET", "/api/v1/expenses", ["manager", "admin"]),
    ("POST", "/api/v1/expenses", ["manager", "admin"]),
    ("PUT", "/api/v1/expenses/1", ["manager", "admin"]),
    ("DELETE", "/api/v1/expenses/1", ["admin"]),
    ("DELETE", "/api/v1/expenses/categories/1", ["admin"]),
    ("GET", "/api/v1/dashboard/stats", ["manager", "admin"]),
    ("GET", "/api/v1/dashboard/inventory/valuation", ["manager", "admin"]),
    ("GET", "/api/v1/reports/sales", ["manager", "admin"]),
    ("GET", "/api/v1/sales/reports/daily", ["manager", "admin"]),
    ("GET", "/api/v1/payment-discounts/", ROLES),
    ("POST", "/api/v1/payment-discounts/calculate", ROLES),
    ("POST", "/api/v1/payment-discounts/", ["admin"]),
    ("DELETE", "/api/v1/payment-discounts/1", ["admin"]),
    ("POST", "/api/v1/pdv/payment", ROLES),
    ("POST", "/api/v1/pdv/orders/1/cancel", ["manager", "admin"]),
    ("POST", "/api/v1/pdv/orders/1/refund", ["admin"]),
    ("POST", "/api/v1/pdv/pix/1/refund", ["admin"]),
    ("POST", "/api/v1/pdv/store/setup", ["admin"]),
    ("POST", "/api/v1/pdv/terminals", ["admin"]),
    ("GET", "/api/v1/pdv/terminals", ROLES),
    ("POST", "/api/v1/pdv/cielo-pix/register-webhook", ["admin"]),
    ("GET", "/api/v1/mp-connect/status", ["admin"]),
    ("POST", "/api/v1/returns/1", ["seller", "manager", "admin"]),
    ("GET", "/api/v1/conditional-shipments/", ["seller", "manager", "admin"]),
    ("DELETE", "/api/v1/conditional-shipments/1", ["manager", "admin"]),
    ("GET", "/api/v1/inventory/alerts", ["seller", "manager", "admin"]),
    ("POST", "/api/v1/inventory/add", ["manager", "admin"]),
    ("POST", "/api/v1/label-printers/print", ["seller", "manager", "admin"]),
    ("POST", "/api/v1/label-printers/", ["manager", "admin"]),
    ("POST", "/api/v1/ai/scan-product", ["manager", "admin"]),
    ("GET", "/api/v1/team", ["manager", "admin"]),
    ("POST", "/api/v1/team", ["admin"]),
    ("GET", "/api/v1/store/pix", ["admin"]),
    ("GET", "/api/v1/audit/", ["admin"]),
    ("POST", "/api/v1/auth/register", ["admin"]),
    ("GET", "/api/v1/auth/me", ROLES),
    ("GET", "/api/v1/notifications/inbox", ROLES),
])
async def test_papeis_por_rota(test_client, async_session, test_user, method, path, quem):
    from app.models.user import User, UserRole

    tokens = {}
    for i, role in enumerate(ROLES):
        if role == "admin":
            u = test_user
        else:
            from sqlalchemy import select
            email = f"perm.{role}@example.com"
            u = (await async_session.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if u is None:
                u = User(email=email, full_name=f"Teste {role}", hashed_password=get_password_hash("Senha1234"),
                         role=UserRole(role), is_active=True, tenant_id=test_user.tenant_id)
                async_session.add(u)
                await async_session.commit()
                await async_session.refresh(u)
        tokens[role] = create_access_token(data={"sub": str(u.id)})

    for role in ROLES:
        r = await test_client.request(method, path, headers={"Authorization": f"Bearer {tokens[role]}"}, json={}
                                      if method in ("POST", "PUT", "PATCH") else None)
        negado = r.status_code == 403
        assert negado == (role not in quem), f"{role} {method} {path} -> {r.status_code} {r.text[:120]}"
