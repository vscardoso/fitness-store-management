"""
Testes de Isolamento Multi-Tenant (conjunto único; substitui o antigo v2, que era duplicata).

Garante que os dados de uma loja (tenant) não sejam acessíveis por outra, nos módulos:
Produto (repositório + API), Entrada de estoque, Viagem, Venda, Cliente, tentativa maliciosa
de acesso por id e analytics.

Cada teste usa DUAS lojas novas (via tests.test_team_limit._nova_loja), então as contagens são
exatas mesmo com o banco de teste compartilhado. O conftest força a loja 1 em toda rota;
aqui o override é removido para valer a resolução real (loja do usuário logado), como em
test_isolamento_clientes.py.
Produto hoje: sku/price/cost_price vêm das variações (Product.sku é propriedade sem setter).
"""
import uuid
from datetime import date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.sale import PaymentMethod, SaleStatus
from app.models.stock_entry import EntryType
from app.models.trip import TripStatus
from app.repositories.customer_repository import CustomerRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.sale_repository import SaleRepository
from app.repositories.stock_entry_repository import StockEntryRepository
from app.repositories.trip_repository import TripRepository
from app.repositories.base import BaseRepository
from tests.test_team_limit import _nova_loja


def _sem_override():
    """O conftest (fixture test_client) força a loja 1 em toda rota; chamar DENTRO do teste, depois
    do test_client, para valer a loja do usuário logado. O test_client limpa os overrides ao terminar."""
    from app.api.deps import get_current_tenant_id
    from app.main import app
    app.dependency_overrides.pop(get_current_tenant_id, None)


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _uid() -> str:
    return uuid.uuid4().hex[:8]


@pytest.fixture
async def t1(async_session: AsyncSession):
    """Loja 1 do teste: (tenant_id, admin, token)."""
    return await _nova_loja(async_session, "pro")


@pytest.fixture
async def t2(async_session: AsyncSession):
    """Loja 2 do teste: (tenant_id, admin, token)."""
    return await _nova_loja(async_session, "pro")


