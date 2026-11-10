"""Etiqueta do verso da tag em PDF (folha A4 adesiva ou rolo da térmica)."""
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db, get_db_unscoped
from app.models.user import User
from app.services.label_pdf_service import DEFAULT_H_MM, DEFAULT_W_MM, MAX_MM, MIN_MM, a4_grid, build_pdf
from app.services import label_queue_service as queue
from app.services.audit_service import AuditService
from app.services.label_print_service import LabelRequestError, labels_for_entry, labels_for_variants

router = APIRouter(prefix="/labels", tags=["Etiquetas"])


class LabelItem(BaseModel):
    variant_id: int
    quantity: int = Field(1, ge=1, le=200)


class LabelOptions(BaseModel):
    layout: Literal["a4", "roll", "sheet"] = "a4"
    start_position: int = Field(1, ge=1, le=100, description="Na folha A4, em que posição começar (pula as já usadas)")
    width_mm: float = Field(DEFAULT_W_MM, ge=MIN_MM, le=MAX_MM, description="Largura do adesivo em mm (47 = 4,7 cm)")
    height_mm: float = Field(DEFAULT_H_MM, ge=MIN_MM, le=MAX_MM, description="Altura do adesivo em mm (42 = 4,2 cm)")


class LabelPdfRequest(LabelOptions):
    items: List[LabelItem] = Field(..., min_length=1)


