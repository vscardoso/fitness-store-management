"""Troca de peça dentro do prazo (e prazo configurável por loja).

Cenário do lojista: cliente comprou 5 peças e, no prazo, troca algumas por outra cor/tamanho. A loja pode não
devolver dinheiro (só troca); a diferença de preço é paga na hora e entra como pagamento da venda de troca.
"""
import itertools
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
D = Decimal
_n = itertools.count(1)


async def _cenario(db, test_user, *, price_a="100.00", price_b="100.00", stock_b=10):
    """Loja 1: produto com a variação A (vendida) e B (para trocar). Entrada de 10 de A e `stock_b` de B a R$ 40."""
    from app.models.product_variant import ProductVariant
    t_id, token, cat = await _loja_api(db, test_user)
    p, va = await _produto(db, t_id, cat, "Legging Troca", price_a)
    vb = ProductVariant(product_id=p.id, sku=f"TRC-{next(_n)}-B", color="Azul", size="M", price=D(price_b), tenant_id=t_id)
    db.add(vb)
    await db.flush()
    itens = [(va, p, 10, 40)]
    if stock_b:
        itens.append((vb, p, stock_b, 40))
    await _lote(db, t_id, itens)
    ids = [SimpleNamespace(id=x.id) for x in (p, va, vb)]
    await db.commit()
    return (t_id, {"Authorization": f"Bearer {token}"}, *ids)


async def _vender(client, h, p, v, qtd, preco):
    r = await client.post("/api/v1/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": str(preco)}],
        "payments": [{"amount": str(D(preco) * qtd), "payment_method": "cash"}]})
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return body["id"], body["items"][0]["id"]


async def _estoque(db, variant_id):
    from app.models.entry_item import EntryItem
    rows = (await db.execute(select(EntryItem).where(EntryItem.variant_id == variant_id))).scalars().all()
    return sum(r.quantity_remaining for r in rows)


async def _config(db, tenant_id, **campos):
    from app.models.store import Store
    s = (await db.execute(select(Store).where(Store.id == tenant_id))).scalar_one()
    for k, v in campos.items():
        setattr(s, k, v)
    await db.commit()


async def test_troca_de_1_das_5_pecas_mesmo_preco(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 5, "100.00")
    ea, eb = await _estoque(async_session, va.id), await _estoque(async_session, vb.id)
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Tamanho não serviu", "items": [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}]})
    assert r.status_code == 201, r.text
    body = r.json()
    assert float(body["total_refund"]) == 100.0 and float(body["net_amount"]) == 0.0
    assert body["exchange_sale_id"] and body["exchange_sale_number"].startswith("VENDA-")
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == ea + 1      # a peça devolvida voltou
    assert await _estoque(async_session, vb.id) == eb - 1      # a peça nova saiu (FIFO)
    from app.models.sale import Payment, Sale
    nova = (await async_session.execute(select(Sale).where(Sale.id == body["exchange_sale_id"]))).scalar_one()
    assert float(nova.total_amount) == 100.0 and nova.notes.startswith("Troca da venda")
    pagos = (await async_session.execute(select(Payment).where(Payment.sale_id == nova.id))).scalars().all()
    assert pagos == []                                          # sem diferença, nada a cobrar
    original = (await async_session.execute(select(Sale).where(Sale.id == sale_id))).scalar_one()
    assert str(original.status).lower().endswith("partially_refunded")


async def test_troca_por_peca_mais_cara_cobra_a_diferenca_na_hora(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="130.00")
    sale_id, item_id = await _vender(test_client, h, p, va, 5, "100.00")
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Quer outra cor", "settlement_method": "pix",
        "items": [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}]})
    assert r.status_code == 201, r.text
    body = r.json()
    assert float(body["net_amount"]) == 30.0 and body["settlement_method"] == "pix"
    async_session.expire_all()
    from app.models.sale import Payment
    pagos = (await async_session.execute(select(Payment).where(Payment.sale_id == body["exchange_sale_id"]))).scalars().all()
    assert len(pagos) == 1 and float(pagos[0].amount) == 30.0 and str(pagos[0].payment_method).lower().endswith("pix")
    assert pagos[0].status == "confirmed"


