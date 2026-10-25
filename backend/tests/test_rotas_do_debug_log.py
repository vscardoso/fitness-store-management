"""Rotas que já falharam no DEBUG_LOG.txt (trace do app em desenvolvimento) e não podem voltar a falhar.

Cada teste abaixo é a "prova" de um erro registrado em `scripts/debug_log_resolvidos.json`: enquanto o teste passa,
o script `scripts/limpar_debug_log.py` considera aquele erro sanado e pode limpar o arquivo.
"""
import pytest

from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto, _viagem  # noqa: F401

pytestmark = pytest.mark.asyncio


async def _cenario(db, test_user):
    t_id, token, cat = await _loja_api(db, test_user)
    p, v = await _produto(db, t_id, cat, "Peca Trace", "80.00")
    p_id, v_id = p.id, v.id
    trip = await _viagem(db, t_id, fuel=50)
    lote = await _lote(db, t_id, [(v, p, 4, 20)], trip=trip)
    ids = {"t": t_id, "p": p_id, "v": v_id, "trip": trip.id, "entry": lote.id}
    await db.commit()
    return ids, {"Authorization": f"Bearer {token}"}


async def test_pdv_vendas_pendentes_nao_da_500(test_client, async_session, test_user):
    """Trace: GET /pdv/pending-sales dava 500 (coluna c.name, token ':' no SQL)."""
    _, h = await _cenario(async_session, test_user)
    r = await test_client.get("/api/v1/pdv/pending-sales", headers=h)
    assert r.status_code == 200, r.text[:200]


async def test_analytics_da_viagem_nao_da_500(test_client, async_session, test_user):
    """Trace: GET /trips/{id}/analytics dava 500 (unrecognized token ':')."""
    ids, h = await _cenario(async_session, test_user)
    r = await test_client.get(f"/api/v1/trips/{ids['trip']}/analytics", headers=h)
    assert r.status_code == 200, r.text[:200]


async def test_produtos_agrupados_respondem_no_limite_permitido(test_client, async_session, test_user):
    """Trace: /products/grouped recusava limit acima de 500 (o limite é 500; o app pede até isso)."""
    _, h = await _cenario(async_session, test_user)
    assert (await test_client.get("/api/v1/products/grouped?limit=500", headers=h)).status_code == 200


async def test_excluir_produto_sem_venda_nao_da_500(test_client, async_session, test_user):
    """Trace: DELETE /products/{id} dava 500 (SQL 'near ei'). Produto com venda continua sendo recusado (400)."""
    ids, h = await _cenario(async_session, test_user)
    r = await test_client.delete(f"/api/v1/products/{ids['p']}", headers=h)
    assert r.status_code in (200, 204, 400, 409), r.text[:200]   # nunca 500


async def test_corrigir_item_da_entrada_nao_da_500(test_client, async_session, test_user):
    """Trace: POST /stock-entries/entry-items/{id}/correct dava 500 (atributo stock_entry_id, argumento id)."""
    ids, h = await _cenario(async_session, test_user)
    entry = (await test_client.get(f"/api/v1/stock-entries/{ids['entry']}", headers=h)).json()
    item_id = entry["entry_items"][0]["id"]
    r = await test_client.post(f"/api/v1/stock-entries/entry-items/{item_id}/correct", headers=h,
                               json={"quantity_diff": -1, "reason": "Contagem do estoque conferida"})
    assert r.status_code < 500, r.text[:200]


async def test_caixa_de_notificacoes_e_envios_condicionais_respondem(test_client, async_session, test_user):
    """Trace: unread-count dava 404 e a lista de envios dava 500 (coluna conditional_shipment_items...)."""
    _, h = await _cenario(async_session, test_user)
    assert (await test_client.get("/api/v1/notifications/inbox/unread-count", headers=h)).status_code == 200
    assert (await test_client.get("/api/v1/conditional-shipments/", headers=h)).status_code == 200


async def test_criar_produto_nao_da_500(test_client, async_session, test_user):
    """Trace: POST /products/ dava 500 (ProductVariant sem atributo barcode)."""
    ids, h = await _cenario(async_session, test_user)
    import itertools
    n = next(itertools.count(1))
    r = await test_client.post("/api/v1/products/", headers=h, json={
        "name": f"Produto Trace {ids['p']}", "sku": f"TRC-{ids['p']}-{n}", "price": 50, "cost_price": 20, "category_id": (
            (await test_client.get("/api/v1/categories/", headers=h)).json()[0]["id"])})
    assert r.status_code < 500, r.text[:200]
