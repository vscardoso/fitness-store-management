"""
Regressao dos 5 achados ALTOS da auditoria de seguranca (docs/security-audit/REPORT.md).
Comando: cd backend && venv\\Scripts\\python -m pytest tests/test_seguranca_achados_altos.py -q
"""
from datetime import datetime, timedelta, timezone

import pytest
import jwt

from app.core.config import settings


# ── 1) Webhooks Stone/Cielo/Cielo PIX exigem segredo (fail-closed) ───────────

@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["stone", "cielo", "cielo-pix"])
async def test_webhooks_sem_token_sao_recusados(test_client, monkeypatch, path):
    monkeypatch.setattr(settings, "PDV_WEBHOOK_TOKEN", "")
    r = await test_client.post(f"/api/v1/pdv/webhooks/{path}", json={})
    assert r.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["stone", "cielo", "cielo-pix"])
async def test_webhooks_token_errado_recusado_e_certo_aceito(test_client, monkeypatch, path):
    monkeypatch.setattr(settings, "PDV_WEBHOOK_TOKEN", "segredo-teste")
    ruim = await test_client.post(f"/api/v1/pdv/webhooks/{path}", json={}, headers={"X-Webhook-Token": "errado"})
    assert ruim.status_code == 401
    bom = await test_client.post(f"/api/v1/pdv/webhooks/{path}", json={}, headers={"X-Webhook-Token": "segredo-teste"})
    assert bom.status_code == 200


# ── 2) Mercado Pago: assinatura fail-closed sem segredo ─────────────────────

def test_mp_assinatura_recusada_sem_segredo(monkeypatch):
    from app.services.payment_providers.mercadopago import MercadoPagoTerminalProvider
    monkeypatch.setattr(settings, "MP_WEBHOOK_SECRET", "")
    assert MercadoPagoTerminalProvider().verify_webhook_signature(None, None, "1") is False


# ── 3) OAuth state assinado ──────────────────────────────────────────────────

def test_oauth_state_assinado_ida_e_volta():
    from app.api.v1.endpoints.mp_connect import _make_state, _read_state
    assert _read_state(_make_state(7, 1)) == 7


def test_oauth_state_inteiro_cru_e_rejeitado():
    from app.api.v1.endpoints.mp_connect import _read_state
    assert _read_state("2") is None


def test_oauth_state_expirado_ou_outro_proposito_e_rejeitado():
    from app.api.v1.endpoints.mp_connect import _read_state
    passado = datetime.now(timezone.utc) - timedelta(minutes=1)
    expirado = jwt.encode({"tid": 2, "purpose": "mp_oauth", "exp": passado}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    outro = jwt.encode(
        {"tid": 2, "purpose": "x", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        settings.SECRET_KEY, algorithm=settings.ALGORITHM,
    )
    assert _read_state(expirado) is None
    assert _read_state(outro) is None


# ── 4) /admin so para operadores da plataforma ───────────────────────────────

def test_admin_painel_bloqueado_sem_allowlist(monkeypatch):
    from app.admin.auth import _is_operator
    monkeypatch.setattr(settings, "ADMIN_PANEL_EMAILS", "")
    assert _is_operator("dono@loja.com") is False


def test_admin_painel_so_emails_da_allowlist(monkeypatch):
    from app.admin.auth import _is_operator
    monkeypatch.setattr(settings, "ADMIN_PANEL_EMAILS", "Op@Provadorfit.com.br, outro@x.com")
    assert _is_operator("op@provadorfit.com.br") is True
    assert _is_operator("dono@loja.com") is False
    assert _is_operator(None) is False


# ── 5) POST /pdv/orders nao toca venda de outro tenant ───────────────────────

@pytest.mark.asyncio
async def test_create_order_rejeita_venda_de_outro_tenant(db, test_user):
    from app.services.pdv_service import PDVService

    class _Terminal:
        tenant_id = test_user.tenant_id
        provider = "manual"

    svc = PDVService.__new__(PDVService)

    class _Repo:
        async def get(self, _db, _id):
            return _Terminal()

    svc.repo = _Repo()

    class _Payload:
        terminal_id = 1
        sale_id = 987654  # inexistente neste tenant
        total_amount = 1.0
        payment_type = "credit_card"
        installments = 1
        description = "x"
        expiration_time = "PT15M"

    with pytest.raises(ValueError, match="Venda não encontrada"):
        await svc.create_order(db, test_user.tenant_id, _Payload())
