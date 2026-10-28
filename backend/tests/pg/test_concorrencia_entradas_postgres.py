"""
Corrida entre venda e mexidas na entrada (editar item, excluir item, excluir entrada, ajuste manual de estoque), no Postgres
de verdade com pedidos em paralelo. Antes não havia trava nesses caminhos: eles liam "nada vendido"/o saldo e regravavam
por cima, e a baixa de uma venda feita no meio sumia (peça inventada) ou a venda caía num produto apagado.

Rodar: TEST_PG_URL=postgresql+asyncpg://postgres@127.0.0.1:55432/postgres pytest tests/pg/test_concorrencia_entradas_postgres.py -p no:cacheprovider --no-cov
"""
import asyncio
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from tests.pg.test_concorrencia_vendas_postgres import (  # noqa: F401  (fixtures)
    PG_URL, _confere, _estoque, _post_venda, _prepara, _status, _zera_limites, pg, pytestmark,
)

import os
RODADAS = int(os.environ.get("RODADAS", "6"))


async def _item_id(pg, vid):
    from sqlalchemy import select
    from app.models.entry_item import EntryItem
    async with pg.mk() as s:
        return (await s.execute(select(EntryItem.id, EntryItem.entry_id).where(EntryItem.variant_id == vid, EntryItem.is_active == True))).one()  # noqa: E712


async def _duas_variacoes_na_mesma_entrada(pg):
    from tests.test_lot_costs import _lote, _produto
    from tests.test_estresse_vendas_fifo import _variacao
    async with pg.mk() as s:
        p, v1 = await _produto(s, pg.tenant, pg.cat, "ConcEnt", "100.00")
        v2 = await _variacao(s, p, pg.tenant, "100.00", cor="Outra", tam="G")
        e = await _lote(s, pg.tenant, [(v1, p, 10, 40), (v2, p, 10, 40)], entry_date=date.today() - timedelta(days=3))
        await s.commit()
        return SimpleNamespace(id=p.id), SimpleNamespace(id=v1.id), SimpleNamespace(id=v2.id), e.id


async def test_editar_quantidade_do_item_enquanto_vende(pg):
    for rodada in range(RODADAS):
        p, (v,) = await _prepara(pg, [(10, 40)])
        item_id, _ = await _item_id(pg, v.id)
        edita = pg.client.put(f"/api/v1/stock-entries/entry-items/{item_id}", headers=pg.h, json={"quantity_received": 15})
        rs = await asyncio.gather(edita, _post_venda(pg, p, v, 3))
        assert all(r.status_code < 500 for r in rs), f"rodada {rodada}: {_status(rs)} {[r.text[:150] for r in rs]}"
        venda_ok = rs[1].status_code in (200, 201)
        edit_ok = rs[0].status_code == 200
        est = await _estoque(pg, v.id)
        # editou antes da venda: 15 - 3; vendeu antes: a edição é recusada (já teve venda) e fica 10 - 3
        esperado = (15 if edit_ok else 10) - (3 if venda_ok else 0)
        assert est == esperado, f"rodada {rodada}: estoque {est}, esperado {esperado} ({_status(rs)})"
        await _confere(pg, [v.id])


async def test_excluir_item_da_entrada_enquanto_vende(pg):
    for rodada in range(RODADAS):
        p, v1, v2, entry_id = await _duas_variacoes_na_mesma_entrada(pg)
        item_id, _ = await _item_id(pg, v1.id)
        apaga = pg.client.delete(f"/api/v1/stock-entries/entry-items/{item_id}", headers=pg.h)
        rs = await asyncio.gather(apaga, _post_venda(pg, p, v1, 2))
        assert all(r.status_code < 500 for r in rs), f"rodada {rodada}: {_status(rs)} {[r.text[:150] for r in rs]}"
        apagou, vendeu = rs[0].status_code == 200, rs[1].status_code in (200, 201)
        assert not (apagou and vendeu), f"rodada {rodada}: apagou o item E vendeu a peça dele"
        await _confere(pg, [v1.id, v2.id])


async def test_excluir_entrada_enquanto_vende(pg):
    for rodada in range(RODADAS):
        p, v1, v2, entry_id = await _duas_variacoes_na_mesma_entrada(pg)
        apaga = pg.client.delete(f"/api/v1/stock-entries/{entry_id}", headers=pg.h)
        rs = await asyncio.gather(apaga, _post_venda(pg, p, v2, 1))
        assert all(r.status_code < 500 for r in rs), f"rodada {rodada}: {_status(rs)} {[r.text[:150] for r in rs]}"
        apagou, vendeu = rs[0].status_code == 200, rs[1].status_code in (200, 201)
        assert not (apagou and vendeu), f"rodada {rodada}: apagou a entrada E vendeu a peça dela"
        await _confere(pg, [v1.id, v2.id])


async def test_ajuste_manual_de_estoque_enquanto_vende(pg):
    for rodada in range(RODADAS):
        p, (v,) = await _prepara(pg, [(10, 40)])
        ajusta = pg.client.post(f"/api/v1/products/{p.id}/adjust-quantity", headers=pg.h,
                                json={"new_quantity": 2, "reason": "Contagem da loja"})
        rs = await asyncio.gather(ajusta, _post_venda(pg, p, v, 5))
        assert all(r.status_code < 500 for r in rs), f"rodada {rodada}: {_status(rs)} {[r.text[:150] for r in rs]}"
        est = await _estoque(pg, v.id)
        assert est >= 0
        if rs[0].status_code == 200:
            # a contagem diz que sobram 2: com a venda antes ou depois, o estoque final é 2 (ou a venda foi recusada)
            assert est == 2, f"rodada {rodada}: ajuste para 2 terminou com {est} ({_status(rs)})"
