"""Custo por lote: rateio da viagem e das despesas do lote, FIFO a custo posto, P&L sem dupla contagem e lucro por lote."""
import itertools
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash

pytestmark = pytest.mark.asyncio
_seq = itertools.count(1)
D = Decimal


async def _loja(db, *, with_trip_cost=None):
    """Loja nova + admin + categoria. Devolve (tenant_id, token, category_id)."""
    from datetime import datetime, timezone
    from app.models.category import Category
    from app.models.store import Store
    from app.models.subscription import Subscription
    from app.models.user import User, UserRole

    n = next(_seq)
    store = Store(name=f"Loja Lote {n}", slug=f"loja-lote-{n}", subdomain=f"lote-{n}", plan="enterprise",
                  is_default=False, is_active=True)
    db.add(store)
    await db.flush()
    db.add(Subscription(tenant_id=store.id, plan="enterprise", status="active", is_trial=False,
                        current_period_start=datetime.now(timezone.utc),
                        current_period_end=datetime.now(timezone.utc) + timedelta(days=30),
                        max_products=1, max_users=1, is_active=True))
    admin = User(email=f"dono.lote.{n}@example.com", full_name="Dona Lote", hashed_password=get_password_hash("Senha1234"),
                 role=UserRole.ADMIN, is_active=True, tenant_id=store.id)
    cat = Category(name=f"Cat {n}", slug=f"cat-lote-{n}", tenant_id=store.id)
    db.add_all([admin, cat])
    await db.commit()
    await db.refresh(admin)
    await db.refresh(cat)
    return store.id, create_access_token(data={"sub": str(admin.id)}), cat.id


@pytest.fixture(autouse=True)
async def _limpa_loja_1(async_session):
    """O banco de teste é compartilhado: apaga o que estes testes criaram na loja 1 para não alterar contagens de outros testes."""
    from sqlalchemy import delete, func
    from app.models.category import Category
    from app.models.entry_item import EntryItem
    from app.models.expense import Expense
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import StockEntry
    from app.models.trip import Trip
    from app.models.inventory import Inventory

    modelos = [Inventory, Expense, EntryItem, StockEntry, Trip, ProductVariant, Product, Category]
    antes = {}
    for m in modelos:
        antes[m] = (await async_session.execute(select(func.coalesce(func.max(m.id), 0)))).scalar()
    yield
    await async_session.rollback()
    for m in modelos:
        await async_session.execute(delete(m).where(m.tenant_id == 1, m.id > antes[m]))
    await async_session.commit()


async def _loja_api(db, test_user):
    """Loja 1 (a que a API dos testes usa) com categoria nova. Devolve (tenant_id, token, category_id)."""
    from app.models.category import Category
    n = next(_seq)
    cat = Category(name=f"Cat API {n}", slug=f"cat-api-{n}", tenant_id=test_user.tenant_id)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return test_user.tenant_id, create_access_token(data={"sub": str(test_user.id)}), cat.id


async def _produto(db, tenant_id, cat_id, nome, preco="200.00"):
    from app.models.product import Product
    from app.models.product_variant import ProductVariant
    n = next(_seq)
    p = Product(name=f"{nome} {n}", category_id=cat_id, tenant_id=tenant_id, base_price=D(preco))
    db.add(p)
    await db.flush()
    v = ProductVariant(product_id=p.id, sku=f"SKU-{n}-{tenant_id}", price=D(preco), tenant_id=tenant_id)
    db.add(v)
    await db.flush()
    return p, v


async def _viagem(db, tenant_id, **custos):
    from app.models.trip import Trip
    n = next(_seq)
    fuel = D(str(custos.get("fuel", 0)))
    t = Trip(trip_code=f"VIAGEM-{n}", trip_date=date.today(), destination="Brás", tenant_id=tenant_id,
             travel_cost_fuel=fuel, travel_cost_food=D(0), travel_cost_toll=D(0), travel_cost_hotel=D(0),
             travel_cost_other=D(0), travel_cost_total=fuel)
    db.add(t)
    await db.flush()
    return t


