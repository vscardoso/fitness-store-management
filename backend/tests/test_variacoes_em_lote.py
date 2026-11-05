"""Editar produto grava todas as variações juntas (tudo ou nada). Caso real de 05/11/2026: no Macaquinho Tipo Lupo
a 3ª variação deu conflito (Preto G -> P, que já existia) e as duas primeiras ficaram gravadas pela metade."""
import pytest

from app.models.user import UserRole
from tests.test_short_codes import _loja, _produto, _sem_override, _user

pytestmark = pytest.mark.asyncio


async def _estado(client, h, ids):
    out = {}
    for vid in ids:
        j = (await client.get(f"/api/v1/product-variants/{vid}", headers=h)).json()
        out[vid] = (j["color"], j["size"], j["sku"])
    return out


async def test_conflito_recusa_tudo_e_nada_muda(test_client, async_session):
    _sem_override()
    t, c = await _loja(async_session)
    p, vs = await _produto(async_session, t, c, grade=(("Azul", None), ("Preto", "G"), ("Preto", "P"), ("Cinza", "G")))
    await async_session.commit()
    azul, preto_g, preto_p, cinza = (v.id for v in vs)
    h = await _user(async_session, t, UserRole.MANAGER)
    antes = await _estado(test_client, h, [azul, preto_g, preto_p, cinza])

    body = {"items": [{"id": azul, "size": "G"}, {"id": cinza, "size": "P", "sku": "NOVO-SKU-1"}, {"id": preto_g, "size": "P"}]}
    r = await test_client.put(f"/api/v1/product-variants/product/{p.id}/bulk", json=body, headers=h)
    assert r.status_code == 400, r.text
    assert "Preto · P" in r.json()["detail"]
    assert await _estado(test_client, h, [azul, preto_g, preto_p, cinza]) == antes   # nada gravado


async def test_grava_tudo_junto_e_permite_trocar_tamanhos(test_client, async_session):
    _sem_override()
    t, c = await _loja(async_session)
    p, vs = await _produto(async_session, t, c, grade=(("Azul", None), ("Preto", "G"), ("Preto", "P")))
    await async_session.commit()
    azul, preto_g, preto_p = (v.id for v in vs)
    h = await _user(async_session, t, UserRole.MANAGER)

    # troca P <-> G entre as duas pretas (salvando uma por uma isso dava conflito) e dá tamanho à azul
    body = {"items": [{"id": preto_g, "size": "P"}, {"id": preto_p, "size": "g"}, {"id": azul, "size": "unico", "price": "99.90"}]}
    r = await test_client.put(f"/api/v1/product-variants/product/{p.id}/bulk", json=body, headers=h)
    assert r.status_code == 200, r.text
    depois = await _estado(test_client, h, [azul, preto_g, preto_p])
    assert depois[preto_g][1] == "P" and depois[preto_p][1] == "G" and depois[azul][1] == "ÚNICO"
    assert (await test_client.get(f"/api/v1/product-variants/{azul}", headers=h)).json()["price"] in ("99.90", 99.9, "99.9")


async def test_sku_repetido_e_variacao_de_outro_produto_recusados(test_client, async_session):
    _sem_override()
    t, c = await _loja(async_session)
    p, vs = await _produto(async_session, t, c, grade=(("Azul", "P"), ("Azul", "G")))
    _, outro = await _produto(async_session, t, c, nome="Outro", grade=(("Rosa", "M"),))
    await async_session.commit()
    h = await _user(async_session, t, UserRole.MANAGER)
    url = f"/api/v1/product-variants/product/{p.id}/bulk"
    r = await test_client.put(url, json={"items": [{"id": vs[0].id, "sku": "IGUAL"}, {"id": vs[1].id, "sku": "igual"}]}, headers=h)
    assert r.status_code == 400 and "SKU" in r.json()["detail"]
    r = await test_client.put(url, json={"items": [{"id": vs[0].id, "sku": outro[0].sku}]}, headers=h)
    assert r.status_code == 400 and "já existe" in r.json()["detail"]
    r = await test_client.put(url, json={"items": [{"id": outro[0].id, "size": "G"}]}, headers=h)
    assert r.status_code == 400
    vend = await _user(async_session, t, UserRole.SELLER)
    assert (await test_client.put(url, json={"items": [{"id": vs[0].id, "size": "M"}]}, headers=vend)).status_code == 403


async def test_juntar_variacao_repetida_mantem_pecas_e_custo(test_client, async_session):
    """Preto G era na verdade Preto P: junta as duas numa só, com as peças e o custo de cada entrada."""
    from sqlalchemy import select
    from app.models.entry_item import EntryItem
    from app.models.stock_entry import StockEntry
    from datetime import date
    from decimal import Decimal as D
    _sem_override()
    t, c = await _loja(async_session)
    p, vs = await _produto(async_session, t, c, grade=(("Preto", "G"), ("Preto", "P")))
    preto_g, preto_p = vs
    e = StockEntry(entry_code=f"LOTE-{p.id}", entry_date=date.today(), entry_type="local", supplier_name="Fornecedor Teste", tenant_id=t, total_cost=D("90"))
    async_session.add(e)
    await async_session.flush()
    for v, custo in ((preto_g, "50"), (preto_p, "40")):
        async_session.add(EntryItem(entry_id=e.id, product_id=p.id, variant_id=v.id, quantity_received=1,
                                    quantity_remaining=1, unit_cost=D(custo), tenant_id=t))
    await async_session.commit()
    h = await _user(async_session, t, UserRole.MANAGER)

    r = await test_client.put(f"/api/v1/product-variants/product/{p.id}/bulk",
                              json={"items": [{"id": preto_g.id, "merge_into": preto_p.id}]}, headers=h)
    assert r.status_code == 200, r.text
    alvo = (await test_client.get(f"/api/v1/product-variants/{preto_p.id}", headers=h)).json()
    assert alvo["current_stock"] == 2 and alvo["size"] == "P"
    itens = (await async_session.execute(select(EntryItem).where(EntryItem.entry_id == e.id))).scalars().all()
    assert sorted((i.variant_id, float(i.unit_cost)) for i in itens) == [(preto_p.id, 40.0), (preto_p.id, 50.0)]
    lista = (await test_client.get(f"/api/v1/product-variants/product/{p.id}", headers=h)).json()
    assert [v["id"] for v in lista] == [preto_p.id]   # a repetida saiu da lista

    # destino inválido (ela mesma) é recusado
    r = await test_client.put(f"/api/v1/product-variants/product/{p.id}/bulk",
                              json={"items": [{"id": preto_p.id, "merge_into": preto_p.id}]}, headers=h)
    assert r.status_code == 400
