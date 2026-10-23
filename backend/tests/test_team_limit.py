"""Limite de usuários ativos por plano em POST /team, PATCH /team/{id}/activate e POST /auth/register."""
import itertools

import pytest

from app.core.plans import PLAN_MAX_USERS, max_users_for
from app.core.security import create_access_token, get_password_hash

pytestmark = pytest.mark.asyncio
_seq = itertools.count(1)


def test_tabela_de_limites():
    assert PLAN_MAX_USERS == {"trial": 3, "free": 1, "pro": 5, "enterprise": 999999}
    assert max_users_for("PRO") == 5          # maiúsculas (como no seed dos testes)
    assert max_users_for(None) == 3           # sem plano = trial
    assert max_users_for("inexistente") == 3  # plano desconhecido = trial


async def _nova_loja(db, plan: str):
    """Loja nova com assinatura no plano dado, 1 admin ativo. Devolve (tenant_id, admin, token_do_admin)."""
    from datetime import datetime, timedelta, timezone
    from app.models.store import Store
    from app.models.subscription import Subscription
    from app.models.user import User, UserRole

    n = next(_seq)
    store = Store(name=f"Loja Limite {plan} {n}", slug=f"loja-limite-{plan}-{n}", subdomain=f"limite-{plan}-{n}",
                  plan=plan, is_default=False, is_active=True)
    db.add(store)
    await db.flush()
    db.add(Subscription(tenant_id=store.id, plan=plan, status="active", is_trial=plan == "trial",
                        current_period_start=datetime.now(timezone.utc),
                        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
                        max_products=100, max_users=1, is_active=True))
    admin = User(email=f"dono.{plan}.{n}@example.com", full_name="Dona da Loja",
                 hashed_password=get_password_hash("Senha1234"), role=UserRole.ADMIN, is_active=True, tenant_id=store.id)
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    return store.id, admin, create_access_token(data={"sub": str(admin.id)})


def _membro(i, role="seller"):
    return {"email": f"membro{i}.{next(_seq)}@example.com", "full_name": f"Membro Numero {i}",
            "password": "Senha1234", "role": role}


async def _criar(client, token, i, role="seller"):
    return await client.post("/api/v1/team", json=_membro(i, role), headers={"Authorization": f"Bearer {token}"})


async def test_trial_permite_equipe_ate_3_usuarios(test_client, async_session):
    _, _, token = await _nova_loja(async_session, "trial")  # dona = 1 de 3
    assert (await _criar(test_client, token, 1, "cashier")).status_code == 201   # 2 de 3
    assert (await _criar(test_client, token, 2, "seller")).status_code == 201    # 3 de 3
    r = await _criar(test_client, token, 3, "manager")                            # 4º: recusado
    assert r.status_code == 403, r.text
    assert "Limite de 3" in r.json()["detail"] and "trial" in r.json()["detail"]


async def test_free_so_a_dona(test_client, async_session):
    _, _, token = await _nova_loja(async_session, "free")
    r = await _criar(test_client, token, 1)
    assert r.status_code == 403 and "Limite de 1" in r.json()["detail"]


async def test_pro_ate_5(test_client, async_session):
    _, _, token = await _nova_loja(async_session, "pro")
    for i in range(4):
        assert (await _criar(test_client, token, i)).status_code == 201
    assert (await _criar(test_client, token, 9)).status_code == 403


async def test_enterprise_sem_limite_pratico(test_client, async_session):
    _, _, token = await _nova_loja(async_session, "enterprise")
    for i in range(8):
        assert (await _criar(test_client, token, i)).status_code == 201


async def test_desativar_libera_vaga_e_reativar_respeita_o_limite(test_client, async_session):
    _, _, token = await _nova_loja(async_session, "trial")
    h = {"Authorization": f"Bearer {token}"}
    a = (await _criar(test_client, token, 1)).json()
    b = (await _criar(test_client, token, 2)).json()
    assert (await _criar(test_client, token, 3)).status_code == 403              # cheio (3 de 3)
    assert (await test_client.delete(f"/api/v1/team/{a['id']}", headers=h)).status_code == 200
    assert (await _criar(test_client, token, 4)).status_code == 201              # vaga liberada, cheio de novo
    r = await test_client.patch(f"/api/v1/team/{a['id']}/activate", headers=h)    # reativar estouraria
    assert r.status_code == 403, r.text
    assert (await test_client.delete(f"/api/v1/team/{b['id']}", headers=h)).status_code == 200
    assert (await test_client.patch(f"/api/v1/team/{a['id']}/activate", headers=h)).status_code == 200


async def test_register_do_admin_tambem_respeita_o_limite(test_client, async_session):
    _, _, token = await _nova_loja(async_session, "free")
    r = await test_client.post("/api/v1/auth/register", json=_membro(1), headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, r.text


async def test_limite_e_por_loja(test_client, async_session):
    """A loja cheia não trava outra loja."""
    _, _, token_a = await _nova_loja(async_session, "free")
    _, _, token_b = await _nova_loja(async_session, "free")
    assert (await _criar(test_client, token_a, 1)).status_code == 403
    assert (await _criar(test_client, token_b, 1)).status_code == 403  # cada uma com a sua dona = 1 de 1
    _, _, token_c = await _nova_loja(async_session, "pro")
    assert (await _criar(test_client, token_c, 1)).status_code == 201


@pytest.mark.parametrize("role,esperado", [("cashier", 403), ("seller", 403), ("manager", 403), ("admin", 201)])
async def test_so_admin_cria_membro_por_papel(test_client, async_session, role, esperado):
    from app.models.user import User, UserRole
    tenant_id, _, admin_token = await _nova_loja(async_session, "pro")
    if role == "admin":
        token = admin_token
    else:
        u = User(email=f"papel.{role}.{next(_seq)}@example.com", full_name=f"Papel {role}",
                 hashed_password=get_password_hash("Senha1234"), role=UserRole(role), is_active=True, tenant_id=tenant_id)
        async_session.add(u)
        await async_session.commit()
        await async_session.refresh(u)
        token = create_access_token(data={"sub": str(u.id)})
    r = await _criar(test_client, token, 1)
    assert r.status_code == esperado, f"{role}: {r.status_code} {r.text[:150]}"


async def test_email_repetido_na_equipe_da_mensagem_clara(test_client, async_session):
    _, admin, token = await _nova_loja(async_session, "pro")
    h = {"Authorization": f"Bearer {token}"}
    r = await test_client.post("/api/v1/team", headers=h, json={
        "email": admin.email, "full_name": "Pessoa Repetida", "password": "Senha1234", "role": "seller"})
    assert r.status_code == 400
    assert "e-mail" in r.json()["detail"].lower() and "outro e-mail" in r.json()["detail"].lower()
    # e a checagem que o app faz ao sair do campo reconhece o e-mail como já usado
    c = await test_client.post("/api/v1/auth/check-email", json={"email": admin.email})
    assert c.status_code == 200 and c.json()["available"] is False