async def _lote(db, tenant_id, itens, *, trip=None, entry_date=None):
    """itens: [(variant, produto, quantidade, custo_unitario)]. Devolve a entrada."""
    from app.models.entry_item import EntryItem
    from app.models.stock_entry import EntryType, StockEntry
    n = next(_seq)
    total = sum(D(q) * D(str(c)) for _, _, q, c in itens)
    e = StockEntry(entry_code=f"LOTE-{n:04d}", entry_date=entry_date or date.today(),
                   entry_type=EntryType.TRIP if trip else EntryType.LOCAL, trip_id=trip.id if trip else None,
                   supplier_name="Fornecedor Teste", total_cost=total, tenant_id=tenant_id)
    db.add(e)
    await db.flush()
    for v, p, q, c in itens:
        db.add(EntryItem(entry_id=e.id, variant_id=v.id, product_id=p.id, quantity_received=q, quantity_remaining=q,
                         unit_cost=D(str(c)), tenant_id=tenant_id))
    await db.flush()
    return e


async def _extras(db, entry_id):
    from app.models.entry_item import EntryItem
    rows = (await db.execute(select(EntryItem).where(EntryItem.entry_id == entry_id).order_by(EntryItem.id))).scalars().all()
    return [(r.unit_cost, r.extra_unit_cost, r.landed_unit_cost) for r in rows]


# ───────────────────────── rateio ─────────────────────────

async def test_exemplo_do_lojista_viagem_1000_mercadoria_10000(async_session):
    from app.services import lot_cost_service as svc
    t_id, _, cat = await _loja(async_session)
    p, v = await _produto(async_session, t_id, cat, "Legging")
    trip = await _viagem(async_session, t_id, fuel=1000)
    lote = await _lote(async_session, t_id, [(v, p, 100, 100)], trip=trip)
    out = await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    assert out[lote.id]["extra"] == D("1000")
    (custo, extra, posto), = await _extras(async_session, lote.id)
    assert custo == D("100.00") and extra == D("10.0000") and posto == D("110.0000")  # +10% por peça


async def test_viagem_com_dois_lotes_divide_proporcional_ao_custo(async_session):
    from app.services import lot_cost_service as svc
    t_id, _, cat = await _loja(async_session)
    p1, v1 = await _produto(async_session, t_id, cat, "A")
    p2, v2 = await _produto(async_session, t_id, cat, "B")
    trip = await _viagem(async_session, t_id, fuel=1000)
    a = await _lote(async_session, t_id, [(v1, p1, 60, 100)], trip=trip)   # 6.000
    b = await _lote(async_session, t_id, [(v2, p2, 40, 100)], trip=trip)   # 4.000
    out = await svc.recompute_entries(async_session, [a.id], tenant_id=t_id)   # recalcula o irmão junto
    assert out[a.id]["trip_share"] == D("600") and out[b.id]["trip_share"] == D("400")
    assert (await _extras(async_session, a.id))[0][1] == D("10.0000")
    assert (await _extras(async_session, b.id))[0][1] == D("10.0000")


async def test_despesa_do_lote_divide_entre_itens_proporcional_ao_custo(async_session):
    from app.models.expense import Expense
    from app.services import lot_cost_service as svc
    t_id, _, cat = await _loja(async_session)
    p1, v1 = await _produto(async_session, t_id, cat, "Barato")
    p2, v2 = await _produto(async_session, t_id, cat, "Caro")
    lote = await _lote(async_session, t_id, [(v1, p1, 10, 100), (v2, p2, 10, 300)])  # 1.000 + 3.000
    async_session.add(Expense(amount=D("400"), description="Frete", expense_date=date.today(), tenant_id=t_id,
                              stock_entry_id=lote.id))
    await async_session.flush()
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    (c1, e1, _), (c2, e2, _) = await _extras(async_session, lote.id)
    assert e1 == D("10.0000") and e2 == D("30.0000")  # 10% sobre cada custo; soma = 100 + 300 = 400


