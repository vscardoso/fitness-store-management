"""Feed de catálogo da Meta: só publicado e com foto, preço e nome do produto, sem marca, token por loja, papel de admin."""
import csv
import io

import pytest
from sqlalchemy import select, update

from app.core.security import create_access_token, get_password_hash
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse: limpa a loja 1 depois de cada teste)
from tests.test_troca import _cenario

pytestmark = pytest.mark.asyncio
ADMIN_API = "/api/v1/catalog-feed"


async def _ligar(client, h):
    r = await client.post(f"{ADMIN_API}/rotate", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _csv(client, url):
    path = url.split("/api/v1", 1)[1]
    r = await client.get(f"/api/v1{path}")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    return r.text, list(csv.DictReader(io.StringIO(r.text)))


async def _produto_set(db, pid, **campos):
    from app.models.product import Product
    await db.execute(update(Product).where(Product.id == pid).values(**campos))
    await db.commit()


async def test_feed_so_existe_com_token_valido_e_comeca_desligado(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    st = (await test_client.get(ADMIN_API, headers=h)).json()
    assert st["enabled"] is False and st["url"] is None
    r = await test_client.get("/api/v1/public/catalog-feed/token-que-nao-existe.csv")
    assert r.status_code == 404
    st = await _ligar(test_client, h)
    assert st["enabled"] is True and st["url"].endswith(".csv") and "/api/v1/public/catalog-feed/" in st["url"]


async def test_produto_sem_foto_fica_fora_e_aparece_na_lista_do_admin(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    st = await _ligar(test_client, h)
    texto, linhas = await _csv(test_client, st["url"])
    assert linhas == []                                                  # sem foto: nada vai
    assert st["items"] == 0 and st["skipped_no_photo"] == 2 and st["published_products"] == 1
    assert [x["id"] for x in st["missing_photo_products"]] == [p.id]
    # com foto: as duas variações entram
    await _produto_set(async_session, p.id, image_url="/uploads/products/12.jpg")
    st = (await test_client.get(ADMIN_API, headers=h)).json()
    texto, linhas = await _csv(test_client, st["url"])
    assert len(linhas) == 2 and st["missing_photo_products"] == []
    assert {x["item_group_id"] for x in linhas} == {f"p{p.id}"}
    # a Meta recebe a versão de 1200 px em pé, não a original (que pode estar deitada com rotação só no EXIF)
    assert all(x["image_link"] == "https://api.provadorfit.com.br/uploads/products/12.jpg?w=1200" for x in linhas)
    assert all(x["price"] == "100.00 BRL" and x["condition"] == "new" and x["availability"] == "in stock" for x in linhas)
    assert all(x["title"].startswith("Legging Troca") for x in linhas)
    assert {x["id"] for x in linhas} == {f"v{va.id}", f"v{vb.id}"}


async def test_foto_da_variacao_e_foto_absoluta_do_cloudinary(test_client, async_session, test_user):
    from app.models.product_media import ProductMedia
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _produto_set(async_session, p.id, image_url="https://res.cloudinary.com/x/capa.jpg")
    async_session.add(ProductMedia(product_id=p.id, variant_id=vb.id, tenant_id=t_id, url="/uploads/products/azul.jpg", is_cover=True, position=0))
    await async_session.commit()
    st = await _ligar(test_client, h)
    _, linhas = await _csv(test_client, st["url"])
    por_id = {x["id"]: x for x in linhas}
    assert por_id[f"v{va.id}"]["image_link"] == "https://res.cloudinary.com/x/capa.jpg"
    assert por_id[f"v{vb.id}"]["image_link"] == "https://api.provadorfit.com.br/uploads/products/azul.jpg?w=1200"


async def test_marca_nunca_vai_no_feed(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _produto_set(async_session, p.id, image_url="/uploads/x.jpg", brand="Zorba Sport", name="Legging Zorba Sport Cintura Alta",
                       description="Legging Nike com tecido Lupo, modelo Zorba Sport. Alta compressão.")
    st = await _ligar(test_client, h)
    texto, linhas = await _csv(test_client, st["url"])
    baixo = texto.lower()
    for marca in ("nike", "lupo", "zorba"):
        assert marca not in baixo, marca
    assert len(linhas) == 2 and linhas[0]["title"] == "Legging Cintura Alta"
    assert "Alta compressão" in linhas[0]["description"]
    from app.models.store import Store
    loja = (await async_session.execute(select(Store).where(Store.id == t_id))).scalar_one()
    assert linhas[0]["brand"] == loja.name                                # só o nome da loja
    assert st["brand_removed"] == 2


async def test_nome_so_de_marca_sai_do_feed(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _produto_set(async_session, p.id, image_url="/uploads/x.jpg", name="Nike")
    st = await _ligar(test_client, h)
    _, linhas = await _csv(test_client, st["url"])
    assert linhas == [] and st["skipped_no_name"] == 2


async def test_despublicado_inativo_sem_preco_e_sem_estoque(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    t_id, h, p, va, vb = await _cenario(async_session, test_user, stock_b=0)
    await _produto_set(async_session, p.id, image_url="/uploads/x.jpg")
    st = await _ligar(test_client, h)
    _, linhas = await _csv(test_client, st["url"])
    por_id = {x["id"]: x for x in linhas}
    assert por_id[f"v{va.id}"]["availability"] == "in stock" and por_id[f"v{vb.id}"]["availability"] == "out of stock"
    # variação inativa e preço zerado saem
    await async_session.execute(update(ProductVariant).where(ProductVariant.id == vb.id).values(price=0))
    await async_session.commit()
    st = (await test_client.get(ADMIN_API, headers=h)).json()
    _, linhas = await _csv(test_client, st["url"])
    assert [x["id"] for x in linhas] == [f"v{va.id}"] and st["skipped_no_price"] == 1
    await async_session.execute(update(ProductVariant).where(ProductVariant.id == va.id).values(is_active=False))
    await async_session.commit()
    _, linhas = await _csv(test_client, st["url"])
    assert linhas == []
    # produto despublicado some inteiro
    await async_session.execute(update(ProductVariant).where(ProductVariant.id == va.id).values(is_active=True))
    await async_session.commit()
    await _produto_set(async_session, p.id, is_catalog=False)
    st2 = (await test_client.get(ADMIN_API, headers=h)).json()
    _, linhas = await _csv(test_client, st2["url"])
    assert linhas == [] and st2["published_products"] == 0


async def test_csv_com_virgula_aspas_e_quebra_de_linha_na_descricao(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _produto_set(async_session, p.id, image_url="/uploads/x.jpg", description='Top "lindo", confortável\nlinha 2\x07')
    st = await _ligar(test_client, h)
    _, linhas = await _csv(test_client, st["url"])
    assert linhas[0]["description"] == 'Top "lindo", confortável\nlinha 2'


async def test_novo_link_invalida_o_antigo_e_desligar_apaga(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    antigo = (await _ligar(test_client, h))["url"]
    novo = (await _ligar(test_client, h))["url"]
    assert antigo != novo
    assert (await test_client.get("/api/v1" + antigo.split("/api/v1", 1)[1])).status_code == 404
    assert (await test_client.get("/api/v1" + novo.split("/api/v1", 1)[1])).status_code == 200
    r = await test_client.delete(ADMIN_API, headers=h)
    assert r.status_code == 200 and r.json()["enabled"] is False
    assert (await test_client.get("/api/v1" + novo.split("/api/v1", 1)[1])).status_code == 404


async def test_so_admin_configura_e_cada_loja_ve_so_o_seu(test_client, async_session, test_user):
    from app.models.user import User, UserRole
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    for papel in (UserRole.CASHIER, UserRole.SELLER, UserRole.MANAGER):
        u = User(email=f"feed.{papel.value}@example.com", full_name="Pessoa", hashed_password=get_password_hash("Senha1234"),
                 role=papel, is_active=True, tenant_id=t_id)
        async_session.add(u)
        await async_session.commit()
        await async_session.refresh(u)
        hp = {"Authorization": f"Bearer {create_access_token(data={'sub': str(u.id)})}"}
        for metodo, caminho in (("get", ""), ("post", "/rotate"), ("delete", "")):
            r = await getattr(test_client, metodo)(f"{ADMIN_API}{caminho}", headers=hp)
            assert r.status_code == 403, (papel, metodo)
    from app.models.category import Category
    from tests.test_lot_costs import _produto
    from tests.test_team_limit import _nova_loja
    outra_id, _admin, token_outra = await _nova_loja(async_session, "pro")
    cat = Category(name="Cat outra", slug=f"cat-outra-{outra_id}", tenant_id=outra_id)
    async_session.add(cat)
    await async_session.commit()
    await async_session.refresh(cat)
    po, vo = await _produto(async_session, outra_id, cat.id, "Top Outra Loja", "59.90")
    po_id = po.id
    await async_session.commit()
    await _produto_set(async_session, po_id, image_url="/uploads/outra.jpg")
    await _produto_set(async_session, p.id, image_url="/uploads/x.jpg")
    st = await _ligar(test_client, h)
    _, linhas = await _csv(test_client, st["url"])
    assert len(linhas) == 2 and all(x["item_group_id"] == f"p{p.id}" for x in linhas)
    from tests.test_looks import _sem_override
    _sem_override()   # a API dos testes fixa a loja 1; aqui o tenant vem do usuário
    ho = {"Authorization": f"Bearer {token_outra}", "X-Tenant-Id": str(outra_id)}
    st_o = await _ligar(test_client, ho)
    _, linhas_o = await _csv(test_client, st_o["url"])
    assert [x["item_group_id"] for x in linhas_o] == [f"p{po_id}"] and st_o["url"] != st["url"]