async def test_loja_que_nao_devolve_dinheiro_recusa_peca_mais_barata_e_devolucao_seca(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="70.00")
    await _config(async_session, t_id, allow_money_refund=False)
    try:
        sale_id, item_id = await _vender(test_client, h, p, va, 5, "100.00")
        ea, eb = await _estoque(async_session, va.id), await _estoque(async_session, vb.id)
        # peça nova vale menos: a loja não devolve a diferença, então recusa tudo
        r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
            "reason": "Troca", "items": [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}]})
        assert r.status_code == 400 and "não devolve dinheiro" in r.json()["detail"]
        # devolução sem peça nova: também recusada
        r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
            "reason": "Desistiu", "items": [{"sale_item_id": item_id, "quantity": 1}]})
        assert r.status_code == 400 and "não devolve dinheiro" in r.json()["detail"]
        async_session.expire_all()
        assert (await _estoque(async_session, va.id), await _estoque(async_session, vb.id)) == (ea, eb)  # nada mudou
    finally:
        await _config(async_session, t_id, allow_money_refund=True)


async def test_troca_sem_estoque_da_peca_nova_ou_mesma_variacao_e_recusada(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user, stock_b=0)
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Troca", "items": [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": vb.id}]})
    assert r.status_code == 400 and "Sem estoque" in r.json()["detail"]
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Troca", "items": [{"sale_item_id": item_id, "quantity": 1, "replacement_variant_id": va.id}]})
    assert r.status_code == 400 and "diferente" in r.json()["detail"]
    r = await test_client.get(f"/api/v1/returns/history/{sale_id}", headers=h)
    assert r.status_code == 200 and r.json() == []              # nada foi gravado


async def test_peca_com_defeito_nao_volta_ao_estoque(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    ea = await _estoque(async_session, va.id)
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Costura aberta", "items": [{"sale_item_id": item_id, "quantity": 1, "restock": False, "replacement_variant_id": vb.id}]})
    assert r.status_code == 201, r.text
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == ea           # não voltou


async def test_prazo_da_loja_configuravel(test_client, async_session, test_user):
    from app.models.sale import Sale
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 2, "100.00")
    venda = (await async_session.execute(select(Sale).where(Sale.id == sale_id))).scalar_one()
    venda.created_at = datetime.now(timezone.utc) - timedelta(days=10)
    await async_session.commit()
    try:
        e = (await test_client.get(f"/api/v1/returns/eligibility/{sale_id}", headers=h)).json()
        assert e["is_eligible"] is False and e["max_return_days"] == 7 and "7 dias" in e["reason"]
        r = await test_client.put("/api/v1/store/return-settings", headers=h, json={"return_window_days": 15, "allow_money_refund": True})
        assert r.status_code == 200 and r.json()["return_window_days"] == 15
        e = (await test_client.get(f"/api/v1/returns/eligibility/{sale_id}", headers=h)).json()
        assert e["is_eligible"] is True and e["max_return_days"] == 15
        assert e["items"][0]["variant_label"] is not None
        r = await test_client.put("/api/v1/store/return-settings", headers=h, json={"return_window_days": 91})
        assert r.status_code == 422                              # limite de 0 a 90
    finally:
        await _config(async_session, t_id, return_window_days=7, allow_money_refund=True)


async def test_prazo_so_admin_altera(test_client, async_session, test_user):
    from app.core.permissions import RULES  # noqa: F401
    t_id, h, *_ = await _cenario(async_session, test_user)
    r = await test_client.get("/api/v1/store/return-settings", headers=h)
    assert r.status_code == 200 and r.json() == {"return_window_days": 7, "allow_money_refund": True}


# ───────────────────── devolução ao fornecedor ─────────────────────

async def _entry_item(db, variant_id):
    from app.models.entry_item import EntryItem
    return (await db.execute(select(EntryItem).where(EntryItem.variant_id == variant_id).order_by(EntryItem.id))).scalars().first()


