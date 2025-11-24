"""
Middleware para resolução de Tenant.

Define `request.state.tenant_id` para cada requisição, com base em:
- Header `X-Tenant-Id`
- Header `X-Store-Slug`
- Host (domínio) mapeado em `Store.domain`
- Store padrão (`is_default=True`)

Se não conseguir resolver, mantém sem definir e a dependency
`get_current_tenant_id` fará o fallback/erro.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.store import Store


class TenantMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        tenant_id: int | None = None

        # 1) Header X-Tenant-Id (numérico)
        tenant_id_hdr = request.headers.get("X-Tenant-Id")
        if tenant_id_hdr and tenant_id_hdr.isdigit():
            tenant_id = int(tenant_id_hdr)
        else:
            # 2) Slug ou 3) Domínio ou 4) Default
            slug = request.headers.get("X-Store-Slug")
            host = request.headers.get("host") or request.headers.get("Host")
            domain = host.split(":")[0] if host else None

            async with async_session_maker() as session:
                if slug:
                    result = await session.execute(
                        select(Store.id).where(Store.slug == slug, Store.is_active == True)
                    )
                    tid = result.scalar_one_or_none()
                    if tid:
                        tenant_id = tid
                if tenant_id is None and domain:
                    result = await session.execute(
                        select(Store.id).where(Store.domain == domain, Store.is_active == True)
                    )
                    tid = result.scalar_one_or_none()
                    if tid:
                        tenant_id = tid
                if tenant_id is None:
                    result = await session.execute(select(Store.id).where(Store.is_default == True))
                    tid = result.scalar_one_or_none()
                    if tid:
                        tenant_id = tid

        # Atribui ao state (se encontrado)
        if tenant_id is not None:
            request.state.tenant_id = tenant_id

        response = await call_next(request)
        return response
