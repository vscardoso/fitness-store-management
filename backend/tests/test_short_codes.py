"""Código curto da etiqueta (#0001...) e PDF das etiquetas."""
import itertools
import subprocess
import tempfile
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash
from app.models.catalog_counter import CatalogCounter
from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.store import Store
from app.models.user import User, UserRole
from app.services.short_code_service import format_short_code, parse_short_code, qr_payload

pytestmark = pytest.mark.asyncio
_seq = itertools.count(1)


@pytest.fixture(autouse=True)
def _tenant_de_verdade():
    """O conftest força a loja 1 em toda rota; aqui vale a loja do usuário logado."""
    from app.api.deps import get_current_tenant_id
    from app.main import app
    guardado = app.dependency_overrides.pop(get_current_tenant_id, None)
    yield
    if guardado is not None:
        app.dependency_overrides[get_current_tenant_id] = guardado
D = Decimal


async def _loja(db):
    n = next(_seq)
    store = Store(name=f"Loja Código {n}", slug=f"loja-codigo-{n}", subdomain=f"codigo-{n}", is_default=False, is_active=True)
    db.add(store)
    await db.flush()
    cat = Category(name=f"Cat {n}", slug=f"cat-codigo-{n}", tenant_id=store.id)
    db.add(cat)
    await db.flush()
    return store.id, cat.id


async def _produto(db, tenant_id, cat_id, nome="Legging", grade=(("Preto", "M"),), sku=True, preco="89.90"):
    n = next(_seq)
    p = Product(name=f"{nome} {n}", category_id=cat_id, tenant_id=tenant_id, base_price=D(preco))
    db.add(p)
    await db.flush()
    vs = []
    for i, (cor, tam) in enumerate(grade):
        v = ProductVariant(product_id=p.id, sku=f"SKU-{n}-{i}-{tenant_id}" if sku else None, color=cor, size=tam,
                           price=D(preco), tenant_id=tenant_id)
        db.add(v)
        vs.append(v)
    await db.flush()
    return p, vs


async def _user(db, tenant_id, role):
    n = next(_seq)
    u = User(email=f"etq.{role.value}.{n}@example.com", full_name="Pessoa", hashed_password=get_password_hash("Senha1234"),
             role=role, tenant_id=tenant_id, is_active=True)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"Authorization": "Bearer " + create_access_token(data={"sub": str(u.id)}), "X-Tenant-Id": str(tenant_id)}


def _sem_override():
    """Chamar dentro do teste: a fixture test_client volta a forçar a loja 1 depois das autouse."""
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)


# ── funções puras ─────────────────────────────────────────────────────────────

def test_formato_e_leitura():
    assert format_short_code(7) == "#0007" and format_short_code(12345) == "#12345" and format_short_code(None) is None
    assert qr_payload(123) == "PV#0123"
    for s in ("PV#0123", "pv#0123", "#0123", "0123", "123", " #123 "):
        assert parse_short_code(s) == 123, s
    for s in ("", None, "abc", "#", "0", "PV#", "12a", "7891234567890123"):
        assert parse_short_code(s) is None, s


# ── numeração ─────────────────────────────────────────────────────────────────

async def test_variacao_nova_ganha_numero_em_ordem_por_loja(async_session):
    db = async_session
    t1, c1 = await _loja(db)
    t2, c2 = await _loja(db)
    _, a = await _produto(db, t1, c1, grade=(("Preto", "P"), ("Preto", "M"), ("Preto", "G")))
    _, b = await _produto(db, t2, c2)
    _, c = await _produto(db, t1, c1)
    await db.commit()
    assert [v.short_code for v in a] == [1, 2, 3]  # grade em ordem: P, M, G
    assert [v.short_code for v in c] == [4]
    assert [v.short_code for v in b] == [1]       # outra loja começa do 1


async def test_catalogo_sem_sku_nao_ganha_numero(async_session):
    db = async_session
    t, c = await _loja(db)
    _, vs = await _produto(db, t, c, sku=False)
    await db.commit()
    assert vs[0].short_code is None
    _, ws = await _produto(db, t, c)
    await db.commit()
    assert ws[0].short_code == 1  # catálogo não gastou número


async def test_rollback_devolve_o_numero(async_session):
    db = async_session
    t, c = await _loja(db)
    _, a = await _produto(db, t, c)
    await db.commit()
    assert a[0].short_code == 1
    await _produto(db, t, c)  # gravou no flush, mas a operação falha
    await db.rollback()
    _, b = await _produto(db, t, c)
    await db.commit()
    assert b[0].short_code == 2  # sem buraco
    counter = (await db.execute(select(CatalogCounter).where(CatalogCounter.tenant_id == t))).scalar_one()
    assert counter.next_short_code == 3


