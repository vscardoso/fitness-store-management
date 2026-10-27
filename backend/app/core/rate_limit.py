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


def enforce(*checks: tuple[str, int, int], what: str = "tentativas") -> None:
    """Cada check é (chave, limite, janela em segundos). Estourou algum: 429 com Retry-After e frase clara."""
    from fastapi import HTTPException, status

    for key, limit, window in checks:
        wait = hit(key, limit, window)
        if wait is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Muitas {what} em pouco tempo. Tente de novo em {_wait_text(wait)}.",
                headers={"Retry-After": str(wait)},
            )
