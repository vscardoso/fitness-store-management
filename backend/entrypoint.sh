#!/bin/bash
set -e

echo "[ENTRYPOINT] Inicializando banco de dados..."
python scripts/db_init.py

echo "[ENTRYPOINT] Iniciando servidor na porta ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
