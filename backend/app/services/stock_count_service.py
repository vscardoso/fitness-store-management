"""
Conferência de estoque salva: grava a contagem física (em andamento ou finalizada) e devolve o histórico.

- Em andamento (`open`): pode ser salva várias vezes (cada salvamento troca as peças contadas) e continuada depois,
  em qualquer aparelho. Cada salvamento sobe a `revision`; salvar com revisão velha é recusado (409), para dois aparelhos
  não se sobrescreverem sem querer.
- Finalizada (`finished`): fotografia fechada, com a data do fechamento. Não muda mais.
Peça que ninguém contou não entra (fica como "não contada"). A conferência nunca altera o estoque.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.stock_count import StockCount, StockCountItem
from app.models.user import User
from app.services.stock_check_service import StockCheckService
from app.utils.variant_grid import size_sort_key


class StockCountError(ValueError):
    """Contagem recusada (a mensagem é mostrada à pessoa)."""


class StockCountNotFound(StockCountError):
    pass


class StockCountConflict(StockCountError):
    pass


class StockCountService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _load(self, tenant_id: int, count_id: int) -> StockCount:
        count = (await self.db.execute(
            select(StockCount).where(StockCount.id == count_id, StockCount.tenant_id == tenant_id,
                                     StockCount.is_active == True)  # noqa: E712
        )).scalar_one_or_none()
        if count is None:
            raise StockCountNotFound("Conferência não encontrada.")
        return count

    async def save(
        self, *, tenant_id: int, user: User, count_id: Optional[int], name: Optional[str], note: Optional[str],
        category_id: Optional[int], counts: Dict[int, int], finish: bool = False, revision: Optional[int] = None,
    ) -> StockCount:
        existing: Optional[StockCount] = None
        if count_id is not None:
            existing = await self._load(tenant_id, count_id)
            if existing.status == "finished":
                raise StockCountConflict("Esta conferência já foi finalizada e não pode mais mudar.")
            if revision is None or revision != existing.revision:
                raise StockCountConflict(
                    "Outra pessoa salvou esta conferência depois que você a abriu. Atualize a tela para ver os números dela."
                )
            category_id = existing.category_id   # a categoria é a da criação
        if (existing is None or finish) and not counts:
            raise StockCountError("Nenhuma peça foi contada. Conte ao menos uma peça antes de salvar.")

        report = await StockCheckService(self.db).report(tenant_id=tenant_id, category_id=category_id)
        by_variant = {r["variant_id"]: r for r in report["rows"]}
        unknown = [v for v in counts if v not in by_variant]
        if unknown:
            raise StockCountError(
                f"{len(unknown)} peça(s) da contagem não existem mais nesta loja (ou estão fora da categoria escolhida). "
                "Atualize a tela e salve de novo."
            )
        category_name: Optional[str] = None
        if category_id:
            category_name = (await self.db.execute(
                select(Category.name).where(Category.id == category_id, Category.tenant_id == tenant_id)
            )).scalar_one_or_none()
            if category_name is None:
                raise StockCountError("Categoria não encontrada.")

        items: List[StockCountItem] = []
        ok = short = over = system_total = counted_total = 0
        for vid, qty in counts.items():
            r = by_variant[vid]
            diff = qty - r["system_quantity"]
            system_total += r["system_quantity"]
            counted_total += qty
            if diff == 0:
                ok += 1
            elif diff < 0:
                short += -diff
            else:
                over += diff
            items.append(StockCountItem(
                tenant_id=tenant_id, variant_id=vid, product_id=r["product_id"], product_name=r["product_name"][:255],
                category_name=r["category_name"], color=r["color"], size=r["size"], sku=r["sku"],
                display_code=r["display_code"], system_quantity=r["system_quantity"], counted_quantity=qty, difference=diff,
            ))

        summary = dict(
            total_variants=report["total_variants"], counted_variants=len(items), ok_variants=ok,
            diff_variants=len(items) - ok, short_pieces=short, over_pieces=over,
            system_pieces=system_total, counted_pieces=counted_total,
        )
        clean_name = (name or "").strip()[:120] or None
        clean_note = (note or "").strip() or None
        try:
            if existing is None:
                count = StockCount(
                    tenant_id=tenant_id, name=clean_name, note=clean_note, category_id=category_id,
                    category_name=category_name, created_by_id=user.id,
                    created_by_name=(user.full_name or user.email or "")[:120],
                    status="finished" if finish else "open", revision=1,
                    finished_at=datetime.utcnow() if finish else None, **summary,
                )
                self.db.add(count)
                await self.db.flush()
            else:
                count = existing
                await self.db.execute(delete(StockCountItem).where(
                    StockCountItem.count_id == count.id, StockCountItem.tenant_id == tenant_id))
                count.name = clean_name
                count.note = clean_note
                count.category_name = category_name
                count.revision = (count.revision or 1) + 1
                for k, v in summary.items():
                    setattr(count, k, v)
                if finish:
                    count.status = "finished"
                    count.finished_at = datetime.utcnow()
            for it in items:
                it.count_id = count.id
            self.db.add_all(items)
            await self.db.commit()   # tudo ou nada: cabeçalho e itens juntos
        except Exception:
            await self.db.rollback()
            raise
        await self.db.refresh(count)
        return count

    async def list(self, *, tenant_id: int, status: Optional[str] = None, limit: int = 50, offset: int = 0) -> List[StockCount]:
        stmt = select(StockCount).where(StockCount.tenant_id == tenant_id, StockCount.is_active == True)  # noqa: E712
        if status:
            stmt = stmt.where(StockCount.status == status)
        stmt = stmt.order_by((StockCount.status == "open").desc(), StockCount.created_at.desc(), StockCount.id.desc())
        return list((await self.db.execute(stmt.limit(limit).offset(offset))).scalars().all())

    async def total(self, *, tenant_id: int, status: Optional[str] = None) -> int:
        stmt = select(func.count(StockCount.id)).where(StockCount.tenant_id == tenant_id, StockCount.is_active == True)  # noqa: E712
        if status:
            stmt = stmt.where(StockCount.status == status)
        return int((await self.db.execute(stmt)).scalar() or 0)

    async def get(self, *, tenant_id: int, count_id: int, only_diffs: bool = False) -> Optional[Dict[str, Any]]:
        try:
            count = await self._load(tenant_id, count_id)
        except StockCountNotFound:
            return None
        stmt = select(StockCountItem).where(StockCountItem.count_id == count_id, StockCountItem.tenant_id == tenant_id)
        if only_diffs:
            stmt = stmt.where(StockCountItem.difference != 0)
        items = list((await self.db.execute(stmt)).scalars().all())
        items.sort(key=lambda i: (
            (i.category_name or "").casefold(), i.product_name.casefold(), (i.color or "").casefold(), size_sort_key(i.size),
        ))
        return {"count": count, "items": items}
