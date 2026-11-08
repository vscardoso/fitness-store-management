"""Auditoria de papéis, isolamento entre lojas e concorrência nas rotas de dinheiro.

Fixtures comuns. A limpeza da loja 1 e das vendas vale para TODOS os testes desta pasta (autouse).
"""
import itertools

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)

_seq = itertools.count(1)
PAPEIS = ["cashier", "seller", "manager", "admin"]


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def novo_usuario(db, tenant_id: int, papel: str, *, ativo: bool = True):
    """Cria um usuário do papel dado na loja dada. Devolve (user, headers)."""
    from app.models.user import User, UserRole
    n = next(_seq)
    u = User(email=f"aud.pap.{papel}.{n}@example.com", full_name=f"Pessoa {papel} {n}",
             hashed_password=get_password_hash("Senha1234"), role=UserRole(papel), is_active=ativo, tenant_id=tenant_id)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u, bearer(create_access_token(data={"sub": str(u.id)}))


async def quatro_papeis(db, tenant_id: int, admin_headers: dict) -> dict:
    """{'cashier': headers, 'seller': ..., 'manager': ..., 'admin': headers_do_admin_existente}."""
    out = {"admin": admin_headers}
    for p in ("cashier", "seller", "manager"):
        out[p] = (await novo_usuario(db, tenant_id, p))[1]
    return out


@pytest.fixture
def loja_real(test_client):
    """O test_client força a loja 1 em toda rota; aqui vale a loja do usuário logado (como em produção)."""
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)
    return True


@pytest.fixture
def sessao_por_requisicao(test_client, test_engine):
    """Cada requisição usa a SUA sessão (como em produção). O test_client compartilha uma sessão só entre todas,
    o que impede qualquer teste de concorrência. Devolve o próprio client."""
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.core.database import get_db
    from app.main import app

    maker = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db():
        async with maker() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db] = _get_db
    return test_client


def eh_sqlite(db) -> bool:
    return db.get_bind().dialect.name == "sqlite"


@pytest.fixture(autouse=True)
async def _restaura_loja_1(async_session):
    """Estes testes mexem na linha da loja 1 (configurações via PUT, implantação do financeiro, suspensão). O `_limpa_loja_1`
    só apaga linhas NOVAS; a linha da loja continua alterada e quebrava testes de outras pastas (ex.: a matriz mandava
    `PUT /store/loyalty-settings` com corpo vazio como admin e DESLIGAVA o programa de fidelidade). Aqui a linha volta ao que era."""
    from sqlalchemy import update
    from app.core import store_suspension
    from app.models.store import Store
    cols = [c.key for c in Store.__table__.columns if c.key != "id"]
    row = (await async_session.execute(select(Store).where(Store.id == 1))).scalar_one()
    antes = {k: getattr(row, k) for k in cols}
    store_suspension.clear_cache()
    yield
    await async_session.rollback()
    await async_session.execute(update(Store).where(Store.id == 1).values(**antes))
    await async_session.commit()
    store_suspension.clear_cache()
