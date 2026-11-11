"""Renovação da sessão (refresh): tolerância na troca do token e inatividade.

Caso real de 10/11/2026: a dona da loja era derrubada várias vezes por hora. Duas abas (ou uma resposta perdida seguida de nova
tentativa) mandavam o MESMO refresh_token; o servidor trocava na primeira e respondia 401 na segunda, e o app apagava a sessão.
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.core import rate_limit
from app.core.security import get_password_hash
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserRole
from app.services import auth_service as auth_mod

pytestmark = pytest.mark.asyncio

SENHA = "Senha1234"


@pytest.fixture(autouse=True)
def _reset_limiter():
    rate_limit.reset_all()
    yield
    rate_limit.reset_all()


async def _login(test_client, async_session, test_user, email):
    user = User(email=email, full_name="Sessao Teste", hashed_password=get_password_hash(SENHA),
                role=UserRole.SELLER, is_active=True, tenant_id=test_user.tenant_id)
    async_session.add(user)
    await async_session.commit()
    r = await test_client.post("/api/v1/auth/login", json={"email": email, "password": SENHA})
    assert r.status_code == 200, r.text
    return user, r.json()["refresh_token"]


async def _refresh(test_client, token):
    return await test_client.post("/api/v1/auth/refresh", json={"refresh_token": token})


async def _record(async_session, raw):
    async_session.expire_all()
    return (await async_session.execute(select(RefreshToken).where(RefreshToken.token_hash == RefreshToken.hash_token(raw)))).scalar_one()


async def test_renovacao_normal_troca_o_token(test_client, async_session, test_user):
    _, r1 = await _login(test_client, async_session, test_user, "sessao.normal@example.com")
    a = await _refresh(test_client, r1)
    assert a.status_code == 200, a.text
    r2 = a.json()["refresh_token"]
    assert r2 != r1
    assert a.json()["access_token"]
    assert (await _refresh(test_client, r2)).status_code == 200


async def test_duas_abas_com_o_mesmo_token_nao_derrubam_a_sessao(test_client, async_session, test_user):
    """O caso do incidente: o mesmo refresh_token chega duas vezes seguidas. As duas respostas têm que ser 200 e os DOIS
    tokens novos têm que continuar valendo (cada aba pode ter guardado um deles)."""
    _, r1 = await _login(test_client, async_session, test_user, "sessao.corrida@example.com")
    a = await _refresh(test_client, r1)
    b = await _refresh(test_client, r1)
    assert a.status_code == 200 and b.status_code == 200, (a.text, b.text)
    r2, r3 = a.json()["refresh_token"], b.json()["refresh_token"]
    assert r2 != r3
    # a aba que guardou o par da primeira resposta e a que guardou o da segunda seguem renovando
    assert (await _refresh(test_client, r2)).status_code == 200
    assert (await _refresh(test_client, r3)).status_code == 200


async def test_token_trocado_ha_muito_tempo_continua_recusado(test_client, async_session, test_user):
    _, r1 = await _login(test_client, async_session, test_user, "sessao.reuso@example.com")
    assert (await _refresh(test_client, r1)).status_code == 200
    rec = await _record(async_session, r1)
    assert rec.revoked is True
    rec.last_used_at = datetime.utcnow() - timedelta(seconds=auth_mod.ROTATION_GRACE_SECONDS + 60)
    await async_session.commit()
    late = await _refresh(test_client, r1)
    assert late.status_code == 401, late.text


async def test_logout_nao_tem_tolerancia(test_client, async_session, test_user):
    """Token revogado de propósito (logout) é recusado na hora, mesmo logo depois de ter sido usado."""
    _, r1 = await _login(test_client, async_session, test_user, "sessao.logout@example.com")
    a = await _refresh(test_client, r1)
    r2 = a.json()["refresh_token"]
    await auth_mod.AuthService(async_session).revoke_session(r2)
    assert (await _refresh(test_client, r2)).status_code == 401


async def test_inatividade_derruba_so_depois_do_limite(test_client, async_session, test_user):
    _, r1 = await _login(test_client, async_session, test_user, "sessao.inativo@example.com")
    rec = await _record(async_session, r1)
    rec.last_used_at = datetime.utcnow() - timedelta(hours=auth_mod.INACTIVITY_HOURS - 0.5)
    await async_session.commit()
    ok = await _refresh(test_client, r1)
    assert ok.status_code == 200, ok.text

    r2 = ok.json()["refresh_token"]
    rec2 = await _record(async_session, r2)
    rec2.last_used_at = datetime.utcnow() - timedelta(hours=auth_mod.INACTIVITY_HOURS + 0.5)
    await async_session.commit()
    late = await _refresh(test_client, r2)
    assert late.status_code == 401
    assert "inatividade" in late.json()["detail"].lower()


async def test_inatividade_do_servidor_cobre_duas_horas_de_ausencia_mais_a_validade_do_access_token(test_client, async_session, test_user):
    """O app derruba com 2 h sem uso; o servidor só renova de hora em hora (access_token de 60 min), então o limite dele
    não pode ser menor que 2 h + 60 min, senão derrubaria quem esteve ativo."""
    assert auth_mod.INACTIVITY_HOURS * 60 >= 120 + auth_mod.ACCESS_TOKEN_MINUTES


async def test_renovacao_preserva_a_sessao_de_outro_aparelho(test_client, async_session, test_user):
    """A limpeza dos 'irmãos' é só da mesma sessão: outro login do mesmo usuário (outro aparelho) não é tocado."""
    user, r1 = await _login(test_client, async_session, test_user, "sessao.aparelhos@example.com")
    outro = await test_client.post("/api/v1/auth/login", json={"email": user.email, "password": SENHA})
    assert outro.status_code == 200
    r_outro = outro.json()["refresh_token"]
    assert (await _refresh(test_client, r1)).status_code == 200
    assert (await _refresh(test_client, r1)).status_code == 200
    rec = await _record(async_session, r_outro)
    assert rec.revoked is False
    assert (await _refresh(test_client, r_outro)).status_code == 200
