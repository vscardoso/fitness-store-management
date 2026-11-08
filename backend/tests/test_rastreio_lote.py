"""Rastreio das peças do lote (08/11/2026): peça que saiu SEM venda (variação excluída, baixa) não pode aparecer como vendida.

Caso real (loja 2): a tela do lote mostrava "29 vendidos" quando só 2 peças tinham sido vendidas; as outras 27 saíram por
exclusão de variação e baixa. Cada saída agora fica no livro do estoque (entry_item_events) e a conta fecha:
recebidas = vendidas + com a cliente + saíram sem venda + em estoque."""
import pytest
from sqlalchemy import select, update

from app.models.entry_item import EntryItem
from app.models.entry_item_event import EntryItemEvent
from app.services.stock_ledger import reconcile
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse)
from tests.test_relatorio_vendas_pdf import _limpa_vendas  # noqa: F401  (fixture autouse)
from tests.test_troca import _cenario, _vender

pytestmark = pytest.mark.asyncio
API = "/api/v1"


async def _entry_id(async_session, t_id):
    from app.models.stock_entry import StockEntry
    return (await async_session.execute(select(StockEntry.id).where(StockEntry.tenant_id == t_id).order_by(StockEntry.id.desc()))).scalars().first()


async def test_peca_excluida_nao_vira_venda_e_a_conta_fecha(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)        # 10 de A e 10 de B
    eid = await _entry_id(async_session, t_id)
    await _vender(test_client, h, p, va, 2, "100.00")                     # vendeu 2 de A
    r = await test_client.delete(f"{API}/product-variants/{vb.id}", headers=h, params={"zerar_estoque": "true"})
    assert r.status_code in (200, 204), r.text                            # B: 10 peças saem sem venda

    entry = (await test_client.get(f"{API}/stock-entries/{eid}", headers=h)).json()
    por_var = {i["variant_id"]: i for i in entry["entry_items"]}
    assert por_var[va.id]["quantity_sold"] == 2 and por_var[va.id]["quantity_removed"] == 0
    assert por_var[vb.id]["quantity_sold"] == 0 and por_var[vb.id]["quantity_removed"] == 10      # antes: 10 "vendidas"
    assert entry["items_sold"] == 2

    tr = (await test_client.get(f"{API}/stock-entries/{eid}/tracking", headers=h)).json()
    t = tr["totals"]
    assert (t["received"], t["sold"], t["removed"], t["remaining"]) == (20, 2, 10, 8) and t["closed"] is True
    assert t["removed_unrecorded"] == 0                                    # a saída de B está no livro
    linha_b = next(x for x in tr["items"] if x["removed"] == 10)
    assert linha_b["removed"] == 10 and any(e["reason"] == "variacao_excluida" for e in linha_b["history"])

    rec = await reconcile(async_session, t_id, entry_id=eid)
    assert rec["untracked"] == [] and rec["ok"] is True, rec
    assert rec["by_reason"]["venda"]["pieces"] == -2 and rec["by_reason"]["variacao_excluida"]["pieces"] == -10


async def test_livro_acusa_mudanca_feita_sem_passar_por_ele(test_client, async_session, test_user):
    """UPDATE em massa escrito à mão escapa do gancho: a conta do livro tem que mostrar a diferença."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    eid = await _entry_id(async_session, t_id)
    assert (await reconcile(async_session, t_id, entry_id=eid))["untracked"] == []
    await async_session.execute(update(EntryItem).where(EntryItem.entry_id == eid, EntryItem.variant_id == va.id).values(quantity_remaining=7))
    await async_session.commit()
    rec = await reconcile(async_session, t_id, entry_id=eid)
    assert len(rec["untracked"]) == 1 and rec["untracked"][0]["difference"] == -3 and rec["ok"] is False


async def test_produto_com_entrada_nao_e_excluido_pela_lixeira(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    r = await test_client.delete(f"{API}/products/{p.id}", headers=h)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "product_has_entries"
    eventos = (await async_session.execute(select(EntryItemEvent).where(EntryItemEvent.tenant_id == t_id, EntryItemEvent.reason == "produto_excluido"))).scalars().all()
    assert eventos == []                                                   # nada foi mexido


async def test_backfill_monta_o_livro_de_lote_antigo_e_a_conta_fecha(test_client, async_session, test_user):
    """Lote de antes do livro: vendas vêm de sale_sources; a saída sem venda fica marcada como refeita; corrente fecha."""
    from sqlalchemy import delete
    from app.services.stock_ledger_backfill import backfill
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    eid = await _entry_id(async_session, t_id)
    await _vender(test_client, h, p, va, 2, "100.00")
    from app.services.stock_ledger import stock_reason
    with stock_reason("baixa_sem_registro"):          # simula a saída antiga: tira 3 de B pelo ORM
        item_b = (await async_session.execute(select(EntryItem).where(EntryItem.entry_id == eid, EntryItem.variant_id == vb.id))).scalar_one()
        item_b.quantity_remaining = 7
        await async_session.commit()
    await async_session.execute(delete(EntryItemEvent).where(EntryItemEvent.tenant_id == t_id))   # como se o livro não existisse
    await async_session.commit()
    assert len((await reconcile(async_session, t_id, entry_id=eid))["no_history"]) == 2

    dry = await backfill(async_session, t_id, apply=False)
    assert dry["applied"] is False and dry["sem_registro"] == 3
    ok = await backfill(async_session, t_id, apply=True)
    assert ok["applied"] is True
    rec = await reconcile(async_session, t_id, entry_id=eid)
    assert rec["untracked"] == [] and rec["no_history"] == []
    assert rec["by_reason"]["baixa_sem_registro"]["pieces"] == -3 and rec["by_reason"]["venda"]["pieces"] == -2
    tr = (await test_client.get(f"{API}/stock-entries/{eid}/tracking", headers=h)).json()
    assert tr["totals"]["removed_unrecorded"] == 3 and tr["totals"]["closed"] is True
    assert all(e["reconstructed"] for r in tr["items"] for e in r["history"])
    again = await backfill(async_session, t_id, apply=True)         # idempotente
    assert again["items"] == 0 and again["events"] == 0


async def test_lista_de_entradas_e_relatorios_tambem_usam_a_venda_real(test_client, async_session, test_user):
    """Entradas (taxa de venda), venda lenta e melhor desempenho não contam peça excluída como vendida."""
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    eid = await _entry_id(async_session, t_id)
    await _vender(test_client, h, p, va, 2, "100.00")
    r = await test_client.delete(f"{API}/product-variants/{vb.id}", headers=h, params={"zerar_estoque": "true"})
    assert r.status_code in (200, 204), r.text

    lista = (await test_client.get(f"{API}/stock-entries/", headers=h, params={"limit": 50})).json()
    e = next(x for x in lista if x["id"] == eid)
    assert round(e["sell_through_rate"], 1) == 10.0 and e["items_sold"] == 2          # 2 de 20; antes 12 de 20 = 60%

    lentos = (await test_client.get(f"{API}/stock-entries/slow-moving", headers=h, params={"threshold": 100})).json()
    assert all(x["quantity_sold"] <= 2 for x in (lentos if isinstance(lentos, list) else lentos.get("items", lentos.get("slow_movers", []))))

    melhores = (await test_client.get(f"{API}/stock-entries/best-performing", headers=h, params={"limit": 20})).json()
    lista_m = melhores if isinstance(melhores, list) else melhores.get("entries", melhores.get("items", []))
    mine = next(x for x in lista_m if x["entry_id"] == eid)
    assert mine["total_quantity_sold"] == 2
