"""Depois de um estorno/devolução tudo tem que voltar ao lugar: a peça disponível para vender de novo e todos os números
(estoque por entrada, saldo do produto, grade, conferência, consulta por etiqueta, painel, cliente e a gaveta do financeiro)."""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _config, _estoque
from tests.test_financeiro import _implantar, _zerar_implantacao

pytestmark = pytest.mark.asyncio
API = "/api/v1"


async def _venda(client, h, p, v, qtd, cliente_id=None):
    body = {"payment_method": "cash", "items": [{"product_id": p.id, "variant_id": v.id, "quantity": qtd, "unit_price": "100.00"}],
            "payments": [{"amount": str(100 * qtd), "payment_method": "cash"}]}
    if cliente_id:
        body["customer_id"] = cliente_id
    r = await client.post(f"{API}/sales/", headers=h, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"], r.json()["items"][0]["id"]


async def _envelhecer(db, sale_id, dias=30):
    from app.models.sale import Sale
    venda = (await db.execute(select(Sale).where(Sale.id == sale_id))).scalar_one()
    venda.created_at = datetime.now(timezone.utc) - timedelta(days=dias)
    await db.commit()


async def _voltou_nas_camadas(db, sale_item_id):
    """Quanto da venda já voltou, lido direto das camadas FIFO guardadas no item (a API não mostra este campo)."""
    from app.models.sale import SaleItem
    await db.rollback()   # lê o que o servidor gravou, não o que a sessão do teste tinha em memória
    fontes = (await db.execute(select(SaleItem.sale_sources).where(SaleItem.id == sale_item_id))).scalar_one()
    return sum(int(f.get("quantity_returned", 0)) for f in fontes["sources"])


async def _fotografia(client, db, h, p, va, cliente_id=None, t_id=1):
    """Todos os lugares onde o app mostra a peça, lidos pela API/banco."""
    g = (await client.get(f"{API}/products/grouped?search=Legging", headers=h)).json()
    prod = next(x for x in g if x["id"] == p.id)
    var = next(v for v in prod["variants"] if v["id"] == va.id)
    inv = (await client.get(f"{API}/inventory/product/{p.id}", headers=h)).json()["quantity"]
    sc = (await client.get(f"{API}/reports/stock-check", headers=h)).json()
    linha = next(r for r in sc["rows"] if r["variant_id"] == va.id)
    look = (await client.get(f"{API}/product-variants/lookup", params={"code": var["display_code"]}, headers=h)).json()
    from app.core.dashboard_cache import invalidate_dashboard_cache
    invalidate_dashboard_cache(t_id)    # o painel guarda os números por alguns minutos: sem isso um teste anterior contamina este
    dash = (await client.get(f"{API}/dashboard/stats", headers=h)).json()
    snap = {
        "fifo": await _estoque(db, va.id),                       # soma das entradas (a verdade do estoque)
        "grade": var["current_stock"], "produto_total": prod["total_stock"],
        "inventario": inv,
        "conferencia": linha["system_quantity"], "conferencia_total": sc["total_pieces"],
        "consulta": look["variant"]["current_stock"],
        "painel_pecas": dash["stock"]["total_quantity"], "painel_investido": dash["stock"]["invested_value"],
        "vendas_hoje": dash["sales"]["total_today"], "cmv_hoje": dash["sales"]["cmv_today"], "lucro_hoje": dash["sales"]["profit_today"],
    }
    if cliente_id:
        c = (await client.get(f"{API}/customers/{cliente_id}", headers=h)).json()
        snap["cliente_gasto"] = float(c["total_spent"] or 0)
        snap["cliente_pontos"] = float(c["loyalty_points"] or 0)
    return snap


def _estoque_igual(snap, fifo, produto_total, painel_pecas, com_inventario=True):
    assert snap["fifo"] == snap["grade"] == snap["conferencia"] == snap["consulta"] == fifo, snap
    assert snap["produto_total"] == snap["conferencia_total"] == produto_total, snap
    if com_inventario:   # o saldo do produto só existe depois da 1ª venda neste cenário (a fixture lança as entradas direto)
        assert snap["inventario"] == produto_total, snap
    assert snap["painel_pecas"] == painel_pecas, snap


async def test_estorno_devolve_a_peca_e_acerta_todos_os_numeros(test_client, async_session, test_user):
    from app.models.customer import Customer
    t_id, h, p, va, vb = await _cenario(async_session, test_user)       # A: 10 peças, B: 10 peças, custo 40, preço 100
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    c = Customer(full_name="Cliente Estorno", phone="34999990000", tenant_id=t_id)
    async_session.add(c)
    await async_session.commit()

    s0 = await _fotografia(test_client, async_session, h, p, va, c.id)
    _estoque_igual(s0, fifo=10, produto_total=20, painel_pecas=20, com_inventario=False)

    sale_id, item_id = await _venda(test_client, h, p, va, 3, c.id)
    s1 = await _fotografia(test_client, async_session, h, p, va, c.id)
    _estoque_igual(s1, fifo=7, produto_total=17, painel_pecas=17)
    assert s1["vendas_hoje"] == 300 and s1["cmv_hoje"] == 120 and s1["lucro_hoje"] == 180
    assert s1["cliente_gasto"] == s0["cliente_gasto"] + 300
    # (dentro do prazo de propósito: devolução abate no DIA em que acontece; venda antiga estornada hoje deixa o dia de hoje negativo, regra do Victor)

    # estorna 1 das 3 peças
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "Lancei a peça errada", "is_correction": True, "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    s2 = await _fotografia(test_client, async_session, h, p, va, c.id)
    _estoque_igual(s2, fifo=8, produto_total=18, painel_pecas=18)       # a peça voltou em TODOS os lugares
    assert s2["vendas_hoje"] == 200 and s2["cmv_hoje"] == 80 and s2["lucro_hoje"] == 120   # receita e custo líquidos
    assert s2["cliente_gasto"] == s0["cliente_gasto"] + 200
    venda = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()
    assert venda["status"] == "partially_refunded"
    assert await _voltou_nas_camadas(async_session, item_id) == 1        # a camada de origem sabe quanto voltou

    # estorna as 2 que sobraram: tudo igual ao começo
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "Venda lançada errada", "is_correction": True, "items": [{"sale_item_id": item_id, "quantity": 2}]})
    assert r.status_code == 201, r.text
    s3 = await _fotografia(test_client, async_session, h, p, va, c.id)
    _estoque_igual(s3, fifo=10, produto_total=20, painel_pecas=20)
    assert s3["painel_investido"] == s0["painel_investido"]              # valor do estoque igual ao de antes da venda
    assert s3["vendas_hoje"] == 0 and s3["cmv_hoje"] == 0 and s3["lucro_hoje"] == 0
    assert s3["cliente_gasto"] == s0["cliente_gasto"] and s3["cliente_pontos"] == s0["cliente_pontos"]
    venda = (await test_client.get(f"{API}/sales/{sale_id}", headers=h)).json()
    assert venda["status"] == "refunded"
    assert await _voltou_nas_camadas(async_session, item_id) == 3

    # a peça está mesmo disponível: dá para vender as 10 de novo, e a 11ª é recusada
    for _ in range(2):
        await _venda(test_client, h, p, va, 5)
    s4 = await _fotografia(test_client, async_session, h, p, va)
    _estoque_igual(s4, fifo=0, produto_total=10, painel_pecas=10)
    r = await test_client.post(f"{API}/sales/", headers=h, json={
        "payment_method": "cash", "items": [{"product_id": p.id, "variant_id": va.id, "quantity": 1, "unit_price": "100.00"}],
        "payments": [{"amount": "100.00", "payment_method": "cash"}]})
    assert r.status_code >= 400


