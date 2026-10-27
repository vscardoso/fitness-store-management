"""Item 2.3: limite de tentativas no cadastro, no esqueci a senha, na consulta de e-mail e no scanner de IA.

Passou do limite: 429, frase em português e Retry-After (segundos)."""
import io

import pytest

from app.core import rate_limit
from tests.conftest import create_access_token  # noqa: F401

pytestmark = pytest.mark.asyncio


def _signup(n):
    return {"full_name": f"Robo {n}", "email": f"robo{n}@example.com", "password": "SenhaForte123",
            "store_name": f"Loja Robo {n}", "accept_terms": True}


async def test_cadastro_para_no_sexto_do_mesmo_ip(test_client):
    from app.core.legal import LEGAL_VERSION
    codes = []
    for n in range(6):
        r = await test_client.post("/api/v1/auth/signup", json={**_signup(n), "terms_version": LEGAL_VERSION})
        codes.append(r.status_code)
    assert codes[:5] == [201] * 5, codes
    assert codes[5] == 429
    assert "Tente de novo em" in r.json()["detail"] and int(r.headers["retry-after"]) > 0


async def test_esqueci_a_senha_por_email_e_por_ip(test_client):
    for _ in range(3):
        assert (await test_client.post("/api/v1/auth/forgot-password", json={"email": "alvo@example.com"})).status_code == 200
    r = await test_client.post("/api/v1/auth/forgot-password", json={"email": "alvo@example.com"})
    assert r.status_code == 429 and "Muitas solicitações de nova senha" in r.json()["detail"]
    # outro e-mail ainda passa até o limite do IP (5 em 15 min)
    assert (await test_client.post("/api/v1/auth/forgot-password", json={"email": "outro@example.com"})).status_code == 200
    r = await test_client.post("/api/v1/auth/forgot-password", json={"email": "terceiro@example.com"})
    assert r.status_code == 429


async def test_consulta_de_email_nao_serve_para_varrer(test_client):
    for i in range(30):
        r = await test_client.post("/api/v1/auth/check-email", json={"email": f"v{i}@example.com"})
        assert r.status_code == 200, (i, r.text)
    r = await test_client.post("/api/v1/auth/check-email", json={"email": "v31@example.com"})
    assert r.status_code == 429


async def test_scanner_por_usuario(test_client, test_user):
    h = {"Authorization": "Bearer " + create_access_token(data={"sub": str(test_user.id)})}
    codes = []
    for _ in range(16):
        files = {"image": ("x.png", io.BytesIO(b"nao e imagem"), "image/png")}
        r = await test_client.post("/api/v1/ai/scan-product", headers=h, files=files, data={"check_duplicates": "false"})
        codes.append(r.status_code)
    assert all(c != 429 for c in codes[:15]), codes
    assert codes[15] == 429 and "leituras do scanner" in r.json()["detail"], (codes, r.text)


async def test_janela_libera_depois(monkeypatch):
    agora = [1000.0]
    monkeypatch.setattr(rate_limit.time, "time", lambda: agora[0])
    assert rate_limit.hit("k", 2, 60) is None and rate_limit.hit("k", 2, 60) is None
    assert rate_limit.hit("k", 2, 60) == 61
    agora[0] += 61
    assert rate_limit.hit("k", 2, 60) is None
