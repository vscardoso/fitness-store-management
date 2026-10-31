"""ProductService: criar, buscar, listar, atualizar, excluir (soft delete), SKU e estoque baixo.

Contrato atual: SKU, preço e barcode moram na variação (Product.sku/price são propriedades da 1ª variação),
produto nasce sem estoque (estoque só entra por StockEntry/EntryItem) e SKU repetido recebe o próximo número livre.
Cada teste usa SKU/nome únicos e categoria própria; o banco de teste é compartilhado (ver _limpa_loja_1).
"""
import itertools
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.schemas.product import ProductCreate, ProductUpdate
from app.services.product_service import ProductService
from tests.test_lot_costs import _limpa_loja_1  # noqa: F401  (fixture autouse: limpa o que a loja 1 ganhou)

pytestmark = pytest.mark.asyncio
_n = itertools.count(1)
TENANT = 1
USER = 1


@pytest.fixture
async def category(async_session: AsyncSession):
    n = next(_n)
    cat = Category(name=f"Cat Serv {n}", slug=f"cat-serv-{n}", description="Categoria de teste", is_active=True, tenant_id=TENANT)
    async_session.add(cat)
    await async_session.commit()
    await async_session.refresh(cat)
    return cat


@pytest.fixture
def service(async_session: AsyncSession):
    return ProductService(async_session)


def _dados(category, **extra):
    n = next(_n)
    base = dict(sku=f"SVC-{n}", name=f"Produto Servico {n}", price=Decimal("100.00"), cost_price=Decimal("50.00"),
                category_id=category.id)
    base.update(extra)
    return ProductCreate(**base)


async def _variacoes(db, product_id):
    from sqlalchemy import select
    from app.models.product_variant import ProductVariant
    return (await db.execute(select(ProductVariant).where(ProductVariant.product_id == product_id)
                             .order_by(ProductVariant.id))).scalars().all()


async def _criar(service, category, **extra):
    return await service.create_product(_dados(category, **extra), tenant_id=TENANT, user_id=USER)


async def test_create_product(service, category, async_session):
    d = _dados(category, description="Descrição de teste")
    sku = d.sku
    p = await service.create_product(d, tenant_id=TENANT, user_id=USER)
    assert p.id is not None and p.tenant_id == TENANT and p.category_id == category.id
    assert p.name == d.name
    # SKU e preço ficam na 1ª variação
    v = await _variacoes(async_session, p.id)
    assert [x.sku for x in v] == [sku] and v[0].price == Decimal("100.00") and v[0].cost_price == Decimal("50.00")


async def test_create_product_with_initial_stock_is_refused(service, category):
    """Regra FIFO estrita: produto não nasce com estoque, a entrada é que traz."""
    with pytest.raises(ValueError, match="estoque inicial"):
        await service.create_product(_dados(category, initial_stock=5), tenant_id=TENANT, user_id=USER)


async def test_create_product_with_unknown_category_is_refused(service, category):
    with pytest.raises(ValueError, match="não encontrada"):
        await service.create_product(_dados(category, category_id=99999999), tenant_id=TENANT, user_id=USER)


async def test_get_product_by_id(service, category):
    created = await _criar(service, category)
    found = await service.get_product(created.id, tenant_id=TENANT)
    assert found is not None and found.id == created.id and found.name == created.name


async def test_get_product_not_found(service):
    assert await service.get_product(99999999, tenant_id=TENANT) is None


async def test_list_products(service, category):
    criados = [await _criar(service, category) for _ in range(3)]
    ids = {p.id for p in await service.list_products(skip=0, limit=100000, tenant_id=TENANT)}
    assert {p.id for p in criados} <= ids


async def test_list_products_with_search(service, category):
    """Busca por nome acha o produto criado com is_catalog=False (produto ativo da loja) e não traz os outros."""
    n = next(_n)
    whey = await _criar(service, category, name=f"Whey Protein Zq{n}", is_catalog=False)
    creatina = await _criar(service, category, name=f"Creatina Zq{n}", is_catalog=False)
    achados = {p.id for p in await service.search_products(f"Whey Protein Zq{n}", tenant_id=TENANT)}
    assert whey.id in achados and creatina.id not in achados


