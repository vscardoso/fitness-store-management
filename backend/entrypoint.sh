#!/bin/bash
# Inicia diretamente o uvicorn.
# main.py lifespan cuida do init_db() com retry automatico.
# Migrations e seed rodam via Render pre-deploy command (manual).
echo "[ENTRYPOINT] Iniciando servidor na porta ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
