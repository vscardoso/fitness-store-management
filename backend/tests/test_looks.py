"""Lookbook: isolamento entre lojas, total na lista e vitrine pública (antes: loja B montava look com produto da A; a vitrine dava erro 500)."""
import itertools
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash
from app.models.category import Category
from app.models.customer import Customer
from app.models.look import Look
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.store import Store
from app.models.user import User, UserRole

pytestmark = pytest.mark.asyncio
_seq = itertools.count(1)
D = Decimal
SITE = {"host": "site-publico.exemplo.com"}   # o ambiente de teste tem uma loja com domínio 'test'; sem isto a rota pública escolheria ela


@pytest.fixture(autouse=True)
def _tenant_de_verdade():
    """O conftest força a loja 1 em toda rota; aqui vale a loja do usuário logado."""
    from app.api.deps import get_current_tenant_id
    from app.main import app
    guardado = app.dependency_overrides.pop(get_current_tenant_id, None)
    yield
    if guardado is not None:
        app.dependency_overrides[get_current_tenant_id] = guardado


def _sem_override():
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)


async def _loja(db):
    n = next(_seq)
    store = Store(name=f"Loja Look {n}", slug=f"loja-look-{n}", subdomain=f"look-{n}", is_default=False, is_active=True)
    db.add(store)
    await db.flush()
    cat = Category(name=f"Cat {n}", slug=f"cat-look-{n}", tenant_id=store.id)
    db.add(cat)
    await db.flush()
    return store, cat.id


async def _produto(db, store, cat_id, nome, preco):
    n = next(_seq)
    p = Product(name=f"{nome} {n}", category_id=cat_id, tenant_id=store.id, base_price=D(preco))
    db.add(p)
    await db.flush()
    v = ProductVariant(product_id=p.id, sku=f"LK-{n}-{store.id}", color="Preto", size="M", price=D(preco), tenant_id=store.id)
    db.add(v)
    await db.flush()
    return p, v


async def _user(db, store):
    n = next(_seq)
    u = User(email=f"look.{n}@example.com", full_name="Gerente", hashed_password=get_password_hash("Senha1234"),
             role=UserRole.MANAGER, tenant_id=store.id, is_active=True)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"Authorization": "Bearer " + create_access_token(data={"sub": str(u.id)}), "X-Tenant-Id": str(store.id)}


async def test_loja_nao_monta_look_com_produto_de_outra_loja(test_client, async_session):
    _sem_override()
    db = async_session
    a, cat_a = await _loja(db)
    b, cat_b = await _loja(db)
    pa, va = await _produto(db, a, cat_a, "Legging da A", "100.00")
    pb, vb = await _produto(db, b, cat_b, "Top da B", "50.00")
    cli_a = Customer(full_name="Cliente da A", phone="34999990001", tenant_id=a.id)
    db.add(cli_a)
    await db.commit()
    hb = await _user(db, b)

    # produto da loja A dentro de um look da loja B
    r = await test_client.post("/api/v1/looks/", headers=hb, json={"name": "Invasor", "items": [{"product_id": pa.id}]})
    assert r.status_code == 400, r.text
    assert "Legging da A" not in r.text
    # variação de outra loja e variação que não é do produto
    r = await test_client.post("/api/v1/looks/", headers=hb, json={"name": "Invasor", "items": [{"product_id": pb.id, "variant_id": va.id}]})
    assert r.status_code == 400, r.text
    # cliente de outra loja
    r = await test_client.post("/api/v1/looks/", headers=hb, json={"name": "Invasor", "customer_id": cli_a.id, "items": []})
    assert r.status_code == 400, r.text
    # nada ficou gravado
    assert (await db.execute(select(Look).where(Look.tenant_id == b.id))).scalars().all() == []

    # look correto da loja B funciona e dá para acrescentar peça própria, não a da A
    r = await test_client.post("/api/v1/looks/", headers=hb, json={"name": "Look B", "items": [{"product_id": pb.id, "variant_id": vb.id}]})
    assert r.status_code == 201, r.text
    look_id = r.json()["id"]
    r = await test_client.post(f"/api/v1/looks/{look_id}/items", headers=hb, json={"product_id": pa.id})
    assert r.status_code == 400, r.text
    r = await test_client.post(f"/api/v1/looks/{look_id}/items", headers=hb, json={"product_id": pb.id, "variant_id": vb.id})
    assert r.status_code == 200 and r.json()["items_count"] == 2


async def test_lista_mostra_o_total_com_desconto_de_3_pecas(test_client, async_session):
    _sem_override()
    db = async_session
    a, cat = await _loja(db)
    itens = [await _produto(db, a, cat, f"Peça {i}", "100.00") for i in range(3)]
    h = await _user(db, a)
    r = await test_client.post("/api/v1/looks/", headers=h, json={
        "name": "Look 3 peças", "items": [{"product_id": p.id, "variant_id": v.id, "position": i} for i, (p, v) in enumerate(itens)]})
    assert r.status_code == 201, r.text
    assert r.json()["discount_percentage"] == 10.0 and r.json()["total_price"] == 270.0
    lista = (await test_client.get("/api/v1/looks/", headers=h)).json()
    assert [(x["items_count"], x["total_price"]) for x in lista] == [(3, 270.0)]


async def test_vitrine_publica_de_looks(test_client, async_session):
    from app.core.database import get_db, get_db_unscoped
    from app.main import app
    _sem_override()
    app.dependency_overrides[get_db_unscoped] = app.dependency_overrides[get_db]   # a rota pública usa a sessão sem loja
    db = async_session
    a, cat = await _loja(db)
    b, cat_b = await _loja(db)
    pecas = [await _produto(db, a, cat, f"Peça {i}", "100.00") for i in range(3)]
    pb, vb = await _produto(db, b, cat_b, "Da B", "80.00")
    h = await _user(db, a)
    hb = await _user(db, b)
    cliente = Customer(full_name="Cliente", phone="34999990002", tenant_id=a.id)
    db.add(cliente)
    await db.commit()
    corpo = lambda nome, **extra: {"name": nome, "items": [{"product_id": p.id, "variant_id": v.id} for p, v in pecas], **extra}
    publico = (await test_client.post("/api/v1/looks/", headers=h, json=corpo("Look público"))).json()
    assert (await test_client.post("/api/v1/looks/", headers=h, json=corpo("Look escondido", is_public=False))).status_code == 201
    assert (await test_client.post("/api/v1/looks/", headers=h, json=corpo("Look da cliente", customer_id=cliente.id))).status_code == 201
    assert (await test_client.post("/api/v1/looks/", headers=hb, json={"name": "Look da B", "items": [{"product_id": pb.id, "variant_id": vb.id}]})).status_code == 201
    # peça tirada do look não conta
    item_id = publico["items"][0]["id"]
    assert (await test_client.delete(f"/api/v1/looks/{publico['id']}/items/{item_id}", headers=h)).status_code == 204

    r = await test_client.get("/api/v1/public/looks", params={"store": a.slug}, headers=SITE)
    assert r.status_code == 200, r.text
    assert [(x["name"], x["items_count"], x["total_price"]) for x in r.json()] == [("Look público", 2, 200.0)]
    r = await test_client.get("/api/v1/public/looks", params={"store": b.slug}, headers=SITE)
    assert [(x["name"], x["items_count"], x["total_price"]) for x in r.json()] == [("Look da B", 1, 80.0)]