async def test_despesa_geral_nao_entra_no_custo(async_session):
    from app.models.expense import Expense
    from app.services import lot_cost_service as svc
    t_id, _, cat = await _loja(async_session)
    p, v = await _produto(async_session, t_id, cat, "X")
    lote = await _lote(async_session, t_id, [(v, p, 10, 100)])
    async_session.add(Expense(amount=D("999"), description="Aluguel", expense_date=date.today(), tenant_id=t_id))
    await async_session.flush()
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    assert (await _extras(async_session, lote.id))[0][1] == D("0")


# ───────────────────────── API de despesas ─────────────────────────

async def test_api_despesa_de_lote_atualiza_rateio_edita_e_apaga(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "X")
    lote = await _lote(async_session, t_id, [(v, p, 10, 100)])  # 1.000
    lote_id = lote.id
    await async_session.commit()

    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "100.00", "description": "Frete do lote", "expense_date": date.today().isoformat(),
        "stock_entry_id": lote_id})
    assert r.status_code == 201, r.text
    exp_id = r.json()["id"]
    assert r.json()["stock_entry_id"] == lote_id
    assert (await _extras(async_session, lote_id))[0][1] == D("10.0000")      # 100 / 10 peças

    r = await test_client.put(f"/api/v1/expenses/{exp_id}", headers=h, json={"amount": "200.00"})
    assert r.status_code == 200, r.text
    async_session.expire_all()
    assert (await _extras(async_session, lote_id))[0][1] == D("20.0000")

    assert (await test_client.delete(f"/api/v1/expenses/{exp_id}", headers=h)).status_code == 204
    async_session.expire_all()
    assert (await _extras(async_session, lote_id))[0][1] == D("0")


async def test_api_despesa_nao_pode_ser_de_lote_e_viagem_nem_de_outra_loja(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "X")
    lote = await _lote(async_session, t_id, [(v, p, 10, 100)])
    trip = await _viagem(async_session, t_id, fuel=50)
    outra_id, _, outra_cat = await _loja(async_session)
    po, vo = await _produto(async_session, outra_id, outra_cat, "Y")
    lote_alheio = await _lote(async_session, outra_id, [(vo, po, 5, 10)])
    await async_session.commit()
    base = {"amount": "10.00", "description": "x", "expense_date": date.today().isoformat()}

    r = await test_client.post("/api/v1/expenses", headers=h, json={**base, "stock_entry_id": lote.id, "trip_id": trip.id})
    assert r.status_code == 422
    r = await test_client.post("/api/v1/expenses", headers=h, json={**base, "stock_entry_id": lote_alheio.id})
    assert r.status_code == 400 and "não encontrado" in r.json()["detail"]
    r = await test_client.post("/api/v1/expenses", headers=h, json={**base, "stock_entry_id": 999999})
    assert r.status_code == 400


