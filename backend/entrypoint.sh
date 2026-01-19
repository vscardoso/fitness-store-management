#!/bin/bash
set -e

echo "🚀 [ENTRYPOINT] Iniciando backend..."

# Aguardar database estar disponível
echo "⏳ [DATABASE] Aguardando PostgreSQL..."
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
                print('✅ [DATABASE] PostgreSQL disponível!')
                return
        except Exception as e:
            if i < max_retries - 1:
                print(f'⏳ [DATABASE] Tentativa {i+1}/{max_retries}...')
                await asyncio.sleep(2)
            else:
                print(f'❌ [DATABASE] Falhou após {max_retries} tentativas')
                sys.exit(1)
    await engine.dispose()

asyncio.run(wait_for_db())
"

# Aplicar migrations
echo "📦 [MIGRATIONS] Aplicando migrations..."
alembic upgrade head
echo "✅ [MIGRATIONS] Migrations aplicadas com sucesso!"

# Criar admin user (ignora erro se já existir)
echo "👤 [SEED] Criando admin user..."
python create_user.py || echo "⚠️ [SEED] Admin user já existe (ignorado)"

# Criar categorias (ignora erro se já existirem)
echo "📁 [SEED] Criando categorias padrão..."
python create_categories.py || echo "⚠️ [SEED] Categorias já existem (ignorado)"

echo "✅ [ENTRYPOINT] Inicialização completa! Iniciando servidor..."

# Iniciar aplicação
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
