"""A conta do lote tem que fechar sempre: o que os cards e relatórios mostram vem da mesma conta do estoque.

Provas:
- propriedade (muitos cenários aleatórios): soma das peças a custo posto = mercadoria + frete/viagem - descontos
  (sobra só arredondamento de 4 casas por peça), nenhuma peça fica com custo negativo, e o desconto de um
  fornecedor nunca cai em peça de outro;
- cada peça mostra frete e desconto e `extra = frete - desconto` exato;
- fornecedor escolhido ao lançar produto em entrada que já existe é gravado (item, produto novo), recusado se for
  de outra loja, e vira vínculo fornecedor x produto.
"""
import random
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from tests.test_desconto_fornecedor import _entrada_dois_fornecedores, _itens, _limpa_extras  # noqa: F401
from tests.test_lot_costs import _limpa_loja_1, _loja_api, _produto, _viagem  # noqa: F401

pytestmark = pytest.mark.asyncio
D = Decimal


async def _cenario_aleatorio(db, test_user, rng):
    """Entrada em viagem com 2 a 6 itens de até 3 fornecedores; descontos e frete aleatórios."""
    import itertools
    from datetime import date
    from app.models.entry_item import EntryItem
    from app.models.entry_supplier_discount import EntrySupplierDiscount
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import EntryType, StockEntry
    from app.models.supplier import Supplier
    t_id, _, cat = await _loja_api(db, test_user)
    n = rng.randrange(10**6)
    sups = [Supplier(name=f"F{k} {n}", tenant_id=t_id) for k in range(3)]
    db.add_all(sups)
    await db.flush()
    trip = await _viagem(db, t_id, fuel=rng.choice([0, 0, 37.5, 100, 333.33, 1000]))
    p = Product(name=f"P{n}", category_id=cat, tenant_id=t_id, base_price=D("100"))
    db.add(p)
    await db.flush()
    e = StockEntry(entry_code=f"CF-{n:06d}", entry_date=date.today(), entry_type=EntryType.TRIP, trip_id=trip.id,
                   supplier_id=sups[0].id, supplier_name=sups[0].name, total_cost=D("0"), tenant_id=t_id,
                   discount_amount=D("0"))
    db.add(e)
    await db.flush()
    merch = D("0")
    itens = []
    for k in range(rng.randint(2, 6)):
        v = ProductVariant(product_id=p.id, sku=f"CF-{n}-{k}", color=f"C{k}", price=D("100"), tenant_id=t_id)
        db.add(v)
        await db.flush()
        qty = rng.randint(1, 60)
        cost = D(rng.randint(100, 20000)) / D(100)
        sup = rng.choice(sups)
        it = EntryItem(entry_id=e.id, variant_id=v.id, product_id=p.id, quantity_received=qty, quantity_remaining=qty,
                       unit_cost=cost, supplier_id=sup.id, tenant_id=t_id)
        db.add(it)
        merch += qty * cost
        itens.append((it, sup))
    e.total_cost = merch
    await db.flush()
    # descontos: geral e por fornecedor (podem exceder a mercadoria de propósito: o sistema limita)
    if rng.random() < 0.7:
        e.discount_amount = (merch * D(rng.randint(0, 120)) / D(1000)).quantize(D("0.01"))
    pedidos = {}
    for s in sups:
        if rng.random() < 0.6:
            pedidos[s.id] = D(rng.randint(0, 40000)) / D(100)
            db.add(EntrySupplierDiscount(entry_id=e.id, supplier_id=s.id, amount=pedidos[s.id], tenant_id=t_id))
    await db.flush()
    return SimpleNamespace(t=t_id, entry=e, itens=itens, sups=sups, trip=trip, pedidos=pedidos, merch=merch)


