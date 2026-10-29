"""Service de Looks — regras de negócio."""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.models.customer import Customer
from app.models.look import Look, LookItem
from app.models.product import Product
from app.models.entry_item import EntryItem
from app.models.stock_entry import StockEntry
from app.models.product_variant import ProductVariant
from app.repositories.look_repository import LookRepository
from app.schemas.look import LookCreate, LookUpdate, LookResponse, LookListResponse, LookItemResponse


def _build_item_response(item: LookItem, stock: Optional[int] = None) -> LookItemResponse:
    price = None
    if item.variant and item.variant.price:
        price = float(item.variant.price)
    elif item.product and item.product.base_price:
        price = float(item.product.base_price)

    variant_desc = None
    if item.variant:
        parts = [v for v in [item.variant.size, item.variant.color] if v]
        variant_desc = " / ".join(parts) if parts else None

    return LookItemResponse(
        id=item.id,
        look_id=item.look_id,
        product_id=item.product_id,
        variant_id=item.variant_id,
        position=item.position,
        product_name=item.product.name if item.product else None,
        variant_description=variant_desc,
        product_image_url=item.product.image_url if item.product else None,
        unit_price=price,
        variant_sku=item.variant.sku if item.variant else None,
        variant_color=item.variant.color if item.variant else None,
        variant_size=item.variant.size if item.variant else None,
        stock=stock,
        created_at=item.created_at,
    )


def _build_response(look: Look, stocks: Optional[dict] = None) -> LookResponse:
    stocks = stocks or {}
    items = [
        _build_item_response(i, stocks.get(("v", i.variant_id)) if i.variant_id else stocks.get(("p", i.product_id)))
        for i in look.items if i.is_active
    ]
    total = sum(i.unit_price or 0 for i in items)
    discount = look.discount_percentage or 0
    if discount > 0 and len(items) >= 3:
        total = total * (1 - discount / 100)

    return LookResponse(
        id=look.id,
        tenant_id=look.tenant_id,
        name=look.name,
        description=look.description,
        customer_id=look.customer_id,
        is_public=look.is_public,
        discount_percentage=look.discount_percentage,
        items=items,
        total_price=round(total, 2),
        items_count=len(items),
        created_at=look.created_at,
        updated_at=look.updated_at,
    )


async def _stock_of(db: AsyncSession, tenant_id: int, look: Look) -> dict:
    """Estoque atual das peças do look: por variação, ou do produto todo quando o item não tem variação."""
    items = [i for i in look.items if i.is_active]
    variant_ids = {i.variant_id for i in items if i.variant_id}
    product_ids = {i.product_id for i in items if not i.variant_id}
    out: dict = {}
    if variant_ids:
        rows = (await db.execute(
            select(EntryItem.variant_id, func.coalesce(func.sum(EntryItem.quantity_remaining), 0))
            .select_from(EntryItem).join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(EntryItem.tenant_id == tenant_id, EntryItem.is_active == True, StockEntry.is_active == True,  # noqa: E712
                   EntryItem.variant_id.in_(variant_ids))
            .group_by(EntryItem.variant_id)
        )).all()
        found = {v: int(q) for v, q in rows}
        for v in variant_ids:
            out[("v", v)] = max(0, found.get(v, 0))
    if product_ids:
        rows = (await db.execute(
            select(EntryItem.product_id, func.coalesce(func.sum(EntryItem.quantity_remaining), 0))
            .select_from(EntryItem).join(StockEntry, StockEntry.id == EntryItem.entry_id)
            .where(EntryItem.tenant_id == tenant_id, EntryItem.is_active == True, StockEntry.is_active == True,  # noqa: E712
                   EntryItem.product_id.in_(product_ids))
            .group_by(EntryItem.product_id)
        )).all()
        found = {p: int(q) for p, q in rows}
        for p in product_ids:
            out[("p", p)] = max(0, found.get(p, 0))
    return out


def _look_total(look: Look) -> float:
    """Soma dos preços das peças ativas; com 3 ou mais peças aplica o desconto do look."""
    items = [_build_item_response(i) for i in look.items if i.is_active]
    total = sum(i.unit_price or 0 for i in items)
    discount = look.discount_percentage or 0
    if discount > 0 and len(items) >= 3:
        total = total * (1 - discount / 100)
    return round(total, 2)


def _build_list_response(look: Look) -> LookListResponse:
    items = [i for i in look.items if i.is_active]
    return LookListResponse(
        id=look.id,
        name=look.name,
        description=look.description,
        customer_id=look.customer_id,
        is_public=look.is_public,
        discount_percentage=look.discount_percentage,
        items_count=len(items),
        total_price=_look_total(look),
        created_at=look.created_at,
    )


class LookValidationError(ValueError):
    """Produto, variação ou cliente que não existe na loja (o endpoint responde 400)."""