async def test_estorno_com_peca_com_defeito_nao_volta_ao_estoque(test_client, async_session, test_user):
    """Defeito (restock falso) é o único caso em que a peça NÃO volta: o resto das contas continua certo."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _config(async_session, t_id, allow_money_refund=True, return_window_days=7)
    sale_id, item_id = await _venda(test_client, h, p, va, 2)
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "Veio rasgada", "items": [{"sale_item_id": item_id, "quantity": 1, "restock": False}]})
    assert r.status_code == 201, r.text
    s = await _fotografia(test_client, async_session, h, p, va)
    _estoque_igual(s, fifo=8, produto_total=18, painel_pecas=18)         # 10 - 2 vendidas; a defeituosa não volta
    assert s["vendas_hoje"] == 100                                       # mas o dinheiro foi devolvido


async def test_estorno_devolve_o_dinheiro_da_gaveta_do_financeiro(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _zerar_implantacao(async_session, t_id)
    r = await _implantar(test_client, h)
    assert r.status_code in (200, 201), r.text

    def gaveta(d):
        return next(a for a in d["accounts"] if a["name"] == "Gaveta")["balance"]

    inicio = gaveta((await test_client.get(f"{API}/finance/accounts", headers=h)).json())
    sale_id, item_id = await _venda(test_client, h, p, va, 3)
    depois_venda = gaveta((await test_client.get(f"{API}/finance/accounts", headers=h)).json())
    assert depois_venda == inicio + 300
    await _envelhecer(async_session, sale_id)
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "Lancei errado", "is_correction": True, "items": [{"sale_item_id": item_id, "quantity": 1}]})
    assert r.status_code == 201, r.text
    assert gaveta((await test_client.get(f"{API}/finance/accounts", headers=h)).json()) == inicio + 200   # saiu 100 da gaveta
    r = await test_client.post(f"{API}/returns/{sale_id}", headers=h, json={
        "reason": "Lancei errado", "is_correction": True, "items": [{"sale_item_id": item_id, "quantity": 2}]})
    assert r.status_code == 201, r.text
    assert gaveta((await test_client.get(f"{API}/finance/accounts", headers=h)).json()) == inicio       # voltou ao saldo de antes
    await _zerar_implantacao(async_session, t_id)