async def test_a_conta_fecha_em_cenarios_aleatorios(async_session, test_user):
    from app.services import lot_cost_service as svc
    rng = random.Random(20261024)
    for rodada in range(40):
        c = await _cenario_aleatorio(async_session, test_user, rng)
        out = (await svc.recompute_entries(async_session, [c.entry.id], tenant_id=c.t))[c.entry.id]
        await async_session.flush()
        itens = [i for i, _ in c.itens]
        unidades = sum(i.quantity_received for i in itens)
        freight_gross = out["trip_share"] + out["own"]
        esperado = freight_gross - out["discount"]
        real = sum((D(i.quantity_received) * D(str(i.extra_unit_cost)) for i in itens), D("0"))
        tolerancia = D("0.0001") * unidades + D("0.01")
        assert abs(real - esperado) <= tolerancia, f"rodada {rodada}: soma das peças {real} x conta {esperado}"
        # a soma a custo posto fecha com mercadoria + frete - descontos
        total_posto = sum((D(i.quantity_received) * i.landed_unit_cost for i in itens), D("0"))
        assert abs(total_posto - (c.merch + esperado)) <= tolerancia
        # nenhuma peça fica com custo negativo e o desconto nunca passa da mercadoria
        assert all(i.landed_unit_cost >= 0 for i in itens), f"rodada {rodada}: custo negativo"
        assert out["discount"] <= c.merch
        # cada peça mostra frete e desconto e a conta é exata: extra = frete - desconto
        for i in itens:
            f_u, d_u = out["items"][i.id]
            assert D(str(i.extra_unit_cost)) == f_u - d_u
            assert f_u >= 0 and d_u >= 0 and d_u <= i.unit_cost + D("0.0001")
        # desconto de fornecedor só cai em peça DELE: fornecedor sem desconto nem geral não recebe nada
        geral = D(str(c.entry.discount_amount or 0))
        for i, s in c.itens:
            if geral == 0 and not c.pedidos.get(s.id):
                assert out["items"][i.id][1] == 0, f"rodada {rodada}: desconto caiu em peça de fornecedor sem desconto"
        # total de desconto aplicado por fornecedor fecha com o pedido (limitado à mercadoria dele)
        for s in c.sups:
            merc_s = sum((D(i.quantity_received) * i.unit_cost for i, sup in c.itens if sup.id == s.id), D("0"))
            parte_geral = min(geral, c.merch) * merc_s / c.merch if c.merch else D("0")
            pedido = max(D("0"), min(c.pedidos.get(s.id, D("0")), merc_s - parte_geral))   # só vai até o que sobrou
            aplicado = sum((D(i.quantity_received) * out["items"][i.id][1] for i, sup in c.itens if sup.id == s.id), D("0"))
            esperado_s = pedido + parte_geral
            assert out["supplier_applied"].get(s.id, D("0")) == pedido
            assert abs(aplicado - esperado_s) <= D("0.0001") * unidades + D("0.01"), f"rodada {rodada}: fornecedor {s.id}"
    await async_session.rollback()