def _pdf(content: bytes, filename: str) -> Response:
    return Response(content=content, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/sizes", summary="Tamanhos de adesivo e quantas cabem por folha A4")
async def label_sizes(user: User = Depends(get_current_active_user)):
    presets = [
        ("47x42", "4,7 × 4,2 cm (tag 5 × 4,5)", 47, 42), ("50x45", "5 × 4,5 cm (deitada)", 50, 45), ("60x50", "6 × 5 cm (deitada)", 60, 50), ("50x60", "5 × 6 cm (em pé)", 50, 60),
        ("65x55", "6,5 × 5,5 cm (deitada)", 65, 55), ("55x65", "5,5 × 6,5 cm (em pé)", 55, 65),
    ]
    out = []
    for key, name, w, h in presets:
        cols, rows = a4_grid(w, h)
        out.append({"id": key, "name": name, "width_mm": w, "height_mm": h, "per_sheet": cols * rows, "cols": cols, "rows": rows})
    return out


@router.post("/pdf", summary="PDF das etiquetas das peças escolhidas")
async def labels_pdf(
    body: LabelPdfRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        labels = await labels_for_variants(db, tenant_id, [(i.variant_id, i.quantity) for i in body.items])
        content = build_pdf(labels, body.layout, body.start_position, body.width_mm, body.height_mm)
        await db.commit()  # grava números novos só depois do PDF pronto
    except (LabelRequestError, ValueError) as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _pdf(content, f"etiquetas-{body.width_mm:g}x{body.height_mm:g}.pdf")


@router.post("/pdf/entry/{entry_id}", summary="PDF com uma etiqueta por peça recebida na entrada")
async def labels_pdf_entry(
    entry_id: int,
    body: LabelOptions,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        labels, code = await labels_for_entry(db, tenant_id, entry_id)
        content = build_pdf(labels, body.layout, body.start_position, body.width_mm, body.height_mm)
        await db.commit()
    except (LabelRequestError, ValueError) as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _pdf(content, f"etiquetas-{code or entry_id}.pdf")


# ── Fila de etiquetas e histórico de impressão ────────────────────────────────────────────────────────────────────────

class QueueAdd(BaseModel):
    items: List[LabelItem] = Field(..., min_length=1)
    entry_id: int | None = None


class QueueQty(BaseModel):
    quantity: int = Field(..., ge=0, le=1000)


class PrintConfirm(LabelOptions):
    items: List[LabelItem] = Field(..., min_length=1)
    from_queue: bool = False
    entry_id: int | None = None


async def _run(db: AsyncSession, coro):
    try:
        result = await coro
        await db.commit()
        return result
    except (queue.QueueError, LabelRequestError) as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/queue", summary="Etiquetas que estão na fila para imprimir")
async def get_queue(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                    tenant_id: int = Depends(get_current_tenant_id)):
    return await queue.list_queue(db, tenant_id)


@router.post("/queue", summary="Põe peças na fila", status_code=status.HTTP_201_CREATED)
async def add_to_queue(body: QueueAdd, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                       tenant_id: int = Depends(get_current_tenant_id)):
    added = await _run(db, queue.add_items(db, tenant_id, user, [i.model_dump() for i in body.items], body.entry_id))
    return {"added": added}


@router.post("/queue/entry/{entry_id}", summary="Põe na fila o que a entrada ainda não imprimiu", status_code=status.HTTP_201_CREATED)
async def add_entry_to_queue(entry_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                             tenant_id: int = Depends(get_current_tenant_id)):
    return await _run(db, queue.add_entry_missing(db, tenant_id, user, entry_id))


@router.put("/queue/{item_id}", summary="Muda a quantidade de um item da fila (0 tira da fila)")
async def set_queue_quantity(item_id: int, body: QueueQty, db: AsyncSession = Depends(get_db),
                             user: User = Depends(get_current_active_user), tenant_id: int = Depends(get_current_tenant_id)):
    await _run(db, queue.set_quantity(db, tenant_id, item_id, body.quantity))
    return {"ok": True}


@router.get("/entry/{entry_id}/progress", summary="Quantas etiquetas da entrada já foram impressas, estão na fila ou faltam")
async def entry_progress(entry_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                         tenant_id: int = Depends(get_current_tenant_id)):
    return await _run(db, queue.entry_progress(db, tenant_id, entry_id))


@router.get("/print-state", summary="Posição em que a próxima impressão começa e o que já está na folha atual")
async def print_state(layout: Literal["a4", "roll", "sheet"] = "sheet", width_mm: float = DEFAULT_W_MM, height_mm: float = DEFAULT_H_MM,
                      db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                      tenant_id: int = Depends(get_current_tenant_id)):
    return await queue.print_state(db, tenant_id, layout, width_mm, height_mm, user)


@router.post("/prints", summary="Salvar impressão: o que saiu, tira da fila e anda a folha", status_code=status.HTTP_201_CREATED)
async def save_print(body: PrintConfirm, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                     tenant_id: int = Depends(get_current_tenant_id)):
    result = await _run(db, queue.confirm_print(db, tenant_id, user, body.layout, body.width_mm, body.height_mm, body.start_position,
                                                [i.model_dump() for i in body.items], body.from_queue, body.entry_id))
    await AuditService.log(db, "LABEL_PRINT_SAVED", tenant_id=tenant_id, user_id=getattr(user, "id", None),
                           user_email=getattr(user, "email", None), entity="label_print", entity_id=result["id"],
                           detail={"etiquetas": result["total"], "papel": body.layout, "medida": f"{body.width_mm:g}x{body.height_mm:g}",
                                   "da_fila": body.from_queue})
    await db.commit()
    return result


@router.get("/prints/recent", summary="Os 3 últimos PDFs gerados")
async def recent_prints(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                        tenant_id: int = Depends(get_current_tenant_id)):
    return await queue.recent_jobs(db, tenant_id)


@router.get("/prints/{job_id}/pdf", summary="Abre de novo o PDF de uma das 3 últimas impressões (não salva nada)")
async def reopen_print_pdf(job_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                           tenant_id: int = Depends(get_current_tenant_id)):
    """Refaz o PDF com as mesmas peças, quantidades, papel e posição da impressão salva. Só leitura: não mexe em fila nem em folha."""
    try:
        job = await queue.get_recent_job(db, tenant_id, job_id)
        content = await _render_job_pdf(db, tenant_id, job)
        fname = queue.pdf_filename(job)
        await db.rollback()   # leitura pura: nada a gravar
    except (queue.QueueError, LabelRequestError, ValueError) as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _pdf(content, fname)


async def _render_job_pdf(db: AsyncSession, tenant_id: int, job) -> bytes:
    wanted: dict[int, int] = {}
    for it in job.items or []:
        wanted[int(it["variant_id"])] = wanted.get(int(it["variant_id"]), 0) + int(it["quantity"])
    labels = await labels_for_variants(db, tenant_id, list(wanted.items()))
    return build_pdf(labels, job.layout, job.start_position, job.width_mm, job.height_mm)


@router.post("/prints/pdf", summary="Imprimir: salva a impressão (tira da fila e anda a folha) e devolve o link https do PDF")
async def print_pdf(body: PrintConfirm, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                    tenant_id: int = Depends(get_current_tenant_id)):
    """Gerar o PDF = imprimir. Tudo ou nada: se o PDF não sai, nada é gravado; se a fila mudou, nada é gravado e a pessoa atualiza.

    Devolve um link https comum para o PDF (não um blob: do navegador), que o WhatsApp e o app da impressora conseguem abrir.
    """
    try:
        await queue.lock_queue(db, tenant_id)
        items = [i.model_dump() for i in body.items]
        # Toda impressão começa na PRIMEIRA posição de uma folha nova, sempre. Antes continuava a folha da impressão anterior e saía
        # com os primeiros espaços em branco quando a folha já tinha sido trocada (foto de 10/11/2026). Automático e sem escolha.
        start = 1
        labels = await labels_for_variants(db, tenant_id, [(i["variant_id"], i["quantity"]) for i in items])
        build_pdf(labels, body.layout, start, body.width_mm, body.height_mm)   # confere que o PDF sai ANTES de gravar
        result = await queue.confirm_print(db, tenant_id, user, body.layout, body.width_mm, body.height_mm, start,
                                           items, body.from_queue, body.entry_id)
        await AuditService.log(db, "LABEL_PRINT_SAVED", tenant_id=tenant_id, user_id=getattr(user, "id", None),
                               user_email=getattr(user, "email", None), entity="label_print", entity_id=result["id"],
                               detail={"etiquetas": result["total"], "papel": body.layout, "medida": f"{body.width_mm:g}x{body.height_mm:g}",
                                       "da_fila": body.from_queue})
        job = await queue.get_recent_job(db, tenant_id, result["id"])
        out = {**result, "filename": queue.pdf_filename(job), "url": queue.pdf_link(job)}
        await db.commit()
    except (queue.QueueError, LabelRequestError, ValueError) as e:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return out


@router.post("/prints/{job_id}/undo", summary="Não saiu: desfaz a última impressão salva (volta para a fila)")
async def undo_print(job_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_user),
                     tenant_id: int = Depends(get_current_tenant_id)):
    result = await _run(db, queue.undo_print(db, tenant_id, user, job_id))
    await AuditService.log(db, "LABEL_PRINT_UNDONE", tenant_id=tenant_id, user_id=getattr(user, "id", None),
                           user_email=getattr(user, "email", None), entity="label_print", entity_id=job_id,
                           detail={"etiquetas": result["returned"]})
    await db.commit()
    return result


# ── Link público do PDF (sem login: o token assinado na URL é a permissão) ────────────────────────────────────────────

public_router = APIRouter(prefix="/public", tags=["Etiquetas (link do PDF)"])


@public_router.get("/label-files/{token}/{filename}", include_in_schema=False)
async def public_label_pdf(token: str, filename: str, db: AsyncSession = Depends(get_db_unscoped)):
    """PDF de uma das 3 últimas impressões, num link https comum (o que o iPhone compartilha de verdade).

    O token é assinado pelo servidor; só abre enquanto a impressão for uma das 3 últimas; o nome no fim do endereço só dá nome ao arquivo.
    """
    try:
        job_id, tenant_id = queue.read_file_token(token)
        job = await queue.get_recent_job(db, tenant_id, job_id)
        content = await _render_job_pdf(db, tenant_id, job)
        fname = queue.pdf_filename(job)
        await db.rollback()
    except (queue.QueueError, LabelRequestError, ValueError):
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF não encontrado ou vencido.")
    return Response(content=content, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{fname}"', "Cache-Control": "private, max-age=300"})
