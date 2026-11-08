"""Validação dos consertos de relatórios e lotes: período que cruza meses, cancelada depois de devolução, /dashboard/top-products,
PDF com desconto e venda "antiga" (sale_sources sem quantity_returned / quantity_defective)."""
import subprocess
import tempfile
from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.core.timezone import get_day_range_utc, today_brazil
from tests.audit.consistencia.mundo import D, devolve, mundo, q2, vende
from tests.test_estresse_dinheiro import _numeros
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio
API = "/api/v1"


def _limpa(t_id):
    from app.core.dashboard_cache import _dashboard_cache, invalidate_dashboard_cache
    _dashboard_cache.clear()
    invalidate_dashboard_cache(t_id)


async def _mover_venda_para_mes_anterior(db, sale_id):
    from app.models.sale import Sale
    hoje = today_brazil()
    ultimo_mes = hoje.replace(day=1) - timedelta(days=1)
    dia = ultimo_mes.replace(day=15)
    await db.execute(update(Sale).where(Sale.id == sale_id).values(created_at=get_day_range_utc(dia)[0] + timedelta(hours=12)))
    await db.commit()
    return ultimo_mes


async def test_periodo_que_cruza_dois_meses(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    from tests.test_troca import _config
    await _config(async_session, t_id, return_window_days=90)
    r1, s1 = await vende(test_client, h, ids, book, [(ids.a, 10, "0")])                     # R$ 1.000, vai para o mês passado
    r2, s2 = await vende(test_client, h, ids, book, [(ids.b, 5, "0")], desconto="60")       # R$ 540 este mês
    ultimo = await _mover_venda_para_mes_anterior(async_session, s1.id)
    assert (await devolve(test_client, h, book, s1, s1.lines[0], 4)).status_code == 201     # devolução HOJE de R$ 400
    _limpa(t_id)
    hoje = today_brazil()
    ini_ant = ultimo.replace(day=1)

    def per(a, b):
        return test_client.get(f"{API}/sales/reports/period", headers=h, params={"start_date": a.isoformat(), "end_date": b.isoformat()})

    todo = (await per(ini_ant, hoje)).json()
    ant = (await per(ini_ant, ultimo)).json()
    atual = (await per(hoje.replace(day=1), hoje)).json()
    assert q2(ant["total_sales"]) == D("1000.00")
    assert q2(atual["total_sales"]) == D("140.00"), "devolução abate no mês em que aconteceu (540 - 400)"
    assert q2(todo["total_sales"]) == q2(ant["total_sales"]) + q2(atual["total_sales"]) == D("1140.00")
    ma = (await test_client.get(f"{API}/reports/monthly", headers=h, params={"year": ultimo.year, "month": ultimo.month})).json()
    mc = (await test_client.get(f"{API}/reports/monthly", headers=h)).json()
    assert ma["result"]["current"]["revenue"] == 1000.0
    assert mc["result"]["current"]["revenue"] == 140.0
    assert mc["result"]["previous"]["revenue"] == 1000.0
    tp = (await test_client.get(f"{API}/sales/reports/top-products", headers=h, params={"period": "this_month", "limit": 50})).json()
    assert q2(sum(D(str(x["total_revenue"])) for x in tp["products"])) == D("540.00")   # ranking ignora produto com saldo negativo no mês (devolução de venda do mês passado)
    dt = (await test_client.get(f"{API}/dashboard/top-products", headers=h, params={"period": "this_month", "limit": 20})).json()
    assert q2(sum(D(str(x["revenue"])) for x in dt["products"])) == D("140.00")   # por produto: 540 - 400 (diferente do ranking por variação acima: 2 granularidades)


async def test_cancelar_venda_com_devolucao_parcial_e_recusado_e_nada_muda(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 10, "0")], desconto="100")
    assert (await devolve(test_client, h, book, s, s.lines[0], 4)).status_code == 201
    _limpa(t_id)
    antes = await _numeros(test_client, h)
    c = await test_client.post(f"{API}/sales/{s.id}/cancel", headers=h, params={"reason": "tentando cancelar"})
    assert c.status_code == 400, c.text
    _limpa(t_id)
    assert await _numeros(test_client, h) == antes
    assert q2(antes["relatorio"]) == D("540.00")


