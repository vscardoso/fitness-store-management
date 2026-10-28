"""Item 2.6: cadastro recusa robô de formulário (campo invisível preenchido ou envio rápido demais) sem criar nada."""
import pytest
from sqlalchemy import func, select

from app.core.legal import LEGAL_VERSION
from app.models.store import Store
from app.models.user import User

pytestmark = pytest.mark.asyncio


def _dados(n, **extra):
    return {"full_name": f"Pessoa {n}", "email": f"pessoa.robo{n}@example.com", "password": "SenhaForte123",
            "store_name": f"Loja Robo Teste {n}", "accept_terms": True, "terms_version": LEGAL_VERSION, **extra}


async def _contagem(db):
    lojas = (await db.execute(select(func.count()).select_from(Store))).scalar_one()
    usuarios = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    return lojas, usuarios


async def test_robo_e_recusado_e_nada_e_criado(test_client, async_session):
    antes = await _contagem(async_session)
    for n, extra in enumerate(({"website": "http://spam.example"}, {"form_ms": 300}, {"website": " x ", "form_ms": 9000})):
        r = await test_client.post("/api/v1/auth/signup", json=_dados(n, **extra))
        assert r.status_code == 400, (extra, r.text)
        assert "Não foi possível concluir o cadastro" in r.json()["detail"]
    assert await _contagem(async_session) == antes


async def test_pessoa_e_app_antigo_passam(test_client):
    # app atual: campo vazio e tempo de gente; app antigo (sem os campos novos) continua funcionando
    for n, extra in enumerate(({"website": "", "form_ms": 8000}, {}), start=10):
        r = await test_client.post("/api/v1/auth/signup", json=_dados(n, **extra))
        assert r.status_code == 201, (extra, r.text)
