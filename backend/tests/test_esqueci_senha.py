"""Esqueci minha senha: a rota pública NÃO pode trocar a senha nem devolver senha.

A versão antiga gerava uma senha temporária e a mandava na resposta: bastava saber o e-mail de alguém para
entrar na conta (inclusive a do admin da loja)."""
import pytest
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


async def test_nao_troca_nem_devolve_senha(test_client, async_session, test_user):
    from app.models.user import User
    uid, email = test_user.id, test_user.email
    antes = (await async_session.execute(select(User.hashed_password).where(User.id == uid))).scalar_one()

    r = await test_client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert "temp_password" not in corpo and "password" not in str(corpo).lower().replace("redefinir sua senha", "")
    async_session.expire_all()
    depois = (await async_session.execute(select(User.hashed_password).where(User.id == uid))).scalar_one()
    assert depois == antes, "a senha foi trocada por um pedido anônimo"


async def test_resposta_igual_para_email_que_nao_existe(test_client, test_user):
    a = await test_client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
    b = await test_client.post("/api/v1/auth/forgot-password", json={"email": "ninguem.aqui@example.com"})
    assert a.status_code == b.status_code == 200
    assert a.json() == b.json(), "a resposta revela se o e-mail tem conta"


async def test_email_vazio(test_client):
    r = await test_client.post("/api/v1/auth/forgot-password", json={"email": " "})
    assert r.status_code == 400
