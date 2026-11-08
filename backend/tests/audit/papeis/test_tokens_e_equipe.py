"""Token ausente, vencido, forjado ou de usuário desativado; troca de papel no meio da sessão; equipe de outra loja;
limite de usuários por plano.
"""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
import jwt as _jose  # PyJWT, o mesmo do app
from sqlalchemy import select, update

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from tests.test_team_limit import _nova_loja
from tests.test_troca import _cenario
from .conftest import bearer, novo_usuario, quatro_papeis
from .test_matriz_papeis import TABELA

pytestmark = pytest.mark.asyncio
API = "/api/v1"
AMOSTRA = [t for t in TABELA if t[0] in ("GET", "POST") and t[1].count("/") <= 3][::3]   # ~30 rotas variadas de dinheiro


def _forjar(payload, key=None, alg=None):
    return _jose.encode(payload, key if key is not None else settings.SECRET_KEY, algorithm=alg or settings.ALGORITHM)


def _exp(minutos):
    return datetime.now(timezone.utc) + timedelta(minutes=minutos)


async def _bate(client, headers, nome):
    """Toda rota da amostra deve recusar com 401/403 (nunca 2xx, nunca 500)."""
    erros = []
    for metodo, caminho, _ in AMOSTRA:
        r = await client.request(metodo, f"{API}{caminho}", headers=headers, json={} if metodo == "POST" else None)
        if r.status_code not in (401, 403):
            erros.append(f"{nome}: {metodo} {caminho} -> {r.status_code} {r.text[:90]}")
    return erros


async def test_sem_token_e_token_lixo_sao_recusados_em_toda_rota_de_dinheiro(test_client, async_session, test_user):
    t_id, h_admin, *_ = await _cenario(async_session, test_user)
    sub = str(test_user.id)
    casos = {
        "sem cabeçalho": {},
        "sem cabeçalho mas com X-Tenant-Id": {"X-Tenant-Id": str(t_id), "X-Store-Slug": "test"},
        "Bearer vazio": {"Authorization": "Bearer "},
        "lixo": bearer("isto-nao-e-um-jwt"),
        "esquema errado": {"Authorization": f"Basic {create_access_token(data={'sub': sub})}"},
        "vencido": bearer(create_access_token(data={"sub": sub}, expires_delta=timedelta(minutes=-5))),
        "assinado com outra chave": bearer(_forjar({"sub": sub, "exp": _exp(30), "type": "access"}, key="outra-chave-qualquer-0123456789abcdef")),
        "sem sub": bearer(_forjar({"exp": _exp(30), "type": "access"})),
        "usuário que não existe": bearer(create_access_token(data={"sub": "99999999"})),
    }
    erros = []
    for nome, h in casos.items():
        erros += await _bate(test_client, h, nome)
    assert erros == [], "\n".join(erros)


async def test_token_com_sub_estranho_nao_pode_dar_500(test_client, async_session, test_user):
    """sub não numérico, negativo ou gigante precisa virar 401, não 500 (e o corpo não pode vazar a mensagem do erro)."""
    ruins = []
    for sub in ("abc", "-1", "0", "1; DROP TABLE users", "99999999999999999999999999", "1.5", ""):
        r = await test_client.get(f"{API}/sales/", headers=bearer(create_access_token(data={"sub": sub})))
        if r.status_code != 401:
            ruins.append(f"sub={sub!r} -> {r.status_code} {r.text[:140]}")
    assert ruins == [], "\n".join(ruins)


async def test_token_alg_none_e_recusado(test_client, async_session, test_user):
    import base64
    import json

    def b64(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    tok = f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64({'sub': str(test_user.id), 'exp': int(_exp(30).timestamp()), 'type': 'access'})}."
    r = await test_client.get(f"{API}/sales/", headers=bearer(tok))
    assert r.status_code == 401, r.text


async def test_refresh_token_nao_serve_como_token_de_acesso(test_client, async_session, test_user):
    """O refresh dura dias e fica guardado no aparelho; se a API aceitar como acesso, o roubo dele vale mais que o de um token curto."""
    tok = create_refresh_token(data={"sub": str(test_user.id)})
    r = await test_client.get(f"{API}/sales/", headers=bearer(tok))
    assert r.status_code == 401, f"refresh aceito como acesso: {r.status_code}"


