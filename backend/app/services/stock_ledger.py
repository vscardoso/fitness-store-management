"""Livro de movimentos do estoque por lote (`entry_item_events`).

Regra: TODA mudança em `entry_items.quantity_remaining` grava um registro com o saldo antes e depois, o motivo e quem fez. O
registro é feito por um gancho do SQLAlchemy (`after_flush`), então vale para qualquer caminho que mexa no item pelo ORM
(venda, devolução, baixa, ajuste, exclusão...), inclusive os que forem escritos no futuro. Só um UPDATE em massa escrito à mão
escapa do gancho: por isso `reconcile` compara o saldo de cada lote com o último registro e acusa qualquer diferença.

O motivo vem do contexto: quem mexe no estoque embrulha o trecho em `with stock_reason("venda", user_id=..., ref="sale:12")`.
Sem motivo o registro sai como `sem_motivo` (nunca derruba a venda em produção); nos testes (`STOCK_LEDGER_STRICT=1`) vira erro,
para a falha aparecer antes de ir ao ar.
"""
import functools
import logging
import os
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import event, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, attributes

from app.models.entry_item import EntryItem
from app.models.entry_item_event import EntryItemEvent

logger = logging.getLogger(__name__)

# motivo -> como aparece na conta do lote
REASONS: Dict[str, str] = {
    "entrada": "Entrada do lote",
    "venda": "Venda",
    "cancelamento_venda": "Venda cancelada (voltou ao estoque)",
    "devolucao": "Devolução da cliente (voltou ao estoque)",
    "troca_saida": "Saída por troca",
    "condicional_envio": "Enviada em condicional",
    "condicional_volta": "Voltou do condicional",
    "baixa_conferencia": "Baixa pela Conferência",
    "variacao_excluida": "Baixa ao excluir a variação",
    "produto_excluido": "Baixa ao excluir o produto",
    "entrada_excluida": "Baixa ao excluir a entrada",
    "ajuste_estoque": "Ajuste manual de estoque",
    "fornecedor_envio": "Saiu para devolução ao fornecedor",
    "fornecedor_volta": "Voltou da devolução ao fornecedor",
    "edicao_item": "Correção do item da entrada",
    "peca_juntada": "Peças juntadas de outra variação",
    "baixa_sem_registro": "Saída sem registro na hora (refeita depois)",
    "saldo_inicial": "Saldo no começo do livro",
    "sem_motivo": "SEM MOTIVO (falha de programa)",
}
# o que conta como "saiu sem ser venda" na conta fechada do lote
REMOVAL_REASONS = {"baixa_conferencia", "variacao_excluida", "produto_excluido", "entrada_excluida", "ajuste_estoque",
                   "baixa_sem_registro", "edicao_item"}

_ctx: ContextVar[Optional[Dict[str, Any]]] = ContextVar("stock_reason_ctx", default=None)


@contextmanager
def stock_reason(reason: str, *, user_id: Optional[int] = None, ref: Optional[str] = None, note: Optional[str] = None):
    """Diz por que o estoque dos lotes vai mudar dentro deste bloco."""
    if reason not in REASONS:
        raise ValueError(f"Motivo de estoque desconhecido: {reason}")
    token = _ctx.set({"reason": reason, "user_id": user_id, "ref": ref, "note": note})
    try:
        yield
    finally:
        _ctx.reset(token)


