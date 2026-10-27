"""Medição de tempo de resposta da API, sem gravar arquivo.

Tudo fica em memória com tamanho fixo: um resumo por rota (contagem, média, máximo, p95 por faixas) e as
últimas 100 requisições lentas. Zera quando o servidor reinicia. Lê-se em GET /api/v1/perf (admin).
Requisição acima de SLOW_MS também vai para o log do servidor (uma linha curta).
"""
import logging
import os
import re
import time
from collections import deque
from contextvars import ContextVar
from typing import Deque, Dict, List

logger = logging.getLogger("perf")

SLOW_MS = 1000
_MAX_ROUTES = 400
_BUCKETS_MS = (50, 100, 250, 500, 1000, 2000, 5000, float("inf"))
_SKIP = ("/uploads", "/admin", "/health", "/docs", "/openapi")

# consultas ao banco da requisição atual: [quantidade, milissegundos]
_db: ContextVar[List[float]] = ContextVar("perf_db", default=[0, 0.0])
_stats: Dict[str, dict] = {}
_slow: Deque[dict] = deque(maxlen=100)
_started = time.time()


def _route_key(scope) -> str:
    route = scope.get("route")
    path = getattr(route, "path", None)
    if not path:
        path = re.sub(r"/\d+", "/{id}", scope.get("path", ""))
    return f"{scope.get('method', '')} {path}"


def record(key: str, ms: float, status: int, db_count: int, db_ms: float) -> None:
    s = _stats.get(key)
    if s is None:
        if len(_stats) >= _MAX_ROUTES:
            return
        s = _stats[key] = {"n": 0, "sum": 0.0, "max": 0.0, "db_sum": 0.0, "q_sum": 0, "err": 0,
                           "buckets": [0] * len(_BUCKETS_MS)}
    s["n"] += 1
    s["sum"] += ms
    s["max"] = max(s["max"], ms)
    s["db_sum"] += db_ms
    s["q_sum"] += db_count
    if status >= 500:
        s["err"] += 1
    for i, limit in enumerate(_BUCKETS_MS):
        if ms <= limit:
            s["buckets"][i] += 1
            break
    if ms >= SLOW_MS:
        _slow.append({"quando": time.strftime("%Y-%m-%d %H:%M:%S"), "rota": key, "ms": round(ms),
                      "status": status, "consultas": db_count, "banco_ms": round(db_ms)})
        logger.warning("LENTA %s %dms status=%s consultas=%d banco=%dms", key, ms, status, db_count, db_ms)


def _p95(buckets: List[int]) -> float:
    total = sum(buckets)
    if not total:
        return 0
    acc = 0
    for i, c in enumerate(buckets):
        acc += c
        if acc >= total * 0.95:
            return _BUCKETS_MS[i] if _BUCKETS_MS[i] != float("inf") else 5000
    return 5000


def snapshot(top: int = 25) -> dict:
    rows = []
    for key, s in _stats.items():
        rows.append({
            "rota": key, "chamadas": s["n"], "media_ms": round(s["sum"] / s["n"]), "max_ms": round(s["max"]),
            "p95_ms_ate": _p95(s["buckets"]), "banco_media_ms": round(s["db_sum"] / s["n"]),
            "consultas_media": round(s["q_sum"] / s["n"], 1), "erros_5xx": s["err"],
        })
    rows.sort(key=lambda r: r["media_ms"] * r["chamadas"], reverse=True)
    return {"worker": os.getpid(), "desde": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(_started)),
            "rotas_medidas": len(rows), "mais_pesadas": rows[:top], "lentas_recentes": list(_slow)[-30:][::-1]}


# ─── Vigia: avisa no registro de erros quando uma rota está lenta ou fazendo consulta demais ───
ALERT_MEAN_MS = 500
ALERT_QUERIES = 40
ALERT_MIN_CALLS = 20


def slow_routes() -> list:
    """Rotas com amostra suficiente cuja média passa de ALERT_MEAN_MS ou que fazem mais de ALERT_QUERIES consultas."""
    out = []
    for key, s in _stats.items():
        if s["n"] < ALERT_MIN_CALLS:
            continue
        mean, queries = s["sum"] / s["n"], s["q_sum"] / s["n"]
        if mean > ALERT_MEAN_MS or queries > ALERT_QUERIES:
            out.append({"rota": key, "chamadas": s["n"], "media_ms": round(mean), "consultas_media": round(queries, 1),
                        "banco_media_ms": round(s["db_sum"] / s["n"])})
    return sorted(out, key=lambda r: r["media_ms"] * r["chamadas"], reverse=True)


async def check_perf_alerts() -> None:
    """Job do agendador (a cada 6 h): uma linha de aviso por rota problemática. Cada worker só enxerga os próprios pedidos."""
    from app.services.error_log_service import record_error
    for r in slow_routes()[:10]:
        await record_error(
            message=f"Rota lenta: {r['rota']} média {r['media_ms']} ms, {r['consultas_media']} consultas por chamada ({r['chamadas']} chamadas)",
            level="warning", source="api", error_type="rota_lenta", detail=r,
        )


class PerfMiddleware:
    """ASGI puro: mede do primeiro byte recebido até o fim da resposta e acrescenta o cabeçalho Server-Timing."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path", "").startswith(_SKIP):
            return await self.app(scope, receive, send)
        t0 = time.perf_counter()
        counter = [0, 0.0]
        _db.set(counter)
        status = {"v": 0}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status["v"] = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"server-timing", f"app;dur={(time.perf_counter() - t0) * 1000:.0f}".encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            record(_route_key(scope), (time.perf_counter() - t0) * 1000, status["v"], int(counter[0]), counter[1])


def attach_db_timing() -> None:
    """Conta consultas e soma o tempo de banco de cada requisição (vale para qualquer engine do processo)."""
    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    @event.listens_for(Engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany):
        conn.info["perf_t"] = time.perf_counter()

    @event.listens_for(Engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany):
        t = conn.info.pop("perf_t", None)
        if t is not None:
            c = _db.get()
            c[0] += 1
            c[1] += (time.perf_counter() - t) * 1000
