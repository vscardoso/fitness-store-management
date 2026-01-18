"""Main FastAPI application with middleware and exception handlers."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.scheduler import start_scheduler, shutdown_scheduler
from app.api.v1.router import api_router
from app.middleware.tenant import TenantMiddleware

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


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
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    openapi_url="/api/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
    expose_headers=["X-Total-Count", "X-Page", "X-Page-Size"],
)

# Tenant Middleware (resolve tenant_id por requisição)
app.add_middleware(TenantMiddleware)


# ============================================================================
# INCLUDE API ROUTERS
# ============================================================================

# Include all API v1 endpoints
app.include_router(api_router)


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
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": errors,
            "message": "Erro de validação nos dados enviados"
        }
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(
    request: Request,
    exc: SQLAlchemyError
):
    """Handle database errors with full detail to ease debugging."""
    logger.error(f"Database error: {str(exc)}", exc_info=True)
    # Sempre retornar o detalhe do erro para diagnóstico em ambiente de dev
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": str(exc),
            "message": str(exc) if settings.DEBUG else "Erro no banco de dados"
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(
    request: Request,
    exc: Exception
):
    """Handle general exceptions."""
    logger.error(f"Unexpected error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Erro interno do servidor",
            "message": str(exc) if settings.DEBUG else "Ocorreu um erro inesperado"
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
