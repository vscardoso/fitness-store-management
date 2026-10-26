"""Main FastAPI application with middleware and exception handlers."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from pathlib import Path
import mimetypes
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import http_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.database import init_db, close_db, engine
from app.core.scheduler import start_scheduler, shutdown_scheduler
from app.api.v1.router import api_router
from app.services.error_log_service import log_request_error
from app.core.friendly_errors import GENERIC, friendly_from_text, is_technical
from app.middleware.tenant import TenantMiddleware
from app.admin.auth import AdminAuth
from app.admin.views import ALL_VIEWS
from app.webhooks.whatsapp import router as whatsapp_router
from app.webhooks.whatsapp_cloud import router as whatsapp_cloud_router
from sqladmin import Admin
from starlette.middleware.sessions import SessionMiddleware

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Silenciar loggers ruidosos
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
logging.getLogger("apscheduler").setLevel(logging.WARNING)
logging.getLogger("app.core.scheduler").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.

    Handles startup and shutdown events.
    """
    # Startup
    logger.info("Starting up application...")
    await init_db()
    logger.info("Database initialized")

    # Start background scheduler
    start_scheduler()
    logger.info("Background scheduler started")

    # Só em desenvolvimento: tira do DEBUG_LOG.txt os erros já sanados (sem rodar testes; ver scripts/limpar_debug_log.py)
    if settings.ENVIRONMENT == "development":
        try:
            import subprocess
            import sys as _sys

            _script = Path(__file__).resolve().parent.parent / "scripts" / "limpar_debug_log.py"
            if _script.exists():
                subprocess.Popen(
                    [_sys.executable, str(_script), "limpar", "--auto"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
        except Exception as exc:  # a limpeza do trace nunca atrapalha o start
            logger.warning("Limpeza do DEBUG_LOG ignorada: %s", exc)

    yield

    # Shutdown
    logger.info("Shutting down application...")
    shutdown_scheduler()
    logger.info("Background scheduler stopped")
    await close_db()
    logger.info("Database connections closed")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API REST para gerenciamento de loja fitness",
    # Documentação da API só fora de produção (em produção revela todas as rotas a qualquer pessoa)
    docs_url=None if settings.ENVIRONMENT == "production" else "/docs",
    redoc_url=None if settings.ENVIRONMENT == "production" else "/redoc",
    openapi_url=None if settings.ENVIRONMENT == "production" else "/openapi.json",
    lifespan=lifespan,
)


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
    expose_headers=["X-Total-Count", "X-Page", "X-Page-Size"],
)

# Session middleware (necessário para o painel Admin)
# Cookie só trafega por HTTPS em produção (em dev local o painel roda em http).
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    session_cookie="admin_session",
    max_age=3600,
    same_site="strict",
    https_only=settings.ENVIRONMENT == "production",
)


