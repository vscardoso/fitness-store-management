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


# ───────────────────────────────────────────────────────── Saídas sem venda (GET /stock-entries/removals)
async def _cenario_saidas(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)         # 10 de A e 10 de B (R$ 40)
    eid = await _entry_id(async_session, t_id)
    await _vender(test_client, h, p, va, 2, "100.00")                      # venda não pode aparecer
    r = await test_client.delete(f"{API}/product-variants/{vb.id}", headers=h, params={"zerar_estoque": "true"})
    assert r.status_code in (200, 204), r.text                             # 10 peças de B: variacao_excluida
    item_a = (await async_session.execute(select(EntryItem).where(EntryItem.variant_id == va.id))).scalars().first()
    # saída antiga sem registro na hora (refeita depois): 3 peças de A
    async_session.add(EntryItemEvent(tenant_id=t_id, entry_item_id=item_a.id, variant_id=va.id, product_id=p.id,
                                     reason="baixa_sem_registro", delta=-3, before=8, after=5, reconstructed=True))
    await async_session.commit()
    return t_id, h, eid, p, va, vb


async def test_saidas_sem_venda_lista_totais_e_nulos(test_client, async_session, test_user):
    t_id, h, eid, p, va, vb = await _cenario_saidas(test_client, async_session, test_user)
    r = await test_client.get(f"{API}/stock-entries/removals", headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["total_count"] == 2 and len(d["items"]) == 2
    assert d["totals"]["pieces"] == 13 and d["totals"]["cost"] == "520.00"          # 13 x R$ 40 (custo posto)
    assert d["totals"]["by_reason"]["variacao_excluida"] == {"label": "Baixa ao excluir a variação", "pieces": 10}
    assert d["totals"]["by_reason"]["baixa_sem_registro"]["pieces"] == 3
    primeiro, ultimo = d["items"]
    assert primeiro["reason"] == "variacao_excluida" and primeiro["when"] is not None      # com data primeiro
    assert ultimo["reason"] == "baixa_sem_registro" and ultimo["when"] is None and ultimo["reconstructed"] is True   # sem data por último
    assert primeiro["quantity"] == 10 and primeiro["unit_cost"] == "40.00" and primeiro["cost_total"] == "400.00"
    assert primeiro["entry_id"] == eid and primeiro["entry_code"] and primeiro["product_id"] == p.id
    assert primeiro["product_name"].startswith("Legging Troca") and primeiro["variant_label"]
    assert all(i["reason"] != "venda" for i in d["items"])


async def test_saidas_sem_venda_filtros_e_paginacao(test_client, async_session, test_user):
    from datetime import date, timedelta
    t_id, h, eid, p, va, vb = await _cenario_saidas(test_client, async_session, test_user)
    g = lambda **q: test_client.get(f"{API}/stock-entries/removals", headers=h, params=q)
    d = (await g(reason="baixa_sem_registro")).json()
    assert d["total_count"] == 1 and d["totals"]["pieces"] == 3 and d["items"][0]["when"] is None
    assert (await g(reason="inventado")).status_code == 400
    d = (await g(limit=1)).json()
    assert len(d["items"]) == 1 and d["total_count"] == 2 and d["totals"]["pieces"] == 13       # totais do filtro, não da página
    assert (await g(limit=1, skip=1)).json()["items"][0]["reason"] == "baixa_sem_registro"
    assert (await g(limit=201)).status_code == 422
    hoje = date.today()
    d = (await g(start_date=(hoje - timedelta(days=1)).isoformat(), end_date=(hoje + timedelta(days=1)).isoformat())).json()
    assert d["totals"]["by_reason"].keys() == {"variacao_excluida"}                             # sem data não entra em filtro por data
    d = (await g(start_date=(hoje + timedelta(days=2)).isoformat())).json()
    assert d["total_count"] == 0 and d["totals"]["pieces"] == 0
    assert (await g(entry_id=eid)).json()["total_count"] == 2
    assert (await g(entry_id=eid + 999)).json()["total_count"] == 0


async def test_saidas_sem_venda_bate_com_reconcile_e_isolamento(test_client, async_session, test_user):
    from app.models.store import Store
    t_id, h, eid, p, va, vb = await _cenario_saidas(test_client, async_session, test_user)
    rec = await reconcile(async_session, t_id, entry_id=eid)
    d = (await test_client.get(f"{API}/stock-entries/removals", headers=h)).json()
    assert d["totals"]["by_reason"]["variacao_excluida"]["pieces"] == -rec["by_reason"]["variacao_excluida"]["pieces"] == 10
    # evento de OUTRA loja nunca aparece na minha lista
    outra = Store(name="Outra loja saídas", slug="outra-loja-saidas")
    async_session.add(outra)
    await async_session.commit()
    item_a = (await async_session.execute(select(EntryItem).where(EntryItem.variant_id == va.id))).scalars().first()
    async_session.add(EntryItemEvent(tenant_id=outra.id, entry_item_id=item_a.id, reason="baixa_conferencia", delta=-4, before=8, after=4))
    await async_session.commit()
    d2 = (await test_client.get(f"{API}/stock-entries/removals", headers=h)).json()
    assert d2["totals"]["pieces"] == 13 and "baixa_conferencia" not in d2["totals"]["by_reason"]
    from app.services.stock_flow_service import removals
    assert (await removals(async_session, outra.id))["total_count"] == 0     # a outra loja também não enxerga o lote da minha
    await async_session.execute(EntryItemEvent.__table__.delete().where(EntryItemEvent.tenant_id == outra.id))
    await async_session.commit()


async def test_saidas_sem_venda_so_gerente_e_admin(test_client, async_session, test_user):
    from tests.audit.papeis.conftest import novo_usuario
    t_id, h, eid, p, va, vb = await _cenario_saidas(test_client, async_session, test_user)
    from app.models.user import User
    criados = []
    try:
        for papel, esperado in (("cashier", 403), ("seller", 403), ("manager", 200)):
            u, hp = await novo_usuario(async_session, t_id, papel)
            criados.append(u.id)
            r = await test_client.get(f"{API}/stock-entries/removals", headers=hp)
            assert r.status_code == esperado, (papel, r.status_code)
    finally:   # não deixa usuário sobrando na loja 1 (limite de usuários do plano nos outros testes)
        await async_session.execute(User.__table__.delete().where(User.id.in_(criados)))
        await async_session.commit()
    assert (await test_client.get(f"{API}/stock-entries/removals", headers=h)).status_code == 200