@pytest.fixture
async def loja(async_session, test_user, test_client):
    t_id, h_admin, *_ = await _cenario(async_session, test_user)
    return t_id, await quatro_papeis(async_session, t_id, h_admin)


async def test_usuario_desativado_perde_o_acesso_na_hora(test_client, async_session, test_user, loja):
    t_id, h = loja
    u, hu = await novo_usuario(async_session, t_id, "seller")
    assert (await test_client.get(f"{API}/sales/", headers=hu)).status_code == 200
    r = await test_client.delete(f"{API}/team/{u.id}", headers=h["admin"])
    assert r.status_code == 200, r.text
    erros = await _bate(test_client, hu, "desativado")
    assert erros == [], "\n".join(erros)
    # reativar devolve o acesso com o MESMO token
    r = await test_client.patch(f"{API}/team/{u.id}/activate", headers=h["admin"])
    assert r.status_code == 200, r.text
    assert (await test_client.get(f"{API}/sales/", headers=hu)).status_code == 200


async def test_papel_trocado_vale_na_proxima_requisicao(test_client, async_session, test_user, loja):
    """Gerente rebaixado a caixa perde as rotas de gerente com o MESMO token; vendedor promovido ganha."""
    t_id, h = loja
    u, hu = await novo_usuario(async_session, t_id, "manager")
    assert (await test_client.get(f"{API}/finance/accounts", headers=hu)).status_code != 403
    r = await test_client.patch(f"{API}/team/{u.id}/role", headers=h["admin"], json={"role": "cashier"})
    assert r.status_code == 200, r.text
    assert (await test_client.get(f"{API}/finance/accounts", headers=hu)).status_code == 403
    assert (await test_client.get(f"{API}/expenses", headers=hu)).status_code == 403
    assert (await test_client.get(f"{API}/sales/", headers=hu)).status_code == 200
    r = await test_client.patch(f"{API}/team/{u.id}/role", headers=h["admin"], json={"role": "admin"})
    assert (await test_client.get(f"{API}/finance/accounts", headers=hu)).status_code != 403


async def test_ninguem_abaixo_de_admin_mexe_na_equipe_nem_se_promove(test_client, async_session, test_user, loja):
    t_id, h = loja
    alvo, _ = await novo_usuario(async_session, t_id, "cashier")
    erros = []
    for papel in ("cashier", "seller", "manager"):
        hh = h[papel]
        tentativas = [
            ("POST", "/team", {"email": f"x{papel}@example.com", "full_name": "Fulano Novo", "password": "Senha1234", "role": "admin"}),
            ("PATCH", f"/team/{alvo.id}/role", {"role": "admin"}),
            ("PUT", f"/team/{alvo.id}", {"full_name": "Renomeado"}),
            ("PATCH", f"/team/{alvo.id}/reset-password", {"new_password": "NovaSenha123"}),
            ("DELETE", f"/team/{alvo.id}", None), ("PATCH", f"/team/{alvo.id}/activate", None),
            ("POST", "/auth/register", {"email": f"y{papel}@example.com", "password": "Senha1234", "full_name": "Fulano Registro", "role": "admin"}),
        ]
        for metodo, caminho, corpo in tentativas:
            r = await test_client.request(metodo, f"{API}{caminho}", headers=hh, json=corpo)
            if r.status_code != 403:
                erros.append(f"{papel} {metodo} {caminho} -> {r.status_code} {r.text[:100]}")
    assert erros == [], "\n".join(erros)


