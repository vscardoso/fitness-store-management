"""Resolvedor único de código lido: QR do adesivo, SKU e código antigo; sem custo; só da própria loja."""
from datetime import date

import pytest
from sqlalchemy import select

from app.models.entry_item import EntryItem
from app.models.product_variant import ProductVariant
from app.models.stock_entry import EntryType, StockEntry
from app.models.user import UserRole
from tests.test_short_codes import D, _loja, _produto, _sem_override, _user

pytestmark = pytest.mark.asyncio

URL = "/api/v1/product-variants/lookup"


async def _estoque(db, tenant_id, produto, variante, qtd):
    e = StockEntry(entry_code=f"LK-{variante.id}", entry_date=date.today(), entry_type=EntryType.LOCAL, supplier_name="F",
                   total_cost=D(10) * qtd, tenant_id=tenant_id)
    db.add(e)
    await db.flush()
    db.add(EntryItem(entry_id=e.id, variant_id=variante.id, product_id=produto.id, quantity_received=qtd,
                     quantity_remaining=qtd, unit_cost=D(10), tenant_id=tenant_id))
    await db.flush()


async def test_acha_por_qr_codigo_e_sku_com_estoque_e_irmas(test_client, async_session):
    _sem_override()
    db = async_session
    t, c = await _loja(db)
    p, vs = await _produto(db, t, c, nome="Top Lookup", grade=(("Preto", "M"), ("Preto", "G"), ("Rosa", "P")))
    await _estoque(db, t, p, vs[0], 3)
    await _estoque(db, t, p, vs[1], 5)
    await db.commit()
    h = await _user(db, t, UserRole.SELLER)
    # etiqueta: o primeiro pedido numera (o servidor numera ao imprimir; aqui lê o que já existe)
    await db.refresh(vs[0])
    if vs[0].product_code is None:
        from app.services.short_code_service import ensure_codes
        await ensure_codes(db, vs)
        await db.commit()
        for v in vs:
            await db.refresh(v)
    codigo = f"#{vs[0].product_code}-{vs[0].variant_number}"

    for texto in (f"PV#{vs[0].product_code:03d}-{vs[0].variant_number}", codigo, codigo.lstrip("#"), vs[0].sku):
        r = await test_client.get(URL, params={"code": texto}, headers=h)
        assert r.status_code == 200, (texto, r.text)
        corpo = r.json()
        assert corpo["variant"]["id"] == vs[0].id, texto
        assert corpo["variant"]["current_stock"] == 3 and corpo["product"]["name"].startswith("Top Lookup")
        assert corpo["product_stock"] == 8 and len(corpo["siblings"]) == 3
        # nunca custo
        assert not any("cost" in k for k in corpo["variant"]) and not any("cost" in k for k in corpo["product"])
    assert (await test_client.get(URL, params={"code": vs[0].sku}, headers=h)).json()["match"] == "sku"
    assert (await test_client.get(URL, params={"code": vs[0].sku.lower()}, headers=h)).json()["variant"]["id"] == vs[0].id   # caixa não importa
    assert (await test_client.get(URL, params={"code": codigo}, headers=h)).json()["match"] == "label"
    # irmãs em ordem: cor, depois tamanho natural
    assert [(s["color"], s["size"]) for s in (await test_client.get(URL, params={"code": codigo}, headers=h)).json()["siblings"]] == [
        ("Preto", "M"), ("Preto", "G"), ("Rosa", "P")]


async def test_codigo_antigo_e_numero_simples_so_por_ultimo(test_client, async_session):
    _sem_override()
    db = async_session
    t, c = await _loja(db)
    _, vs = await _produto(db, t, c, nome="Antigo", grade=(("Azul", "M"),))
    outra = ProductVariant(product_id=vs[0].product_id, sku="12345", color="Verde", size="G", price=D("10"), tenant_id=t)
    db.add(outra)
    await db.commit()
    await db.refresh(vs[0])
    await db.refresh(outra)
    h = await _user(db, t, UserRole.CASHIER)
    if vs[0].short_code:
        r = await test_client.get(URL, params={"code": f"PV#{vs[0].short_code:04d}"}, headers=h)
        assert r.status_code == 200 and r.json()["variant"]["id"] == vs[0].id
    # SKU numérico ganha de número simples: "12345" é o SKU da outra peça
    r = await test_client.get(URL, params={"code": "12345"}, headers=h)
    assert r.status_code == 200 and r.json()["variant"]["id"] == outra.id and r.json()["match"] == "sku"


async def test_nao_acha_outra_loja_nem_lixo_e_exige_login(test_client, async_session):
    _sem_override()
    db = async_session
    ta, ca = await _loja(db)
    tb, cb = await _loja(db)
    _, vs = await _produto(db, ta, ca, nome="So da A")
    await db.commit()
    hb = await _user(db, tb, UserRole.MANAGER)
    r = await test_client.get(URL, params={"code": vs[0].sku}, headers=hb)
    assert r.status_code == 404 and "não encontrado" in r.json()["detail"]
    for lixo in ("zzz", "PV#", "#", "0", "PV#999999-9", "x" * 200):
        r = await test_client.get(URL, params={"code": lixo}, headers=hb)
        assert r.status_code in (404, 422), (lixo, r.status_code)
    assert (await test_client.get(URL, params={"code": "a"})).status_code == 401
    assert (await test_client.get(URL, headers=hb)).status_code == 422    # sem o parâmetro
