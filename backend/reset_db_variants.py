#!/usr/bin/env python3
"""
Script para recriar o banco de dados com o novo modelo de variantes.
"""
import asyncio
import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from app.core.database import engine
from app.models.base import BaseModel
from app.models import *  # Importa todos os modelos


async def reset_database():
    """Recria o banco de dados do zero."""
    print("=" * 60)
    print("REINICIANDO BANCO DE DADOS")
    print("=" * 60)
    
    # Drop all tables
    print("\n1. Removendo tabelas existentes...")
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.drop_all)
    print("   [OK] Todas as tabelas foram removidas")
    
    # Create all tables with new schema
    print("\n2. Criando tabelas com novo schema...")
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    print("   [OK] Tabelas criadas com sucesso")
    
    print("\n" + "=" * 60)
    print("BANCO REINICIADO COM SUCESSO!")
    print("=" * 60)
    print("\nProximos passos:")
    print("   1. Reiniciar o backend")
    print("   2. Fazer signup para criar nova loja")
    print("   3. O seed de produtos criara as variantes automaticamente")


if __name__ == "__main__":
    asyncio.run(reset_database())