async def test_equipe_de_outra_loja_e_intocavel(test_client, async_session, test_user, loja, loja_real):
    """Admin da loja B não lê, renomeia, promove, derruba, REDEFINE SENHA nem reativa gente da loja A."""
    t_id, h = loja
    alvo, h_alvo = await novo_usuario(async_session, t_id, "seller")
    alvo_id, alvo_email = alvo.id, alvo.email
    _, _, tok_b = await _nova_loja(async_session, "pro")
    hb = bearer(tok_b)
    resp = []
    for metodo, caminho, corpo in [
        ("GET", f"/team/{alvo_id}", None), ("PUT", f"/team/{alvo_id}", {"full_name": "HACKEADO"}),
        ("PATCH", f"/team/{alvo_id}/role", {"role": "admin"}),
        ("PATCH", f"/team/{alvo_id}/reset-password", {"new_password": "NovaSenha123", "password": "NovaSenha123"}),
        ("DELETE", f"/team/{alvo_id}", None), ("PATCH", f"/team/{alvo_id}/activate", None),
    ]:
        r = await test_client.request(metodo, f"{API}{caminho}", headers=hb, json=corpo)
        if r.status_code not in (404, 403, 400, 422):
            resp.append(f"{metodo} {caminho} -> {r.status_code} {r.text[:120]}")
    assert resp == [], "\n".join(resp)
    lista = (await test_client.get(f"{API}/team", headers=hb)).text
    assert alvo_email not in lista
    async_session.expire_all()
    from app.models.user import User
    u = (await async_session.execute(select(User).where(User.id == alvo_id))).scalar_one()
    assert u.is_active and u.full_name != "HACKEADO" and str(u.role).lower().endswith("seller")
    assert (await test_client.get(f"{API}/sales/", headers=h_alvo)).status_code == 200   # token dele segue válido


# ── limite de usuários por plano ──────────────────────────────────────────────────────────────────────────────────────

def _membro(n, papel="seller"):
    return {"email": f"aud.lim.{n}.{datetime.now().timestamp()}@example.com", "full_name": f"Membro Limite {n}",
            "password": "Senha1234", "role": papel}


@pytest.mark.parametrize("plano,limite", [("free", 1), ("trial", 3), ("pro", 5)])
async def test_limite_do_plano_vale_para_criar_e_reativar(test_client, async_session, loja_real, plano, limite):
    _, _, tok = await _nova_loja(async_session, plano)
    h = bearer(tok)
    criados = []
    for i in range(limite + 2):
        r = await test_client.post(f"{API}/team", headers=h, json=_membro(i))
        if i < limite - 1:
            assert r.status_code == 201, (i, r.text)
            criados.append(r.json()["id"])
        else:
            assert r.status_code == 403 and "Limite" in r.json()["detail"], (i, r.status_code, r.text)
    if criados:
        # desativa um: abre a vaga; reativar outro além do limite é recusado
        assert (await test_client.delete(f"{API}/team/{criados[0]}", headers=h)).status_code == 200
        r = await test_client.post(f"{API}/team", headers=h, json=_membro(99))
        assert r.status_code == 201, r.text
        r = await test_client.patch(f"{API}/team/{criados[0]}/activate", headers=h)
        assert r.status_code == 403, r.text


async def test_dois_cadastros_simultaneos_na_ultima_vaga(test_client, sessao_por_requisicao, async_session, loja_real):
    """Vaga única, dois POST /team ao mesmo tempo: só um pode entrar. (Condição de corrida CONHECIDA, documentada no CLAUDE.md:
    o limite é conferido sem trava de linha. No SQLite os pedidos se enfileiram; no Postgres a janela é real.)"""
    _, _, tok = await _nova_loja(async_session, "trial")
    h = bearer(tok)
    assert (await test_client.post(f"{API}/team", headers=h, json=_membro(1))).status_code == 201   # 2 de 3: sobra 1 vaga
    rs = await asyncio.gather(*[test_client.post(f"{API}/team", headers=h, json=_membro(10 + i)) for i in range(4)])
    codigos = sorted(r.status_code for r in rs)
    assert not any(c >= 500 for c in codigos), codigos
    ativos = (await test_client.get(f"{API}/team", headers=h)).json()
    n_ativos = sum(1 for u in ativos.get("items", ativos.get("users", [])) if u.get("is_active"))
    assert n_ativos == 3, f"limite 3 estourado: {n_ativos} ativos; códigos {codigos}"


async def test_loja_desativada_nao_vende(test_client, async_session, test_user, loja):
    from app.models.store import Store
    t_id, h = loja
    u, hu = await novo_usuario(async_session, t_id, "cashier")
    from app.core import store_suspension
    assert (await test_client.get(f"{API}/sales/", headers=hu)).status_code == 200
    await async_session.execute(update(Store).where(Store.id == t_id).values(is_active=False))
    await async_session.commit()
    store_suspension.clear_cache()      # a leitura da loja é guardada por 30 s
    try:
        r = await test_client.get(f"{API}/sales/", headers=hu)
        assert r.status_code == 403, r.status_code
    finally:
        await async_session.execute(update(Store).where(Store.id == t_id).values(is_active=True))
        await async_session.commit()
        store_suspension.clear_cache()