async def test_dashboard_top_products_valor_pago_liquido_e_igual_ao_resultado_por_produto(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 10, "0"), (ids.c, 4, "20")], desconto="90")
    assert r.status_code == 201, r.text
    assert (await devolve(test_client, h, book, s, s.lines[0], 3)).status_code == 201
    assert (await devolve(test_client, h, book, s, s.lines[1], 4, restock=False)).status_code == 201
    r2, s2 = await vende(test_client, h, ids, book, [(ids.c, 2, "0")])
    assert (await test_client.post(f"{API}/sales/{s2.id}/cancel", headers=h, params={"reason": "lançada errado"})).status_code == 200
    _limpa(t_id)
    dt = {x["product_id"]: x for x in (await test_client.get(f"{API}/dashboard/top-products", headers=h, params={"period": "this_month", "limit": 20})).json()["products"]}
    rp = {x["product_id"]: x for x in (await test_client.get(f"{API}/expenses/resultado-mes/produtos", headers=h)).json()}
    for pid, x in rp.items():
        if x["pieces_net"] <= 0 and x["revenue"] <= 0:
            assert pid not in dt
            continue
        assert q2(dt[pid]["revenue"]) == q2(x["revenue"]) and q2(dt[pid]["cmv"]) == q2(x["cost"]) and dt[pid]["qty_sold"] == x["pieces_net"], (pid, dt[pid], x)


async def test_pdf_do_relatorio_de_vendas_com_desconto_mostra_o_valor_pago(test_client, async_session, test_user):
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 10, "0")], desconto="100")     # R$ 900 pagos
    assert r.status_code == 201
    _limpa(t_id)
    pdf = await test_client.get(f"{API}/reports/sales/pdf?period=this_month", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(pdf.content)
    txt = subprocess.run(["pdftotext", "-layout", f.name, "-"], capture_output=True, text=True).stdout
    assert "900,00" in txt, txt[:1500]
    assert "1.000,00" not in txt, "o PDF mostra o preço cheio (R$ 1.000,00) em vez do valor pago"


# ───────────────────────────────────────────────────────── venda "antiga": sale_sources sem quantity_returned / quantity_defective
async def _estado_lotes(client, h, ids):
    out = {}
    for eid in ids.entries:
        a = (await client.get(f"{API}/stock-entries/{eid}/analytics", headers=h)).json()
        t = (await client.get(f"{API}/stock-entries/{eid}/tracking", headers=h)).json()["totals"]
        out[eid] = (q2(a["real_revenue"]), q2(a["cost_of_sold"]), a["total_quantity_sold"], t["sold"], t["removed"], t["closed"])
    return out


async def _antigo(test_client, async_session, test_user, defeito):
    """Simula venda anterior à correção: remove quantity_returned/quantity_defective das fontes depois da devolução."""
    from app.models.sale import SaleItem
    t_id, h, ids, book = await mundo(async_session, test_user)
    r, s = await vende(test_client, h, ids, book, [(ids.a, 12, "0"), (ids.b, 5, "0")], desconto="30")
    assert (await devolve(test_client, h, book, s, s.lines[0], 2, restock=not defeito)).status_code == 201
    assert (await devolve(test_client, h, book, s, s.lines[1], 3)).status_code == 201
    _limpa(t_id)
    novo = await _estado_lotes(test_client, h, ids)
    n_novo = await _numeros(test_client, h)
    fifo_novo = (await test_client.get(f"{API}/dashboard/fifo-performance", headers=h)).json()
    itens = (await async_session.execute(select(SaleItem).where(SaleItem.sale_id == s.id))).scalars().all()
    for it in itens:
        limpas = [{k: v for k, v in src.items() if k not in ("quantity_returned", "quantity_defective")} for src in it.sale_sources["sources"]]
        await async_session.execute(update(SaleItem).where(SaleItem.id == it.id).values(sale_sources={"sources": limpas}))
    await async_session.commit()
    async_session.expire_all()
    _limpa(t_id)
    velho = await _estado_lotes(test_client, h, ids)
    assert await _numeros(test_client, h) == n_novo, "telas da conta única não dependem das fontes"
    fifo_velho = (await test_client.get(f"{API}/dashboard/fifo-performance", headers=h)).json()
    return novo, velho, fifo_novo, fifo_velho


# colunas de _estado_lotes: 0 receita, 1 custo, 2 vendidas (Lucro por lote) | 3 vendidas, 4 sem venda, 5 fecha (rastreio)
async def test_venda_antiga_lucro_por_lote_nao_muda(test_client, async_session, test_user):
    novo, velho, fn, fv = await _antigo(test_client, async_session, test_user, defeito=False)
    assert {e: v[:3] for e, v in novo.items()} == {e: v[:3] for e, v in velho.items()}
    assert fv["sell_through"] == fn["sell_through"]


async def test_venda_antiga_rastreio_do_lote_nao_muda(test_client, async_session, test_user):
    novo, velho, _fn, _fv = await _antigo(test_client, async_session, test_user, defeito=False)
    assert {e: v[3:] for e, v in novo.items()} == {e: v[3:] for e, v in velho.items()}


async def test_venda_antiga_com_defeito_lucro_por_lote_nao_muda(test_client, async_session, test_user):
    novo, velho, _fn, _fv = await _antigo(test_client, async_session, test_user, defeito=True)
    assert {e: v[:3] for e, v in novo.items()} == {e: v[:3] for e, v in velho.items()}