async def test_analise_da_entrada_mostra_a_conta_de_cada_peca(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    r = await test_client.put(f"/api/v1/stock-entries/{ids.entry}", headers=h, json={
        "discount_amount": 30, "supplier_discounts": [{"supplier_id": ids.sb, "amount": 40}]})
    assert r.status_code == 200, r.text
    a = (await test_client.get(f"/api/v1/stock-entries/{ids.entry}/analytics", headers=h)).json()
    c = (await test_client.get(f"/api/v1/stock-entries/{ids.entry}/costs", headers=h)).json()
    por_item = {i["item_id"]: i for i in a["items"]}
    ia, ib = por_item[ids.ia], por_item[ids.ib]
    # A: 10 por peça, geral de 10% (R$ 1) -> 9; B: 20 por peça, geral R$ 2 e do fornecedor R$ 4 -> 14
    assert ia["freight_unit_cost"] == 0.0 and ia["discount_unit_cost"] == 1.0 and ia["landed_unit_cost"] == 9.0
    assert ib["freight_unit_cost"] == 0.0 and ib["discount_unit_cost"] == 6.0 and ib["landed_unit_cost"] == 14.0
    for i in (ia, ib):  # a conta que o cartão mostra fecha
        assert round(i["merchandise_unit_cost"] + i["freight_unit_cost"] - i["discount_unit_cost"], 4) == round(i["landed_unit_cost"], 4)
    # cartão e análise falam do mesmo total
    assert c["discount_amount"] == 70.0 and c["general_discount"] == 30.0
    assert a["total_investment"] == c["total_investment"] == 230.0     # 300 - 70
    assert sum(s["discount"] for s in c["suppliers"]) == 40.0


async def test_fornecedor_em_entrada_existente_item_avulso(test_client, async_session, test_user):
    from app.models.supplier_product import SupplierProduct
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    # outro produto, lançado na entrada já existente, com o fornecedor B (a entrada é do A)
    p, v = await _produto(async_session, ids.t, ids.cat, "Top Novo", "80.00")
    p_id, v_id = p.id, v.id
    await async_session.commit()
    r = await test_client.post(f"/api/v1/stock-entries/{ids.entry}/items", headers=h, json={
        "product_id": p_id, "variant_id": v_id, "quantity_received": 4, "unit_cost": 25, "supplier_id": ids.sb})
    assert r.status_code in (200, 201), r.text
    async_session.expire_all()
    novo = (await _itens(async_session, ids.entry))[-1]
    assert novo.supplier_id == ids.sb
    vinc = (await async_session.execute(select(SupplierProduct).where(
        SupplierProduct.supplier_id == ids.sb, SupplierProduct.product_id == p_id))).scalar_one_or_none()
    assert vinc is not None and D(str(vinc.last_unit_cost)) == D("25.00")
    # sem informar fornecedor: usa o da entrada
    p2, v2 = await _produto(async_session, ids.t, ids.cat, "Top Padrao", "80.00")
    p2_id, v2_id = p2.id, v2.id
    await async_session.commit()
    r = await test_client.post(f"/api/v1/stock-entries/{ids.entry}/items", headers=h, json={
        "product_id": p2_id, "variant_id": v2_id, "quantity_received": 2, "unit_cost": 10})
    assert r.status_code in (200, 201), r.text
    async_session.expire_all()
    assert (await _itens(async_session, ids.entry))[-1].supplier_id == ids.sa
    # fornecedor que não é da loja: recusa e não grava nada
    antes = len(await _itens(async_session, ids.entry))
    r = await test_client.post(f"/api/v1/stock-entries/{ids.entry}/items", headers=h, json={
        "product_id": p2_id, "variant_id": v2_id, "quantity_received": 1, "unit_cost": 10, "supplier_id": 999999})
    assert r.status_code in (400, 404), r.text
    async_session.expire_all()
    assert len(await _itens(async_session, ids.entry)) == antes


async def test_fornecedor_em_produto_novo_numa_entrada_existente(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    cat = ids.cat
    corpo = {"product_name": "Macaquinho Teste", "product_category_id": cat, "base_price": 120,
             "variants": [{"size": "M", "color": "Preto", "price": 120, "cost_price": 50, "quantity": 3}]}
    r = await test_client.post(f"/api/v1/stock-entries/{ids.entry}/with-new-product", headers=h, json={**corpo, "supplier_id": ids.sb})
    assert r.status_code in (200, 201), r.text
    async_session.expire_all()
    assert (await _itens(async_session, ids.entry))[-1].supplier_id == ids.sb
    # sem fornecedor: fica com o da entrada
    corpo["product_name"] = "Macaquinho Padrao"
    r = await test_client.post(f"/api/v1/stock-entries/{ids.entry}/with-new-product", headers=h, json=corpo)
    assert r.status_code in (200, 201), r.text
    async_session.expire_all()
    assert (await _itens(async_session, ids.entry))[-1].supplier_id == ids.sa
    # fornecedor inexistente: recusa tudo (o produto não pode ficar criado pela metade)
    from app.models.product import Product
    corpo["product_name"] = "Macaquinho Fantasma"
    r = await test_client.post(f"/api/v1/stock-entries/{ids.entry}/with-new-product", headers=h, json={**corpo, "supplier_id": 999999})
    assert r.status_code == 400, r.text
    async_session.expire_all()
    assert (await async_session.execute(select(Product).where(Product.name == "Macaquinho Fantasma"))).first() is None


# ───────────────────── preço de tabela por item e preço PAGO nos relatórios ─────────────────────

async def _compra(client, h, entry_code, supplier_name, product_id, variant_id, qty, cost, **extra):
    from datetime import date
    r = await client.post("/api/v1/stock-entries/", headers=h, json={
        "entry_date": date.today().isoformat(), "entry_code": entry_code, "entry_type": "local",
        "supplier_name": supplier_name,
        "items": [{"product_id": product_id, "variant_id": variant_id, "quantity_received": qty, "unit_cost": cost,
                   **extra.get("item", {})}],
        **{k: v for k, v in extra.items() if k != "item"}})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_preco_de_tabela_no_item_nao_muda_o_custo_e_aparece_na_analise(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    p, v = await _produto(async_session, ids.t, ids.cat, "Top Tabela", "90.00")
    p_id, v_id = p.id, v.id
    await async_session.commit()
    e = await _compra(test_client, h, "TABELA-0001", "Forn Tabela", p_id, v_id, 4, 25, item={"list_unit_cost": 30})
    a = (await test_client.get(f"/api/v1/stock-entries/{e}/analytics", headers=h)).json()
    c = (await test_client.get(f"/api/v1/stock-entries/{e}/costs", headers=h)).json()
    item = a["items"][0]
    assert item["list_unit_cost"] == 30.0 and item["item_discount_unit"] == 5.0
    assert item["merchandise_unit_cost"] == 25.0 and item["landed_unit_cost"] == 25.0   # o pago já é o custo: nada é abatido de novo
    assert c["item_discounts_total"] == 20.0 and c["total_investment"] == 100.0
    # tabela menor que o pago é recusada; tabela igual ao pago não vira desconto
    from datetime import date
    r = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        "entry_date": date.today().isoformat(), "entry_code": "TABELA-0002", "entry_type": "local", "supplier_name": "Forn Tabela",
        "items": [{"product_id": p_id, "variant_id": v_id, "quantity_received": 1, "unit_cost": 25, "list_unit_cost": 20}]})
    assert r.status_code in (400, 422), r.text
    e2 = await _compra(test_client, h, "TABELA-0003", "Forn Tabela", p_id, v_id, 2, 25, item={"list_unit_cost": 25})
    c2 = (await test_client.get(f"/api/v1/stock-entries/{e2}/costs", headers=h)).json()
    assert c2["item_discounts_total"] == 0.0
    # editar o item: põe e tira o preço de tabela sem mexer no custo nem no estoque
    item_id = a["items"][0]["item_id"]
    r = await test_client.put(f"/api/v1/stock-entries/entry-items/{item_id}", headers=h, json={"list_unit_cost": 40})
    assert r.status_code == 200, r.text
    a = (await test_client.get(f"/api/v1/stock-entries/{e}/analytics", headers=h)).json()
    assert a["items"][0]["item_discount_unit"] == 15.0 and a["items"][0]["landed_unit_cost"] == 25.0
    r = await test_client.put(f"/api/v1/stock-entries/entry-items/{item_id}", headers=h, json={"list_unit_cost": 0})
    assert r.status_code == 200
    a = (await test_client.get(f"/api/v1/stock-entries/{e}/analytics", headers=h)).json()
    assert a["items"][0]["list_unit_cost"] is None and a["items"][0]["item_discount_unit"] == 0.0


async def test_relatorios_de_fornecedor_mostram_o_preco_pago_com_desconto(test_client, async_session, test_user):
    ids, h = await _entrada_dois_fornecedores(async_session, test_user)
    p, v = await _produto(async_session, ids.t, ids.cat, "Short Comparado", "90.00")
    p_id, v_id = p.id, v.id
    await async_session.commit()
    # o banco de teste reaproveita ids: tira vínculos antigos que apontem para este id de produto
    from sqlalchemy import delete
    from app.models.supplier_product import SupplierProduct
    await async_session.execute(delete(SupplierProduct).where(SupplierProduct.product_id == p_id))
    await async_session.commit()
    # dois fornecedores vendem o mesmo produto a R$ 10; o Y deu R$ 20 de desconto nas 10 peças (paga R$ 8 por peça)
    await _compra(test_client, h, "COMP-X-0001", "Forn Comp X", p_id, v_id, 10, 10)
    ey = await _compra(test_client, h, "COMP-Y-0001", "Forn Comp Y", p_id, v_id, 10, 10)
    assert (await test_client.put(f"/api/v1/stock-entries/{ey}", headers=h, json={"discount_amount": 20})).status_code == 200

    comp = (await test_client.get("/api/v1/suppliers/cost-comparison", headers=h)).json()
    prod = next(x for x in comp["products"] if x["product_id"] == p_id)
    por = {s["supplier_name"]: s for s in prod["suppliers"]}
    assert por["Forn Comp X"]["last_unit_cost"] == 10.0
    assert por["Forn Comp Y"]["last_unit_cost"] == 8.0, "a comparação tem que usar o preço PAGO, com o desconto"
    assert prod["cheapest_supplier_name"] == "Forn Comp Y" and prod["savings_per_unit"] == 2.0

    card = (await test_client.get(f"/api/v1/products/{p_id}/suppliers", headers=h)).json()
    assert {float(s["last_unit_cost"]) for s in card} == {10.0, 8.0}

    rank = (await test_client.get("/api/v1/suppliers/ranking?days=0", headers=h)).json()
    y = next(s for s in rank["suppliers"] if s["supplier_name"] == "Forn Comp Y")
    assert y["purchased_cost"] == 80.0 and y["stock_cost"] == 80.0   # 10 peças a R$ 8 pagos
    # mesmo assim o estoque e o custo das peças seguem a conta do lote (nada duplicado)
    a = (await test_client.get(f"/api/v1/stock-entries/{ey}/analytics", headers=h)).json()
    assert a["items"][0]["landed_unit_cost"] == 8.0 and a["total_investment"] == 80.0