async def _validate_refs(
    db: AsyncSession,
    tenant_id: int,
    items: List[tuple],
    customer_id: Optional[int] = None,
) -> None:
    """Tudo que entra no look tem que ser da MESMA loja: sem isso uma loja monta look com produto de outra e lê o nome, o preço e a foto dele."""
    if customer_id is not None:
        ok = (await db.execute(
            select(Customer.id).where(Customer.id == customer_id, Customer.tenant_id == tenant_id, Customer.is_active == True)  # noqa: E712
        )).scalar_one_or_none()
        if ok is None:
            raise LookValidationError("Cliente não encontrado nesta loja.")
    product_ids = {pid for pid, _ in items}
    if product_ids:
        found = set((await db.execute(
            select(Product.id).where(Product.id.in_(product_ids), Product.tenant_id == tenant_id, Product.is_active == True)  # noqa: E712
        )).scalars().all())
        if found != product_ids:
            raise LookValidationError("Produto não encontrado nesta loja.")
    for pid, vid in items:
        if vid is None:
            continue
        ok = (await db.execute(
            select(ProductVariant.id).where(
                ProductVariant.id == vid, ProductVariant.product_id == pid,
                ProductVariant.tenant_id == tenant_id, ProductVariant.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if ok is None:
            raise LookValidationError("Variação não encontrada neste produto.")


class LookService:
    def __init__(self):
        self.repo = LookRepository()

    async def create(self, db: AsyncSession, tenant_id: int, data: LookCreate) -> LookResponse:
        await _validate_refs(db, tenant_id, [(i.product_id, i.variant_id) for i in data.items], data.customer_id)
        # Regra: desconto de 10% automático para 3+ peças
        if len(data.items) >= 3 and data.discount_percentage == 0:
            data.discount_percentage = 10.0
        look = await self.repo.create(db, tenant_id, data)
        # Recarregar com relacionamentos
        look = await self.repo.get(db, look.id, tenant_id)
        return _build_response(look, await _stock_of(db, tenant_id, look))

    async def list(
        self,
        db: AsyncSession,
        tenant_id: int,
        customer_id: Optional[int] = None,
        is_public: Optional[bool] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[LookListResponse]:
        looks = await self.repo.list(db, tenant_id, customer_id, is_public, skip, limit)
        return [_build_list_response(l) for l in looks]

    async def get(self, db: AsyncSession, look_id: int, tenant_id: int) -> Optional[LookResponse]:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return None
        return _build_response(look, await _stock_of(db, tenant_id, look))

    async def update(
        self, db: AsyncSession, look_id: int, tenant_id: int, data: LookUpdate
    ) -> Optional[LookResponse]:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return None
        look = await self.repo.update(db, look, data)
        look = await self.repo.get(db, look.id, tenant_id)
        return _build_response(look, await _stock_of(db, tenant_id, look))

    async def delete(self, db: AsyncSession, look_id: int, tenant_id: int) -> bool:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return False
        await self.repo.soft_delete(db, look)
        return True

    async def add_item(
        self,
        db: AsyncSession,
        look_id: int,
        tenant_id: int,
        product_id: int,
        variant_id: Optional[int],
        position: int = 0,
    ) -> Optional[LookResponse]:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return None
        await _validate_refs(db, tenant_id, [(product_id, variant_id)])
        await self.repo.add_item(db, tenant_id, look_id, product_id, variant_id, position)
        # Expirar do identity map para forçar re-query com os novos itens
        await db.refresh(look)
        look = await self.repo.get(db, look_id, tenant_id)
        # Mesma regra da criação: com 3 ou mais peças e sem desconto definido, vale o desconto de 10%
        if look.items_count >= 3 and not look.discount_percentage:
            look.discount_percentage = 10.0
            await db.commit()
            look = await self.repo.get(db, look_id, tenant_id)
        return _build_response(look, await _stock_of(db, tenant_id, look))

    async def remove_item(
        self, db: AsyncSession, look_id: int, item_id: int, tenant_id: int
    ) -> bool:
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return False
        return await self.repo.remove_item(db, item_id, look_id)

    async def change_item_variant(
        self, db: AsyncSession, look_id: int, item_id: int, tenant_id: int, variant_id: int
    ) -> Optional[LookResponse]:
        """Troca a cor/tamanho de uma peça do look (a variação tem que ser do mesmo produto e da mesma loja)."""
        look = await self.repo.get(db, look_id, tenant_id)
        if not look:
            return None
        item = await self.repo.get_item(db, item_id, look_id)
        if not item:
            return None
        await _validate_refs(db, tenant_id, [(item.product_id, variant_id)])
        await self.repo.set_item_variant(db, item, variant_id)
        await db.refresh(look)
        look = await self.repo.get(db, look_id, tenant_id)
        return _build_response(look, await _stock_of(db, tenant_id, look))