async def test_api_despesa_de_viagem_rateia_entre_lotes_e_trocar_de_lote_para_viagem(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p1, v1 = await _produto(async_session, t_id, cat, "A")
    p2, v2 = await _produto(async_session, t_id, cat, "B")
    trip = await _viagem(async_session, t_id, fuel=0)
    a = await _lote(async_session, t_id, [(v1, p1, 10, 100)], trip=trip)   # 1.000
    b = await _lote(async_session, t_id, [(v2, p2, 30, 100)], trip=trip)   # 3.000
    a_id, b_id, trip_id = a.id, b.id, trip.id
    await async_session.commit()
    r = await test_client.post("/api/v1/expenses", headers=h, json={
        "amount": "400.00", "description": "Hotel", "expense_date": date.today().isoformat(), "trip_id": trip_id})
    assert r.status_code == 201, r.text
    async_session.expire_all()
    assert (await _extras(async_session, a_id))[0][1] == D("10.0000")   # 100 / 10 peças
    assert (await _extras(async_session, b_id))[0][1] == D("10.0000")   # 300 / 30 peças

    # a mesma despesa passa a ser só do lote A: sai da viagem inteira
    r = await test_client.put(f"/api/v1/expenses/{r.json()['id']}", headers=h, json={"trip_id": None, "stock_entry_id": a_id})
    assert r.status_code == 200, r.text
    async_session.expire_all()
    assert (await _extras(async_session, a_id))[0][1] == D("40.0000")   # 400 / 10 peças
    assert (await _extras(async_session, b_id))[0][1] == D("0")


async def test_editar_custo_da_viagem_atualiza_total_e_rateio(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "X")
    trip = await _viagem(async_session, t_id, fuel=100)
    lote = await _lote(async_session, t_id, [(v, p, 10, 100)], trip=trip)
    from app.services import lot_cost_service as svc
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    lote_id, trip_id = lote.id, trip.id
    await async_session.commit()
    assert (await _extras(async_session, lote_id))[0][1] == D("10.0000")

    r = await test_client.put(f"/api/v1/trips/{trip_id}", headers=h, json={"travel_cost_fuel": "300.00", "travel_cost_toll": "50.00"})
    assert r.status_code == 200, r.text
    assert float(r.json()["travel_cost_total"]) == 350.0                # o total acompanha (antes ficava velho)
    async_session.expire_all()
    assert (await _extras(async_session, lote_id))[0][1] == D("35.0000")


# ───────────────────────── FIFO e resultado ─────────────────────────

async def test_fifo_grava_custo_posto_e_o_p_l_nao_conta_a_viagem_de_novo(async_session):
    from app.models.expense import Expense
    from app.services import lot_cost_service as svc
    from app.services.expense_service import ExpenseService
    from app.services.fifo_service import FIFOService
    t_id, _, cat = await _loja(async_session)
    p, v = await _produto(async_session, t_id, cat, "X")
    trip = await _viagem(async_session, t_id, fuel=1000)
    lote = await _lote(async_session, t_id, [(v, p, 100, 100)], trip=trip)
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)

    sources = await FIFOService(async_session).process_sale(p.id, 50, variant_id=v.id, tenant_id=t_id)
    assert len(sources) == 1
    assert sources[0]["unit_cost"] == 110.0                       # mercadoria 100 + 10 de viagem
    assert sources[0]["merchandise_unit_cost"] == 100.0 and sources[0]["extra_unit_cost"] == 10.0
    assert sources[0]["total_cost"] == 5500.0

    # despesa geral conta no mês; a do lote não
    async_session.add(Expense(amount=D("300"), description="Aluguel", expense_date=date.today(), tenant_id=t_id))
    async_session.add(Expense(amount=D("100"), description="Frete", expense_date=date.today(), tenant_id=t_id,
                              stock_entry_id=lote.id))
    await async_session.flush()
    hoje = date.today()
    res = await ExpenseService(async_session)._build_period_result(hoje.replace(day=1), hoje, t_id, "teste")
    assert res.total_expenses == D("300")          # só a geral
    assert res.trip_costs == D("0")                # viagem já está no CMV