@app.middleware("http")
async def security_headers(request, call_next):
    """Cabeçalhos de segurança em toda resposta da API."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    # HSTS só quando a requisição chegou por HTTPS (nginx informa em X-Forwarded-Proto)
    if request.headers.get("x-forwarded-proto") == "https" or request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

# Tenant Middleware (resolve tenant_id por requisição)
app.add_middleware(TenantMiddleware)

# ============================================================================
# PAINEL ADMINISTRATIVO (SQLAdmin) - acesso em /admin
# ============================================================================
authentication_backend = AdminAuth(secret_key=settings.SECRET_KEY)
admin = Admin(
    app,
    engine=engine,
    authentication_backend=authentication_backend,
    title="Fitness Store Admin",
    base_url="/admin",
)

for view in ALL_VIEWS:
    admin.add_view(view)


# ============================================================================
# INCLUDE API ROUTERS
# ============================================================================

# Include all API v1 endpoints
app.include_router(api_router)

# Matriz de permissões por papel (caixa, vendedor, gerente, admin): app/core/permissions.py
from app.core.permissions import apply_permission_matrix
apply_permission_matrix(app)

# Webhook WhatsApp (fora do prefixo /api/v1)
app.include_router(whatsapp_router)
# WhatsApp oficial (Cloud API da Meta), também fora do prefixo
app.include_router(whatsapp_cloud_router)


# ============================================================================
# STATIC FILES (uploads)
# ============================================================================

# Criar pasta de uploads se não existir
uploads_path = Path(settings.UPLOAD_DIR)
uploads_path.mkdir(parents=True, exist_ok=True)

mimetypes.add_type("image/webp", ".webp")  # sem isso o Python pode servir .webp como text/plain


class UploadsStaticFiles(StaticFiles):
    """Logos têm nome UUID novo a cada upload, então o navegador pode guardá-los por muito tempo."""

    def file_response(self, full_path, stat_result, scope, status_code=200):
        response = super().file_response(full_path, stat_result, scope, status_code)
        if "logos" in Path(full_path).parts:
            response.headers["Cache-Control"] = "public, max-age=2592000, immutable"
        return response


# Montar pasta de uploads como arquivos estáticos
# Acesso via: GET /uploads/{folder}/{filename}
app.mount("/uploads", UploadsStaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# ============================================================================
# MIDDLEWARE
# ============================================================================

# Trusted Host Middleware (security)
if not settings.DEBUG:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"]  # Configure properly in production
    )


# Request Logging Middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    logger.info(f"{request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"Status: {response.status_code}")
    return response


# Exception Handlers
def _validation_sentence(err: dict) -> str:
    """Uma frase clara para um erro de validação do Pydantic (ex.: 'Material: no máximo 100 letras')."""
    from app.core.friendly_errors import field_label
    loc = [str(p) for p in (err.get("loc") or []) if p not in ("body", "query", "path")]
    campo = field_label(loc[-1]) if loc else "Campo"
    kind, ctx = err.get("type", ""), err.get("ctx") or {}
    if kind == "string_too_long":
        return f"{campo}: no máximo {ctx.get('max_length')} letras"
    if kind == "string_too_short" or kind == "missing":
        return f"{campo}: preencha este campo"
    if kind in ("greater_than", "greater_than_equal"):
        return f"{campo}: valor menor que o permitido"
    if kind in ("less_than", "less_than_equal"):
        return f"{campo}: valor maior que o permitido"
    return f"{campo}: valor inválido"


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError
):
    """Handle validation errors."""
    import json
    from decimal import Decimal

    def make_json_safe(obj):
        """Converter recursivamente objetos para formato JSON-safe."""
        if isinstance(obj, dict):
            return {k: make_json_safe(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [make_json_safe(item) for item in obj]
        elif isinstance(obj, (Decimal, ValueError, Exception)):
            return str(obj)
        elif isinstance(obj, (str, int, float, bool, type(None))):
            return obj
        else:
            # Para qualquer outro tipo, converter para string
            return str(obj)

    # Converter erros para formato JSON-safe
    errors = exc.errors()
    errors = make_json_safe(errors)

    logger.error(f"Validation error: {errors}")
    await log_request_error(request, 422, message="Dados inválidos", extra={"errors": errors})
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": errors,
            "message": "Confira os campos: " + "; ".join(_validation_sentence(e) for e in errors[:3])
        }
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_logging_handler(request: Request, exc: StarletteHTTPException):
    """Mantém a resposta padrão e registra no error_logs os erros que importam (5xx e 4xx de gravação)."""
    await log_request_error(request, exc.status_code, exc=exc, message=str(exc.detail))
    # Erro técnico (SQL, driver) nunca vai para a tela da lojista: o original fica no registro de erros
    if exc.status_code >= 500 or (isinstance(exc.detail, str) and is_technical(exc.detail)):
        exc = StarletteHTTPException(
            status_code=exc.status_code,
            detail=friendly_from_text(str(exc.detail)),
            headers=getattr(exc, "headers", None),
        )
    return await http_exception_handler(request, exc)


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(
    request: Request,
    exc: SQLAlchemyError
):
    """Erro de banco: o detalhe técnico vai para o registro de erros; a lojista recebe uma frase clara."""
    logger.error(f"Database error: {str(exc)}", exc_info=True)
    await log_request_error(request, 500, exc=exc)
    friendly = friendly_from_text(str(exc))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": friendly,
            "message": str(exc) if settings.DEBUG else friendly,
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(
    request: Request,
    exc: Exception
):
    """Handle general exceptions."""
    logger.error(f"Unexpected error: {str(exc)}", exc_info=True)
    await log_request_error(request, 500, exc=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": GENERIC,
            "message": str(exc) if settings.DEBUG else GENERIC,
        }
    )


# Health Check Endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    """Check API health status."""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT
    }


# Root Endpoint
@app.get("/", tags=["Root"])
async def root():
    """API root endpoint."""
    return {
        "message": f"Bem-vindo à {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/api/docs" if settings.DEBUG else None
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        log_level=settings.LOG_LEVEL.lower()
    )
