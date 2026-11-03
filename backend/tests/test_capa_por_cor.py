"""Capa do produto = a foto de UMA das cores (decisão do Victor, 2026-11-03).

A primeira cor que ganha foto vira a capa; outra cor recebendo foto não muda a capa; "Usar como capa" troca;
apagar a capa passa para outra foto; a foto principal antiga, sem cor, pode ser passada para a cor certa.
"""
import io

import pytest
from PIL import Image
from sqlalchemy import select

from app.models.product import Product
from app.models.product_variant import ProductVariant
from tests.test_lot_costs import _limpa_loja_1, _loja_api, _produto  # noqa: F401  (fixture autouse)

pytestmark = pytest.mark.asyncio


def _png(cor) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), cor).save(buf, format="PNG")
    return buf.getvalue()


async def _cenario(db, test_user):
    t_id, token, cat = await _loja_api(db, test_user)
    p, v1 = await _produto(db, t_id, cat, "Jaqueta Capa")
    v1.color, v1.size = "Lilás", "M"
    v2 = ProductVariant(product_id=p.id, sku=f"CAPA-{p.id}-2", color="Preto", size="M", price=v1.price, tenant_id=t_id)
    db.add(v2)
    await db.commit()
    return p.id, v1.id, v2.id, {"Authorization": f"Bearer {token}"}


async def _enviar(client, h, pid, vid=None, cor=(200, 30, 90)):
    url = f"/api/v1/products/{pid}/media/upload" + (f"?variant_id={vid}" if vid else "")
    r = await client.post(url, headers=h, files={"file": ("f.png", io.BytesIO(_png(cor)), "image/png")})
    assert r.status_code == 201, r.text
    return r.json()


async def _capa(db, pid):
    db.expire_all()
    return (await db.execute(select(Product.image_url).where(Product.id == pid))).scalar_one()


async def test_primeira_cor_vira_capa_e_outra_cor_nao_rouba(test_client, async_session, test_user):
    pid, lilas, preto, h = await _cenario(async_session, test_user)
    a = await _enviar(test_client, h, pid, lilas)
    assert await _capa(async_session, pid) == a["url"]
    await _enviar(test_client, h, pid, preto, cor=(10, 10, 10))
    assert await _capa(async_session, pid) == a["url"]          # antes a capa pulava para a última cor


async def test_usar_como_capa_troca_e_cor_sem_foto_e_recusada(test_client, async_session, test_user):
    pid, lilas, preto, h = await _cenario(async_session, test_user)
    await _enviar(test_client, h, pid, lilas)
    r = await test_client.put(f"/api/v1/products/{pid}/cover-variant", headers=h, json={"variant_id": preto})
    assert r.status_code == 400 and "ainda não tem foto" in r.json()["detail"]
    b = await _enviar(test_client, h, pid, preto, cor=(10, 10, 10))
    r = await test_client.put(f"/api/v1/products/{pid}/cover-variant", headers=h, json={"variant_id": preto})
    assert r.status_code == 200 and r.json()["image_url"] == b["url"]
    assert await _capa(async_session, pid) == b["url"]


async def test_trocar_a_foto_da_cor_que_e_capa_atualiza_a_capa(test_client, async_session, test_user):
    pid, lilas, preto, h = await _cenario(async_session, test_user)
    await _enviar(test_client, h, pid, lilas)
    nova = await _enviar(test_client, h, pid, lilas, cor=(90, 60, 200))
    r = await test_client.patch(f"/api/v1/products/{pid}/media/{nova['id']}/cover", headers=h)
    assert r.status_code == 200
    assert await _capa(async_session, pid) == nova["url"]


async def test_apagar_a_capa_passa_para_outra_cor(test_client, async_session, test_user):
    pid, lilas, preto, h = await _cenario(async_session, test_user)
    a = await _enviar(test_client, h, pid, lilas)
    b = await _enviar(test_client, h, pid, preto, cor=(10, 10, 10))
    assert (await test_client.delete(f"/api/v1/products/{pid}/media/{a['id']}", headers=h)).status_code == 204
    assert await _capa(async_session, pid) == b["url"]
    assert (await test_client.delete(f"/api/v1/products/{pid}/media/{b['id']}", headers=h)).status_code == 204
    assert await _capa(async_session, pid) is None


async def test_foto_principal_antiga_sem_cor_passa_para_a_cor_certa(test_client, async_session, test_user):
    pid, lilas, preto, h = await _cenario(async_session, test_user)
    solta = await _enviar(test_client, h, pid)                   # como a jaqueta: foto principal sem cor
    assert solta["variant_id"] is None and await _capa(async_session, pid) == solta["url"]
    r = await test_client.post(f"/api/v1/products/{pid}/main-photo/assign", headers=h, json={"variant_id": lilas})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["variant_id"] == lilas and d["is_cover"] is True
    assert await _capa(async_session, pid) == solta["url"]       # continua a capa, agora como foto da cor Lilás
    async_session.expire_all()
    v = (await async_session.execute(select(ProductVariant.image_url).where(ProductVariant.id == lilas))).scalar_one()
    assert v == solta["url"]
    # de novo: a foto principal já é de uma cor
    r = await test_client.post(f"/api/v1/products/{pid}/main-photo/assign", headers=h, json={"variant_id": preto})
    assert r.status_code == 400
    # cor de outro produto
    r = await test_client.put(f"/api/v1/products/{pid}/cover-variant", headers=h, json={"variant_id": 999999})
    assert r.status_code == 400


async def test_produto_antigo_so_com_endereco_da_foto_passa_para_a_cor(test_client, async_session, test_user):
    """Produto antigo: foto principal só em product.image_url, sem registro na galeria."""
    from sqlalchemy import update
    pid, lilas, preto, h = await _cenario(async_session, test_user)
    await async_session.execute(update(Product).where(Product.id == pid).values(image_url="/uploads/products/antiga.jpg"))
    await async_session.commit()
    r = await test_client.post(f"/api/v1/products/{pid}/main-photo/assign", headers=h, json={"variant_id": lilas})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["variant_id"] == lilas and d["url"] == "/uploads/products/antiga.jpg" and d["is_cover"] is True
    assert await _capa(async_session, pid) == "/uploads/products/antiga.jpg"
    lista = (await test_client.get(f"/api/v1/products/{pid}/media", headers=h)).json()
    assert [(m["variant_id"], m["url"]) for m in lista] == [(lilas, "/uploads/products/antiga.jpg")]

