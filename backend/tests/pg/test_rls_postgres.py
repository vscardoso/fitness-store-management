"""
RLS no Postgres de verdade (não roda no SQLite).

Rodar:
  TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg -p no:cacheprovider --no-cov
O teste cria e apaga o banco `provador_rls_test` no servidor informado (use SÓ um Postgres local descartável).
"""
import os
from urllib.parse import urlparse

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core import rls
from app.core.config import settings

PG_URL = os.getenv("TEST_PG_URL")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not PG_URL, reason="defina TEST_PG_URL para testar RLS no Postgres"),
]

DB = "provador_rls_test"
APP_ROLE = "provador_app_test"


def _url(db: str, user: str | None = None, pwd: str | None = None) -> str:
    u = urlparse(PG_URL.replace("+asyncpg", ""))
    assert u.hostname in ("localhost", "127.0.0.1"), "RLS test só roda em Postgres local"
    auth = f"{user}:{pwd}@" if user else (f"{u.username}@" if u.username else "")
    return f"postgresql+asyncpg://{auth}{u.hostname}:{u.port or 5432}/{db}"


@pytest.fixture(scope="module", autouse=True)
def _rls_on():
    old = settings.RLS_ENABLED
    settings.RLS_ENABLED = True
    yield
    settings.RLS_ENABLED = old


@pytest.fixture(scope="module")
async def pg():
    """Banco novo com o schema real dos modelos, 2 lojas com dados e RLS ligado. Devolve (admin, app, tabelas)."""
    from app.models.base import BaseModel
    import app.models  # noqa: F401  (registra todas as tabelas)

    root = create_async_engine(_url("postgres"), isolation_level="AUTOCOMMIT")
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
        await c.execute(text(f"CREATE DATABASE {DB}"))
        await c.execute(text(f"DROP ROLE IF EXISTS {APP_ROLE}"))
    admin = create_async_engine(_url(DB))
    async with admin.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)

    from app.models.category import Category
    from app.models.product import Product
    from app.models.store import Store
    from app.models.user import User, UserRole

    async with _sess(admin) as s:
        for sid, slug in ((1, "loja-a"), (2, "loja-b")):
            s.add(Store(id=sid, name=f"Loja {slug}", slug=slug, subdomain=slug, plan="trial",
                        is_default=False, is_active=True))
        await s.flush()
        for uid, tid in ((1, 1), (2, 2)):
            s.add(User(id=uid, email=f"u{uid}@example.com", hashed_password="x", full_name=f"Usuario {uid}",
                       role=UserRole.ADMIN, tenant_id=tid, is_active=True))
            s.add(Category(id=uid, name=f"Cat {uid}", slug=f"cat-{uid}", tenant_id=tid))
        await s.flush()
        for pid, tid in ((1, 1), (2, 1), (3, 2)):
            s.add(Product(id=pid, name=f"Produto {pid}", category_id=tid, tenant_id=tid, base_price=10))
        await s.commit()

    from scripts.rls_apply import TABLES_SQL, role_statements
    async with admin.begin() as conn:
        tables = [r[0] for r in (await conn.execute(text(TABLES_SQL))).all()]
        for s in rls.enable_statements(tables) + role_statements(APP_ROLE, "apptest", DB):
            await conn.execute(text(s))

    app_engine = create_async_engine(_url(DB, APP_ROLE, "apptest"))
    yield admin, app_engine, tables
    await app_engine.dispose()
    await admin.dispose()
    async with root.connect() as c:
        await c.execute(text(f"DROP DATABASE IF EXISTS {DB} WITH (FORCE)"))
        await c.execute(text(f"DROP ROLE IF EXISTS {APP_ROLE}"))
    await root.dispose()


def _sess(engine) -> AsyncSession:
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)()


async def _ids(db, table="products"):
    return sorted(r[0] for r in (await db.execute(text(f"SELECT id FROM {table}"))).all())


async def test_tabelas_com_tenant_id_cobertas(pg):
    _, _, tables = pg
    assert {"products", "users", "categories"} <= set(tables)
    assert len(tables) >= 20


async def test_sem_contexto_nao_enxerga_nada(pg):
    _, app_engine, _ = pg
    async with _sess(app_engine) as db:
        assert await _ids(db) == []
        assert await _ids(db, "users") == []


async def test_cada_loja_ve_so_o_seu(pg):
    _, app_engine, _ = pg
    async with _sess(app_engine) as db:
        await rls.set_tenant(db, 1)
        assert await _ids(db) == [1, 2]
        assert await _ids(db, "users") == [1]
    async with _sess(app_engine) as db:
        await rls.set_tenant(db, 2)
        assert await _ids(db) == [3]
        assert await _ids(db, "users") == [2]


async def test_query_sem_filtro_nao_vaza(pg):
    """O caso que o RLS existe para pegar: um SELECT que esqueceu o WHERE tenant_id."""
    from app.models.product import Product
    _, app_engine, _ = pg
    async with _sess(app_engine) as db:
        await rls.set_tenant(db, 1)
        rows = (await db.execute(select(Product.id))).scalars().all()
        assert sorted(rows) == [1, 2]


async def test_insert_em_outra_loja_e_recusado(pg):
    _, app_engine, _ = pg
    async with _sess(app_engine) as db:
        await rls.set_tenant(db, 1)
        from app.models.product import Product
        db.add(Product(id=99, name="Invasor", category_id=2, tenant_id=2, base_price=10))
        with pytest.raises(DBAPIError):
            await db.flush()
        await db.rollback()


