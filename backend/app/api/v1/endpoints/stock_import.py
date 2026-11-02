"""Importação de estoque por planilha (gerente e admin): modelo, conferência (preview) e gravação tudo-ou-nada."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_tenant_id
from app.core.database import get_db
from app.models.user import User
from app.services.stock_import_service import StockImportError, StockImportService, read_table, template_xlsx

router = APIRouter(prefix="/stock-import", tags=["Importação de estoque"])

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_TEXT_CHARS = 2_000_000


async def _table(file: Optional[UploadFile], text: str):
    try:
        if file is not None and file.filename:
            raw = await file.read(MAX_FILE_BYTES + 1)
            if len(raw) > MAX_FILE_BYTES:
                raise StockImportError("O arquivo passa de 5 MB. Divida a planilha em partes.")
            return read_table(file_bytes=raw, filename=file.filename)
        if len(text or "") > MAX_TEXT_CHARS:
            raise StockImportError("Texto grande demais. Divida a planilha em partes.")
        return read_table(text_=text)
    except StockImportError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


def _day(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Data inválida. Use o formato AAAA-MM-DD.")


@router.get("/template", summary="Modelo da planilha (Excel)")
async def template(current_user: User = Depends(get_current_active_user)):
    return Response(
        content=template_xlsx(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="modelo-estoque-provador.xlsx"'},
    )


@router.post("/preview", summary="Conferir a planilha sem gravar nada")
async def preview(
    file: Optional[UploadFile] = File(None),
    text: str = Form(""),
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    table = await _table(file, text)
    return await StockImportService(db).preview(tenant_id, table)


@router.post("/commit", summary="Importar: grava tudo ou nada")
async def commit(
    file: Optional[UploadFile] = File(None),
    text: str = Form(""),
    entry_date: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    table = await _table(file, text)
    try:
        return await StockImportService(db).commit(tenant_id, table, entry_date=_day(entry_date))
    except StockImportError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
