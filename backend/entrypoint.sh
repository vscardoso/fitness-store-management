#!/bin/bash
set -e

echo "[ENTRYPOINT] Rodando migrations Alembic..."
alembic upgrade head

echo "[ENTRYPOINT] Iniciando servidor na porta ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