async def test_update_e_delete_de_outra_loja_nao_afetam(pg):
    admin, app_engine, _ = pg
    async with _sess(app_engine) as db:
        await rls.set_tenant(db, 1)
        up = await db.execute(text("UPDATE products SET name = 'HACK' WHERE id = 3"))
        de = await db.execute(text("DELETE FROM products WHERE id = 3"))
        assert up.rowcount == 0 and de.rowcount == 0
        await db.commit()
    async with admin.connect() as c:
        assert (await c.execute(text("SELECT name FROM products WHERE id = 3"))).scalar_one() == "Produto 3"


async def test_nao_da_para_mudar_a_linha_para_outra_loja(pg):
    _, app_engine, _ = pg
    async with _sess(app_engine) as db:
        await rls.set_tenant(db, 1)
        with pytest.raises(DBAPIError):
            await db.execute(text("UPDATE products SET tenant_id = 2 WHERE id = 1"))
        await db.rollback()


async def test_bypass_enxerga_tudo(pg):
    _, app_engine, _ = pg
    async with _sess(app_engine) as db:
        await rls.bypass_on(db)
        assert await _ids(db) == [1, 2, 3]
        await rls.set_tenant(db, 2)  # desliga o bypass
        assert await _ids(db) == [3]


async def test_contexto_sobrevive_ao_commit(pg):
    """Nova transação depois de commit/rollback precisa reaplicar a loja (after_begin)."""
    _, app_engine, _ = pg
    async with _sess(app_engine) as db:
        await rls.set_tenant(db, 1)
        assert await _ids(db) == [1, 2]
        await db.commit()
        assert await _ids(db) == [1, 2]
        await db.rollback()
        assert await _ids(db) == [1, 2]


async def test_contexto_nao_vaza_pelo_pool(pg):
    """Conexão reutilizada por outra requisição (sem contexto) não herda a loja anterior."""
    _, app_engine, _ = pg
    for _ in range(3):
        async with _sess(app_engine) as db:
            await rls.set_tenant(db, 1)
            assert await _ids(db) == [1, 2]
            await db.commit()
        async with _sess(app_engine) as db:
            assert await _ids(db) == []


async def test_superusuario_ignora_rls_por_isso_a_app_precisa_do_papel(pg):
    admin, _, _ = pg
    async with admin.connect() as c:
        assert len((await c.execute(text("SELECT id FROM products"))).all()) == 3


async def test_rollback_desliga_tudo(pg):
    admin, app_engine, tables = pg
    async with admin.begin() as conn:
        for s in rls.disable_statements(tables):
            await conn.execute(text(s))
    async with _sess(app_engine) as db:
        assert await _ids(db) == [1, 2, 3]
    async with admin.begin() as conn:  # religa para o restante da suíte
        for s in rls.enable_statements(tables):
            await conn.execute(text(s))
    async with _sess(app_engine) as db:
        assert await _ids(db) == []


# ─── Fluxo HTTP completo com RLS ligado e a aplicação conectada com o papel sem superpoderes ───

@pytest.fixture
async def client(pg, monkeypatch):
    import app.core.database as db_module
    import app.middleware.tenant as tenant_module
    from httpx import AsyncClient
    from app.core.security import get_password_hash
    from app.main import app
    from app.core import rate_limit

    admin, app_engine, _ = pg
    async with admin.begin() as conn:  # superusuário ignora RLS e define as senhas de teste
        for uid in (1, 2):
            await conn.execute(text("UPDATE users SET hashed_password = :h WHERE id = :i"),
                               {"h": get_password_hash("Senha1234"), "i": uid})
    maker = sessionmaker(app_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(db_module, "async_session_maker", maker)
    monkeypatch.setattr(tenant_module, "async_session_maker", maker)
    rate_limit.reset_all()
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c


async def _login(client, n):
    r = await client.post("/api/v1/auth/login", json={"email": f"u{n}@example.com", "password": "Senha1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_http_login_e_listagem_so_da_propria_loja(client):
    h1 = await _login(client, 1)
    h2 = await _login(client, 2)
    r1 = await client.get("/api/v1/products/", headers=h1)
    r2 = await client.get("/api/v1/products/", headers=h2)
    assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
    ids1 = sorted(p["id"] for p in (r1.json() if isinstance(r1.json(), list) else r1.json()["items"]))
    ids2 = sorted(p["id"] for p in (r2.json() if isinstance(r2.json(), list) else r2.json()["items"]))
    assert ids1 == [1, 2]
    assert ids2 == [3]


async def test_http_produto_de_outra_loja_da_404(client):
    h1 = await _login(client, 1)
    assert (await client.get("/api/v1/products/3", headers=h1)).status_code == 404
    assert (await client.get("/api/v1/products/1", headers=h1)).status_code == 200


async def test_http_token_sem_usuario_valido_nao_ve_nada(client):
    r = await client.get("/api/v1/products/", headers={"Authorization": "Bearer lixo"})
    assert r.status_code == 401


async def test_arvore_de_categorias_roda_no_postgres(pg):
    """Regressão: a CTE recursiva falhava no Postgres (tipo varchar(100) x varchar)."""
    from app.repositories.category_repository import CategoryRepository
    admin, _, _ = pg
    async with _sess(admin) as db:
        tree = await CategoryRepository(db).get_hierarchy()
        assert isinstance(tree, list) and tree
