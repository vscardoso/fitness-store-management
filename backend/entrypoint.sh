#!/bin/bash
set -e

echo "[ENTRYPOINT] Inicializando banco de dados..."
PYTHONPATH=/app python scripts/db_init.py

echo "[ENTRYPOINT] Iniciando servidor na porta ${PORT:-8000} com ${WEB_CONCURRENCY:-2} workers..."
# Um worker por CPU (o VPS tem 2): o processo único saturava 1 núcleo em ~12 pedidos/s. WEB_CONCURRENCY=1 volta ao antigo.
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2}