async def test_analise_do_lote_com_vendas_reais_e_devolucao(async_session):
    """100 peças a R$ 100 + viagem R$ 1.000; vende 50 por R$ 200 cada."""
    from app.models.sale import Sale, SaleItem, SaleStatus
    from app.services import lot_cost_service as svc
    from app.services.fifo_service import FIFOService
    from app.services.stock_entry_service import StockEntryService
    t_id, _, cat = await _loja(async_session)
    p, v = await _produto(async_session, t_id, cat, "Legging", preco="200.00")
    trip = await _viagem(async_session, t_id, fuel=1000)
    lote = await _lote(async_session, t_id, [(v, p, 100, 100)], trip=trip)
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)

    seller_id = (await async_session.execute(select(__import__("app.models.user", fromlist=["User"]).User.id)
                                             .where(__import__("app.models.user", fromlist=["User"]).User.tenant_id == t_id))).scalar_one()
    sources = await FIFOService(async_session).process_sale(p.id, 50, variant_id=v.id, tenant_id=t_id)
    sale = Sale(sale_number=f"V-{next(_seq)}", subtotal=D("10000"), total_amount=D("10000"), payment_method="cash",
                seller_id=seller_id, status=SaleStatus.COMPLETED, tenant_id=t_id)
    async_session.add(sale)
    await async_session.flush()
    async_session.add(SaleItem(sale_id=sale.id, product_id=p.id, variant_id=v.id, quantity=50, unit_price=D("200"),
                               unit_cost=D("110"), subtotal=D("10000"), discount_amount=D("0"),
                               sale_sources={"sources": sources}, tenant_id=t_id))
    await async_session.flush()

    a = await StockEntryService(async_session).get_entry_analytics(lote.id, tenant_id=t_id)
    assert a["total_cost"] == 10000.0 and a["extra_costs_total"] == 1000.0 and a["total_investment"] == 11000.0
    assert a["total_quantity_sold"] == 50
    assert a["real_revenue"] == 10000.0 and a["cost_of_sold"] == 5500.0
    assert a["gross_profit"] == 4500.0 and a["margin_pct"] == 45.0
    assert round(a["recovered_pct"], 2) == 90.91
    assert a["stock_value_remaining"] == 5500.0                      # 50 peças x 110
    assert a["projected_profit_if_all_sold"] == 9000.0               # 20.000 - 11.000

    c = await StockEntryService(async_session).get_entry_costs(lote.id, tenant_id=t_id)
    assert c["merchandise_cost"] == 10000.0 and c["trip"]["share_of_this_lot"] == 1000.0
    assert round(c["cost_increase_pct"], 2) == 10.0


