"""Estresse de vendas, FIFO, devolução e troca (premissa: o estoque e o custo nunca podem se perder nem se inventar).

Cenário-título do Victor: vende 30 peças (em 3 camadas de custo), devolve 5 e troca 6 da MESMA venda, e confere tudo:
estoque por camada, custo FIFO das peças que saem e voltam, valores devolvidos, limites e estado final.
Ver docs/PLANO_TESTES_VENDAS_FIFO.md (matriz de cenários e o que falta).
"""
import itertools
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1, _loja_api, _lote, _produto  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
D = Decimal
_n = itertools.count(1)


@pytest.fixture(autouse=True)
async def _limpa_vendas(async_session):
    """Cada teste começa e termina sem as vendas e devoluções que criou (os ids se repetem entre testes e contaminariam o oráculo)."""
    from sqlalchemy import delete, func
    from app.models.sale import Payment, Sale, SaleItem
    from app.models.sale_return import ReturnItem, SaleReturn
    modelos = [ReturnItem, SaleReturn, Payment, SaleItem, Sale]
    antes = {m: (await async_session.execute(select(func.coalesce(func.max(m.id), 0)))).scalar() for m in modelos}
    yield
    await async_session.rollback()
    for m in modelos:
        await async_session.execute(delete(m).where(m.id > antes[m]))
    await async_session.commit()


async def _variacao(db, produto, tenant, preco, cor="Azul", tam="M"):
    from app.models.product_variant import ProductVariant
    v = ProductVariant(product_id=produto.id, sku=f"EST-{next(_n)}-{tenant}", color=cor, size=tam, price=D(str(preco)), tenant_id=tenant)
    db.add(v)
    await db.flush()
    return v


async def _camadas(db, variant_id):
    """[(entry_item_id, recebido, restante, custo)] na ordem do FIFO (data da entrada, depois id)."""
    from app.models.entry_item import EntryItem
    from app.models.stock_entry import StockEntry
    rows = (await db.execute(
        select(EntryItem.id, EntryItem.quantity_received, EntryItem.quantity_remaining, EntryItem.unit_cost, StockEntry.entry_date)
        .join(StockEntry, StockEntry.id == EntryItem.entry_id)
        .where(EntryItem.variant_id == variant_id, EntryItem.is_active == True)  # noqa: E712
        .order_by(StockEntry.entry_date, EntryItem.id))).all()
    return [(r[0], r[1], r[2], D(str(r[3]))) for r in rows]


async def _estoque(db, variant_id):
    return sum(c[2] for c in await _camadas(db, variant_id))


async def _item_da_venda(db, sale_item_id):
    from app.models.sale import SaleItem
    return (await db.execute(select(SaleItem).where(SaleItem.id == sale_item_id))).scalar_one()


async def _confere_camadas(db, variant_id):
    """Nenhuma camada pode ficar negativa nem acima do que entrou."""
    for item_id, recebido, restante, custo in await _camadas(db, variant_id):
        assert 0 <= restante <= recebido, f"camada {item_id}: recebido {recebido}, restante {restante}"


async def _cenario_30(db, test_user, preco_a="100.00", preco_b="100.00", estoque_b=40):
    """Variação A com 3 camadas (10 a R$40, 15 a R$45, 20 a R$50 = 45 peças) e B para a troca."""
    t_id, token, cat = await _loja_api(db, test_user)
    p, va = await _produto(db, t_id, cat, "Legging Estresse", preco_a)
    vb = await _variacao(db, p, t_id, preco_b)
    hoje = date.today()
    await _lote(db, t_id, [(va, p, 10, 40)], entry_date=hoje - timedelta(days=30))
    await _lote(db, t_id, [(va, p, 15, 45)], entry_date=hoje - timedelta(days=20))
    await _lote(db, t_id, [(va, p, 20, 50)], entry_date=hoje - timedelta(days=10))
    if estoque_b:
        await _lote(db, t_id, [(vb, p, estoque_b, 30)], entry_date=hoje - timedelta(days=15))
    ids = [SimpleNamespace(id=x.id) for x in (p, va, vb)]
    await db.commit()
    return t_id, {"Authorization": f"Bearer {token}"}, *ids


async def _vender(client, h, p, v, qtd, preco, metodo="cash"):
    r = await client.post("/api/v1/sales/", headers=h, json={
        "payment_method": metodo, "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": str(preco)}],
        "payments": [{"amount": str(D(str(preco)) * qtd), "payment_method": metodo}]})
    assert r.status_code in (200, 201), r.text
    corpo = r.json()
    return corpo["id"], corpo["items"][0]["id"]


async def _devolver(client, h, sale_id, itens, motivo="Teste de estresse", **extra):
    return await client.post(f"/api/v1/returns/{sale_id}", headers=h, json={"reason": motivo, "items": itens, **extra})


# ───────────────────────────────────────────────────────────────────────── cenário-título
async def test_vende_30_devolve_5_e_troca_6_da_mesma_venda(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario_30(async_session, test_user)
    assert [c[2] for c in await _camadas(async_session, va.id)] == [10, 15, 20]

    sale_id, item_id = await _vender(test_client, h, p, va, 30, "100.00")
    async_session.expire_all()
    # FIFO: 10 da primeira camada (R$40), 15 da segunda (R$45), 5 da terceira (R$50)
    assert [c[2] for c in await _camadas(async_session, va.id)] == [0, 0, 15]
    item = await _item_da_venda(async_session, item_id)
    fontes = item.sale_sources
    fontes = fontes if isinstance(fontes, list) else fontes.get("sources", fontes)
    assert sum(f["quantity_taken"] for f in fontes) == 30
    assert sum(D(str(f["total_cost"])) for f in fontes) == D(10 * 40 + 15 * 45 + 5 * 50)  # 1.325

    # devolve 5 (volta ao estoque)
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 5}])
    assert r.status_code == 201, r.text
    assert D(str(r.json()["total_refund"])) == D("500.00")
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 15 + 5
    await _confere_camadas(async_session, va.id)

    # troca 6 da mesma venda por B (mesmo preço): net 0, A volta +6, B sai 6
    antes_b = await _estoque(async_session, vb.id)
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 6, "replacement_variant_id": vb.id}])
    assert r.status_code == 201, r.text
    corpo = r.json()
    assert D(str(corpo["total_refund"])) == D("600.00") and D(str(corpo["net_amount"])) == D("0.00")
    assert corpo["exchange_sale_id"]
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 20 + 6
    assert await _estoque(async_session, vb.id) == antes_b - 6
    await _confere_camadas(async_session, va.id)
    await _confere_camadas(async_session, vb.id)

    # já saíram da venda: 5 devolvidas + 6 trocadas = 11. Sobram 19 que ainda podem voltar; 20 não.
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 20}])
    assert r.status_code == 400, r.text
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 26  # a recusa não mexeu em nada

    # devolve as 19 restantes: venda vira totalmente devolvida e nada mais pode voltar
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 19}])
    assert r.status_code == 201, r.text
    async_session.expire_all()
    assert await _estoque(async_session, va.id) == 26 + 19 == 45  # voltou tudo que entrou
    await _confere_camadas(async_session, va.id)
    r = await _devolver(test_client, h, sale_id, [{"sale_item_id": item_id, "quantity": 1}])
    assert r.status_code == 400, r.text
