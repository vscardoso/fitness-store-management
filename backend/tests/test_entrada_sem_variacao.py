"""Produto que perdeu todas as variações não recebe item de entrada sem variação (caso real: #086, loja 2, 10/11/2026)."""
import itertools
from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.entry_item import EntryItem
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.stock_entry import StockEntry
from tests.test_lot_costs import _loja_api, _limpa_loja_1  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
API = "/api/v1"
_n = itertools.count(1)


async def _produto_sem_variacao(test_client, async_session, h, cat):
    n = next(_n)
    nome = f"Agasalho Teste {n}"
    r = await test_client.post(f"{API}/stock-entries/with-new-product-variants", headers=h, json={
        "entry_code": f"SV-{n:05d}", "entry_date": date.today().isoformat(), "entry_type": "local", "supplier_name": "Forn SV",
        "product_name": nome, "product_category_id": cat, "base_price": 100,
        "variants": [{"sku": f"SV{n}-PRE-G", "color": "Preto", "size": "G", "price": 100, "cost_price": 55, "quantity": 1}]})
    assert r.status_code in (200, 201), r.text
    entry_id = r.json()["id"]
    p = (await async_session.execute(select(Product).where(Product.name == nome))).scalar_one()
    v = (await async_session.execute(select(ProductVariant).where(ProductVariant.product_id == p.id))).scalar_one()
    # no caso real a peça foi baixada por "ajuste" na Conferência e depois a variação foi excluída: aqui só o resultado final
    v.is_active = False
    await async_session.commit()
    ativas = (await async_session.execute(select(func.count()).select_from(ProductVariant).where(
        ProductVariant.product_id == p.id, ProductVariant.is_active == True))).scalar()  # noqa: E712
    assert ativas == 0
    return p.id, entry_id


async def _itens_sem_variacao(async_session, t_id):
    return (await async_session.execute(select(func.count()).select_from(EntryItem).where(
        EntryItem.tenant_id == t_id, EntryItem.variant_id.is_(None), EntryItem.is_active == True))).scalar()  # noqa: E712


async def test_item_avulso_sem_variacao_e_recusado_com_frase_clara(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    pid, entry_id = await _produto_sem_variacao(test_client, async_session, h, cat)
    antes = await _itens_sem_variacao(async_session, t_id)
    r = await test_client.post(f"{API}/stock-entries/{entry_id}/items", headers=h, json={"product_id": pid, "quantity_received": 1, "unit_cost": 55})
    assert r.status_code == 400, r.text
    assert "sem variação ativa" in r.json()["detail"] and "Nova cor ou tamanho" in r.json()["detail"]
    await async_session.rollback()
    assert await _itens_sem_variacao(async_session, t_id) == antes                                    # nada foi gravado


async def test_entrada_nova_com_produto_sem_variacao_e_recusada_e_nao_cria_entrada(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    pid, _ = await _produto_sem_variacao(test_client, async_session, h, cat)
    entradas = (await async_session.execute(select(func.count()).select_from(StockEntry).where(StockEntry.tenant_id == t_id))).scalar()
    r = await test_client.post(f"{API}/stock-entries/", headers=h, json={
        "entry_code": f"SV-NOVA-{next(_n):04d}", "entry_date": date.today().isoformat(), "entry_type": "local", "supplier_name": "Forn SV",
        "items": [{"product_id": pid, "quantity_received": 1, "unit_cost": 55}]})
    assert r.status_code == 400, r.text
    assert "sem variação ativa" in r.json()["detail"]
    await async_session.rollback()
    assert (await async_session.execute(select(func.count()).select_from(StockEntry).where(StockEntry.tenant_id == t_id))).scalar() == entradas


async def test_com_a_variacao_nova_criada_a_entrada_funciona(test_client, async_session, test_user):
    """O caminho certo que a frase indica: criar a variação (cor e tamanho) e dar entrada nela."""
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    pid, entry_id = await _produto_sem_variacao(test_client, async_session, h, cat)
    r = await test_client.post(f"{API}/stock-entries/{entry_id}/variants", headers=h, json={"product_id": pid, "color": "Preto", "size": "G", "quantity": 1, "cost_price": 55, "price": 100})
    assert r.status_code in (200, 201), r.text
    await async_session.rollback()
    assert await _itens_sem_variacao(async_session, t_id) == 0
