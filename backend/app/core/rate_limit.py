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
