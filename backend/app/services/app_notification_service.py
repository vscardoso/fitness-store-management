"""Caixa de alertas da loja: estoque baixo e produto zerado.

`sync_stock_alerts` e idempotente: cria o alerta quando a condicao aparece, nao duplica enquanto
ela continua e remove o alerta quando o estoque se recupera (assim um novo problema alerta de novo).
"""
import logging
from typing import Optional
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory
from app.models.product import Product
from app.models.entry_item import EntryItem
from app.models.notification import AppNotification, PushToken
from app.models.store import Store
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


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

        def clip(text: str, limit: int) -> str:
            # nome de produto muito longo estourava a coluna (title é varchar(255)) e derrubava a consulta inteira
            return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"

        state: dict[int, tuple[str, str, str]] = {}
        for pid, name, qty, min_stock in rows:
            qty, min_stock = int(qty), int(min_stock)
            name = clip(name or "", 120)
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

    async def push_pending(self, db: AsyncSession, tenant_id: int) -> dict:
        """Manda para o celular os alertas que ainda não viraram push (um aviso só, mesmo com vários).

        Marca como enviado mesmo sem aparelho cadastrado, para um aparelho novo não receber
        alertas antigos de uma vez.
        """
        pending = (await db.execute(
            select(AppNotification).where(
                AppNotification.tenant_id == tenant_id,
                AppNotification.is_active == True,  # noqa: E712
                AppNotification.push_sent == False,  # noqa: E712
            ).order_by(AppNotification.created_at.asc())
        )).scalars().all()
        if not pending:
            return {"pending": 0, "sent": 0}

        user_ids = list((await db.execute(
            select(PushToken.user_id).where(
                PushToken.tenant_id == tenant_id, PushToken.is_active == True  # noqa: E712
            )
        )).scalars().all())

        sent = 0
        if user_ids:
            if len(pending) == 1:
                title, body = pending[0].title, pending[0].body
            else:
                names = ", ".join(n.title.split(": ", 1)[-1] for n in pending[:3])
                extra = f" e mais {len(pending) - 3}" if len(pending) > 3 else ""
                title, body = "Alertas de estoque", f"{len(pending)} produtos precisam de atenção: {names}{extra}."
            try:
                result = await NotificationService().send_notification(
                    db, tenant_id, user_ids, title, body,
                    {"type": "warning", "route": "/notifications"},
                )
                sent = int(result.get("sent_count", 0))
            except Exception as exc:  # Expo fora do ar não pode derrubar o job nem repetir para sempre
                logger.error("Falha ao enviar push de estoque (loja %s): %s", tenant_id, exc)

        for n in pending:
            n.push_sent = True
        await db.commit()
        return {"pending": len(pending), "sent": sent}

    async def run_stock_alerts(self, db: AsyncSession, tenant_id: Optional[int] = None) -> dict:
        """Sincroniza e dispara os pushes de uma loja, ou de todas quando tenant_id é None (usado pelo agendador)."""
        if tenant_id is None:
            tenants = list((await db.execute(select(Store.id).where(Store.is_active == True))).scalars().all())  # noqa: E712
        else:
            tenants = [tenant_id]
        total = {"tenants": len(tenants), "pending": 0, "sent": 0}
        for tid in tenants:
            await self.sync_stock_alerts(db, tid)
            r = await self.push_pending(db, tid)
            total["pending"] += r["pending"]
            total["sent"] += r["sent"]
        return total
