"""Termos de Uso e Política de Privacidade: aceite obrigatório no cadastro, novo aceite no login, versão única."""
import itertools
import re
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.legal import LEGAL_VERSION
from app.core.security import create_access_token, get_password_hash
from app.models.legal_acceptance import LegalAcceptance
from app.models.store import Store
from app.models.user import User, UserRole

pytestmark = pytest.mark.asyncio
_seq = itertools.count(1)


def _signup_body(**extra):
    n = next(_seq)
    body = {"full_name": "Dona Termos", "email": f"dona.termos.{n}@example.com", "password": "Senha1234",
            "store_name": f"Loja Termos {n}", "accept_terms": True, "terms_version": LEGAL_VERSION}
    body.update(extra)
    return body


async def _counts(db):
    db.expire_all()
    stores = (await db.execute(select(func.count()).select_from(Store))).scalar()
    users = (await db.execute(select(func.count()).select_from(User))).scalar()
    return stores, users


async def _user(db, role=UserRole.ADMIN):
    n = next(_seq)
    u = User(email=f"termos.{role.value}.{n}@example.com", full_name="Pessoa", hashed_password=get_password_hash("Senha1234"),
             role=role, tenant_id=1, is_active=True)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u, {"Authorization": "Bearer " + create_access_token(data={"sub": str(u.id)})}


async def test_versao_atual_e_publica(test_client):
    r = await test_client.get("/api/v1/legal/current")
    assert r.status_code == 200 and r.json()["version"] == LEGAL_VERSION
    assert r.json()["terms_path"] == "/termos" and r.json()["privacy_path"] == "/privacidade"


async def test_cadastro_sem_aceite_nao_cria_nada(test_client, async_session):
    antes = await _counts(async_session)
    r = await test_client.post("/api/v1/auth/signup", json=_signup_body(accept_terms=False))
    assert r.status_code == 400 and "Termos de Uso" in r.json()["detail"]
    r = await test_client.post("/api/v1/auth/signup", json={k: v for k, v in _signup_body().items() if k not in ("accept_terms", "terms_version")})
    assert r.status_code == 400
    assert await _counts(async_session) == antes


async def test_cadastro_com_versao_velha_nao_cria_nada(test_client, async_session):
    antes = await _counts(async_session)
    r = await test_client.post("/api/v1/auth/signup", json=_signup_body(terms_version="2020-01-01"))
    assert r.status_code == 400 and "atualizados" in r.json()["detail"]
    assert await _counts(async_session) == antes


async def test_cadastro_com_aceite_grava_versao_data_e_ip(test_client, async_session):
    body = _signup_body()
    r = await test_client.post("/api/v1/auth/signup", json=body, headers={"X-Real-IP": "203.0.113.7", "User-Agent": "TesteNavegador/1.0"})
    assert r.status_code == 201, r.text
    user = (await async_session.execute(select(User).where(User.email == body["email"]))).scalar_one()
    acc = (await async_session.execute(select(LegalAcceptance).where(LegalAcceptance.user_id == user.id))).scalar_one()
    assert (acc.version, acc.channel, acc.ip, acc.user_agent, acc.tenant_id) == (LEGAL_VERSION, "signup", "203.0.113.7", "TesteNavegador/1.0", user.tenant_id)
    assert acc.accepted_at is not None
    token = r.json()["access_token"] if "access_token" in r.json() else r.json()["tokens"]["access_token"]
    st = await test_client.get("/api/v1/legal/status", headers={"Authorization": f"Bearer {token}"})
    assert st.status_code == 200 and st.json() == {"version": LEGAL_VERSION, "accepted": True}


async def test_erro_no_meio_do_cadastro_desfaz_tudo(test_client, async_session, monkeypatch):
    import app.services.signup_service as svc

    async def falha(*a, **k):
        raise RuntimeError("falha simulada ao gravar o aceite")

    monkeypatch.setattr(svc, "record_acceptance", falha)
    antes = await _counts(async_session)
    r = await test_client.post("/api/v1/auth/signup", json=_signup_body())
    assert r.status_code in (400, 500)
    assert await _counts(async_session) == antes


async def test_conta_antiga_aceita_no_login_uma_vez(test_client, async_session):
    user, h = await _user(async_session)
    uid = user.id
    st = await test_client.get("/api/v1/legal/status", headers=h)
    assert st.status_code == 200 and st.json()["accepted"] is False

    r = await test_client.post("/api/v1/legal/accept", json={"version": "2020-01-01"}, headers=h)
    assert r.status_code == 409

    for _ in range(2):  # repetir não duplica
        r = await test_client.post("/api/v1/legal/accept", json={"version": LEGAL_VERSION}, headers={**h, "X-Real-IP": "198.51.100.2"})
        assert r.status_code == 200 and r.json()["accepted"] is True
    async_session.expire_all()
    rows = (await async_session.execute(select(LegalAcceptance).where(LegalAcceptance.user_id == uid))).scalars().all()
    assert len(rows) == 1 and rows[0].channel == "login" and rows[0].ip == "198.51.100.2"
    assert (await test_client.get("/api/v1/legal/status", headers=h)).json()["accepted"] is True


async def test_caixa_tambem_aceita(test_client, async_session):
    _, h = await _user(async_session, role=UserRole.CASHIER)
    assert (await test_client.get("/api/v1/legal/status", headers=h)).status_code == 200
    assert (await test_client.post("/api/v1/legal/accept", json={"version": LEGAL_VERSION}, headers=h)).status_code == 200


async def test_status_e_aceite_exigem_login(test_client):
    assert (await test_client.get("/api/v1/legal/status")).status_code == 401
    assert (await test_client.post("/api/v1/legal/accept", json={"version": LEGAL_VERSION})).status_code == 401


def test_versao_do_servidor_igual_a_do_app():
    ts = (Path(__file__).resolve().parents[2] / "mobile" / "constants" / "legal.ts").read_text(encoding="utf-8")
    m = re.search(r"LEGAL_VERSION\s*=\s*'([^']+)'", ts)
    assert m and m.group(1) == LEGAL_VERSION, "troque a versão nos dois lugares (app/core/legal.py e mobile/constants/legal.ts)"
