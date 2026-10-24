"""Desconto por fornecedor numa entrada com vários fornecedores + integridade do FIFO.

Regras provadas aqui:
- o desconto de um fornecedor só mexe no custo dos itens DELE;
- mudar ou excluir desconto nunca mexe em quantidades, nas fontes FIFO nem no custo de peças já vendidas;
- vendas novas usam o custo atualizado; o estoque (soma do que sobra) continua batendo com comprado - vendido;
- crédito do fornecedor (devolução) vai para o desconto daquele fornecedor.
"""
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1, _loja_api  # noqa: F401  (fixture autouse)
from tests.test_troca import _vender

pytestmark = pytest.mark.asyncio
D = Decimal


@pytest.fixture(autouse=True)
async def _limpa_extras(async_session):
    """O banco de teste é compartilhado e reaproveita ids: apaga o que estes testes criaram nas tabelas que a
    limpeza da loja 1 não cobre (descontos por fornecedor, devoluções ao fornecedor, vendas e pagamentos)."""
    from sqlalchemy import delete, func
    from app.models.entry_supplier_discount import EntrySupplierDiscount
    from app.models.sale import Payment, Sale, SaleItem
    from app.models.supplier import Supplier
    from app.models.supplier_return import SupplierReturn
    modelos = [EntrySupplierDiscount, SupplierReturn, Payment, SaleItem, Sale, Supplier]
    antes = {m: (await async_session.execute(select(func.coalesce(func.max(m.id), 0)))).scalar() for m in modelos}
    yield
    await async_session.rollback()
    for m in modelos:
        await async_session.execute(delete(m).where(m.id > antes[m]))
    await async_session.commit()


async def _entrada_dois_fornecedores(db, test_user):
    """Entrada com A (10 peças x R$ 10 = R$ 100) e B (10 peças x R$ 20 = R$ 200). Devolve ids e cabeçalho."""
    import itertools
    from datetime import date
    from app.models.entry_item import EntryItem
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import EntryType, StockEntry
    from app.models.supplier import Supplier
    t_id, token, cat = await _loja_api(db, test_user)
    n = next(_seq)
    sa = Supplier(name=f"Forn A {n}", tenant_id=t_id)
    sb = Supplier(name=f"Forn B {n}", tenant_id=t_id)
    db.add_all([sa, sb])
    await db.flush()
    p = Product(name=f"Conjunto {n}", category_id=cat, tenant_id=t_id, base_price=D("100"))
    db.add(p)
    await db.flush()
    va = ProductVariant(product_id=p.id, sku=f"DF-{n}-A", color="Preto", price=D("100"), tenant_id=t_id)
    vb = ProductVariant(product_id=p.id, sku=f"DF-{n}-B", color="Azul", price=D("100"), tenant_id=t_id)
    db.add_all([va, vb])
    await db.flush()
    e = StockEntry(entry_code=f"DF-{n:04d}", entry_date=date.today(), entry_type=EntryType.LOCAL,
                   supplier_id=sa.id, supplier_name=sa.name, total_cost=D("300"), tenant_id=t_id)
    db.add(e)
    await db.flush()
    ia = EntryItem(entry_id=e.id, variant_id=va.id, product_id=p.id, quantity_received=10, quantity_remaining=10,
                   unit_cost=D("10"), supplier_id=sa.id, tenant_id=t_id)
    ib = EntryItem(entry_id=e.id, variant_id=vb.id, product_id=p.id, quantity_received=10, quantity_remaining=10,
                   unit_cost=D("20"), supplier_id=sb.id, tenant_id=t_id)
    db.add_all([ia, ib])
    await db.flush()
    ids = SimpleNamespace(t=t_id, entry=e.id, p=p.id, va=va.id, vb=vb.id, ia=ia.id, ib=ib.id, sa=sa.id, sb=sb.id)
    await db.commit()
    return ids, {"Authorization": f"Bearer {token}"}


import itertools  # noqa: E402
_seq = itertools.count(1)


async def _itens(db, entry_id):
    from app.models.entry_item import EntryItem
    rows = (await db.execute(select(EntryItem).where(EntryItem.entry_id == entry_id).order_by(EntryItem.id))).scalars().all()
    return rows


async def _put(client, h, entry_id, body):
    return await client.put(f"/api/v1/stock-entries/{entry_id}", headers=h, json=body)


