"""
Endpoints de IA para análise de produtos.
"""
import time
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_tenant_id
from app.models.user import User
from app.schemas.ai import ProductScanResponse, ProductScanResult, AIStatusResponse
from app.services.ai_scan_service import AIScanService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai")


# Tipos MIME suportados nativamente pela OpenAI Vision API
SUPPORTED_MEDIA_TYPES = {
    "image/jpeg": "jpeg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}

# Tipos que precisam de conversão para JPEG antes de enviar à OpenAI
CONVERTIBLE_MEDIA_TYPES = {
    "image/heic",
    "image/heif",
    "image/tiff",
    "image/bmp",
}

# Tamanho máximo: 10MB
MAX_IMAGE_SIZE = 10 * 1024 * 1024


def _convert_to_jpeg(image_bytes: bytes) -> bytes:
    """Converte imagem para JPEG usando Pillow. Usado para HEIC/HEIF/TIFF/BMP."""
    try:
        # Registrar suporte a HEIC/HEIF via pillow-heif (se disponível)
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
        except ImportError:
            pass  # pillow-heif não instalado — HEIC pode falhar

        from PIL import Image
        import io
        img = Image.open(io.BytesIO(image_bytes))
        # Converter para RGB se necessário (HEIC pode ter canal alpha)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        output = io.BytesIO()
        img.save(output, format="JPEG", quality=85)
        return output.getvalue()
    except Exception as e:
        raise ValueError(f"Nao foi possivel converter imagem para JPEG: {e}")


@router.post("/scan-product", response_model=ProductScanResponse)
async def scan_product(
    image: UploadFile = File(..., description="Imagem do produto (JPEG, PNG, WebP, GIF)"),
    context: Optional[str] = Form(None, description="Contexto adicional sobre o produto"),
    check_duplicates: bool = Form(True, description="Verificar produtos duplicados"),
    suggest_price: bool = Form(True, description="Sugerir preço de venda"),
    db: AsyncSession = Depends(get_db),
    tenant_id: int = Depends(get_current_tenant_id),
    current_user: User = Depends(get_current_active_user),
):
    """
    Analisa imagem de produto com IA Claude Vision.

    ## Funcionalidades:
    - Identifica nome, marca, cor, tamanho automaticamente
    - Detecta código de barras se visível na imagem
    - Sugere categoria apropriada
    - Gera SKU único
    - Calcula preço sugerido baseado em histórico
    - Detecta produtos duplicados

    ## Limites:
    - Tamanho máximo: 10MB
    - Formatos: JPEG, PNG, WebP, GIF

    ## Retorno:
    - `success`: Se a análise foi bem-sucedida
    - `data`: Dados extraídos do produto
    - `processing_time_ms`: Tempo de processamento

    ## Exemplo de uso:
    ```bash
    curl -X POST "/api/v1/ai/scan-product" \\
      -H "Authorization: Bearer {token}" \\
      -F "image=@produto.jpg" \\
      -F "check_duplicates=true" \\
      -F "suggest_price=true"
    ```
    """
    start_time = time.time()

    try:
        # Validar content type
        # React Native/Expo pode enviar application/octet-stream mesmo para imagens JPEG.
        # Nesse caso, inferir o tipo pela extensão do filename antes de rejeitar.
        content_type = image.content_type or "application/octet-stream"

        # Verificar se o tipo é suportado diretamente ou precisa de conversão
        all_known_types = set(SUPPORTED_MEDIA_TYPES.keys()) | CONVERTIBLE_MEDIA_TYPES
        if content_type not in all_known_types:
            # Tentar inferir pelo nome do arquivo
            filename = image.filename or ""
            ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
            inferred = {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "webp": "image/webp",
                "gif": "image/gif",
                "heic": "image/heic",
                "heif": "image/heif",
                "tiff": "image/tiff",
                "tif": "image/tiff",
                "bmp": "image/bmp",
            }.get(ext)

            if inferred:
                logger.info(
                    f"content_type '{content_type}' nao reconhecido, "
                    f"inferido como '{inferred}' pela extensao '{ext}'"
                )
                content_type = inferred
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Formato nao suportado: {content_type}. Use JPEG, PNG, WebP, GIF ou HEIC.",
                )

        # Ler imagem
        image_bytes = await image.read()

        # Validar tamanho
        if len(image_bytes) > MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Imagem muito grande. Máximo: 10MB (recebido: {len(image_bytes) / (1024*1024):.1f}MB)",
            )

        if len(image_bytes) < 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Arquivo de imagem inválido ou corrompido.",
            )

        # Converter HEIC/HEIF/TIFF/BMP para JPEG (OpenAI nao suporta esses formatos)
        if content_type in CONVERTIBLE_MEDIA_TYPES:
            logger.info(f"Convertendo {content_type} para JPEG...")
            image_bytes = _convert_to_jpeg(image_bytes)
            content_type = "image/jpeg"
            logger.info(f"Conversao concluida: {len(image_bytes)} bytes JPEG")

        logger.info(f"Processing image scan: size={len(image_bytes)} bytes, type={content_type}")

        # Executar análise
        service = AIScanService(db)
        result = await service.analyze_image(
            image_bytes=image_bytes,
            media_type=content_type,
            tenant_id=tenant_id,
            check_duplicates=check_duplicates,
            suggest_price=suggest_price,
            context=context,
        )

        elapsed_ms = int((time.time() - start_time) * 1000)

        return ProductScanResponse(
            success=True,
            data=result,
            error=None,
            processing_time_ms=elapsed_ms,
        )

    except HTTPException:
        # Re-levantar HTTPException para que o FastAPI trate corretamente
        # (nao capturar como erro generico — HTTPException e subclasse de Exception)
        raise

    except ValueError as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.warning(f"Validation error in scan: {e}")
        return ProductScanResponse(
            success=False,
            data=None,
            error=str(e),
            processing_time_ms=elapsed_ms,
        )

    except RuntimeError as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Runtime error in scan: {e}")
        return ProductScanResponse(
            success=False,
            data=None,
            error=str(e),
            processing_time_ms=elapsed_ms,
        )

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Unexpected error in scan: {e}", exc_info=True)
        return ProductScanResponse(
            success=False,
            data=None,
            error="Erro interno ao processar imagem",
            processing_time_ms=elapsed_ms,
        )


@router.get("/status", response_model=AIStatusResponse)
async def get_ai_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Verifica status do serviço de IA.

    Retorna:
    - `enabled`: Se o serviço está habilitado
    - `model`: Modelo em uso
    - `has_api_key`: Se a API key está configurada
    """
    service = AIScanService(db)
    status_data = await service.check_status()

    return AIStatusResponse(**status_data)
