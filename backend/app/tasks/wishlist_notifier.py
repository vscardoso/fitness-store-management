"""
Tarefa periódica: verifica wishlists pendentes e envia push notification
quando o produto volta ao estoque.

Chamada via lifespan (startup) ou scheduler externo.
"""
import asyncio
import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import async_session_maker as AsyncSessionLocal
from app.models.wishlist import Wishlist
from app.models.inventory import Inventory
from app.models.product_variant import ProductVariant
from app.models.customer import Customer
from app.models.user import User
from app.repositories.wishlist_repository import WishlistRepository
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)
_wishlist_repo = WishlistRepository()
_notif_svc = NotificationService()


async def _get_stock(db, product_id: int, variant_id=None) -> int:
    """Retorna estoque atual do produto/variante."""
    if variant_id:
        stmt = select(ProductVariant).where(
            ProductVariant.id == variant_id, ProductVariant.is_active == True
        )
        result = await db.execute(stmt)
        v = result.scalar_one_or_none()
        return v.current_stock if v else 0

    stmt = select(Inventory).where(Inventory.product_id == product_id)
    result = await db.execute(stmt)
    inv = result.scalar_one_or_none()
    return inv.quantity if inv else 0


async def _get_user_id_for_customer(db, customer_id: int):
    """Tenta encontrar user vinculado ao customer pelo email."""
    stmt = select(Customer).where(Customer.id == customer_id, Customer.is_active == True)
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()
    if not customer or not customer.email:
        return None

    stmt = select(User).where(User.email == customer.email, User.is_active == True)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    return user.id if user else None


async def run_wishlist_notifier():
    """
    Verifica todos os wishlists não-notificados.
    Para cada item com estoque disponível, envia push e marca como notificado.
    """
    async with AsyncSessionLocal() as db:
        try:
            stmt = (
                select(Wishlist)
                .where(Wishlist.notified == False, Wishlist.is_active == True)
                .options(selectinload(Wishlist.product))
            )
            result = await db.execute(stmt)
            pending = result.scalars().all()

            notified = 0
            for item in pending:
                stock = await _get_stock(db, item.product_id, item.variant_id)
                if stock <= 0:
                    continue

                # Tenta enviar push para o usuário vinculado
                user_id = await _get_user_id_for_customer(db, item.customer_id)
                if user_id:
                    product_name = item.product.name if item.product else f"Produto #{item.product_id}"
                    await _notif_svc.send_notification(
                        db=db,
                        tenant_id=item.tenant_id,
                        user_ids=[user_id],
                        title="Produto disponível! 🛍️",
                        body=f"{product_name} voltou ao estoque. Não perca!",
                        data={"product_id": item.product_id, "variant_id": item.variant_id},
                    )

                await _wishlist_repo.mark_notified(db, item)
                notified += 1

            if notified:
                logger.info(f"[WishlistNotifier] {notified} notificações enviadas.")
        except Exception as e:
            logger.error(f"[WishlistNotifier] Erro: {e}")


async def start_periodic_notifier(interval_seconds: int = 3600):
    """Loop periódico — executa a cada `interval_seconds` (default: 1h)."""
    while True:
        await run_wishlist_notifier()
        await asyncio.sleep(interval_seconds)
