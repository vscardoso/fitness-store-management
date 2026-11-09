"""Fila de impressão de etiquetas: entrar na fila, só o botão "Imprimi" tira da fila e anda a folha, "Não saiu" desfaz."""
from datetime import date
from decimal import Decimal

import pytest

from app.models.entry_item import EntryItem
from app.models.stock_entry import StockEntry
from app.models.user import UserRole
from tests.test_short_codes import _loja, _produto, _sem_override, _tenant_de_verdade, _user  # noqa: F401

pytestmark = pytest.mark.asyncio
D = Decimal
API = "/api/v1/labels"


async def _cenario(db, qtds=(5, 4)):
    t, cat = await _loja(db)
    p, vs = await _produto(db, t, cat, grade=(("Preto", "M"), ("Preto", "G")))
    entry = StockEntry(entry_code=f"ENT-FILA-{t}", entry_date=date.today(), entry_type="local", supplier_name="Fornecedor",
                       tenant_id=t, total_cost=D("0"))
    db.add(entry)
    await db.flush()
    for v, q in zip(vs, qtds):
        db.add(EntryItem(entry_id=entry.id, product_id=p.id, variant_id=v.id, quantity_received=q, quantity_remaining=q,
                         unit_cost=D("30"), tenant_id=t))
    await db.commit()
    h = await _user(db, t, UserRole.SELLER)
    return t, h, entry.id, [v.id for v in vs]


SHEET = {"layout": "sheet", "width_mm": 47, "height_mm": 42}


async def test_entrada_na_fila_so_o_que_falta_e_nao_dobra(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    r = await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    assert r.status_code == 201 and r.json()["added"] == 9 and r.json()["progress"]["missing"] == 0
    r = await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)        # de novo: nada a mais
    assert r.json()["added"] == 0
    q = (await test_client.get(f"{API}/queue", headers=h)).json()
    assert q["total"] == 9 and {i["variant_id"]: i["quantity"] for i in q["items"]} == {va: 5, vb: 4}
    assert q["items"][0]["entry_code"] == f"ENT-FILA-{t}"


async def test_gerar_pdf_nao_tira_da_fila_so_o_botao_imprimi(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    r = await test_client.post(f"{API}/pdf", json={**SHEET, "items": [{"variant_id": va, "quantity": 5}, {"variant_id": vb, "quantity": 4}]}, headers=h)
    assert r.status_code == 200
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 9           # PDF não muda nada
    st = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    assert st["next_position"] == 1 and st["per_sheet"] == 6 and st["sheet"] == []

    body = {**SHEET, "start_position": 1, "from_queue": True, "items": [{"variant_id": va, "quantity": 5}, {"variant_id": vb, "quantity": 4}]}
    r = await test_client.post(f"{API}/prints", json=body, headers=h)                        # "Imprimi, tirar da fila"
    assert r.status_code == 201, r.text
    assert r.json()["total"] == 9 and r.json()["next_position"] == 4                          # 9 = 6 + 3: a 2ª folha parou no 3
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 0
    st = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    assert st["next_position"] == 4
    assert [c["position"] for c in st["sheet"]] == [1, 2, 3]                                  # o que já está na folha atual
    assert all(c["code"] for c in st["sheet"])
    prog = (await test_client.get(f"{API}/entry/{entry_id}/progress", headers=h)).json()
    assert prog["printed"] == 9 and prog["queued"] == 0 and prog["missing"] == 0


async def test_impressao_parcial_deixa_o_resto_na_fila_e_continua_a_folha(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    r = await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 1, "from_queue": True,
                                                       "items": [{"variant_id": va, "quantity": 2}]}, headers=h)
    assert r.json()["next_position"] == 3
    q = (await test_client.get(f"{API}/queue", headers=h)).json()
    assert q["total"] == 7 and {i["variant_id"]: i["quantity"] for i in q["items"]} == {va: 3, vb: 4}
    # a próxima impressão já começa do 3 e fecha a folha
    r = await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 3, "from_queue": True,
                                                       "items": [{"variant_id": vb, "quantity": 4}]}, headers=h)
    assert r.json()["next_position"] == 1                                                    # folha cheia: a próxima é nova
    st = (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()
    assert st["next_position"] == 1 and st["sheet"] == []


async def test_nao_saiu_volta_para_a_fila_e_desfaz_a_folha(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    job = (await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 1, "from_queue": True,
                                                         "items": [{"variant_id": va, "quantity": 5}]}, headers=h)).json()
    assert job["next_position"] == 6
    r = await test_client.post(f"{API}/prints/{job['id']}/undo", headers=h)
    assert r.status_code == 200 and r.json()["returned"] == 5
    q = (await test_client.get(f"{API}/queue", headers=h)).json()
    assert q["total"] == 9
    assert (await test_client.get(f"{API}/print-state", params=SHEET, headers=h)).json()["next_position"] == 1
    assert (await test_client.post(f"{API}/prints/{job['id']}/undo", headers=h)).status_code == 400   # já desfeita


async def test_validacoes_e_isolamento_entre_lojas(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    t2, h2, entry2, (vc, _) = await _cenario(async_session)
    r = await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 7, "from_queue": False,
                                                       "items": [{"variant_id": va, "quantity": 1}]}, headers=h)
    assert r.status_code == 400                                                              # a folha só tem 6 posições
    r = await test_client.post(f"{API}/queue", json={"items": [{"variant_id": vc, "quantity": 1}]}, headers=h)
    assert r.status_code == 400                                                              # peça de outra loja
    r = await test_client.post(f"{API}/queue/entry/{entry2}", headers=h)
    assert r.status_code == 400                                                              # entrada de outra loja
    await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)
    assert (await test_client.get(f"{API}/queue", headers=h2)).json()["total"] == 0          # a fila é de cada loja
    item = (await test_client.get(f"{API}/queue", headers=h)).json()["items"][0]
    assert (await test_client.put(f"{API}/queue/{item['id']}", json={"quantity": 0}, headers=h2)).status_code == 400
    assert (await test_client.put(f"{API}/queue/{item['id']}", json={"quantity": 2}, headers=h)).status_code == 200
    assert (await test_client.get(f"{API}/queue", headers=h)).json()["total"] == 2 + 4


async def test_direto_da_entrada_conta_como_impresso_sem_passar_pela_fila(test_client, async_session):
    _sem_override()
    t, h, entry_id, (va, vb) = await _cenario(async_session)
    r = await test_client.post(f"{API}/prints", json={**SHEET, "start_position": 1, "from_queue": False, "entry_id": entry_id,
                                                       "items": [{"variant_id": va, "quantity": 5}]}, headers=h)
    assert r.status_code == 201
    prog = (await test_client.get(f"{API}/entry/{entry_id}/progress", headers=h)).json()
    assert prog["printed"] == 5 and prog["missing"] == 4
    r = await test_client.post(f"{API}/queue/entry/{entry_id}", headers=h)                    # só o que falta
    assert r.json()["added"] == 4
