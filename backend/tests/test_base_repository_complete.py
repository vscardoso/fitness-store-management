"""
Testes abrangentes para BaseRepository cobrindo todos os métodos.

Cada teste usa lojas (tenants) novas e exclusivas, então as contagens são exatas
mesmo com o banco de teste compartilhado pela sessão.
Produto hoje: sku/price/cost_price são propriedades derivadas das variações (sem setter);
o repositório genérico grava só os campos do próprio Product (name, category_id, base_price...).
"""
import itertools
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository
from app.models.product import Product
from app.models.category import Category
from app.models.store import Store

_seq = itertools.count(1)


async def _nova_loja(db: AsyncSession) -> int:
    """Cria uma loja nova e devolve o id (tenant)."""
    n = next(_seq)
    tag = uuid.uuid4().hex[:8]
    store = Store(
        name=f"Loja Repo {n} {tag}",
        slug=f"loja-repo-{n}-{tag}",
        subdomain=f"repo-{n}-{tag}",
        is_default=False,
        is_active=True,
    )
    db.add(store)
    await db.commit()
    await db.refresh(store)
    return store.id


async def _categoria(db: AsyncSession, tenant_id: int | None) -> Category:
    cat = Category(
        name="Categoria Repo",
        slug=f"cat-repo-{uuid.uuid4().hex[:10]}",
        description="Category for testing",
        tenant_id=tenant_id,
        is_active=True,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@pytest.fixture
async def tenant_id(async_session: AsyncSession) -> int:
    """Loja exclusiva do teste."""
    return await _nova_loja(async_session)


@pytest.fixture
async def other_tenant_id(async_session: AsyncSession) -> int:
    """Outra loja exclusiva do teste."""
    return await _nova_loja(async_session)


@pytest.fixture
async def category(async_session: AsyncSession, tenant_id: int):
    """Categoria da loja do teste."""
    return await _categoria(async_session, tenant_id)


def _prod(category: Category, name: str, base_price: float = 100.00, **extra) -> dict:
    return {"name": name, "base_price": base_price, "category_id": category.id, **extra}


@pytest.mark.asyncio
async def test_repository_initialization():
    """Testa inicialização do repositório."""
    repo = BaseRepository[Product, dict, dict](Product)
    assert repo.model == Product


@pytest.mark.asyncio
async def test_create_with_dict(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa criação com dicionário."""
    repo = BaseRepository[Product, dict, dict](Product)

    product = await repo.create(
        async_session,
        obj_in=_prod(category, "Test Product", description="Test description"),
        tenant_id=tenant_id,
    )

    assert product.id is not None
    assert product.name == "Test Product"
    assert product.description == "Test description"
    assert product.tenant_id == tenant_id
    assert product.is_active is True


@pytest.mark.asyncio
async def test_create_rejects_sku_assignment(async_session: AsyncSession, category: Category, tenant_id: int):
    """sku agora é propriedade sem setter: o repositório não deve aceitar sku no Product."""
    repo = BaseRepository[Product, dict, dict](Product)
    with pytest.raises(AttributeError):
        await repo.create(
            async_session,
            obj_in=_prod(category, "Com SKU", sku="X-001"),
            tenant_id=tenant_id,
        )


@pytest.mark.asyncio
async def test_create_injects_tenant_id(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa que create injeta tenant_id automaticamente."""
    repo = BaseRepository[Product, dict, dict](Product)

    # Não passa tenant_id no obj_in
    product = await repo.create(
        async_session,
        obj_in=_prod(category, "Test Product 2", 200.00),
        tenant_id=tenant_id,  # Passa apenas no parâmetro
    )

    assert product.tenant_id == tenant_id


@pytest.mark.asyncio
async def test_get_by_id(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa busca por ID."""
    repo = BaseRepository[Product, dict, dict](Product)

    created = await repo.create(async_session, obj_in=_prod(category, "Test Product 3", 300.00), tenant_id=tenant_id)
    await async_session.commit()

    found = await repo.get(async_session, created.id, tenant_id=tenant_id)

    assert found is not None
    assert found.id == created.id
    assert found.name == "Test Product 3"


@pytest.mark.asyncio
async def test_get_respects_tenant_isolation(
    async_session: AsyncSession, category: Category, tenant_id: int, other_tenant_id: int
):
    """Testa que get respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)

    product = await repo.create(async_session, obj_in=_prod(category, "Test Product 4", 400.00), tenant_id=tenant_id)
    await async_session.commit()

    not_found = await repo.get(async_session, product.id, tenant_id=other_tenant_id)

    assert not_found is None


@pytest.mark.asyncio
async def test_get_non_existent(async_session: AsyncSession, tenant_id: int):
    """Testa busca de registro inexistente."""
    repo = BaseRepository[Product, dict, dict](Product)

    result = await repo.get(async_session, 99999999, tenant_id=tenant_id)

    assert result is None


@pytest.mark.asyncio
async def test_get_multi_with_pagination(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa busca múltipla com paginação."""
    repo = BaseRepository[Product, dict, dict](Product)

    for i in range(5):
        await repo.create(async_session, obj_in=_prod(category, f"Product {i}", 100.00 * (i + 1)), tenant_id=tenant_id)
    await async_session.commit()

    page1 = await repo.get_multi(async_session, skip=0, limit=3, tenant_id=tenant_id)
    assert len(page1) == 3

    page2 = await repo.get_multi(async_session, skip=3, limit=3, tenant_id=tenant_id)
    assert len(page2) == 2

    # sem sobreposição entre as páginas
    assert not ({p.id for p in page1} & {p.id for p in page2})


@pytest.mark.asyncio
async def test_get_multi_with_filters(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa busca múltipla com filtros."""
    repo = BaseRepository[Product, dict, dict](Product)
    outra_categoria = await _categoria(async_session, tenant_id)

    await repo.create(async_session, obj_in=_prod(category, "Cheap Product", 50.00), tenant_id=tenant_id)
    await repo.create(async_session, obj_in=_prod(category, "Expensive Product", 500.00), tenant_id=tenant_id)
    await repo.create(async_session, obj_in=_prod(outra_categoria, "Other Category Product"), tenant_id=tenant_id)
    await async_session.commit()

    products = await repo.get_multi(async_session, filters={"category_id": category.id}, tenant_id=tenant_id)

    assert sorted(p.name for p in products) == ["Cheap Product", "Expensive Product"]


@pytest.mark.asyncio
async def test_get_multi_with_order_by(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa busca múltipla com ordenação."""
    repo = BaseRepository[Product, dict, dict](Product)

    for nome, preco in (("Product C", 300.00), ("Product A", 100.00), ("Product B", 200.00)):
        await repo.create(async_session, obj_in=_prod(category, nome, preco), tenant_id=tenant_id)
    await async_session.commit()

    products = await repo.get_multi(async_session, order_by="name", tenant_id=tenant_id)

    assert [p.name for p in products] == ["Product A", "Product B", "Product C"]


@pytest.mark.asyncio
async def test_get_multi_respects_tenant_isolation(
    async_session: AsyncSession, tenant_id: int, other_tenant_id: int
):
    """Testa que get_multi respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)
    cat1 = await _categoria(async_session, tenant_id)
    cat2 = await _categoria(async_session, other_tenant_id)

    await repo.create(async_session, obj_in=_prod(cat1, "T1 Product"), tenant_id=tenant_id)
    await repo.create(async_session, obj_in=_prod(cat2, "T2 Product", 200.00), tenant_id=other_tenant_id)
    await async_session.commit()

    t1_names = [p.name for p in await repo.get_multi(async_session, tenant_id=tenant_id)]
    t2_names = [p.name for p in await repo.get_multi(async_session, tenant_id=other_tenant_id)]

    assert t1_names == ["T1 Product"]
    assert t2_names == ["T2 Product"]


@pytest.mark.asyncio
async def test_update_record(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa atualização de registro."""
    repo = BaseRepository[Product, dict, dict](Product)

    product = await repo.create(async_session, obj_in=_prod(category, "Original Name"), tenant_id=tenant_id)
    await async_session.commit()

    updated = await repo.update(
        async_session,
        id=product.id,
        obj_in={"name": "Updated Name", "base_price": 150.00},
        tenant_id=tenant_id,
    )
    await async_session.commit()

    assert updated is not None
    assert updated.name == "Updated Name"
    assert float(updated.base_price) == 150.00


@pytest.mark.asyncio
async def test_update_respects_tenant_isolation(
    async_session: AsyncSession, category: Category, tenant_id: int, other_tenant_id: int
):
    """Testa que update respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)

    product = await repo.create(async_session, obj_in=_prod(category, "Tenant 1 Product"), tenant_id=tenant_id)
    await async_session.commit()

    result = await repo.update(
        async_session, id=product.id, obj_in={"name": "Hacked Name"}, tenant_id=other_tenant_id
    )

    assert result is None
    # e o registro da loja dona continua intacto
    intacto = await repo.get(async_session, product.id, tenant_id=tenant_id)
    assert intacto.name == "Tenant 1 Product"


@pytest.mark.asyncio
async def test_update_non_existent(async_session: AsyncSession, tenant_id: int):
    """Testa atualização de registro inexistente."""
    repo = BaseRepository[Product, dict, dict](Product)

    result = await repo.update(async_session, id=99999999, obj_in={"name": "New Name"}, tenant_id=tenant_id)

    assert result is None


@pytest.mark.asyncio
async def test_soft_delete(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa soft delete (padrão)."""
    repo = BaseRepository[Product, dict, dict](Product)

    product = await repo.create(async_session, obj_in=_prod(category, "To Delete"), tenant_id=tenant_id)
    await async_session.commit()

    deleted = await repo.delete(async_session, id=product.id, soft_delete=True, tenant_id=tenant_id)
    await async_session.commit()

    assert deleted is True

    # Não aparece em buscas normais
    assert await repo.get(async_session, product.id, tenant_id=tenant_id) is None


@pytest.mark.asyncio
async def test_hard_delete(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa hard delete."""
    repo = BaseRepository[Product, dict, dict](Product)

    product = await repo.create(async_session, obj_in=_prod(category, "To Hard Delete"), tenant_id=tenant_id)
    await async_session.commit()

    deleted = await repo.delete(async_session, id=product.id, soft_delete=False, tenant_id=tenant_id)
    await async_session.commit()

    assert deleted is True
    assert await repo.get(async_session, product.id, tenant_id=tenant_id) is None


@pytest.mark.asyncio
async def test_delete_respects_tenant_isolation(
    async_session: AsyncSession, category: Category, tenant_id: int, other_tenant_id: int
):
    """Testa que delete (soft e hard) respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)

    product = await repo.create(async_session, obj_in=_prod(category, "Protected Product"), tenant_id=tenant_id)
    await async_session.commit()

    assert await repo.delete(async_session, id=product.id, tenant_id=other_tenant_id) is False
    assert await repo.delete(async_session, id=product.id, soft_delete=False, tenant_id=other_tenant_id) is False

    found = await repo.get(async_session, product.id, tenant_id=tenant_id)
    assert found is not None


@pytest.mark.asyncio
async def test_get_by_field(async_session: AsyncSession, category: Category, tenant_id: int, other_tenant_id: int):
    """Testa busca por campo arbitrário (e que respeita a loja)."""
    repo = BaseRepository[Product, dict, dict](Product)

    await repo.create(async_session, obj_in=_prod(category, "Unique Product"), tenant_id=tenant_id)
    await async_session.commit()

    found = await repo.get_by_field(async_session, field="name", value="Unique Product", tenant_id=tenant_id)
    assert found is not None
    assert found.name == "Unique Product"

    outra_loja = await repo.get_by_field(async_session, field="name", value="Unique Product", tenant_id=other_tenant_id)
    assert outra_loja is None


@pytest.mark.asyncio
async def test_get_by_field_invalid_field(async_session: AsyncSession, tenant_id: int):
    """Testa busca por campo inválido."""
    repo = BaseRepository[Product, dict, dict](Product)

    with pytest.raises(ValueError, match="Field 'invalid_field' does not exist"):
        await repo.get_by_field(async_session, field="invalid_field", value="anything", tenant_id=tenant_id)


@pytest.mark.asyncio
async def test_exists_true(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa exists quando registro existe."""
    repo = BaseRepository[Product, dict, dict](Product)

    product = await repo.create(async_session, obj_in=_prod(category, "Exists Product"), tenant_id=tenant_id)
    await async_session.commit()

    assert await repo.exists(async_session, id=product.id, tenant_id=tenant_id) is True


@pytest.mark.asyncio
async def test_exists_false(async_session: AsyncSession, tenant_id: int):
    """Testa exists quando registro não existe."""
    repo = BaseRepository[Product, dict, dict](Product)

    assert await repo.exists(async_session, id=99999999, tenant_id=tenant_id) is False


@pytest.mark.asyncio
async def test_exists_respects_tenant_isolation(
    async_session: AsyncSession, category: Category, tenant_id: int, other_tenant_id: int
):
    """Testa que exists respeita isolamento de tenant."""
    repo = BaseRepository[Product, dict, dict](Product)

    product = await repo.create(async_session, obj_in=_prod(category, "Tenant Product"), tenant_id=tenant_id)
    await async_session.commit()

    assert await repo.exists(async_session, id=product.id, tenant_id=other_tenant_id) is False


@pytest.mark.asyncio
async def test_count_all(async_session: AsyncSession, category: Category, tenant_id: int, other_tenant_id: int):
    """Testa contagem de todos os registros da loja."""
    repo = BaseRepository[Product, dict, dict](Product)
    cat2 = await _categoria(async_session, other_tenant_id)

    for i in range(3):
        await repo.create(async_session, obj_in=_prod(category, f"Product {i}"), tenant_id=tenant_id)
    await repo.create(async_session, obj_in=_prod(cat2, "De outra loja"), tenant_id=other_tenant_id)
    await async_session.commit()

    assert await repo.count(async_session, tenant_id=tenant_id) == 3
    assert await repo.count(async_session, tenant_id=other_tenant_id) == 1


@pytest.mark.asyncio
async def test_count_with_filters(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa contagem com filtros."""
    repo = BaseRepository[Product, dict, dict](Product)
    outra_categoria = await _categoria(async_session, tenant_id)

    await repo.create(async_session, obj_in=_prod(category, "Product 1"), tenant_id=tenant_id)
    await repo.create(async_session, obj_in=_prod(outra_categoria, "Product 2"), tenant_id=tenant_id)
    await async_session.commit()

    assert await repo.count(async_session, filters={"category_id": category.id}, tenant_id=tenant_id) == 1


@pytest.mark.asyncio
async def test_bulk_create(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa criação em lote."""
    repo = BaseRepository[Product, dict, dict](Product)

    products = await repo.bulk_create(
        async_session,
        objects=[
            _prod(category, "Bulk 1", 100.00),
            _prod(category, "Bulk 2", 200.00),
            _prod(category, "Bulk 3", 300.00),
        ],
        tenant_id=tenant_id,
    )
    await async_session.commit()

    assert len(products) == 3
    assert all(p.id is not None for p in products)
    assert all(p.tenant_id == tenant_id for p in products)


@pytest.mark.asyncio
async def test_get_or_create_get_existing(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa get_or_create quando registro já existe."""
    repo = BaseRepository[Product, dict, dict](Product)

    await repo.create(async_session, obj_in=_prod(category, "Existing Product"), tenant_id=tenant_id)
    await async_session.commit()

    product, created = await repo.get_or_create(
        async_session,
        name="Existing Product",
        tenant_id=tenant_id,
        defaults={"base_price": 200.00, "category_id": category.id, "description": "Novo"},
    )

    assert created is False
    assert product.description != "Novo"  # Não foi alterado


@pytest.mark.asyncio
async def test_get_or_create_create_new(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa get_or_create quando registro não existe."""
    repo = BaseRepository[Product, dict, dict](Product)

    product, created = await repo.get_or_create(
        async_session,
        name="New Product",
        tenant_id=tenant_id,
        defaults={"base_price": 300.00, "category_id": category.id},
    )
    await async_session.commit()

    assert created is True
    assert product.name == "New Product"
    assert product.tenant_id == tenant_id


@pytest.mark.asyncio
async def test_get_or_create_does_not_cross_tenants(
    async_session: AsyncSession, tenant_id: int, other_tenant_id: int
):
    """get_or_create com a mesma chave em lojas diferentes cria um registro por loja."""
    repo = BaseRepository[Product, dict, dict](Product)
    cat1 = await _categoria(async_session, tenant_id)
    cat2 = await _categoria(async_session, other_tenant_id)

    p1, created1 = await repo.get_or_create(
        async_session, name="Mesmo Nome", tenant_id=tenant_id, defaults={"category_id": cat1.id}
    )
    p2, created2 = await repo.get_or_create(
        async_session, name="Mesmo Nome", tenant_id=other_tenant_id, defaults={"category_id": cat2.id}
    )

    assert created1 is True and created2 is True
    assert p1.id != p2.id
    assert p1.tenant_id == tenant_id and p2.tenant_id == other_tenant_id


@pytest.mark.asyncio
async def test_repository_without_tenant_filter(async_session: AsyncSession, tenant_id: int):
    """
    Todo modelo (BaseModel) agora tem tenant_id; sem tenant_id o repositório não filtra por loja.
    Registro sem loja (tenant_id None) só é achado quando nenhuma loja é informada.
    """
    repo = BaseRepository[Category, dict, dict](Category)

    categoria = await repo.create(
        async_session,
        obj_in={"name": "Sem Loja", "slug": f"sem-loja-{uuid.uuid4().hex[:8]}"},
    )
    await async_session.commit()

    found = await repo.get(async_session, categoria.id)
    assert found is not None
    assert found.name == "Sem Loja"
    assert found.tenant_id is None

    assert await repo.get(async_session, categoria.id, tenant_id=tenant_id) is None


@pytest.mark.asyncio
async def test_get_multi_respects_is_active_filter(async_session: AsyncSession, category: Category, tenant_id: int):
    """Testa que get_multi retorna apenas registros ativos."""
    repo = BaseRepository[Product, dict, dict](Product)

    await repo.create(async_session, obj_in=_prod(category, "Active Product"), tenant_id=tenant_id)
    inactive = await repo.create(async_session, obj_in=_prod(category, "Inactive Product", 200.00), tenant_id=tenant_id)
    await async_session.commit()

    await repo.delete(async_session, id=inactive.id, soft_delete=True, tenant_id=tenant_id)
    await async_session.commit()

    names = [p.name for p in await repo.get_multi(async_session, tenant_id=tenant_id)]

    assert names == ["Active Product"]
