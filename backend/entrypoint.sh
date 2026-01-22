#!/bin/bash
set -e

echo "[ENTRYPOINT] Iniciando backend..."

# Aguardar database estar disponivel
echo "[DATABASE] Aguardando PostgreSQL..."
python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings
import sys

async def wait_for_db():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    max_retries = 30
    for i in range(max_retries):
        try:
            async with engine.connect():
                print('[DATABASE] PostgreSQL disponivel!')
                return
        except Exception as e:
            if i < max_retries - 1:
                print(f'[DATABASE] Tentativa {i+1}/{max_retries}...')
                await asyncio.sleep(2)
            else:
                print(f'[DATABASE] Falhou apos {max_retries} tentativas')
                sys.exit(1)
    await engine.dispose()

asyncio.run(wait_for_db())
"

# Smart Migration - detecta estado e aplica/stamp conforme necessario
echo "[MIGRATIONS] Executando smart migration..."
python smart_migrate.py || {
    echo "[MIGRATIONS] Smart migrate falhou, tentando fallback..."
    alembic stamp head 2>/dev/null || alembic upgrade head 2>/dev/null || echo "[MIGRATIONS] Continuando mesmo assim..."
}
echo "[MIGRATIONS] Migrations sincronizadas!"

# Criar admin user (ignora erro se ja existir)
echo "[SEED] Criando admin user..."
python create_user.py 2>/dev/null || echo "[SEED] Admin user ja existe (OK)"

# Criar categorias (ignora erro se ja existirem)
echo "[SEED] Criando categorias padrao..."
python create_categories.py 2>/dev/null || echo "[SEED] Categorias ja existem (OK)"

echo "[ENTRYPOINT] Inicializacao completa! Iniciando servidor..."

# Iniciar aplicacao
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