async def _categoria(db: AsyncSession, tenant_id: int) -> Category:
    cat = Category(
        name="Suplementos",
        slug=f"suplementos-{_uid()}",
        description="Suplementos alimentares",
        tenant_id=tenant_id,
        is_active=True,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


async def _produto(db: AsyncSession, tenant_id: int, name: str, sku: str) -> Product:
    """Produto como hoje: o Product guarda nome/categoria e o SKU/preço vivem na variação."""
    cat = await _categoria(db, tenant_id)
    produto = await ProductRepository(db).create(
        {"name": name, "category_id": cat.id, "base_price": 100.00},
        tenant_id=tenant_id,
    )
    db.add(ProductVariant(
        product_id=produto.id, tenant_id=tenant_id, sku=sku,
        size="M", color="Preto", price=100.00, cost_price=50.00, is_active=True,
    ))
    await db.commit()
    return produto


def _hoje_utc() -> date:
    """created_at é gravado em UTC; as consultas por dia usam a data UTC."""
    return datetime.utcnow().date()


# ============================================================================
# PRODUTOS
# ============================================================================


@pytest.mark.asyncio
async def test_product_isolation_repository(async_session: AsyncSession, t1, t2):
    """Isolamento de produtos no repositório (get_multi, get, SKU da variação)."""
    ten1, ten2 = t1[0], t2[0]
    repo = ProductRepository(async_session)

    sku1, sku2 = f"PROD-T1-{_uid()}", f"PROD-T2-{_uid()}"
    product_t1 = await _produto(async_session, ten1, "Produto Tenant 1", sku1)
    product_t2 = await _produto(async_session, ten2, "Produto Tenant 2", sku2)

    # Cada loja só vê o seu produto
    products_t1 = await BaseRepository.get_multi(repo, async_session, skip=0, limit=100, tenant_id=ten1)
    assert [p.id for p in products_t1] == [product_t1.id]
    assert products_t1[0].tenant_id == ten1

    products_t2 = await BaseRepository.get_multi(repo, async_session, skip=0, limit=100, tenant_id=ten2)
    assert [p.id for p in products_t2] == [product_t2.id]
    assert products_t2[0].tenant_id == ten2

    # Buscar produto da loja 1 com filtro da loja 2 deve retornar None
    assert await repo.get(async_session, product_t1.id, tenant_id=ten2) is None
    assert (await repo.get(async_session, product_t1.id, tenant_id=ten1)).sku == sku1

    # SKU da variação também respeita a loja
    assert await repo.get_by_sku(sku1, tenant_id=ten2) is None
    achado = await repo.get_by_sku(sku1, tenant_id=ten1)
    assert achado is not None and achado.id == product_t1.id


@pytest.mark.asyncio
async def test_product_isolation_api(test_client: AsyncClient, async_session: AsyncSession, t1, t2):
    """Isolamento de produtos via API (listar, ler por id)."""
    _sem_override()
    (ten1, _, token1), (ten2, _, token2) = t1, t2
    cat1 = await _categoria(async_session, ten1)
    cat2 = await _categoria(async_session, ten2)

    r = await test_client.post("/api/v1/products", headers=_h(token1), json={
        "sku": f"API-T1-{_uid()}", "name": "Produto API Tenant 1",
        "category_id": cat1.id, "cost_price": 50.00, "price": 100.00,
    })
    assert r.status_code == 201, r.text
    product_t1_id = r.json()["id"]

    r = await test_client.post("/api/v1/products", headers=_h(token2), json={
        "sku": f"API-T2-{_uid()}", "name": "Produto API Tenant 2",
        "category_id": cat2.id, "cost_price": 50.00, "price": 100.00,
    })
    assert r.status_code == 201, r.text
    product_t2_id = r.json()["id"]

    # Cada loja lista só o seu produto
    r = await test_client.get("/api/v1/products", headers=_h(token1))
    assert r.status_code == 200, r.text
    assert [p["id"] for p in r.json()] == [product_t1_id]

    r = await test_client.get("/api/v1/products", headers=_h(token2))
    assert r.status_code == 200, r.text
    assert [p["id"] for p in r.json()] == [product_t2_id]

    # Acesso cruzado por id: 404
    r = await test_client.get(f"/api/v1/products/{product_t1_id}", headers=_h(token2))
    assert r.status_code == 404, r.text
    r = await test_client.get(f"/api/v1/products/{product_t2_id}", headers=_h(token1))
    assert r.status_code == 404, r.text


# ============================================================================
# ENTRADAS DE ESTOQUE
# ============================================================================


@pytest.mark.asyncio
async def test_stock_entry_isolation_repository(async_session: AsyncSession, t1, t2):
    """Isolamento de entradas de estoque no repositório."""
    ten1, ten2 = t1[0], t2[0]
    repo = StockEntryRepository()

    entry_t1 = await repo.create(async_session, {
        "entry_code": f"ENTRY-T1-{_uid()}",
        "entry_type": EntryType.LOCAL,
        "entry_date": date.today(),
        "supplier_name": "Fornecedor T1",
        "total_cost": 500.00,
    }, tenant_id=ten1)
    entry_t2 = await repo.create(async_session, {
        "entry_code": f"ENTRY-T2-{_uid()}",
        "entry_type": EntryType.LOCAL,
        "entry_date": date.today(),
        "supplier_name": "Fornecedor T2",
        "total_cost": 300.00,
    }, tenant_id=ten2)

    entries_t1 = await repo.get_multi(async_session, skip=0, limit=100, tenant_id=ten1)
    assert [e.id for e in entries_t1] == [entry_t1.id]
    assert entries_t1[0].tenant_id == ten1

    entries_t2 = await repo.get_multi(async_session, skip=0, limit=100, tenant_id=ten2)
    assert [e.id for e in entries_t2] == [entry_t2.id]
    assert entries_t2[0].tenant_id == ten2

    # Acesso cruzado deve retornar None
    assert await repo.get(async_session, entry_t1.id, tenant_id=ten2) is None
    assert (await repo.get(async_session, entry_t1.id, tenant_id=ten1)).id == entry_t1.id


# ============================================================================
# VIAGENS
# ============================================================================


@pytest.mark.asyncio
async def test_trip_isolation_repository(async_session: AsyncSession, t1, t2):
    """Isolamento de viagens no repositório."""
    ten1, ten2 = t1[0], t2[0]
    repo = TripRepository()

    trip_t1 = await repo.create(async_session, {
        "trip_code": f"TRIP-T1-{_uid()}",
        "destination": "São Paulo",
        "trip_date": date.today(),
        "status": TripStatus.PLANNED,
        "travel_cost_fuel": 500.00,
    }, tenant_id=ten1)
    trip_t2 = await repo.create(async_session, {
        "trip_code": f"TRIP-T2-{_uid()}",
        "destination": "Rio de Janeiro",
        "trip_date": date.today(),
        "status": TripStatus.PLANNED,
        "travel_cost_fuel": 300.00,
    }, tenant_id=ten2)

    trips_t1 = await BaseRepository.get_multi(repo, async_session, skip=0, limit=100, tenant_id=ten1)
    assert [t.id for t in trips_t1] == [trip_t1.id]
    assert trips_t1[0].tenant_id == ten1

    trips_t2 = await BaseRepository.get_multi(repo, async_session, skip=0, limit=100, tenant_id=ten2)
    assert [t.id for t in trips_t2] == [trip_t2.id]
    assert trips_t2[0].tenant_id == ten2

    # Acesso cruzado por id e por código: None
    assert await repo.get_by_id(async_session, trip_t1.id, tenant_id=ten2) is None
    assert await repo.get_by_code(async_session, trip_t1.trip_code, tenant_id=ten2) is None
    assert (await repo.get_by_code(async_session, trip_t1.trip_code, tenant_id=ten1)).id == trip_t1.id


# ============================================================================
# VENDAS
# ============================================================================


@pytest.mark.asyncio
async def test_sale_isolation_repository(async_session: AsyncSession, t1, t2):
    """Isolamento de vendas no repositório."""
    (ten1, admin1, _), (ten2, admin2, _) = t1, t2
    sale_repo = SaleRepository(async_session)
    customer_repo = CustomerRepository(async_session)

    customer_t1 = await customer_repo.create(
        async_session, {"full_name": "Cliente T1", "email": f"c1.{_uid()}@test.com", "phone": "11999999991"}, tenant_id=ten1)
    customer_t2 = await customer_repo.create(
        async_session, {"full_name": "Cliente T2", "email": f"c2.{_uid()}@test.com", "phone": "11999999992"}, tenant_id=ten2)

    numero_t1 = f"SALE-T1-{_uid()}"
    sale_t1 = await sale_repo.create({
        "sale_number": numero_t1,
        "status": SaleStatus.COMPLETED,
        "customer_id": customer_t1.id,
        "seller_id": admin1.id,
        "subtotal": 100.00,
        "total_amount": 100.00,
        "payment_method": PaymentMethod.CASH,
    }, tenant_id=ten1)
    sale_t2 = await sale_repo.create({
        "sale_number": f"SALE-T2-{_uid()}",
        "status": SaleStatus.COMPLETED,
        "customer_id": customer_t2.id,
        "seller_id": admin2.id,
        "subtotal": 200.00,
        "total_amount": 200.00,
        "payment_method": PaymentMethod.PIX,
    }, tenant_id=ten2)
    await async_session.commit()

    sales_t1 = await sale_repo.get_multi(skip=0, limit=100, tenant_id=ten1)
    assert [s.id for s in sales_t1] == [sale_t1.id]
    assert sales_t1[0].tenant_id == ten1

    sales_t2 = await sale_repo.get_multi(skip=0, limit=100, tenant_id=ten2)
    assert [s.id for s in sales_t2] == [sale_t2.id]
    assert sales_t2[0].tenant_id == ten2

    # Acesso cruzado por id: None
    assert await sale_repo.get(async_session, sale_t1.id, tenant_id=ten2) is None

    # Busca por número respeita a loja
    assert await sale_repo.get_by_sale_number(numero_t1, tenant_id=ten2) is None
    por_numero = await sale_repo.get_by_sale_number(numero_t1, tenant_id=ten1)
    assert por_numero is not None and por_numero.id == sale_t1.id


# ============================================================================
# CLIENTES
# ============================================================================


@pytest.mark.asyncio
async def test_customer_isolation_repository(async_session: AsyncSession, t1, t2):
    """Isolamento de clientes no repositório."""
    ten1, ten2 = t1[0], t2[0]
    repo = CustomerRepository(async_session)

    email1 = f"isolation1.{_uid()}@test.com"
    customer_t1 = await repo.create(
        async_session, {"full_name": "Cliente Isolation T1", "email": email1, "phone": "11999999881"}, tenant_id=ten1)
    customer_t2 = await repo.create(
        async_session, {"full_name": "Cliente Isolation T2", "email": f"isolation2.{_uid()}@test.com", "phone": "11999999882"},
        tenant_id=ten2)
    await async_session.commit()

    customers_t1 = await BaseRepository.get_multi(repo, async_session, skip=0, limit=100, tenant_id=ten1)
    assert [c.id for c in customers_t1] == [customer_t1.id]
    assert customers_t1[0].tenant_id == ten1

    customers_t2 = await BaseRepository.get_multi(repo, async_session, skip=0, limit=100, tenant_id=ten2)
    assert [c.id for c in customers_t2] == [customer_t2.id]
    assert customers_t2[0].tenant_id == ten2

    # Acesso cruzado por id: None
    assert await repo.get(async_session, customer_t1.id, tenant_id=ten2) is None

    # Busca por e-mail respeita a loja
    assert await repo.get_by_email(async_session, email1, tenant_id=ten2) is None
    por_email = await repo.get_by_email(async_session, email1, tenant_id=ten1)
    assert por_email is not None and por_email.id == customer_t1.id


# ============================================================================
# TENTATIVA MALICIOSA DE ACESSO POR ID
# ============================================================================


@pytest.mark.asyncio
async def test_boundary_malicious_access_attempt(
    test_client: AsyncClient, async_session: AsyncSession, t1, t2
):
    """A loja 2 tenta ler, alterar e apagar o produto da loja 1 trocando o id."""
    _sem_override()
    (ten1, _, _), (_, _, token2) = t1, t2
    product_repo = ProductRepository(async_session)
    product_t1 = await _produto(async_session, ten1, "Produto Privado T1", f"MALICIOUS-T1-{_uid()}")

    # 1. Leitura direta por id
    r = await test_client.get(f"/api/v1/products/{product_t1.id}", headers=_h(token2))
    assert r.status_code == 404, f"Deve ser 404, não dados de outra loja: {r.text}"

    # 2. Atualização
    r = await test_client.put(
        f"/api/v1/products/{product_t1.id}", json={"name": "TENTATIVA DE HACK"}, headers=_h(token2))
    assert r.status_code == 404, f"Não deve permitir atualização: {r.text}"

    # 3. Exclusão
    r = await test_client.delete(f"/api/v1/products/{product_t1.id}", headers=_h(token2))
    assert r.status_code in (404, 403), f"Não deve permitir exclusão: {r.text}"

    # 4. O produto continua intacto e ativo para a loja 1
    product_check = await product_repo.get(async_session, product_t1.id, tenant_id=ten1)
    assert product_check is not None
    await async_session.refresh(product_check)
    assert product_check.name == "Produto Privado T1", "Nome não deve ter sido alterado"
    assert product_check.is_active is True, "Produto não deve ter sido desativado"


# ============================================================================
# ANALYTICS
# ============================================================================


@pytest.mark.asyncio
async def test_analytics_isolation(async_session: AsyncSession, t1, t2):
    """Totais diários e listagem por período calculam só as vendas da própria loja."""
    (ten1, admin1, _), (ten2, admin2, _) = t1, t2
    sale_repo = SaleRepository(async_session)
    customer_repo = CustomerRepository(async_session)

    customer_t1 = await customer_repo.create(
        async_session, {"full_name": "Cliente Analytics T1", "email": f"an1.{_uid()}@test.com", "phone": "11999998881"},
        tenant_id=ten1)
    customer_t2 = await customer_repo.create(
        async_session, {"full_name": "Cliente Analytics T2", "email": f"an2.{_uid()}@test.com", "phone": "11999998882"},
        tenant_id=ten2)

    for i in range(3):  # 100 + 200 + 300
        await sale_repo.create({
            "sale_number": f"ANALYTICS-T1-{_uid()}-{i}",
            "status": SaleStatus.COMPLETED,
            "customer_id": customer_t1.id,
            "seller_id": admin1.id,
            "subtotal": 100.00 * (i + 1),
            "total_amount": 100.00 * (i + 1),
            "payment_method": PaymentMethod.CASH,
        }, tenant_id=ten1)
    for i in range(2):  # 200 + 400
        await sale_repo.create({
            "sale_number": f"ANALYTICS-T2-{_uid()}-{i}",
            "status": SaleStatus.COMPLETED,
            "customer_id": customer_t2.id,
            "seller_id": admin2.id,
            "subtotal": 200.00 * (i + 1),
            "total_amount": 200.00 * (i + 1),
            "payment_method": PaymentMethod.CASH,
        }, tenant_id=ten2)
    await async_session.commit()

    hoje = _hoje_utc()
    assert float(await sale_repo.get_daily_total(hoje, tenant_id=ten1)) == 600.00
    assert float(await sale_repo.get_daily_total(hoje, tenant_id=ten2)) == 600.00

    sales_t1 = await sale_repo.get_by_date_range(hoje, hoje, tenant_id=ten1)
    assert len(sales_t1) == 3
    assert all(s.tenant_id == ten1 for s in sales_t1)

    sales_t2 = await sale_repo.get_by_date_range(hoje, hoje, tenant_id=ten2)
    assert len(sales_t2) == 2
    assert all(s.tenant_id == ten2 for s in sales_t2)