async def _fifo_snapshot(db, ids):
    """Foto do que o desconto NUNCA pode alterar: quantidades dos itens e, nas vendas já feitas, custo e fontes FIFO."""
    from app.models.entry_item import EntryItem
    from app.models.sale import SaleItem
    itens = (await db.execute(select(EntryItem).where(EntryItem.entry_id == ids.entry).order_by(EntryItem.id))).scalars().all()
    vendas = (await db.execute(select(SaleItem).where(SaleItem.variant_id.in_([ids.va, ids.vb])).order_by(SaleItem.id))).scalars().all()
    return {
        "qtd": [(i.id, i.quantity_received, i.quantity_remaining, str(i.unit_cost)) for i in itens],
        "vendas": [(v.id, v.quantity, str(v.unit_cost), repr(v.sale_sources)) for v in vendas],
    }


async def _confere_estoque(db, ids):
    """Invariante FIFO: sobra = recebido - vendido, por item, olhando as fontes das vendas."""
    from app.models.sale import SaleItem
    vendas = (await db.execute(select(SaleItem).where(SaleItem.variant_id.in_([ids.va, ids.vb])))).scalars().all()
    tirado = {}
    for v in vendas:
        for s in (v.sale_sources or {}).get("sources", []):
            tirado[s["entry_item_id"]] = tirado.get(s["entry_item_id"], 0) + s["quantity_taken"]
    for i in await _itens(db, ids.entry):
        assert i.quantity_remaining == i.quantity_received - tirado.get(i.id, 0), f"FIFO divergiu no item {i.id}"
        assert 0 <= i.quantity_remaining <= i.quantity_received


