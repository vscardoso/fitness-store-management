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

from sqlalchemy import delete, func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.stock_count import StockCount, StockCountItem
from app.models.stock_entry import StockEntry
from app.models.user import User
from app.services.stock_check_service import StockCheckService
from app.services.stock_lock import lock_receipt_check
from app.utils.variant_grid import size_sort_key


class StockCountError(ValueError):
    """Contagem recusada (a mensagem é mostrada à pessoa)."""


class StockCountNotFound(StockCountError):
    pass


KEEP_BATCHES = 60


class StockCountConflict(StockCountError):
    pass


def _who(user: User) -> str:
    return (user.full_name or user.email or "")[:120]


def _summarize(items, total_variants: int) -> Dict[str, int]:
    ok = short = over = system_total = counted_total = 0
    for it in items:
        diff = it.counted_quantity - it.system_quantity
        system_total += it.system_quantity
        counted_total += it.counted_quantity
        if diff == 0:
            ok += 1
        elif diff < 0:
            short += -diff
        else:
            over += diff
    return dict(total_variants=total_variants, counted_variants=len(items), ok_variants=ok,
                diff_variants=len(items) - ok, short_pieces=short, over_pieces=over,
                system_pieces=system_total, counted_pieces=counted_total)


def _follow(item: StockCountItem, live: int) -> bool:
    """Acompanha o estoque que mudou DEPOIS da bipada (venda, condicional, devolução, entrada) numa conferência aberta.

    O "sistema" da peça passa a ser o estoque de agora. Saída (venda) primeiro sai das peças que ainda não foram
    bipadas; só o que passar delas desconta da contagem (a peça bipada foi vendida e não está mais na prateleira).
    Entrada não soma na contagem: a peça nova aparece como "falta" até alguém bipar.
    """
    sys_q = item.system_quantity
    if live == sys_q:
        return False
    if live < sys_q:
        not_scanned = max(0, sys_q - item.counted_quantity)
        item.counted_quantity = max(0, item.counted_quantity - max(0, (sys_q - live) - not_scanned))
    item.system_quantity = live
    item.difference = item.counted_quantity - live
    return True


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

    async def _follow_stock(self, tenant_id: int, count: StockCount, items) -> bool:
        """Conferência aberta: põe cada peça contada em dia com o estoque de agora (ver `_follow`). True se mudou algo."""
        items = list(items)
        if count.status != "open" or not items or count.entry_id:
            return False   # conferência de entrada: o "sistema" é o que a nota trouxe, não muda com venda
        live = await StockCheckService(self.db).quantities(tenant_id=tenant_id, variant_ids=[i.variant_id for i in items])
        changed = False
        for it in items:
            if it.variant_id is not None and _follow(it, live.get(it.variant_id, 0)):
                changed = True
        if changed:
            for k, v in _summarize(items, count.total_variants or 0).items():
                if k != "total_variants" or v:
                    setattr(count, k, v)
            count.revision = (count.revision or 1) + 1
        return changed

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
        if existing is None:
            # uma conferência só por loja: com uma em andamento, todo mundo conta nela (não abre outra em paralelo)
            aberta = (await self.db.execute(select(StockCount.id, StockCount.name).where(
                StockCount.tenant_id == tenant_id, StockCount.is_active == True,  # noqa: E712
                StockCount.entry_id.is_(None), StockCount.status == "open").limit(1))).first()
            if aberta:
                raise StockCountConflict(
                    f"Já existe uma conferência em andamento{(' (' + aberta.name + ')') if aberta.name else ''}. "
                    f"Entre nela para contar junto [#{aberta.id}]."
                )
        # começar vazia é permitido (conferência compartilhada: a 1ª bipada já cria e os outros aparelhos entram);
        # finalizar vazia não
        if finish and not counts:
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
                counted_by_name=_who(user),
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

    async def apply(
        self, *, tenant_id: int, user: User, count_id: int, ops: List[Dict[str, Any]],
        name: Optional[str] = None, note: Optional[str] = None, finish: bool = False, revision: Optional[int] = None,
        batch_id: Optional[str] = None,
    ) -> StockCount:
        """Conferência compartilhada: aplica as bipadas de um aparelho na conferência em andamento, sem apagar as dos outros.

        Cada operação é sobre UMA peça: `delta` (+1 ao bipar, -1 na seta), `set` (quantidade digitada) ou `clear`
        (volta a "não contada"). A linha da conferência é travada durante a gravação, então duas pessoas bipando a mesma
        peça ao mesmo tempo somam as duas. `finish` fecha a conferência (vira relatório e não muda mais).
        """
        count = (await self.db.execute(
            select(StockCount).where(StockCount.id == count_id, StockCount.tenant_id == tenant_id,
                                     StockCount.is_active == True).with_for_update()  # noqa: E712
            # populate_existing: se a conferência já foi carregada nesta sessão (ex.: `open_for_entry`), relê o valor de AGORA
            # (depois da trava). Sem isso a `revision` ficava velha e dois lotes simultâneos gravavam o mesmo número.
            .execution_options(populate_existing=True)
        )).scalar_one_or_none()
        if count is None:
            raise StockCountNotFound("Conferência não encontrada.")
        if count.status == "finished":
            raise StockCountConflict("Esta conferência já foi finalizada por outra pessoa e não pode mais mudar.")
        if finish and (ops or revision is None or revision != count.revision):
            # só finaliza quem está vendo a conferência inteira e atualizada: nada pendente deste aparelho e
            # nenhuma contagem nova de outra pessoa depois da última atualização da tela
            raise StockCountConflict(
                "Chegaram contagens novas de outra pessoa. A tela foi atualizada: confira os números e finalize de novo."
            )
        recent = list(count.recent_batches or [])
        if batch_id and batch_id in recent:
            # lote já aplicado (o aparelho reenviou depois de uma falha de rede): não conta de novo
            await self.db.rollback()
            await self.db.refresh(count)
            return count
        try:
            items = {i.variant_id: i for i in (await self.db.execute(select(StockCountItem).where(
                StockCountItem.count_id == count.id, StockCountItem.tenant_id == tenant_id))).scalars().all()}
            if await self._follow_stock(tenant_id, count, items.values()) and finish:
                # vendeu ou entrou peça desde a última atualização da tela: grava e pede para conferir de novo
                await self.db.commit()
                raise StockCountConflict(
                    "O estoque mudou (venda ou entrada) enquanto você conferia. A tela foi atualizada: "
                    "confira os números e finalize de novo."
                )
            report = None
            who = _who(user)
            for op in ops:
                vid = int(op["variant_id"])
                item = items.get(vid)
                if op.get("clear"):
                    if item is not None:
                        if inspect(item).pending:
                            self.db.expunge(item)   # criada neste mesmo lote e ainda não gravada: só descarta
                        else:
                            await self.db.delete(item)
                        items.pop(vid)
                    continue
                if item is None:
                    if report is None:
                        report = {r["variant_id"]: r for r in (await self._scope(tenant_id, count))["rows"]}
                    r = report.get(vid)
                    if r is None and count.entry_id:
                        # peça lida que não é desta entrada: entra com "sistema" 0 e aparece como "fora da entrada"
                        r = (await StockCheckService(self.db).variant_rows(tenant_id=tenant_id, variant_ids=[vid])).get(vid)
                    if r is None:
                        raise StockCountError("Esta peça não existe mais nesta loja (ou está fora da categoria da conferência). "
                                              "Atualize a tela.")
                    item = StockCountItem(
                        tenant_id=tenant_id, count_id=count.id, variant_id=vid, product_id=r["product_id"],
                        product_name=r["product_name"][:255], category_name=r["category_name"], color=r["color"],
                        size=r["size"], sku=r["sku"], display_code=r["display_code"], system_quantity=r["system_quantity"],
                        counted_quantity=0, difference=0,
                    )
                    self.db.add(item)
                    items[vid] = item
                    base = 0
                else:
                    base = item.counted_quantity
                new = int(op["set"]) if op.get("set") is not None else base + int(op.get("delta") or 0)
                item.counted_quantity = max(0, min(new, 1_000_000))
                item.difference = item.counted_quantity - item.system_quantity
                item.counted_by_name = who
            if finish and not items:
                raise StockCountError("Nenhuma peça foi contada. Conte ao menos uma peça antes de finalizar.")
            await self.db.flush()
            total_variants = count.total_variants
            if not total_variants:
                total_variants = (await self._scope(tenant_id, count))["total_variants"]
            for k, v in _summarize(items.values(), total_variants).items():
                setattr(count, k, v)
            if name is not None:
                count.name = name.strip()[:120] or None
            if note is not None:
                count.note = note.strip() or None
            if batch_id:
                recent.append(batch_id)
                count.recent_batches = recent[-KEEP_BATCHES:]
            count.revision = (count.revision or 1) + 1
            if finish:
                count.status = "finished"
                count.finished_at = datetime.utcnow()
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        await self.db.refresh(count)
        return count

    async def _scope(self, tenant_id: int, count: StockCount) -> Dict[str, Any]:
        """As peças que a conferência cobre e o "sistema" de cada uma: a loja/categoria, ou as peças de UMA entrada."""
        if count.entry_id:
            return await StockCheckService(self.db).entry_report(tenant_id=tenant_id, entry_id=count.entry_id)
        return await StockCheckService(self.db).report(tenant_id=tenant_id, category_id=count.category_id)

    async def find_for_entry(self, *, tenant_id: int, entry_id: int) -> Optional[StockCount]:
        return (await self.db.execute(
            select(StockCount).where(StockCount.tenant_id == tenant_id, StockCount.entry_id == entry_id,
                                     StockCount.is_active == True, StockCount.status == "open")  # noqa: E712
            .order_by(StockCount.id.desc()).limit(1)
        )).scalar_one_or_none()

    async def open_for_entry(self, *, tenant_id: int, user: User, entry_id: int) -> StockCount:
        """Conferir recebimento: a conferência em andamento da entrada (a 1ª bipada de qualquer pessoa a cria; as outras entram nela)."""
        entry = (await self.db.execute(
            select(StockEntry).where(StockEntry.id == entry_id, StockEntry.tenant_id == tenant_id,
                                     StockEntry.is_active == True)  # noqa: E712
        )).scalar_one_or_none()
        if entry is None:
            raise StockCountNotFound("Entrada não encontrada.")
        await lock_receipt_check(self.db, entry_id)   # duas pessoas bipando ao mesmo tempo não criam duas conferências
        count = await self.find_for_entry(tenant_id=tenant_id, entry_id=entry_id)
        if count is not None:
            return count
        try:
            count = StockCount(
                tenant_id=tenant_id, entry_id=entry_id, name=f"Recebimento {entry.entry_code}"[:120], status="open", revision=1,
                created_by_id=user.id, created_by_name=_who(user),
                total_variants=0, counted_variants=0, ok_variants=0, diff_variants=0, short_pieces=0, over_pieces=0,
                system_pieces=0, counted_pieces=0, recent_batches=[],
            )
            self.db.add(count)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        await self.db.refresh(count)
        return count

    async def discard(self, *, tenant_id: int, count_id: int) -> None:
        """Apaga a conferência EM ANDAMENTO para recomeçar do zero (exclusão lógica). Os aparelhos que contavam nela
        recebem 404 e limpam a tela sozinhos. Conferência finalizada é relatório: não se apaga por aqui."""
        count = (await self.db.execute(
            select(StockCount).where(StockCount.id == count_id, StockCount.tenant_id == tenant_id,
                                     StockCount.is_active == True).with_for_update()  # noqa: E712
        )).scalar_one_or_none()
        if count is None:
            raise StockCountNotFound("Conferência não encontrada.")
        if count.status != "open":
            raise StockCountConflict("Conferência finalizada não pode ser apagada.")
        count.is_active = False
        await self.db.commit()

    async def list(self, *, tenant_id: int, status: Optional[str] = None, limit: int = 50, offset: int = 0) -> List[StockCount]:
        stmt = select(StockCount).where(StockCount.tenant_id == tenant_id, StockCount.is_active == True,  # noqa: E712
                                        StockCount.entry_id.is_(None))   # conferência de recebimento tem a tela dela
        if status:
            stmt = stmt.where(StockCount.status == status)
        stmt = stmt.order_by((StockCount.status == "open").desc(), StockCount.created_at.desc(), StockCount.id.desc())
        return list((await self.db.execute(stmt.limit(limit).offset(offset))).scalars().all())

    async def total(self, *, tenant_id: int, status: Optional[str] = None) -> int:
        stmt = select(func.count(StockCount.id)).where(StockCount.tenant_id == tenant_id, StockCount.is_active == True,  # noqa: E712
                                                       StockCount.entry_id.is_(None))
        if status:
            stmt = stmt.where(StockCount.status == status)
        return int((await self.db.execute(stmt)).scalar() or 0)

    async def get(self, *, tenant_id: int, count_id: int, only_diffs: bool = False) -> Optional[Dict[str, Any]]:
        try:
            count = await self._load(tenant_id, count_id)
        except StockCountNotFound:
            return None
        if count.status == "open" and not count.entry_id:
            # venda/entrada feita durante a conferência entra na hora (trava a conferência só enquanto confere)
            count = (await self.db.execute(
                select(StockCount).where(StockCount.id == count_id).with_for_update().execution_options(populate_existing=True)
            )).scalar_one()
            all_items = (await self.db.execute(select(StockCountItem).where(
                StockCountItem.count_id == count_id, StockCountItem.tenant_id == tenant_id))).scalars().all()
            try:
                await self._follow_stock(tenant_id, count, all_items)
                await self.db.commit()   # sem mudança, só solta a trava
                await self.db.refresh(count)
            except Exception:
                await self.db.rollback()
                raise
        stmt = select(StockCountItem).where(StockCountItem.count_id == count_id, StockCountItem.tenant_id == tenant_id)
        if only_diffs:
            stmt = stmt.where(StockCountItem.difference != 0)
        items = list((await self.db.execute(stmt)).scalars().all())
        items.sort(key=lambda i: (
            (i.category_name or "").casefold(), i.product_name.casefold(), (i.color or "").casefold(), size_sort_key(i.size),
        ))
        return {"count": count, "items": items}