async def test_ranking_de_lucro_por_lote(test_client, async_session, test_user):
    from app.services import lot_cost_service as svc
    t_id, token, cat = await _loja_api(async_session, test_user)
    p, v = await _produto(async_session, t_id, cat, "X")
    lote = await _lote(async_session, t_id, [(v, p, 10, 100)])
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    lote_id = lote.id
    await async_session.commit()
    r = await test_client.get("/api/v1/stock-entries/profit-ranking", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    mine = [x for x in r.json() if x["entry_id"] == lote_id]
    assert len(mine) == 1 and mine[0]["total_investment"] == 1000.0


# ───────────────────────── data da entrada ─────────────────────────

async def test_data_da_entrada_pode_ser_retroativa_mas_nao_futura():
    from app.core.timezone import today_brazil
    from app.schemas.stock_entry import entry_date_not_future
    assert entry_date_not_future(today_brazil() - timedelta(days=90)) == today_brazil() - timedelta(days=90)
    assert entry_date_not_future(today_brazil()) == today_brazil()
    with pytest.raises(ValueError):
        entry_date_not_future(today_brazil() + timedelta(days=10))


async def test_codigo_da_entrada_troca_espacos_por_traco():
    from app.schemas.stock_entry import normalize_entry_code
    assert normalize_entry_code("entrada sp 22") == "ENTRADA-SP-22"
    assert normalize_entry_code("  Entrada   SP  22  ") == "ENTRADA-SP-22"
    assert normalize_entry_code("ENTRADA-001") == "ENTRADA-001"
    assert normalize_entry_code(None) is None


async def test_entrada_mostra_total_gasto_com_viagem_e_despesas_e_nao_inventa_retorno(test_client, async_session, test_user):
    """O mesmo total em todas as telas: mercadoria + viagem + despesas do lote. E o 'retorno' fixo de 30% não existe mais."""
    from app.models.expense import Expense
    from app.services import lot_cost_service as svc
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "X")
    trip = await _viagem(async_session, t_id, fuel=230)
    lote = await _lote(async_session, t_id, [(v, p, 10, 100)], trip=trip)     # 1.000 de mercadoria
    async_session.add(Expense(amount=D("120"), description="Almoço", expense_date=date.today(), tenant_id=t_id,
                              stock_entry_id=lote.id))
    await async_session.flush()
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    lote_id = lote.id
    await async_session.commit()

    r = await test_client.get(f"/api/v1/stock-entries/{lote_id}", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_cost"] == 1000.0
    assert body["extra_costs_total"] == 350.0 and body["total_invested"] == 1350.0
    assert body["roi"] is None                      # antes: +30% fixo, mesmo sem vender nada

    a = (await test_client.get(f"/api/v1/stock-entries/{lote_id}/analytics", headers=h)).json()
    assert a["total_investment"] == body["total_invested"]          # cartão e KPI mostram o mesmo número

    lista = (await test_client.get("/api/v1/stock-entries/", headers=h)).json()
    item = next(x for x in (lista if isinstance(lista, list) else lista["items"]) if x["id"] == lote_id)
    assert item["total_invested"] == 1350.0

    stats = (await test_client.get("/api/v1/stock-entries/stats", headers=h)).json()
    assert stats["total_invested"] >= 1350.0                        # o total da lista inclui os extras


async def test_custos_informados_na_criacao_da_entrada_local_e_de_viagem(test_client, async_session, test_user):
    """Frete lançado junto com a entrada: local = despesa da entrada; viagem = despesa da viagem (rateada)."""
    from app.models.expense import Expense
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "X")
    trip = await _viagem(async_session, t_id, fuel=0)
    p2, v2 = await _produto(async_session, t_id, cat, "Y")
    pid, vid, p2id, v2id, trip_id = p.id, v.id, p2.id, v2.id, trip.id
    await async_session.commit()
    base = {"entry_date": date.today().isoformat(), "supplier_name": "Fornecedor Teste"}

    # 1) entrada local com frete de R$ 100 (10 peças de R$ 10 = R$ 100)
    r = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        **base, "entry_code": f"LOCAL-{next(_seq):04d}", "entry_type": "local",
        "items": [{"product_id": pid, "variant_id": vid, "quantity_received": 10, "unit_cost": "10.00"}],
        "extra_costs": [{"description": "Frete", "amount": "100.00"}]})
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    async_session.expire_all()
    (c, extra, posto), = await _extras(async_session, entry_id)
    assert extra == D("10.0000") and posto == D("20.0000")
    exp = (await async_session.execute(select(Expense).where(Expense.stock_entry_id == entry_id))).scalars().all()
    assert len(exp) == 1 and exp[0].trip_id is None and exp[0].description == "Frete"

    # 2) entrada de viagem: o custo vira despesa DA VIAGEM
    r = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        **base, "entry_code": f"VIAGEM-{next(_seq):04d}", "entry_type": "trip", "trip_id": trip_id,
        "items": [{"product_id": p2id, "variant_id": v2id, "quantity_received": 10, "unit_cost": "10.00"}],
        "extra_costs": [{"description": "Combustível", "amount": "100.00"}, {"description": "Almoço", "amount": "20.00"}]})
    assert r.status_code == 201, r.text
    entry2 = r.json()["id"]
    async_session.expire_all()
    (c, extra, posto), = await _extras(async_session, entry2)
    assert extra == D("12.0000") and posto == D("22.0000")                    # (100 + 20) / 10 peças
    exp = (await async_session.execute(select(Expense).where(Expense.trip_id == trip_id))).scalars().all()
    assert sorted(float(e.amount) for e in exp) == [20.0, 100.0] and all(e.stock_entry_id is None for e in exp)

    # 3) custo inválido recusa a entrada inteira (tudo ou nada)
    antes = len((await async_session.execute(select(Expense))).scalars().all())
    r = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        **base, "entry_code": f"RUIM-{next(_seq):04d}", "entry_type": "local",
        "items": [{"product_id": pid, "variant_id": vid, "quantity_received": 1, "unit_cost": "10.00"}],
        "extra_costs": [{"description": "Frete", "amount": "0"}]})
    assert r.status_code == 422
    async_session.expire_all()
    assert len((await async_session.execute(select(Expense))).scalars().all()) == antes


