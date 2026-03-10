#!/bin/bash
echo "[ENTRYPOINT] Iniciando backend..."

# Migrations (nao bloqueante - main.py tem retry para init_db)
echo "[MIGRATIONS] Executando smart migration..."
python smart_migrate.py 2>&1 || echo "[MIGRATIONS] Falhou, continuando..."

# Seed inicial (ignora erros se ja existirem)
python create_user.py 2>/dev/null || true
python create_categories.py 2>/dev/null || true

echo "[ENTRYPOINT] Iniciando servidor na porta ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
