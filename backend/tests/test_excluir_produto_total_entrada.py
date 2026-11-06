"""Excluir um produto refaz o total da entrada (06/11/2026: ESTOQUE-ANTINGO, SAOPAULOGEMEOS e ROLETTE ficaram
somando itens de produtos excluídos: R$ 578, R$ 360 e R$ 440 a mais)."""
from datetime import date

import pytest
from sqlalchemy import select

from app.models.entry_item import EntryItem
from app.models.stock_entry import EntryType, StockEntry
from app.models.user import UserRole
from tests.test_short_codes import D, _loja, _produto, _sem_override, _user

pytestmark = pytest.mark.asyncio


async def test_excluir_produto_desconta_do_total_da_entrada(test_client, async_session):
    _sem_override()
    db = async_session
    t, c = await _loja(db)
    p1, v1 = await _produto(db, t, c, nome="Fica", grade=(("Preto", "M"),))
    p2, v2 = await _produto(db, t, c, nome="Sai", grade=(("Azul", "P"), ("Azul", "G")))
    await db.commit()
    for o in (p1, p2, *v1, *v2):
        await db.refresh(o)
    e = StockEntry(entry_code="LOTE-TOTAL", entry_date=date.today(), entry_type=EntryType.LOCAL, supplier_name="F",
                   total_cost=D("130"), tenant_id=t)
    db.add(e)
    await db.flush()
    db.add(EntryItem(entry_id=e.id, product_id=p1.id, variant_id=v1[0].id, quantity_received=2, quantity_remaining=2, unit_cost=D("40"), tenant_id=t))
    db.add(EntryItem(entry_id=e.id, product_id=p2.id, variant_id=v2[0].id, quantity_received=1, quantity_remaining=1, unit_cost=D("25"), tenant_id=t))
    db.add(EntryItem(entry_id=e.id, product_id=p2.id, variant_id=v2[1].id, quantity_received=1, quantity_remaining=1, unit_cost=D("25"), tenant_id=t))
    eid = e.id
    await db.commit()
    h = await _user(db, t, UserRole.ADMIN)

    r = await test_client.delete(f"/api/v1/products/{p2.id}", headers=h)
    assert r.status_code in (200, 204), r.text
    db.expire_all()
    total = (await db.execute(select(StockEntry.total_cost).where(StockEntry.id == eid))).scalar_one()
    assert total == D("80.00")        # 130 - 2 x 25: só o produto que ficou (2 x 40)