async def test_custos_na_entrada_com_produto_novo_e_com_variantes(test_client, async_session, test_user):
    """Os dois caminhos do assistente de produto aceitam os custos e rateiam na mesma transação."""
    from app.models.expense import Expense
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    n = next(_seq)
    base = {"entry_date": date.today().isoformat(), "supplier_name": "Fornecedor Teste", "entry_type": "local"}

    # produto simples
    r = await test_client.post("/api/v1/stock-entries/with-new-product", headers=h, json={
        **base, "entry_code": f"NP-{n:04d}", "product_name": f"Camiseta Teste {n}", "product_sku": f"NP-SKU-{n}",
        "product_category_id": cat, "product_cost_price": 10, "product_price": 30, "quantity": 10, "discount_amount": "20.00",
        "extra_costs": [{"description": "Frete", "amount": "50.00"}]})
    assert r.status_code in (200, 201), r.text
    entry_id = r.json()["id"]
    async_session.expire_all()
    (c, extra, posto), = await _extras(async_session, entry_id)
    assert extra == D("3.0000") and posto == D("13.0000")                       # (50 frete - 20 desconto) / 10 peças

    # produto com variantes (2 variantes x 5 peças)
    r = await test_client.post("/api/v1/stock-entries/with-new-product-variants", headers=h, json={
        **base, "entry_code": f"NV-{n:04d}", "product_name": f"Legging Teste {n}", "product_category_id": cat,
        "base_price": 30, "discount_amount": "10.00",
        "variants": [
            {"sku": f"NV-{n}-P", "color": "Preto", "size": "P", "price": 30, "cost_price": 10, "quantity": 5},
            {"sku": f"NV-{n}-M", "color": "Preto", "size": "M", "price": 30, "cost_price": 10, "quantity": 5},
        ],
        "extra_costs": [{"description": "Frete", "amount": "20.00"}, {"description": "Embalagem", "amount": "10.00"}]})
    assert r.status_code in (200, 201), r.text
    entry2 = r.json()["id"]
    async_session.expire_all()
    extras = await _extras(async_session, entry2)
    assert [e[1] for e in extras] == [D("2.0000"), D("2.0000")]                  # (30 - 10 desconto) / 10 peças
    n_exp = len((await async_session.execute(select(Expense).where(Expense.stock_entry_id == entry2))).scalars().all())
    assert n_exp == 2


# ───────────────────────── desconto do fornecedor ─────────────────────────

async def test_desconto_do_fornecedor_abate_o_custo_das_pecas(async_session):
    from app.services import lot_cost_service as svc
    t_id, _, cat = await _loja(async_session)
    p, v = await _produto(async_session, t_id, cat, "Top")
    lote = await _lote(async_session, t_id, [(v, p, 10, 10)])  # mercadoria R$ 100
    lote.discount_amount = D("10")
    out = await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    assert out[lote.id]["extra"] == D("-10") and out[lote.id]["discount"] == D("10")
    (custo, extra, posto), = await _extras(async_session, lote.id)
    assert custo == D("10.00") and extra == D("-1.0000") and posto == D("9.0000")


async def test_desconto_com_viagem_e_nunca_passa_da_mercadoria(async_session):
    from app.services import lot_cost_service as svc
    t_id, _, cat = await _loja(async_session)
    p, v = await _produto(async_session, t_id, cat, "Top")
    trip = await _viagem(async_session, t_id, fuel=100)
    lote = await _lote(async_session, t_id, [(v, p, 10, 10)], trip=trip)  # mercadoria 100 + viagem 100
    lote.discount_amount = D("20")
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    (_, extra, posto), = await _extras(async_session, lote.id)
    assert extra == D("8.0000") and posto == D("18.0000")  # (100 - 20) / 10
    lote.discount_amount = D("999")  # absurdo: limita à mercadoria, custo posto não fica negativo
    await svc.recompute_entries(async_session, [lote.id], tenant_id=t_id)
    (_, extra, posto), = await _extras(async_session, lote.id)
    assert posto >= 0 and posto == D("10.0000")


