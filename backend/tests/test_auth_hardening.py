"""Fase 1 de segurança: registro fechado, limite de login, cabeçalhos e CORS."""
import pytest

from app.core import rate_limit
from app.core.security import create_access_token

pytestmark = pytest.mark.asyncio

NEW_USER = {
    "email": "novo.vendedor@example.com",
    "full_name": "Novo Vendedor",
    "password": "Senha1234",
    "role": "seller",
}


@pytest.fixture(autouse=True)
def _reset_limiter():
    rate_limit.reset_all()
    yield
    rate_limit.reset_all()


async def test_register_sem_login_e_recusado(test_client):
    r = await test_client.post("/api/v1/auth/register", json={**NEW_USER, "role": "admin"})
    assert r.status_code in (401, 403)


async def test_register_com_papel_nao_admin_e_recusado(test_client, async_session, test_user):
    from app.models.user import User, UserRole
    from app.core.security import get_password_hash

    seller = User(email="vend@example.com", full_name="Vendedor Teste", hashed_password=get_password_hash("Senha1234"),
                  role=UserRole.SELLER, is_active=True, tenant_id=test_user.tenant_id)
    async_session.add(seller)
    await async_session.commit()
    await async_session.refresh(seller)
    token = create_access_token(data={"sub": str(seller.id)})
    r = await test_client.post("/api/v1/auth/register", json=NEW_USER, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_register_admin_cria_na_propria_loja(test_client, async_session, test_user):
    token = create_access_token(data={"sub": str(test_user.id)})
    r = await test_client.post(
        "/api/v1/auth/register",
        json={**NEW_USER, "tenant_id": 999},  # tenant do corpo deve ser ignorado
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    from sqlalchemy import select
    from app.models.user import User
    u = (await async_session.execute(select(User).where(User.email == NEW_USER["email"]))).scalar_one()
    assert u.tenant_id == test_user.tenant_id
    assert u.role.value == "seller"


async def test_login_bloqueia_apos_5_falhas_e_nao_vaza(test_client):
    body = {"email": "alguem@example.com", "password": "errada"}
    codes = [(await test_client.post("/api/v1/auth/login", json=body)).status_code for _ in range(6)]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429
    r = await test_client.post("/api/v1/auth/login", json=body)
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0


async def test_login_certo_zera_contador(test_client, async_session, test_user):
    from app.models.user import User, UserRole
    from app.core.security import get_password_hash

    async_session.add(User(email="conhecido@example.com", full_name="Usuario Conhecido",
                           hashed_password=get_password_hash("Senha1234"), role=UserRole.SELLER,
                           is_active=True, tenant_id=test_user.tenant_id))
    await async_session.commit()
    bad = {"email": "conhecido@example.com", "password": "errada"}
    for _ in range(3):
        assert (await test_client.post("/api/v1/auth/login", json=bad)).status_code == 401
    ok = await test_client.post("/api/v1/auth/login", json={"email": "conhecido@example.com", "password": "Senha1234"})
    assert ok.status_code == 200, ok.text
    assert rate_limit.retry_after("testclient", "conhecido@example.com") is None
    assert rate_limit.retry_after("x", "conhecido@example.com") is None


async def test_headers_de_seguranca(test_client):
    r = await test_client.get("/health", headers={"X-Forwarded-Proto": "https"})
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert "max-age=31536000" in r.headers["strict-transport-security"]


async def test_cors_preflight_headers_do_app_e_negacao():
    """Valida os PADRÕES do código (sem o .env local, que pode ter curinga)."""
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from httpx import AsyncClient
    from app.core.config import Settings

    cfg = Settings(_env_file=None, SECRET_KEY="x" * 40, DATABASE_URL="sqlite+aiosqlite://")
    mini = FastAPI()
    mini.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True,
                        allow_methods=cfg.cors_allow_methods, allow_headers=cfg.cors_allow_headers)

    @mini.post("/x")
    async def _x():
        return {}

    origin = "http://localhost:3000"
    async with AsyncClient(app=mini, base_url="http://t") as c:
        ok = await c.options("/x", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,x-tenant-id,x-skip-loading,x-skip-auth,x-loading-message",
        })
        assert ok.status_code == 200, ok.text
        bad = await c.options("/x", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                             "Access-Control-Request-Headers": "x-qualquer-coisa"})
        assert bad.status_code == 400
        bad_m = await c.options("/x", headers={"Origin": origin, "Access-Control-Request-Method": "TRACE"})
        assert bad_m.status_code == 400


async def test_signup_ignora_plano_pago_do_cliente(test_client, async_session):
    from sqlalchemy import select
    from app.models.store import Store
    from app.models.user import User

    r = await test_client.post("/api/v1/auth/signup", json={
        "full_name": "Dona da Loja", "email": "dona.plano@example.com", "password": "Senha1234",
        "store_name": "Loja Plano Teste", "plan": "enterprise",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["subscription"]["plan"] == "trial" if "subscription" in body else True
    user = (await async_session.execute(select(User).where(User.email == "dona.plano@example.com"))).scalar_one()
    store = (await async_session.execute(select(Store).where(Store.id == user.tenant_id))).scalar_one()
    assert store.plan == "trial"
