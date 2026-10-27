"""
Limite de tentativas de login (em memória, por processo).

O backend roda em um único processo no VPS; se escalar para vários, trocar por Redis.
Bloqueia por IP e por e-mail separadamente: o IP segura varredura de várias contas,
o e-mail segura ataque a uma conta vindo de vários IPs.
"""
import ipaddress
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import Request

MAX_FAILURES_PER_EMAIL = 5
MAX_FAILURES_PER_IP = 20
WINDOW_SECONDS = 15 * 60

_lock = threading.Lock()
_failures: Dict[str, Deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    """IP real do cliente. X-Real-IP (posto pelo nginx) só vale se a conexão vem de rede privada/loopback."""
    peer = request.client.host if request.client else ""
    try:
        trusted = ipaddress.ip_address(peer).is_private
    except ValueError:
        trusted = False
    if trusted:
        real = request.headers.get("x-real-ip", "").strip()
        if real:
            return real
    return peer or "desconhecido"


def _prune(key: str, now: float) -> Deque[float]:
    q = _failures[key]
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()
    if not q:
        _failures.pop(key, None)
        return deque()
    return q


def retry_after(ip: str, email: str) -> Optional[int]:
    """Segundos até poder tentar de novo, ou None se não está bloqueado."""
    now = time.time()
    waits = []
    with _lock:
        for key, limit in ((f"ip:{ip}", MAX_FAILURES_PER_IP), (f"email:{email.lower().strip()}", MAX_FAILURES_PER_EMAIL)):
            q = _prune(key, now)
            if len(q) >= limit:
                waits.append(int(WINDOW_SECONDS - (now - q[0])) + 1)
    return max(waits) if waits else None


def register_failure(ip: str, email: str) -> None:
    now = time.time()
    with _lock:
        _failures[f"ip:{ip}"].append(now)
        _failures[f"email:{email.lower().strip()}"].append(now)


def clear_email(email: str) -> None:
    with _lock:
        _failures.pop(f"email:{email.lower().strip()}", None)


def reset_all() -> None:
    """Uso em testes."""
    with _lock:
        _failures.clear()
        _hits.clear()


# ─── Limite geral por janela (cadastro, esqueci a senha, scanner de IA) ───────
# Diferente do login (que conta só falhas), aqui toda chamada conta. Mesmo armazenamento em memória.

_hits: Dict[str, Deque[float]] = defaultdict(deque)


def hit(key: str, limit: int, window_seconds: int) -> Optional[int]:
    """Registra uma chamada. Devolve os segundos de espera se o limite estourou (e não registra), senão None."""
    now = time.time()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= limit:
            return int(window_seconds - (now - q[0])) + 1
        q.append(now)
        return None


def _wait_text(seconds: int) -> str:
    if seconds < 90:
        return "1 minuto"
    minutes = (seconds + 59) // 60
    if minutes < 90:
        return f"{minutes} minutos"
    hours = (minutes + 59) // 60
    return f"{hours} horas"


def _raise_429(wait: int, what: str) -> None:
    from fastapi import HTTPException, status

    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Muitas {what} em pouco tempo. Tente de novo em {_wait_text(wait)}.",
        headers={"Retry-After": str(wait)},
    )


def enforce(*checks: tuple[str, int, int], what: str = "tentativas") -> None:
    """Cada check é (chave, limite, janela em segundos). Estourou algum: 429 com Retry-After e frase clara."""
    for key, limit, window in checks:
        wait = hit(key, limit, window)
        if wait is not None:
            _raise_429(wait, what)


# ─── Versão compartilhada entre os workers (Postgres) ─────────────────────────
# Com mais de um worker do uvicorn a memória de cada um é separada: o limite valeria por worker (até o dobro).
# Em produção as chamadas assíncronas abaixo guardam as tentativas na tabela `rate_limit_hits` (UNLOGGED), igual
# para todos os workers. Sem Postgres (testes, SQLite) ou se o banco falhar, cai na memória acima: o limite
# nunca some e o login nunca quebra por causa do limitador.
_LOGIN_IP_KEY = "login:ip:{}"
_LOGIN_EMAIL_KEY = "login:email:{}"
_pg_warned = False


def _use_pg() -> bool:
    from app.core.config import settings
    from app.core.database import engine

    return engine.dialect.name == "postgresql" and settings.ENVIRONMENT != "test"


