"""O bipe (ler a etiqueta ou digitar o código) só enxerga a PRÓPRIA loja.

As duas lojas têm peças com o MESMO código de etiqueta (#001-1): quem bipa em cada loja recebe a peça da sua, nunca a da outra.
Cobre: resolvedor único (/lookup) em todos os formatos, busca por código no seletor, conferência de estoque (lista que o bipe usa)
e SKU igual nas duas lojas.
"""
from decimal import Decimal

import pytest

from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.user import UserRole
from tests.test_short_codes import _loja, _produto, _sem_override, _tenant_de_verdade, _user  # noqa: F401

pytestmark = pytest.mark.asyncio
API = "/api/v1"


async def _duas_lojas(db):
    t1, c1 = await _loja(db)
    t2, c2 = await _loja(db)
    p1, v1 = await _produto(db, t1, c1, nome="Peça da Loja A", grade=(("Verde", "M"),))
    p2, v2 = await _produto(db, t2, c2, nome="Peça da Loja B", grade=(("Rosa", "G"),))
    await db.commit()
    for v in (v1[0], v2[0]):
        await db.refresh(v)
    return (t1, p1, v1[0]), (t2, p2, v2[0])


async def test_bipe_acha_so_a_peca_da_propria_loja_mesmo_com_codigo_igual(test_client, async_session):
    _sem_override()
    db = async_session
    (t1, p1, v1), (t2, p2, v2) = await _duas_lojas(db)
    assert v1.display_code if hasattr(v1, "display_code") else True
    h1 = await _user(db, t1, UserRole.CASHIER)
    h2 = await _user(db, t2, UserRole.CASHIER)

    code = f"#{v1.product_code:03d}-{v1.variant_number}"
    code2 = f"#{v2.product_code:03d}-{v2.variant_number}"
    assert code == code2                                                    # o mesmo código existe nas duas lojas

    for texto in (f"PV{code}", code, code.lstrip("#"), f"pv{code}".lower()):
        a = await test_client.get(f"{API}/product-variants/lookup", params={"code": texto}, headers=h1)
        b = await test_client.get(f"{API}/product-variants/lookup", params={"code": texto}, headers=h2)
        assert a.status_code == 200 and b.status_code == 200, texto
        assert a.json()["variant"]["id"] == v1.id and a.json()["product"]["name"] == p1.name, texto
        assert b.json()["variant"]["id"] == v2.id and b.json()["product"]["name"] == p2.name, texto   # nunca a da outra loja


async def test_bipe_de_peca_que_so_existe_na_outra_loja_nao_acha(test_client, async_session):
    _sem_override()
    db = async_session
    t1, c1 = await _loja(db)
    t2, c2 = await _loja(db)
    p1, v1 = await _produto(db, t1, c1, nome="So da Loja A", grade=(("Verde", "M"), ("Verde", "G")))
    await db.commit()
    for v in v1:
        await db.refresh(v)
    h2 = await _user(db, t2, UserRole.CASHIER)                              # a loja B não tem NENHUMA peça
    for v in v1:
        for texto in (f"PV#{v.product_code:03d}-{v.variant_number}", f"#{v.product_code:03d}-{v.variant_number}", v.sku, v.sku.lower()):
            r = await test_client.get(f"{API}/product-variants/lookup", params={"code": texto}, headers=h2)
            assert r.status_code == 404, (texto, r.text)
            r = await test_client.get(f"{API}/product-variants/short-code/{texto.replace('#', '%23')}", headers=h2)
            assert r.status_code == 404, texto


async def test_sku_igual_nas_duas_lojas_cada_uma_acha_a_sua(test_client, async_session):
    _sem_override()
    db = async_session
    t1, c1 = await _loja(db)
    t2, c2 = await _loja(db)
    ids = {}
    for t, c, nome in ((t1, c1, "SKU repetido A"), (t2, c2, "SKU repetido B")):
        p = Product(name=nome, category_id=c, tenant_id=t, base_price=Decimal("50"))
        db.add(p)
        await db.flush()
        v = ProductVariant(product_id=p.id, sku="SKU-COMUM-001", color="Azul", size="M", price=Decimal("50"), tenant_id=t)
        db.add(v)
        await db.flush()
        ids[t] = (v.id, nome)
    await db.commit()
    h1 = await _user(db, t1, UserRole.CASHIER)
    h2 = await _user(db, t2, UserRole.CASHIER)
    for t, h in ((t1, h1), (t2, h2)):
        r = await test_client.get(f"{API}/product-variants/lookup", params={"code": "sku-comum-001"}, headers=h)
        assert r.status_code == 200
        assert r.json()["variant"]["id"] == ids[t][0] and r.json()["product"]["name"] == ids[t][1]


async def test_conferencia_e_seletor_so_listam_pecas_da_propria_loja(test_client, async_session):
    """A conferência de estoque monta o índice do bipe com a lista da loja; o seletor busca por código: nenhum mistura lojas."""
    _sem_override()
    db = async_session
    (t1, p1, v1), (t2, p2, v2) = await _duas_lojas(db)
    from app.models.entry_item import EntryItem
    from app.models.stock_entry import StockEntry
    from datetime import date
    for t, p, v in ((t1, p1, v1), (t2, p2, v2)):
        e = StockEntry(entry_code=f"ENT-BIPE-{t}", entry_date=date.today(), entry_type="local", supplier_name="F", tenant_id=t, total_cost=Decimal("0"))
        db.add(e)
        await db.flush()
        db.add(EntryItem(entry_id=e.id, product_id=p.id, variant_id=v.id, quantity_received=3, quantity_remaining=3,
                         unit_cost=Decimal("10"), tenant_id=t))
    await db.commit()
    m1 = await _user(db, t1, UserRole.MANAGER)
    m2 = await _user(db, t2, UserRole.MANAGER)

    rows1 = (await test_client.get(f"{API}/reports/stock-check", params={"only_in_stock": True}, headers=m1)).json()["rows"]
    rows2 = (await test_client.get(f"{API}/reports/stock-check", params={"only_in_stock": True}, headers=m2)).json()["rows"]
    assert {r["variant_id"] for r in rows1} == {v1.id} and {r["variant_id"] for r in rows2} == {v2.id}

    code = f"#{v1.product_code:03d}-{v1.variant_number}"
    for h, esperado in ((m1, p1.id), (m2, p2.id)):
        achados = (await test_client.get(f"{API}/products/grouped", params={"search": code}, headers=h)).json()
        assert [g["id"] for g in achados] == [esperado], code
