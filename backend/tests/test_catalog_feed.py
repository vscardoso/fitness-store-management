"""Feed de catálogo da Meta: um item por produto publicado e com foto (cores e tamanhos em estoque na descrição),
preço e nome do produto, sem marca, token por loja, papel de admin."""
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
    assert st["items"] == 0 and st["skipped_no_photo"] == 1 and st["published_products"] == 1
    assert [x["id"] for x in st["missing_photo_products"]] == [p.id]
    # com foto: o produto entra UMA vez, sem variações (cores e tamanhos vão escritos na descrição)
    await _produto_set(async_session, p.id, image_url="/uploads/products/12.jpg")
    st = (await test_client.get(ADMIN_API, headers=h)).json()
    texto, linhas = await _csv(test_client, st["url"])
    assert len(linhas) == 1 and st["missing_photo_products"] == [] and st["items"] == 1
    x = linhas[0]
    assert x["id"] == f"p{p.id}" and "item_group_id" not in x and "color" not in x and "size" not in x
    # a Meta recebe a versão de 1200 px em pé, não a original (que pode estar deitada com rotação só no EXIF)
    assert x["image_link"] == "https://api.provadorfit.com.br/uploads/products/12.jpg?w=1200"
    assert x["price"] == "100.00 BRL" and x["condition"] == "new" and x["availability"] == "in stock"
    assert x["title"].startswith("Legging Troca")
    assert x["description"].endswith("Cores disponíveis: Azul. Tamanhos disponíveis: M.")


async def test_foto_da_variacao_e_foto_absoluta_do_cloudinary(test_client, async_session, test_user):
    from app.models.product_media import ProductMedia
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _produto_set(async_session, p.id, image_url="https://res.cloudinary.com/x/capa.jpg")
    async_session.add(ProductMedia(product_id=p.id, variant_id=vb.id, tenant_id=t_id, url="/uploads/products/azul.jpg", is_cover=True, position=0))
    await async_session.commit()
    st = await _ligar(test_client, h)
    _, linhas = await _csv(test_client, st["url"])
    assert [x["image_link"] for x in linhas] == ["https://res.cloudinary.com/x/capa.jpg"]   # a capa do produto vence
    # produto sem foto própria: usa a capa de uma variação
    await _produto_set(async_session, p.id, image_url=None)
    _, linhas = await _csv(test_client, st["url"])
    assert [x["image_link"] for x in linhas] == ["https://api.provadorfit.com.br/uploads/products/azul.jpg?w=1200"]