def _pg_failed(exc: Exception) -> None:
    global _pg_warned
    if not _pg_warned:
        _pg_warned = True
        import logging
        logging.getLogger(__name__).warning("Limitador compartilhado indisponível, usando a memória do worker: %s", str(exc)[:160])


async def _pg_window(session, key: str, window: int):
    """(quantas tentativas na janela, idade em segundos da mais antiga) depois de apagar as vencidas desta chave."""
    from sqlalchemy import text

    await session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": key})
    await session.execute(text("DELETE FROM rate_limit_hits WHERE key = :k AND ts < now() - make_interval(secs => :w)"),
                          {"k": key, "w": window})
    row = (await session.execute(
        text("SELECT count(*), COALESCE(EXTRACT(EPOCH FROM (now() - min(ts))), 0) FROM rate_limit_hits WHERE key = :k"),
        {"k": key})).one()
    return int(row[0]), float(row[1])


async def _pg_hit(key: str, limit: int, window: int) -> Optional[int]:
    from sqlalchemy import text
    from app.core.database import async_session_maker

    async with async_session_maker() as session:
        count, age = await _pg_window(session, key, window)
        if count >= limit:
            await session.commit()
            return int(window - age) + 1
        await session.execute(text("INSERT INTO rate_limit_hits (key) VALUES (:k)"), {"k": key})
        await session.commit()
        return None


async def ahit(key: str, limit: int, window_seconds: int) -> Optional[int]:
    if _use_pg():
        try:
            return await _pg_hit(key, limit, window_seconds)
        except Exception as exc:  # noqa: BLE001
            _pg_failed(exc)
    return hit(key, limit, window_seconds)


async def aenforce(*checks: tuple[str, int, int], what: str = "tentativas") -> None:
    for key, limit, window in checks:
        wait = await ahit(key, limit, window)
        if wait is not None:
            _raise_429(wait, what)


async def aretry_after(ip: str, email: str) -> Optional[int]:
    """Versão compartilhada de retry_after (login: falhas por IP e por e-mail)."""
    if _use_pg():
        try:
            from app.core.database import async_session_maker

            waits = []
            async with async_session_maker() as session:
                for key, limit in ((_LOGIN_IP_KEY.format(ip), MAX_FAILURES_PER_IP),
                                   (_LOGIN_EMAIL_KEY.format(email.lower().strip()), MAX_FAILURES_PER_EMAIL)):
                    count, age = await _pg_window(session, key, WINDOW_SECONDS)
                    if count >= limit:
                        waits.append(int(WINDOW_SECONDS - age) + 1)
                await session.commit()
            return max(waits) if waits else None
        except Exception as exc:  # noqa: BLE001
            _pg_failed(exc)
    return retry_after(ip, email)


async def aregister_failure(ip: str, email: str) -> None:
    register_failure(ip, email)  # a memória também conta: vale se o banco falhar
    if _use_pg():
        try:
            from sqlalchemy import text
            from app.core.database import async_session_maker

            async with async_session_maker() as session:
                for key in (_LOGIN_IP_KEY.format(ip), _LOGIN_EMAIL_KEY.format(email.lower().strip())):
                    await session.execute(text("INSERT INTO rate_limit_hits (key) VALUES (:k)"), {"k": key})
                await session.commit()
        except Exception as exc:  # noqa: BLE001
            _pg_failed(exc)


async def aclear_email(email: str) -> None:
    clear_email(email)
    if _use_pg():
        try:
            from sqlalchemy import text
            from app.core.database import async_session_maker

            async with async_session_maker() as session:
                await session.execute(text("DELETE FROM rate_limit_hits WHERE key = :k"),
                                      {"k": _LOGIN_EMAIL_KEY.format(email.lower().strip())})
                await session.commit()
        except Exception as exc:  # noqa: BLE001
            _pg_failed(exc)


async def purge_old_hits() -> None:
    """Limpeza periódica (agendador): tentativas com mais de 2 dias não servem para nenhuma janela."""
    if not _use_pg():
        return
    try:
        from sqlalchemy import text
        from app.core.database import async_session_maker

        async with async_session_maker() as session:
            await session.execute(text("DELETE FROM rate_limit_hits WHERE ts < now() - interval '2 days'"))
            await session.commit()
    except Exception as exc:  # noqa: BLE001
        _pg_failed(exc)
