"""Cache em memória para o dashboard. Compartilhado entre endpoints e services."""
import time as _time
from typing import Any, Optional

_dashboard_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 60


def _cache_get(key: str) -> Optional[Any]:
    entry = _dashboard_cache.get(key)
    if entry and (_time.monotonic() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _dashboard_cache[key] = (_time.monotonic(), value)


def invalidate_dashboard_cache(tenant_id: int) -> None:
    """Remove todas as entradas de cache do tenant."""
    tid = str(tenant_id)
    stale = [k for k in list(_dashboard_cache.keys()) if f":{tid}" in k or k == f"stats:{tid}"]
    for k in stale:
        _dashboard_cache.pop(k, None)
