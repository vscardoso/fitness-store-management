"""
Endpoints de gerenciamento de impressoras de etiqueta e jobs de impressão.

Impressora suportada: Elgin L42 Pro (ZPL II, USB/Ethernet/Serial)
Etiqueta padrão: 55mm × 65mm

Endpoints:
    Impressoras:
        GET    /label-printers/              — listar impressoras do tenant
        GET    /label-printers/default       — impressora padrão
        POST   /label-printers/              — cadastrar impressora
        PUT    /label-printers/{id}          — atualizar impressora
        DELETE /label-printers/{id}          — desativar impressora
        POST   /label-printers/{id}/test     — imprimir etiqueta de teste

    Jobs de Impressão:
        POST   /label-printers/print         — imprimir uma variante
        POST   /label-printers/print/batch   — imprimir múltiplas variantes
        GET    /label-printers/print/jobs    — histórico de jobs
        GET    /label-printers/print/preview — ver ZPL sem imprimir
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_tenant_id, require_role
from app.models.user import User, UserRole
from app.models.print_job import PrintJobStatus
from app.schemas.label_printer import (
    LabelPrinterCreate,
    LabelPrinterUpdate,
    LabelPrinterResponse,
    LabelPrinterListResponse,
    PrinterTestResponse,
    PrintJobCreate,
    PrintJobBatchCreate,
    PrintJobResponse,
    PrintJobListResponse,
    ZplPreviewResponse,
)
from app.services.print_job_service import print_job_service

router = APIRouter(prefix="/label-printers", tags=["Etiquetas e Impressão"])


# ============================================================================
# IMPRESSORAS
# ============================================================================


@router.get(
    "/",
    response_model=LabelPrinterListResponse,
    summary="Listar impressoras de etiqueta",
)
async def list_printers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    printers = await print_job_service.list_printers(db, tenant_id)
    return LabelPrinterListResponse(items=printers, total=len(printers))


@router.get(
    "/default",
    response_model=Optional[LabelPrinterResponse],
    summary="Impressora padrão do tenant",
)
async def get_default_printer(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    return await print_job_service.get_default_printer(db, tenant_id)


@router.post(
    "/",
    response_model=LabelPrinterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar impressora de etiqueta",
)
async def create_printer(
    data: LabelPrinterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        printer = await print_job_service.create_printer(db, data.model_dump(), tenant_id)
        await db.commit()
        return printer
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put(
    "/{printer_id}",
    response_model=LabelPrinterResponse,
    summary="Atualizar impressora",
)
async def update_printer(
    printer_id: int,
    data: LabelPrinterUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        printer = await print_job_service.update_printer(
            db, printer_id, data.model_dump(exclude_none=True), tenant_id
        )
        await db.commit()
        return printer
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete(
    "/{printer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Desativar impressora",
)
async def delete_printer(
    printer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        await print_job_service.delete_printer(db, printer_id, tenant_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/{printer_id}/test",
    response_model=PrinterTestResponse,
    summary="Testar conexão com impressora (imprime etiqueta de teste)",
)
async def test_printer(
    printer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        success, message = await print_job_service.test_printer(db, printer_id, tenant_id)
        return PrinterTestResponse(success=success, message=message, printer_id=printer_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============================================================================
# JOBS DE IMPRESSÃO
# ============================================================================


@router.post(
    "/print",
    response_model=PrintJobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Imprimir etiqueta de produto",
    description=(
        "Gera ZPL para o verso da etiqueta (lado com QR code + dados da peça) "
        "e envia para a impressora Elgin L42 Pro via Ethernet/USB/Serial."
    ),
)
async def print_label(
    data: PrintJobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        job = await print_job_service.create_and_print(db, data, tenant_id)
        await db.commit()
        return job
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/print/batch",
    response_model=PrintJobListResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Imprimir etiquetas em lote (múltiplas variantes)",
)
async def print_labels_batch(
    data: PrintJobBatchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        jobs = await print_job_service.create_batch_and_print(db, data, tenant_id)
        await db.commit()
        return PrintJobListResponse(items=jobs, total=len(jobs))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/print/jobs",
    response_model=PrintJobListResponse,
    summary="Histórico de jobs de impressão",
)
async def list_print_jobs(
    status_filter: Optional[PrintJobStatus] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    jobs = await print_job_service.list_jobs(db, tenant_id, status=status_filter, limit=limit)
    return PrintJobListResponse(items=jobs, total=len(jobs))


@router.get(
    "/print/preview",
    response_model=ZplPreviewResponse,
    summary="Visualizar ZPL sem imprimir (debug)",
)
async def preview_zpl(
    variant_id: int = Query(...),
    product_id: int = Query(...),
    printer_id: Optional[int] = Query(None),
    show_price: bool = Query(True),
    show_sku: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: int = Depends(get_current_tenant_id),
):
    try:
        result = await print_job_service.get_zpl_preview(
            db=db,
            variant_id=variant_id,
            product_id=product_id,
            printer_id=printer_id,
            tenant_id=tenant_id,
            show_price=show_price,
            show_sku=show_sku,
        )
        return ZplPreviewResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
