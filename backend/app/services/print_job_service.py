"""
Serviço de orquestração de jobs de impressão.

Fluxo:
  1. Recebe PrintJobCreate do endpoint
  2. Carrega produto + variante do DB
  3. Gera conteúdo via LabelService (str para ZPL/CPCL, bytes para ESC/POS)
  4. Envia para impressora via PrinterService
  5. Salva PrintJob com status (done / error)
"""
from __future__ import annotations

import logging
from typing import List, Optional, Union

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.label_printer import LabelPrinter
from app.models.print_job import PrintJob, PrintJobStatus
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.schemas.label_printer import PrintJobCreate, PrintJobBatchCreate, PrintJobResponse
from app.services.label_service import label_service
from app.services.printer_service import printer_service

logger = logging.getLogger(__name__)


class PrintJobService:

    async def create_and_print(
        self,
        db: AsyncSession,
        data: PrintJobCreate,
        tenant_id: int,
    ) -> PrintJob:
        """Cria job, gera conteúdo de impressão e envia para impressora."""
        printer = await self._get_printer(db, data.printer_id, tenant_id)
        variant = await self._get_variant(db, data.variant_id)
        product = await self._get_product(db, data.product_id or (variant.product_id if variant else None))

        if not variant or not product:
            raise ValueError("Produto ou variante não encontrados.")

        label_data = label_service.generate_back_label_zpl(
            product=product,
            variant=variant,
            quantity=data.quantity,
            show_price=data.show_price,
            show_sku=data.show_sku,
            printer=printer,
        )

        success, message = await printer_service.print_label(printer, label_data)

        job = PrintJob(
            tenant_id=tenant_id,
            printer_id=data.printer_id,
            product_id=product.id,
            variant_id=variant.id,
            quantity=data.quantity,
            show_price=data.show_price,
            show_sku=data.show_sku,
            zpl_content=self._serialize_label(label_data),
            status=PrintJobStatus.DONE if success else PrintJobStatus.ERROR,
            error_message=None if success else message,
            product_name=product.name,
            sku=variant.sku,
            variant_label=self._variant_label(variant),
            price=label_service._format_price(
                getattr(variant, "price", None) or getattr(variant, "sale_price", None)
            ),
        )
        db.add(job)
        await db.flush()
        await db.refresh(job)
        return job

    async def create_batch_and_print(
        self,
        db: AsyncSession,
        data: PrintJobBatchCreate,
        tenant_id: int,
    ) -> List[PrintJob]:
        """Imprime múltiplas variantes de um produto em sequência."""
        printer = await self._get_printer(db, data.printer_id, tenant_id)
        product = await self._get_product(db, data.product_id)

        if not product:
            raise ValueError("Produto não encontrado.")

        jobs: List[PrintJob] = []
        for item in data.items:
            if item.quantity <= 0:
                continue

            variant = await self._get_variant(db, item.variant_id)
            if not variant:
                continue

            label_data = label_service.generate_back_label_zpl(
                product=product,
                variant=variant,
                quantity=item.quantity,
                show_price=item.show_price,
                show_sku=item.show_sku,
                printer=printer,
            )

            success, message = await printer_service.print_label(printer, label_data)

            job = PrintJob(
                tenant_id=tenant_id,
                printer_id=data.printer_id,
                product_id=product.id,
                variant_id=variant.id,
                quantity=item.quantity,
                show_price=item.show_price,
                show_sku=item.show_sku,
                zpl_content=self._serialize_label(label_data),
                status=PrintJobStatus.DONE if success else PrintJobStatus.ERROR,
                error_message=None if success else message,
                product_name=product.name,
                sku=variant.sku,
                variant_label=self._variant_label(variant),
                price=label_service._format_price(
                    getattr(variant, "price", None) or getattr(variant, "sale_price", None)
                ),
            )
            db.add(job)
            jobs.append(job)

        if jobs:
            await db.flush()
        return jobs

    async def get_zpl_preview(
        self,
        db: AsyncSession,
        variant_id: int,
        product_id: int,
        printer_id: Optional[int],
        tenant_id: int,
        show_price: bool = True,
        show_sku: bool = True,
    ) -> dict:
        """Retorna o ZPL gerado sem imprimir (para debug/preview)."""
        printer = None
        if printer_id:
            printer = await self._get_printer(db, printer_id, tenant_id)

        variant = await self._get_variant(db, variant_id)
        product = await self._get_product(db, product_id)

        if not variant or not product:
            raise ValueError("Produto ou variante não encontrados.")

        label_data = label_service.generate_back_label_zpl(
            product=product,
            variant=variant,
            quantity=1,
            show_price=show_price,
            show_sku=show_sku,
            printer=printer,
        )

        width_mm = printer.label_width_mm if printer else label_service.DEFAULT_WIDTH_MM
        height_mm = printer.label_height_mm if printer else label_service.DEFAULT_HEIGHT_MM
        dpi = printer.dpi if printer else label_service.DEFAULT_DPI

        return {
            "zpl": self._serialize_label(label_data),
            "width_dots": label_service._mm_to_dots(width_mm, dpi),
            "height_dots": label_service._mm_to_dots(height_mm, dpi),
            "label_width_mm": width_mm,
            "label_height_mm": height_mm,
            "dpi": dpi,
        }

    async def list_jobs(
        self,
        db: AsyncSession,
        tenant_id: int,
        status: Optional[PrintJobStatus] = None,
        limit: int = 50,
    ) -> List[PrintJob]:
        q = select(PrintJob).where(
            PrintJob.tenant_id == tenant_id,
            PrintJob.is_active == True,
        )
        if status:
            q = q.where(PrintJob.status == status)
        q = q.order_by(PrintJob.created_at.desc()).limit(limit)
        result = await db.execute(q)
        return list(result.scalars().all())

    async def list_printers(
        self, db: AsyncSession, tenant_id: int
    ) -> List[LabelPrinter]:
        q = select(LabelPrinter).where(
            LabelPrinter.tenant_id == tenant_id,
            LabelPrinter.is_active == True,
        ).order_by(LabelPrinter.is_default.desc(), LabelPrinter.name)
        result = await db.execute(q)
        return list(result.scalars().all())

    async def get_default_printer(
        self, db: AsyncSession, tenant_id: int
    ) -> Optional[LabelPrinter]:
        q = select(LabelPrinter).where(
            LabelPrinter.tenant_id == tenant_id,
            LabelPrinter.is_active == True,
            LabelPrinter.is_default == True,
        )
        result = await db.execute(q)
        return result.scalar_one_or_none()

    async def create_printer(
        self, db: AsyncSession, data: dict, tenant_id: int
    ) -> LabelPrinter:
        # Se for default, remove o default das outras
        if data.get("is_default"):
            await self._clear_default(db, tenant_id)

        printer = LabelPrinter(**data, tenant_id=tenant_id)
        db.add(printer)
        await db.flush()
        await db.refresh(printer)
        return printer

    async def update_printer(
        self, db: AsyncSession, printer_id: int, data: dict, tenant_id: int
    ) -> LabelPrinter:
        printer = await self._get_printer(db, printer_id, tenant_id)

        if data.get("is_default"):
            await self._clear_default(db, tenant_id)

        for key, value in data.items():
            if value is not None and hasattr(printer, key):
                setattr(printer, key, value)

        await db.flush()
        await db.refresh(printer)
        return printer

    async def delete_printer(
        self, db: AsyncSession, printer_id: int, tenant_id: int
    ) -> None:
        printer = await self._get_printer(db, printer_id, tenant_id)
        printer.is_active = False
        await db.flush()

    async def test_printer(
        self, db: AsyncSession, printer_id: int, tenant_id: int
    ) -> tuple[bool, str]:
        printer = await self._get_printer(db, printer_id, tenant_id)
        test_zpl = label_service.generate_test_zpl(printer)
        return await printer_service.test_connection(printer, test_zpl)

    # -----------------------------------------------------------------------
    # Helpers privados
    # -----------------------------------------------------------------------

    async def _get_printer(
        self, db: AsyncSession, printer_id: int, tenant_id: int
    ) -> LabelPrinter:
        q = select(LabelPrinter).where(
            LabelPrinter.id == printer_id,
            LabelPrinter.tenant_id == tenant_id,
            LabelPrinter.is_active == True,
        )
        result = await db.execute(q)
        printer = result.scalar_one_or_none()
        if not printer:
            raise ValueError(f"Impressora {printer_id} não encontrada.")
        return printer

    async def _get_variant(
        self, db: AsyncSession, variant_id: Optional[int]
    ) -> Optional[ProductVariant]:
        if not variant_id:
            return None
        q = select(ProductVariant).where(ProductVariant.id == variant_id)
        result = await db.execute(q)
        return result.scalar_one_or_none()

    async def _get_product(
        self, db: AsyncSession, product_id: Optional[int]
    ) -> Optional[Product]:
        if not product_id:
            return None
        q = select(Product).where(Product.id == product_id)
        result = await db.execute(q)
        return result.scalar_one_or_none()

    async def _clear_default(self, db: AsyncSession, tenant_id: int) -> None:
        q = select(LabelPrinter).where(
            LabelPrinter.tenant_id == tenant_id,
            LabelPrinter.is_default == True,
            LabelPrinter.is_active == True,
        )
        result = await db.execute(q)
        for p in result.scalars().all():
            p.is_default = False

    def _serialize_label(self, data: Union[str, bytes]) -> str:
        """Converte LabelOutput para str armazenável (bytes ESC/POS viram hex)."""
        if isinstance(data, bytes):
            return data.hex()
        return data

    def _variant_label(self, variant: ProductVariant) -> str:
        parts = []
        if getattr(variant, "color", None):
            parts.append(variant.color)
        if getattr(variant, "size", None):
            parts.append(variant.size)
        return " | ".join(parts)


print_job_service = PrintJobService()