async def test_api_desconto_na_entrada_reflete_no_custo_e_nas_analises(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "Legging")
    lote = await _lote(async_session, t_id, [(v, p, 10, 10)])
    await async_session.commit()
    r = await test_client.put(f"/api/v1/stock-entries/{lote.id}", headers=h, json={"discount_amount": 10})
    assert r.status_code == 200, r.text
    assert float(r.json()["discount_amount"]) == 10.0
    c = (await test_client.get(f"/api/v1/stock-entries/{lote.id}/costs", headers=h)).json()
    assert c["discount_amount"] == 10.0 and c["extra_costs_total"] == -10.0 and c["total_investment"] == 90.0
    a = (await test_client.get(f"/api/v1/stock-entries/{lote.id}/analytics", headers=h)).json()
    assert a["discount_amount"] == 10.0 and a["total_investment"] == 90.0 and a["trip_cost_share"] == 0.0
    r = await test_client.put(f"/api/v1/stock-entries/{lote.id}", headers=h, json={"discount_amount": -5})
    assert r.status_code == 422


async def test_api_criar_entrada_com_desconto_e_frete_juntos(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "Short")
    await async_session.commit()
    r = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        "entry_date": date.today().isoformat(), "supplier_name": "Fornecedor Teste",
        "entry_code": f"DESC-{next(_seq):04d}", "entry_type": "local", "discount_amount": "15.00",
        "items": [{"product_id": p.id, "variant_id": v.id, "quantity_received": 10, "unit_cost": "10.00"}],
        "extra_costs": [{"description": "Frete", "amount": "25.00"}]})
    assert r.status_code == 201, r.text
    assert float(r.json()["discount_amount"]) == 15.0
    async_session.expire_all()
    (c, extra, posto), = await _extras(async_session, r.json()["id"])
    assert extra == D("1.0000") and posto == D("11.0000")  # (25 frete - 15 desconto) / 10 peças
    r = await test_client.post("/api/v1/stock-entries/", headers=h, json={
        "entry_date": date.today().isoformat(), "supplier_name": "Fornecedor Teste",
        "entry_code": f"DESC-{next(_seq):04d}", "entry_type": "local", "discount_amount": "-1",
        "items": [{"product_id": p.id, "variant_id": v.id, "quantity_received": 1, "unit_cost": "10.00"}]})
    assert r.status_code == 422


async def test_api_excluir_desconto_devolve_o_custo_original(test_client, async_session, test_user):
    t_id, token, cat = await _loja_api(async_session, test_user)
    h = {"Authorization": f"Bearer {token}"}
    p, v = await _produto(async_session, t_id, cat, "Blusa")
    lote = await _lote(async_session, t_id, [(v, p, 10, 10)])
    lote_id = lote.id
    await async_session.commit()
    assert (await test_client.put(f"/api/v1/stock-entries/{lote_id}", headers=h, json={"discount_amount": 20})).status_code == 200
    async_session.expire_all()
    (_, extra, posto), = await _extras(async_session, lote_id)
    assert extra == D("-2.0000") and posto == D("8.0000")
    r = await test_client.put(f"/api/v1/stock-entries/{lote_id}", headers=h, json={"discount_amount": 0})   # lixeira do app
    assert r.status_code == 200 and float(r.json()["discount_amount"]) == 0.0
    async_session.expire_all()
    (_, extra, posto), = await _extras(async_session, lote_id)
    assert extra == D("0") and posto == D("10.00")
    c = (await test_client.get(f"/api/v1/stock-entries/{lote_id}/costs", headers=h)).json()
    assert c["discount_amount"] == 0.0 and c["total_investment"] == 100.0
