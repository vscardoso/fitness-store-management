"""
Gravação do registro de erros (tabela error_logs).

Regras:
- NUNCA derruba a requisição: qualquer falha ao gravar o log é engolida (só vai para o log do servidor);
- NUNCA grava segredo: senha, token, chave e documentos são trocados por *** antes de gravar;
- grava em sessão própria (não depende nem atrapalha a transação da requisição que falhou);
- guarda 30 dias (limpeza ocasional ao gravar).
"""
import json
import logging
import random
import re
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Tuple

from fastapi import Request
import jwt
from sqlalchemy import delete

from app.core.config import settings

logger = logging.getLogger(__name__)

RETENTION_DAYS = 30
MAX_MESSAGE = 2000
MAX_DETAIL = 8000

_SENSITIVE_KEY = re.compile(r"(^pass$|password|passwd|senha|token|secret|authorization|api[_-]?key|credential|cpf|cnpj|card_?number|cartao|cvv|pix[_-]?key)", re.I)
# rotas que não valem registro (ruído ou risco de laço)
_SKIP_PATHS = ("/health", "/api/v1/client-logs", "/api/v1/error-logs")
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def sanitize(obj: Any, depth: int = 0) -> Any:
    """Troca valores de campos sensíveis por *** e encurta textos longos."""
    if depth > 6:
        return "..."
    if isinstance(obj, dict):
        return {str(k): ("***" if _SENSITIVE_KEY.search(str(k)) else sanitize(v, depth + 1)) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(v, depth + 1) for v in list(obj)[:30]]
    if isinstance(obj, str):
        return obj if len(obj) <= 300 else obj[:300] + "..."
    if isinstance(obj, (int, float, bool)) or obj is None:
        return obj
    return str(obj)[:300]


def _clip(text: Optional[str], limit: int) -> Optional[str]:
    if text is None:
        return None
    return text if len(text) <= limit else text[:limit] + "…"


def identify_request(request: Request) -> Tuple[Optional[int], Optional[int]]:
    """(user_id, tenant_id) lidos do token, sem consultar o banco. Token inválido = (None, None)."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None, None
    try:
        payload = jwt.decode(auth[7:], settings.SECRET_KEY, algorithms=[settings.ALGORITHM], options={"verify_exp": False})
        sub = payload.get("sub")
        return (int(sub) if sub is not None else None), payload.get("tenant_id")
    except Exception:
        return None, None


def should_log(method: str, path: str, status_code: int) -> bool:
    if any(path.startswith(p) for p in _SKIP_PATHS):
        return False
    if status_code >= 500:
        return True
    if status_code == 401:  # sessão expirada / senha errada: ruído (login já tem auditoria própria)
        return False
    return method.upper() in _WRITE_METHODS and status_code >= 400


async def record_error(
    *,
    message: str,
    level: str = "error",
    source: str = "api",
    status_code: Optional[int] = None,
    method: Optional[str] = None,
    path: Optional[str] = None,
    error_type: Optional[str] = None,
    detail: Any = None,
    tenant_id: Optional[int] = None,
    user_id: Optional[int] = None,
    user_agent: Optional[str] = None,
    app_version: Optional[str] = None,
) -> None:
    """Grava uma linha em error_logs. Nunca levanta exceção."""
    try:
        from app.core import rls
        from app.core import database as db_module
        from app.models.error_log import ErrorLog

        if detail is not None and not isinstance(detail, str):
            detail = json.dumps(sanitize(detail), ensure_ascii=False, default=str)

        async with db_module.async_session_maker() as session:
            await rls.bypass_on(session)
            if tenant_id is None and user_id is not None:  # token sem a loja: descobre pelo usuário
                from sqlalchemy import select as _select
                from app.models.user import User
                tenant_id = (await session.execute(_select(User.tenant_id).where(User.id == user_id))).scalar_one_or_none()
            session.add(ErrorLog(
                level=level[:10], source=source[:10], status_code=status_code,
                method=(method or None) and method[:10], path=_clip(path, 300), error_type=_clip(error_type, 120),
                message=_clip(message, MAX_MESSAGE) or "(sem mensagem)", detail=_clip(detail, MAX_DETAIL),
                tenant_id=tenant_id, user_id=user_id, user_agent=_clip(user_agent, 300), app_version=_clip(app_version, 40),
            ))
            if random.random() < 0.01:  # limpeza ocasional
                from app.models.error_log import ErrorLog as _E
                cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
                await session.execute(delete(_E).where(_E.created_at < cutoff))
            await session.commit()
    except Exception as e:  # noqa: BLE001
        logger.warning("Falha ao gravar error_log (ignorada): %s", e)


async def log_request_error(
    request: Request,
    status_code: int,
    *,
    exc: Optional[BaseException] = None,
    message: Optional[str] = None,
    extra: Any = None,
) -> None:
    """Registra um erro de requisição, se valer a pena (ver should_log)."""
    try:
        method, path = request.method, request.url.path
        if not should_log(method, path, status_code):
            return
        user_id, tenant_id = identify_request(request)
        tb = None
        if exc is not None and status_code >= 500:
            tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-5000:]
        detail = {"query": dict(request.query_params), "extra": extra, "trace": tb}
        await record_error(
            message=message or (str(exc) if exc else f"HTTP {status_code}"),
            level="error" if status_code >= 500 else "warning",
            status_code=status_code, method=method, path=path,
            error_type=type(exc).__name__ if exc else f"HTTP{status_code}",
            detail=detail, tenant_id=tenant_id, user_id=user_id,
            user_agent=request.headers.get("user-agent"),
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("Falha ao registrar erro da requisição (ignorada): %s", e)