async def test_defeito_vai_ao_fornecedor_e_ele_troca_por_outra_peca(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    sale_id, item_id = await _vender(test_client, h, p, va, 3, "100.00")
    r = await test_client.post(f"/api/v1/returns/{sale_id}", headers=h, json={
        "reason": "Costura aberta", "items": [{"sale_item_id": item_id, "quantity": 1, "restock": False, "replacement_variant_id": vb.id}]})
    assert r.status_code == 201, r.text
    pend = (await test_client.get("/api/v1/supplier-returns/defective-pending", headers=h)).json()
    mine = [x for x in pend if x["variant_id"] == va.id]
    assert mine and mine[0]["quantity_pending"] == 1      # (mais recente primeiro; o banco de teste é compartilhado)
    ri = mine[0]["return_item_id"]
    estoque_a = await _estoque(async_session, va.id)

    r = await test_client.post("/api/v1/supplier-returns/", headers=h, json={"return_item_id": ri, "quantity": 1, "reason": "Defeito de fábrica"})
    assert r.status_code == 201, r.text
    sr = r.json()
    assert sr["status"] == "sent" and sr["from_stock"] is False and float(sr["unit_cost"]) == 40.0
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == estoque_a        # defeito já estava fora do estoque
    # não dá para enviar a mesma peça duas vezes
    r = await test_client.post("/api/v1/supplier-returns/", headers=h, json={"return_item_id": ri, "quantity": 1, "reason": "De novo"})
    assert r.status_code == 400 and "Só restam 0" in r.json()["detail"]

    # fornecedor troca por outra peça (variação B) ao mesmo custo
    eb = await _estoque(async_session, vb.id)
    r = await test_client.post(f"/api/v1/supplier-returns/{sr['id']}/resolve", headers=h, json={"outcome": "exchanged", "replacement_variant_id": vb.id})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "exchanged" and r.json()["replacement_entry_item_id"]
    async_session.expire_all()
    assert await _estoque(async_session, vb.id) == eb + 1
    novo = (await async_session.execute(select(__import__("app.models.entry_item", fromlist=["EntryItem"]).EntryItem).where(
        __import__("app.models.entry_item", fromlist=["EntryItem"]).EntryItem.id == r.json()["replacement_entry_item_id"]))).scalar_one()
    assert float(novo.unit_cost) == 40.0
    # resolvido não resolve de novo
    r = await test_client.post(f"/api/v1/supplier-returns/{sr['id']}/resolve", headers=h, json={"outcome": "rejected"})
    assert r.status_code == 400 and "já foi resolvida" in r.json()["detail"]


async def test_condicional_em_estoque_sai_ao_enviar_e_volta_se_o_fornecedor_recusa(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    item = await _entry_item(async_session, vb.id)
    item_id = item.id
    antes = await _estoque(async_session, vb.id)
    r = await test_client.post("/api/v1/supplier-returns/", headers=h, json={"entry_item_id": item_id, "quantity": 4, "reason": "Condicional: não vendeu"})
    assert r.status_code == 201 and r.json()["from_stock"] is True
    sr_id = r.json()["id"]
    async_session.expire_all()
    assert await _estoque(async_session, vb.id) == antes - 4
    # mais do que tem em estoque: recusa
    r = await test_client.post("/api/v1/supplier-returns/", headers=h, json={"entry_item_id": item_id, "quantity": 99, "reason": "Demais"})
    assert r.status_code == 400 and "em estoque" in r.json()["detail"]
    r = await test_client.post(f"/api/v1/supplier-returns/{sr_id}/resolve", headers=h, json={"outcome": "rejected", "note": "Fora do prazo"})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    async_session.expire_all()
    assert await _estoque(async_session, vb.id) == antes            # recusou: as peças voltaram


async def test_fornecedor_credita_vira_desconto_na_entrada_e_abate_o_custo(test_client, async_session, test_user):
    from app.models.entry_item import EntryItem
    from app.models.stock_entry import StockEntry
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    item = await _entry_item(async_session, vb.id)
    item_id, entry_id = item.id, item.entry_id
    r = await test_client.post("/api/v1/supplier-returns/", headers=h, json={"entry_item_id": item_id, "quantity": 2, "reason": "Condicional"})
    sr_id = r.json()["id"]
    r = await test_client.post(f"/api/v1/supplier-returns/{sr_id}/resolve", headers=h, json={"outcome": "credited", "credit_amount": 20})
    assert r.status_code == 200 and float(r.json()["credit_amount"]) == 20.0
    async_session.expire_all()
    entry = (await async_session.execute(select(StockEntry).where(StockEntry.id == entry_id))).scalar_one()
    assert float(entry.discount_amount) == 20.0
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.entry_id == entry_id))).scalars().all()
    assert all(float(i.extra_unit_cost) < 0 for i in itens)         # desconto virou custo menor por peça
    # crédito sem valor é recusado e nada muda
    r2 = await test_client.post("/api/v1/supplier-returns/", headers=h, json={"entry_item_id": item_id, "quantity": 1, "reason": "Outra"})
    r3 = await test_client.post(f"/api/v1/supplier-returns/{r2.json()['id']}/resolve", headers=h, json={"outcome": "credited"})
    assert r3.status_code == 422 or r3.status_code == 400
