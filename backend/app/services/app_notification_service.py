"""Caixa de alertas da loja: estoque baixo e produto zerado.

`sync_stock_alerts` e idempotente: cria o alerta quando a condicao aparece, nao duplica enquanto
ela continua e remove o alerta quando o estoque se recupera (assim um novo problema alerta de novo).
"""
from typing import Optional
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory
from app.models.product import Product
from app.models.entry_item import EntryItem
from app.models.notification import AppNotification


class AppNotificationService:
    async def _stock_state(self, db: AsyncSession, tenant_id: int) -> dict[int, tuple[str, str, str]]:
        """product_id -> (kind, title, body) para cada produto com problema de estoque agora."""
        rows = (await db.execute(
            select(
                Product.id, Product.name,
                func.coalesce(func.sum(Inventory.quantity), 0),
                func.coalesce(func.sum(Inventory.min_stock), 0),
            )
            .join(Inventory, Inventory.product_id == Product.id)
            .where(
                Product.tenant_id == tenant_id,
                Product.is_active == True,  # noqa: E712
                Inventory.is_active == True,  # noqa: E712
                Product.id.in_(
                    select(EntryItem.product_id).where(
                        EntryItem.tenant_id == tenant_id, EntryItem.is_active == True  # noqa: E712
                    ).scalar_subquery()
                ),
            )
            .group_by(Product.id, Product.name)
        )).all()

        state: dict[int, tuple[str, str, str]] = {}
        for pid, name, qty, min_stock in rows:
            qty, min_stock = int(qty), int(min_stock)
            if qty <= 0:
                state[pid] = ("out_of_stock", f"Sem estoque: {name}", f"{name} acabou. Hora de repor.")
            elif min_stock > 0 and qty <= min_stock:
                state[pid] = (
                    "low_stock",
                    f"Estoque baixo: {name}",
                    f"{name} tem {qty} un e o mínimo configurado é {min_stock}.",
                )
        return state

    async def sync_stock_alerts(self, db: AsyncSession, tenant_id: int) -> None:
        state = await self._stock_state(db, tenant_id)
        existing = (await db.execute(
            select(AppNotification).where(
                AppNotification.tenant_id == tenant_id,
                AppNotification.is_active == True,  # noqa: E712
                AppNotification.kind.in_(["low_stock", "out_of_stock"]),
            )
        )).scalars().all()

        wanted = {f"{kind}:{pid}": (pid, kind, title, body) for pid, (kind, title, body) in state.items()}
        have = {n.dedupe_key for n in existing}

        for n in existing:
            if n.dedupe_key not in wanted:
                n.is_active = False  # estoque recuperou (ou passou de baixo para zerado)
        for key, (pid, kind, title, body) in wanted.items():
            if key not in have:
                db.add(AppNotification(
                    tenant_id=tenant_id, kind=kind, dedupe_key=key, title=title, body=body, product_id=pid,
                ))
        await db.commit()

    async def list(self, db: AsyncSession, tenant_id: int, limit: int = 100) -> list[AppNotification]:
        await self.sync_stock_alerts(db, tenant_id)
        res = await db.execute(
            select(AppNotification)
            .where(AppNotification.tenant_id == tenant_id, AppNotification.is_active == True)  # noqa: E712
            .order_by(AppNotification.is_read.asc(), AppNotification.created_at.desc())
            .limit(limit)
        )
        return list(res.scalars().all())

    async def unread_count(self, db: AsyncSession, tenant_id: int) -> int:
        await self.sync_stock_alerts(db, tenant_id)
        return int((await db.execute(
            select(func.count(AppNotification.id)).where(
                AppNotification.tenant_id == tenant_id,
                AppNotification.is_active == True,  # noqa: E712
                AppNotification.is_read == False,  # noqa: E712
            )
        )).scalar() or 0)

    async def mark_read(self, db: AsyncSession, tenant_id: int, notification_id: int) -> Optional[AppNotification]:
        n = (await db.execute(
            select(AppNotification).where(
                AppNotification.id == notification_id, AppNotification.tenant_id == tenant_id,
                AppNotification.is_active == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if n:
            n.is_read = True
            await db.commit()
        return n

    async def mark_all_read(self, db: AsyncSession, tenant_id: int) -> int:
        res = await db.execute(
            update(AppNotification)
            .where(AppNotification.tenant_id == tenant_id, AppNotification.is_read == False)  # noqa: E712
            .values(is_read=True)
        )
        await db.commit()
        return res.rowcount or 0
