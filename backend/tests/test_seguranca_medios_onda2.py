"""
Regressao dos medios novos da 2a rodada (docs/security-audit/RUN2.md): categoria de outra loja,
endpoints /notifications/test/* em producao e categoria de despesa.
"""
import uuid

import pytest

from app.core.config import settings


@pytest.mark.asyncio
async def test_categoria_de_outra_loja_nao_e_lida_nem_cacheada(db, test_user):
    from app.api.v1.endpoints import products as prod_ep
    from app.models.category import Category

    outra = test_user.tenant_id + 1000
    cat = Category(name="Categoria alheia", slug="alheia-" + uuid.uuid4().hex[:8], tenant_id=outra)
    db.add(cat)
    await db.flush()

    prod_ep._category_cache.clear()
    assert await prod_ep.get_category_data(db, cat.id, test_user.tenant_id) is None
    assert (await prod_ep.get_category_data(db, cat.id, outra))["name"] == "Categoria alheia"
    # cache por (tenant, id): a loja de fora nao enxerga o item cacheado da outra
    assert await prod_ep.get_category_data(db, cat.id, test_user.tenant_id) is None


@pytest.mark.asyncio
async def test_despesa_recusa_categoria_de_outra_loja(db, test_user):
    from app.models.expense import ExpenseCategory
    from app.services.expense_service import ExpenseService

    outra = test_user.tenant_id + 1000
    cat = ExpenseCategory(name="Alheia", tenant_id=outra)
    db.add(cat)
    await db.flush()

    svc = ExpenseService(db)
    with pytest.raises(ValueError, match="Categoria não encontrada"):
        await svc._validate_category(cat.id, test_user.tenant_id)
    await svc._validate_category(cat.id, outra)  # propria loja: ok
    await svc._validate_category(None, test_user.tenant_id)  # sem categoria: ok


@pytest.mark.asyncio
async def test_endpoints_de_teste_de_notificacao_nao_existem_em_producao(test_client, auth_token, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    h = {"Authorization": f"Bearer {auth_token}"}
    r = await test_client.post("/api/v1/notifications/test/check-sla", headers=h)
    assert r.status_code == 404