def with_stock_reason(reason: str):
    """Decorador para um método async inteiro que mexe no estoque dos lotes (ex.: corrigir ou editar item da entrada)."""
    def deco(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            with stock_reason(reason, user_id=kwargs.get("user_id")):
                return await fn(*args, **kwargs)
        return wrapper
    return deco


def _strict() -> bool:
    return os.environ.get("STOCK_LEDGER_STRICT") == "1"


def _called_from_app() -> bool:
    """True se o código do programa (pasta app/) está na pilha: nos testes, quem simula venda escrevendo direto no banco não conta."""
    import sys
    marker = f"{os.sep}app{os.sep}"
    f = sys._getframe(1)
    while f is not None:
        name = f.f_code.co_filename
        if marker in name and "site-packages" not in name and not name.endswith("stock_ledger.py"):
            return True
        f = f.f_back
    return False


def _current() -> Dict[str, Any]:
    c = _ctx.get()
    if c:
        return c
    if _strict() and _called_from_app():
        raise RuntimeError("Estoque mexido sem motivo: embrulhe o trecho em `with stock_reason(...)` (app/services/stock_ledger.py)")
    logger.error("Estoque mexido sem motivo (sem_motivo). Veja o traceback do chamador.", stack_info=True)
    return {"reason": "sem_motivo", "user_id": None, "ref": None, "note": None}


def _row(item: EntryItem, before: int, after: int, c: Dict[str, Any], note: Optional[str] = None) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    return dict(
        created_at=now, updated_at=now, is_active=True, tenant_id=item.tenant_id, entry_item_id=item.id,
        variant_id=item.variant_id, product_id=item.product_id, reason=c["reason"], delta=after - before, before=before,
        after=after, user_id=c.get("user_id"), ref=c.get("ref"), note=note or c.get("note"), reconstructed=False,
    )


@event.listens_for(Session, "after_flush")
def _record_stock_events(session: Session, flush_context) -> None:
    rows: List[Dict[str, Any]] = []
    for obj in list(session.new):
        if isinstance(obj, EntryItem):
            after = int(obj.quantity_remaining or 0)
            c = {"reason": "entrada", "user_id": (_ctx.get() or {}).get("user_id"), "ref": (_ctx.get() or {}).get("ref"), "note": None}
            rows.append(_row(obj, 0, after, c))
    for obj in list(session.dirty):
        if not isinstance(obj, EntryItem):
            continue
        hist = attributes.get_history(obj, "quantity_remaining")
        if not hist.has_changes():
            continue
        after = int(obj.quantity_remaining or 0)
        if hist.deleted:
            before, note = int(hist.deleted[0]), None
        else:
            before, note = after, "saldo anterior desconhecido"
        if before == after and note is None:
            continue
        rows.append(_row(obj, before, after, _current(), note))
    if rows:
        session.connection().execute(insert(EntryItemEvent.__table__), rows)


async def reconcile(db: AsyncSession, tenant_id: int, *, entry_id: Optional[int] = None) -> Dict[str, Any]:
    """Compara o saldo de cada lote com o último registro do livro e resume por motivo.

    `untracked`: lotes cujo saldo de agora é diferente do último "depois" (mudou sem registro).
    `no_history`: lotes sem nenhum registro (anteriores ao livro: rodar `scripts/ledger_backfill.py`).
    """
    last_id = (
        select(EntryItemEvent.entry_item_id, func.max(EntryItemEvent.id).label("mid"))
        .where(EntryItemEvent.tenant_id == tenant_id)
        .group_by(EntryItemEvent.entry_item_id)
        .subquery()
    )
    q = (
        select(EntryItem.id, EntryItem.variant_id, EntryItem.quantity_received, EntryItem.quantity_remaining,
               EntryItem.is_active, EntryItemEvent.after)
        .outerjoin(last_id, last_id.c.entry_item_id == EntryItem.id)
        .outerjoin(EntryItemEvent, EntryItemEvent.id == last_id.c.mid)
        .where(EntryItem.tenant_id == tenant_id)
    )
    if entry_id is not None:
        q = q.where(EntryItem.entry_id == entry_id)
    untracked, no_history = [], []
    checked = 0
    for item_id, variant_id, received, remaining, active, last_after in (await db.execute(q)).all():
        checked += 1
        if last_after is None:
            no_history.append(item_id)
        elif int(last_after) != int(remaining):
            untracked.append({"entry_item_id": item_id, "variant_id": variant_id, "ledger": int(last_after),
                              "actual": int(remaining), "difference": int(remaining) - int(last_after)})
    qr = (
        select(EntryItemEvent.reason, func.sum(EntryItemEvent.delta), func.count(EntryItemEvent.id))
        .where(EntryItemEvent.tenant_id == tenant_id).group_by(EntryItemEvent.reason)
    )
    if entry_id is not None:
        qr = qr.where(EntryItemEvent.entry_item_id.in_(select(EntryItem.id).where(EntryItem.entry_id == entry_id)))
    by_reason = {r: {"label": REASONS.get(r, r), "pieces": int(s or 0), "events": int(n)} for r, s, n in (await db.execute(qr)).all()}
    return {"checked": checked, "untracked": untracked, "no_history": no_history, "by_reason": by_reason,
            "ok": not untracked and not by_reason.get("sem_motivo")}