async def test_variacao_sem_tenant_pega_a_loja_do_produto(async_session):
    db = async_session
    t, c = await _loja(db)
    p = Product(name="Top", category_id=c, tenant_id=t, base_price=D("50"))
    db.add(p)
    await db.flush()
    v = ProductVariant(product_id=p.id, sku=f"SEMTENANT-{t}", color="Azul", size="P", price=D("50"))
    db.add(v)
    await db.commit()
    assert (v.tenant_id, v.short_code) == (t, 1)


async def test_script_numera_as_antigas_em_ordem_de_criacao(async_session, test_engine, monkeypatch):
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import sessionmaker
    import scripts.short_codes_backfill as script

    db = async_session
    t, c = await _loja(db)
    _, vs = await _produto(db, t, c, grade=(("Preto", "P"), ("Preto", "M")))
    _, ws = await _produto(db, t, c)
    await db.commit()
    ids = [v.id for v in vs + ws]
    for v in vs + ws:  # simula variações de antes do código existir
        v.short_code = None
    await db.execute(CatalogCounter.__table__.delete().where(CatalogCounter.tenant_id == t))
    await db.commit()

    maker = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(script, "async_session_maker", maker)
    await script.main(apply=False, only_store=t)
    db.expire_all()
    rows = (await db.execute(select(ProductVariant.short_code).where(ProductVariant.id.in_(ids)))).scalars().all()
    assert rows == [None, None, None]  # simulação não grava
    await script.main(apply=True, only_store=t)
    db.expire_all()
    rows = (await db.execute(select(ProductVariant.id, ProductVariant.short_code).where(ProductVariant.id.in_(ids)).order_by(ProductVariant.id))).all()
    assert [r.short_code for r in rows] == [1, 2, 3]
    await script.main(apply=True, only_store=t)  # idempotente
    db.expire_all()
    again = (await db.execute(select(ProductVariant.short_code).where(ProductVariant.id.in_(ids)).order_by(ProductVariant.id))).scalars().all()
    assert again == [1, 2, 3]
    _, novo = await _produto(db, t, c)
    await db.commit()
    assert novo[0].short_code == 4  # contador continua de onde o script parou


# ── busca pelo código ─────────────────────────────────────────────────────────

async def test_busca_por_sku_e_por_id_respondem(test_client, async_session):
    """Antes as duas davam 500 (categoria carregada fora do contexto assíncrono)."""
    _sem_override()
    t, c = await _loja(async_session)
    _, vs = await _produto(async_session, t, c)
    await async_session.commit()
    sku, vid = vs[0].sku, vs[0].id
    h = await _user(async_session, t, UserRole.CASHIER)
    for url in (f"/api/v1/product-variants/sku/{sku}", f"/api/v1/product-variants/{vid}"):
        r = await test_client.get(url, headers=h)
        assert r.status_code == 200, (url, r.text)
        assert r.json()["category_name"] and r.json()["short_code"] == 1


async def test_busca_pelo_codigo_so_na_propria_loja(test_client, async_session):
    _sem_override()
    db = async_session
    t1, c1 = await _loja(db)
    t2, c2 = await _loja(db)
    p, vs = await _produto(db, t1, c1, nome="Legging Busca", grade=(("Verde", "M"),))
    await db.commit()
    h1 = await _user(db, t1, UserRole.CASHIER)
    h2 = await _user(db, t2, UserRole.CASHIER)
    if True:
        for code in ("PV%230001", "%230001", "0001", "1"):  # o app manda o # codificado (encodeURIComponent)
            r = await test_client.get(f"/api/v1/product-variants/short-code/{code}", headers=h1)
            assert r.status_code == 200, (code, r.text)
            assert r.json()["id"] == vs[0].id and r.json()["short_code"] == 1 and r.json()["product_name"] == p.name
        r = await test_client.get("/api/v1/product-variants/short-code/PV%230001", headers=h2)
        assert r.status_code == 404  # o #0001 da loja 2 não existe
        r = await test_client.get("/api/v1/product-variants/short-code/abc", headers=h1)
        assert r.status_code == 404


# ── PDF ───────────────────────────────────────────────────────────────────────