@pytest.mark.xfail(strict=True, reason="BUG REAL: ProductRepository.search (product_repository.py:150) filtra is_catalog == False; "
                   "o default de ProductCreate/mobile é is_catalog=True (publicado), então produto recém criado some da busca")
async def test_search_finds_product_with_default_is_catalog(service, category):
    n = next(_n)
    p = await _criar(service, category, name=f"Busca Padrao Zq{n}")
    achados = {x.id for x in await service.search_products(f"Busca Padrao Zq{n}", tenant_id=TENANT)}
    assert p.id in achados


async def test_update_product(service, category):
    p = await _criar(service, category)
    up = await service.update_product(p.id, ProductUpdate(name=f"Nome Novo {p.id}", description="Outra descrição"), tenant_id=TENANT)
    assert up.name == f"Nome Novo {p.id}" and up.description == "Outra descrição"
    reread = await service.get_product(p.id, tenant_id=TENANT)
    assert reread.name == f"Nome Novo {p.id}"


async def test_update_product_not_found(service):
    with pytest.raises(ValueError, match="não encontrado"):
        await service.update_product(99999999, ProductUpdate(name="Qualquer Nome"), tenant_id=TENANT)


async def test_delete_product_is_soft_delete(service, category, async_session):
    from sqlalchemy import select
    from app.models.product import Product
    p = await _criar(service, category)
    pid = p.id
    assert await service.delete_product(pid, tenant_id=TENANT) is True
    assert pid not in {x.id for x in await service.list_products(skip=0, limit=100000, tenant_id=TENANT)}  # sai da listagem
    async_session.expire_all()
    raw = (await async_session.execute(select(Product).where(Product.id == pid))).scalar_one()
    assert raw.is_active is False                                      # linha continua lá (soft delete)
    assert all(v.is_active is False for v in await _variacoes(async_session, pid))


async def test_delete_product_not_found(service):
    with pytest.raises(ValueError, match="não encontrado"):
        await service.delete_product(99999999, tenant_id=TENANT)


async def test_get_products_by_category(service, category):
    criados = [await _criar(service, category, is_catalog=False) for _ in range(2)]
    achados = await service.get_products_by_category(category.id, tenant_id=TENANT)
    assert {p.id for p in criados} <= {p.id for p in achados}
    assert all(p.category_id == category.id for p in achados)


@pytest.mark.xfail(strict=True, reason="BUG REAL: ProductRepository.get_by_category (product_repository.py:104) filtra is_catalog == False; "
                   "produto criado com o default is_catalog=True não aparece na listagem por categoria")
async def test_get_products_by_category_with_default_is_catalog(service, category):
    p = await _criar(service, category)
    achados = await service.get_products_by_category(category.id, tenant_id=TENANT)
    assert p.id in {x.id for x in achados}


async def test_get_low_stock_products(service, category):
    """Produto novo (estoque 0) com mínimo 100 entra na lista de estoque baixo."""
    p = await _criar(service, category, min_stock=100)
    baixos = await service.get_low_stock_products(tenant_id=TENANT)
    assert p.id in {x.id for x in baixos}


async def test_get_product_by_sku(service, category):
    d = _dados(category)
    p = await service.create_product(d, tenant_id=TENANT, user_id=USER)
    achado = await service.get_product_by_sku(d.sku, tenant_id=TENANT)
    assert achado is not None and achado.id == p.id
    assert await service.get_product_by_sku("SKU-QUE-NAO-EXISTE-999", tenant_id=TENANT) is None


async def test_create_product_with_duplicate_sku_gets_next_free_sku(service, category, async_session):
    """SKU repetido não derruba o cadastro: o segundo produto recebe outro SKU livre."""
    n = next(_n)
    sku = f"DUP-{n}"
    a = await service.create_product(_dados(category, sku=sku), tenant_id=TENANT, user_id=USER)
    b = await service.create_product(_dados(category, sku=sku), tenant_id=TENANT, user_id=USER)
    assert a.id != b.id
    sku_a = (await _variacoes(async_session, a.id))[0].sku
    sku_b = (await _variacoes(async_session, b.id))[0].sku
    assert sku_a == sku and sku_b != sku
