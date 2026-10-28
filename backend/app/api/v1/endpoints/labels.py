"""Etiqueta do verso da tag em PDF (folha A4 adesiva ou rolo da térmica)."""
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.services.label_pdf_service import MAX_MM, MIN_MM, a4_grid, build_pdf
from app.services.label_print_service import LabelRequestError, labels_for_entry, labels_for_variants

router = APIRouter(prefix="/labels", tags=["Etiquetas"])


class LabelItem(BaseModel):
    variant_id: int
    quantity: int = Field(1, ge=1, le=200)


class LabelOptions(BaseModel):
    layout: Literal["a4", "roll"] = "a4"
    start_position: int = Field(1, ge=1, le=100, description="Na folha A4, em que posição começar (pula as já usadas)")
    width_mm: float = Field(65, ge=MIN_MM, le=MAX_MM, description="Largura do adesivo (65 = 6,5 cm)")
    height_mm: float = Field(55, ge=MIN_MM, le=MAX_MM, description="Altura do adesivo (55 = 5,5 cm)")


class LabelPdfRequest(LabelOptions):
    items: List[LabelItem] = Field(..., min_length=1)


def _pdf(content: bytes, filename: str) -> Response:
    return Response(content=content, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/sizes", summary="Tamanhos de adesivo e quantas cabem por folha A4")
async def label_sizes(user: User = Depends(get_current_active_user)):
    presets = [("65x55", "6,5 × 5,5 cm (deitada)", 65, 55), ("55x65", "5,5 × 6,5 cm (em pé)", 55, 65)]
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