def _pdf_text(content: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(content)
        f.flush()
        return subprocess.run(["pdftotext", "-layout", f.name, "-"], capture_output=True, text=True, check=True).stdout


def _pages(content: bytes) -> int:
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(content)
        f.flush()
        info = subprocess.run(["pdfinfo", f.name], capture_output=True, text=True, check=True).stdout
    return int(next(line.split()[-1] for line in info.splitlines() if line.startswith("Pages:")))


async def test_pdf_das_pecas(test_client, async_session):
    _sem_override()
    db = async_session
    t, c = await _loja(db)
    p, vs = await _produto(db, t, c, nome="Legging Cirrê", grade=(("Verde Militar", "M"), ("Preto", "GG")), preco="89.90")
    await db.commit()
    h = await _user(db, t, UserRole.SELLER)
    if True:
        body = {"items": [{"variant_id": vs[0].id, "quantity": 3}, {"variant_id": vs[1].id, "quantity": 10}], "layout": "a4"}
        r = await test_client.post("/api/v1/labels/pdf", json=body, headers=h)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
        assert _pages(r.content) == 2  # 13 etiquetas, 12 por folha
        text = _pdf_text(r.content)
        m, gg = format_short_code(vs[0].short_code), format_short_code(vs[1].short_code)
        assert {m, gg} == {"#0001", "#0002"}
        assert text.count(m) == 3 and text.count(gg) == 10
        assert "R$ 89,90" in text and "Verde Militar" in text and "Legging Cirrê" in text
        for proibido in ("SKU-", "Entrada", "custo", "Custo"):
            assert proibido not in text  # nada interno na etiqueta da cliente

        body = {"items": [{"variant_id": vs[0].id, "quantity": 3}, {"variant_id": vs[1].id, "quantity": 11}],
                "layout": "a4", "start_position": 12}  # folha já usada: começa na última posição
        r = await test_client.post("/api/v1/labels/pdf", json=body, headers=h)
        assert _pages(r.content) == 3  # 14 etiquetas: 1 na primeira folha, 12 na segunda, 1 na terceira

        body = {"items": [{"variant_id": vs[0].id, "quantity": 4}], "layout": "roll"}
        r = await test_client.post("/api/v1/labels/pdf", json=body, headers=h)
        assert _pages(r.content) == 4  # rolo: uma por página


async def test_pdf_recusas_e_permissao(test_client, async_session):
    _sem_override()
    db = async_session
    t, c = await _loja(db)
    t2, c2 = await _loja(db)
    _, vs = await _produto(db, t, c)
    _, outra = await _produto(db, t2, c2)
    _, cat = await _produto(db, t, c, sku=False)
    await db.commit()
    seller = await _user(db, t, UserRole.SELLER)
    cashier = await _user(db, t, UserRole.CASHIER)
    vid, outra_id, cat_id = vs[0].id, outra[0].id, cat[0].id
    if True:
        url = "/api/v1/labels/pdf"
        one = {"items": [{"variant_id": vid, "quantity": 1}]}
        assert (await test_client.post(url, json=one, headers=cashier)).status_code == 403
        assert (await test_client.post(url, json={"items": [{"variant_id": outra_id, "quantity": 1}]}, headers=seller)).status_code == 400
        assert (await test_client.post(url, json={"items": [{"variant_id": cat_id, "quantity": 1}]}, headers=seller)).status_code == 400
        many = {"items": [{"variant_id": vid, "quantity": 200}] * 4}
        assert (await test_client.post(url, json=many, headers=seller)).status_code == 400  # 800 > 600
        assert (await test_client.post(url, json={**one, "start_position": 13}, headers=seller)).status_code == 422
        assert (await test_client.post(url, json={**one, "layout": "zpl"}, headers=seller)).status_code == 422


async def test_pdf_da_entrada_uma_por_peca_e_numera_antigas(test_client, async_session):
    _sem_override()
    from datetime import date
    from app.models.entry_item import EntryItem
    from app.models.stock_entry import StockEntry

    db = async_session
    t, c = await _loja(db)
    p, vs = await _produto(db, t, c, nome="Short Saia", grade=(("Preto", "P"), ("Preto", "M")))
    await db.commit()
    vs[1].short_code = None  # variação antiga, ainda sem número
    entry = StockEntry(entry_code=f"ENT-{t}", entry_date=date.today(), entry_type="local", supplier_name="Fornecedor Teste", tenant_id=t, total_cost=D("0"))
    db.add(entry)
    await db.flush()
    for v, q in ((vs[0], 2), (vs[1], 3)):
        db.add(EntryItem(entry_id=entry.id, product_id=p.id, variant_id=v.id, quantity_received=q, quantity_remaining=q,
                         unit_cost=D("30"), tenant_id=t))
    await db.commit()
    h = await _user(db, t, UserRole.MANAGER)
    v1_id, entry_id = vs[1].id, entry.id
    if True:
        r = await test_client.post(f"/api/v1/labels/pdf/entry/{entry_id}", json={"layout": "roll"}, headers=h)
        assert r.status_code == 200, r.text
        assert _pages(r.content) == 5
        assert f'etiquetas-ENT-{t}.pdf' in r.headers["content-disposition"]
        db.expire_all()
        num = (await db.execute(select(ProductVariant.short_code).where(ProductVariant.id == v1_id))).scalar_one()
        assert num == 3  # numerada agora e gravada (1 e 2 já eram da grade)
        text = _pdf_text(r.content)
        assert text.count("#0001") == 2 and text.count("#0003") == 3
        r = await test_client.post("/api/v1/labels/pdf/entry/999999", json={}, headers=h)
        assert r.status_code == 400