async def test_desconto_de_um_fornecedor_so_abate_os_itens_dele(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    r = await _put(test_client, h, ids.entry, {"supplier_discounts": [{"supplier_id": ids.sb, "amount": 40}]})
    assert r.status_code == 200, r.text
    async_session.expire_all()
    ia, ib = await _itens(async_session, ids.entry)
    assert ia.extra_unit_cost == D("0") and ia.landed_unit_cost == D("10.00")         # fornecedor A intacto
    assert ib.extra_unit_cost == D("-4.0000") and ib.landed_unit_cost == D("16.0000")  # B: 40 / 10 peças
    c = (await test_client.get(f"/api/v1/stock-entries/{ids.entry}/costs", headers=h)).json()
    assert c["discount_amount"] == 40.0 and c["general_discount"] == 0.0
    assert c["total_investment"] == 260.0
    por = {s["supplier_id"]: s for s in c["suppliers"]}
    assert por[ids.sa]["discount"] == 0.0 and por[ids.sb]["discount"] == 40.0
    assert por[ids.sa]["merchandise"] == 100.0 and por[ids.sb]["merchandise"] == 200.0


async def test_desconto_geral_e_por_fornecedor_somam_cada_um_no_seu_escopo(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    r = await _put(test_client, h, ids.entry, {"discount_amount": 30, "supplier_discounts": [{"supplier_id": ids.sa, "amount": 10}]})
    assert r.status_code == 200, r.text
    async_session.expire_all()
    ia, ib = await _itens(async_session, ids.entry)
    # geral R$ 30 sobre R$ 300 de mercadoria = 10%: A 10 -> 9 e B 20 -> 18; depois A tira mais R$ 10 (1 por peça)
    assert ia.landed_unit_cost == D("8.0000")
    assert ib.landed_unit_cost == D("18.0000")
    c = (await test_client.get(f"/api/v1/stock-entries/{ids.entry}/costs", headers=h)).json()
    assert c["discount_amount"] == 40.0 and c["general_discount"] == 30.0 and c["total_investment"] == 260.0


async def test_desconto_invalido_e_recusado_e_nada_muda(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    antes = await _fifo_snapshot(async_session, ids)
    r = await _put(test_client, h, ids.entry, {"supplier_discounts": [{"supplier_id": ids.sa, "amount": 101}]})
    assert r.status_code == 400 and "mercadoria" in r.json()["detail"]
    r = await _put(test_client, h, ids.entry, {"supplier_discounts": [{"supplier_id": 999999, "amount": 5}]})
    assert r.status_code == 400 and "não tem itens" in r.json()["detail"]
    r = await _put(test_client, h, ids.entry, {"supplier_discounts": [{"supplier_id": ids.sa, "amount": -1}]})
    assert r.status_code == 422
    async_session.expire_all()
    assert await _fifo_snapshot(async_session, ids) == antes
    assert all(i.extra_unit_cost == 0 for i in await _itens(async_session, ids.entry))


async def test_fifo_intacto_ao_lancar_mudar_e_excluir_desconto_com_vendas_feitas(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    # vende 4 do fornecedor B ANTES de qualquer desconto: custo da venda = R$ 20
    sale_id, item_id = await _vender(test_client, h, SimpleNamespace(id=ids.p), SimpleNamespace(id=ids.vb), 4, "100.00")
    async_session.expire_all()
    base = await _fifo_snapshot(async_session, ids)
    assert base["vendas"][-1][2] in ("20.0", "20.00", "20")
    await _confere_estoque(async_session, ids)

    for body in (
        {"supplier_discounts": [{"supplier_id": ids.sb, "amount": 60}]},   # lança
        {"supplier_discounts": [{"supplier_id": ids.sb, "amount": 20}]},   # muda
        {"supplier_discounts": [{"supplier_id": ids.sb, "amount": 0}]},    # exclui
    ):
        r = await _put(test_client, h, ids.entry, body)
        assert r.status_code == 200, r.text
        async_session.expire_all()
        snap = await _fifo_snapshot(async_session, ids)
        assert snap["vendas"] == base["vendas"], "custo e fontes de peças JÁ vendidas não podem mudar"
        assert snap["qtd"] == base["qtd"], "quantidades do FIFO não podem mudar"
        await _confere_estoque(async_session, ids)


async def test_venda_nova_usa_o_custo_atualizado_pelo_fifo_e_o_estoque_continua_batendo(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    await _put(test_client, h, ids.entry, {"supplier_discounts": [{"supplier_id": ids.sb, "amount": 40}]})   # B: custo posto R$ 16
    sale_id, item_id = await _vender(test_client, h, SimpleNamespace(id=ids.p), SimpleNamespace(id=ids.vb), 5, "100.00")
    async_session.expire_all()
    from app.models.sale import SaleItem
    v = (await async_session.execute(select(SaleItem).where(SaleItem.id == item_id))).scalar_one()
    assert D(str(v.unit_cost)) == D("16.00")                      # FIFO gravou o custo posto com desconto
    assert v.sale_sources["sources"][0]["entry_item_id"] == ids.ib
    ib = (await _itens(async_session, ids.entry))[1]
    assert ib.quantity_remaining == 5
    await _confere_estoque(async_session, ids)
    # mudar o desconto depois da venda: a venda guarda os R$ 16, só o saldo (5 peças) muda
    await _put(test_client, h, ids.entry, {"supplier_discounts": [{"supplier_id": ids.sb, "amount": 100}]})   # B: R$ 10 por peça
    async_session.expire_all()
    v = (await async_session.execute(select(SaleItem).where(SaleItem.id == item_id))).scalar_one()
    assert D(str(v.unit_cost)) == D("16.00")
    ib = (await _itens(async_session, ids.entry))[1]
    assert ib.landed_unit_cost == D("10.0000") and ib.quantity_remaining == 5
    await _confere_estoque(async_session, ids)


async def test_credito_do_fornecedor_vai_para_o_desconto_daquele_fornecedor(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    r = await test_client.post("/api/v1/supplier-returns/", headers=h, json={"entry_item_id": ids.ib, "quantity": 2, "reason": "Condicional"})
    assert r.status_code == 201, r.text
    sr = r.json()
    assert sr["supplier_id"] == ids.sb
    r = await test_client.post(f"/api/v1/supplier-returns/{sr['id']}/resolve", headers=h, json={"outcome": "credited", "credit_amount": 30})
    assert r.status_code == 200, r.text
    async_session.expire_all()
    ia, ib = await _itens(async_session, ids.entry)
    assert ia.extra_unit_cost == D("0")                                # A não recebeu nada do crédito de B
    assert ib.extra_unit_cost == D("-3.0000")                          # R$ 30 / 10 peças de B
    c = (await test_client.get(f"/api/v1/stock-entries/{ids.entry}/costs", headers=h)).json()
    por = {s["supplier_id"]: s for s in c["suppliers"]}
    assert por[ids.sb]["discount"] == 30.0 and por[ids.sa]["discount"] == 0.0
    # peças enviadas ao fornecedor saíram do estoque (8 restam); o resto do FIFO segue consistente
    assert ib.quantity_remaining == 8 and ib.quantity_received == 10