async def test_marca_nunca_vai_no_feed(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _produto_set(async_session, p.id, image_url="/uploads/x.jpg", brand="Zorba Sport", name="Legging Zorba Sport Cintura Alta",
                       description="Legging Nike com tecido Lupo, modelo Zorba Sport. Alta compressão.")
    st = await _ligar(test_client, h)
    texto, linhas = await _csv(test_client, st["url"])
    baixo = texto.lower()
    for marca in ("nike", "lupo", "zorba"):
        assert marca not in baixo, marca
    assert len(linhas) == 1 and linhas[0]["title"] == "Legging Cintura Alta"
    assert "Alta compressão" in linhas[0]["description"]
    from app.models.store import Store
    loja = (await async_session.execute(select(Store).where(Store.id == t_id))).scalar_one()
    assert linhas[0]["brand"] == loja.name                                # só o nome da loja
    assert st["brand_removed"] == 1


async def test_nome_so_de_marca_sai_do_feed(test_client, async_session, test_user):
    t_id, h, p, va, vb = await _cenario(async_session, test_user)
    await _produto_set(async_session, p.id, image_url="/uploads/x.jpg", name="Nike")
    st = await _ligar(test_client, h)
    _, linhas = await _csv(test_client, st["url"])
    assert linhas == [] and st["skipped_no_name"] == 1


async def test_despublicado_inativo_sem_preco_e_sem_estoque(test_client, async_session, test_user):
    from app.models.product_variant import ProductVariant
    t_id, h, p, va, vb = await _cenario(async_session, test_user, stock_b=0)
    await _produto_set(async_session, p.id, image_url="/uploads/x.jpg")
    st = await _ligar(test_client, h)
    _, linhas = await _csv(test_client, st["url"])
    # a variação Azul M está sem peça: o produto segue em estoque (a outra tem) e a grade não cita Azul nem M
    assert len(linhas) == 1 and linhas[0]["availability"] == "in stock"
    assert "Azul" not in linhas[0]["description"] and "Tamanhos" not in linhas[0]["description"]
    # variação sem preço não conta; sem nenhuma com preço, o produto sai
    await async_session.execute(update(ProductVariant).where(ProductVariant.id == vb.id).values(price=0))
    await async_session.commit()
    st = (await test_client.get(ADMIN_API, headers=h)).json()
    _, linhas = await _csv(test_client, st["url"])
    assert [x["id"] for x in linhas] == [f"p{p.id}"] and st["skipped_no_price"] == 0
    await async_session.execute(update(ProductVariant).where(ProductVariant.id == va.id).values(is_active=False))
    await async_session.commit()
    st = (await test_client.get(ADMIN_API, headers=h)).json()
    _, linhas = await _csv(test_client, st["url"])
    assert linhas == [] and st["skipped_no_price"] == 1
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
    assert linhas[0]["description"].startswith('Top "lindo", confortável\nlinha 2\n\nCores disponíveis: Azul.')


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
    assert [x["id"] for x in linhas] == [f"p{p.id}"]
    from tests.test_looks import _sem_override
    _sem_override()   # a API dos testes fixa a loja 1; aqui o tenant vem do usuário
    ho = {"Authorization": f"Bearer {token_outra}", "X-Tenant-Id": str(outra_id)}
    st_o = await _ligar(test_client, ho)
    _, linhas_o = await _csv(test_client, st_o["url"])
    assert [x["id"] for x in linhas_o] == [f"p{po_id}"] and st_o["url"] != st["url"]


async def test_um_item_por_produto_menor_preco_grade_em_ordem_e_esgotado(test_client, async_session, test_user):
    """Várias cores, tamanhos fora de ordem e preços diferentes: um item só, menor preço, só o que tem peça."""
    from app.models.entry_item import EntryItem
    from app.models.product_variant import ProductVariant
    from app.models.stock_entry import StockEntry
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="89.90")
    await _produto_set(async_session, p.id, image_url="/uploads/x.jpg")
    entrada = (await async_session.execute(select(StockEntry).where(StockEntry.tenant_id == t_id))).scalars().first()
    novas = []
    for i, (cor, tam, qtd) in enumerate((("Preto", "GG", 2), ("Preto", "P", 1), ("Rosa", "G", 0), ("Azul", "P/M", 3))):
        v = ProductVariant(product_id=p.id, sku=f"GRD-{p.id}-{i}", color=cor, size=tam, price=120, tenant_id=t_id)
        async_session.add(v)
        await async_session.flush()
        if qtd:
            async_session.add(EntryItem(entry_id=entrada.id, variant_id=v.id, product_id=p.id, tenant_id=t_id,
                                        quantity_received=qtd, quantity_remaining=qtd, unit_cost=30, is_active=True))
        novas.append(v)
    await async_session.commit()
    st = await _ligar(test_client, h)
    _, linhas = await _csv(test_client, st["url"])
    assert len(linhas) == 1
    x = linhas[0]
    assert x["price"] == "89.90 BRL"                               # o menor preço das variações
    # Rosa G está sem peça: fica de fora; tamanhos em ordem natural (P, P/M, M, GG)
    assert x["description"].endswith("Cores disponíveis: Azul, Preto. Tamanhos disponíveis: P, P/M, M, GG.")
    # tudo esgotado: continua no catálogo como indisponível e sem grade
    from sqlalchemy import update as _upd
    await async_session.execute(_upd(EntryItem).where(EntryItem.product_id == p.id).values(quantity_remaining=0))
    await async_session.commit()
    _, linhas = await _csv(test_client, st["url"])
    assert linhas[0]["availability"] == "out of stock" and "disponíveis" not in linhas[0]["description"]



async def test_vitrine_publica_do_produto_sem_login_sem_marca_e_so_publicado(test_client, async_session, test_user):
    """Link do catálogo da Meta: /produtos/{id}?store={slug} lê esta rota sem login."""
    from app.models.store import Store
    from app.models.whatsapp_cloud import WhatsAppCloudNumber
    t_id, h, p, va, vb = await _cenario(async_session, test_user, price_b="89.90", stock_b=0)
    await _produto_set(async_session, p.id, image_url="/uploads/products/12.jpg", brand="Zorba",
                       name="Legging Zorba Cintura Alta", description="Tecido Lupo macio.")
    loja = (await async_session.execute(select(Store).where(Store.id == t_id))).scalar_one()
    slug = loja.slug
    async_session.add(WhatsAppCloudNumber(tenant_id=t_id, phone_number_id=f"pn-vitrine-{p.id}", display_phone_number="+55 34 3305-0261"))
    await async_session.commit()
    url = f"/api/v1/public/vitrine/{slug}/produtos/{p.id}"
    r = await test_client.get(url)   # sem cabeçalho de login
    assert r.status_code == 200, r.text
    d = r.json()
    texto = r.text.lower()
    for proibido in ("zorba", "lupo", "cost", "quantity", "estoque_"):
        assert proibido not in texto, proibido
    assert d["name"] == "Legging Cintura Alta" and d["description"] == "Tecido macio."
    assert d["price_min"] == 89.9 and d["price_max"] == 100.0 and d["in_stock"] is True
    assert d["colors"] == [] and d["sizes"] == []          # a variação com peça não tem cor/tamanho; Azul M está sem peça
    assert d["photos"] == ["https://api.provadorfit.com.br/uploads/products/12.jpg?w=1200"]
    assert d["store"]["name"] == loja.name and d["store"]["whatsapp"] == "553433050261"
    # não publicado, loja errada, produto de outra loja e slug inexistente: 404
    assert (await test_client.get(f"/api/v1/public/vitrine/nao-existe/produtos/{p.id}")).status_code == 404
    assert (await test_client.get(f"/api/v1/public/vitrine/{slug}/produtos/999999")).status_code == 404
    await _produto_set(async_session, p.id, is_catalog=False)
    assert (await test_client.get(url)).status_code == 404
