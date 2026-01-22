"""
Script para criar categorias padrão no banco de dados.
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import async_session_maker
from app.models.category import Category


async def create_default_categories():
    """Criar categorias padrão para loja fitness."""
    
    categories_data = [
        {
            "name": "Suplementos",
            "slug": "suplementos",
            "description": "Suplementos alimentares e proteínas",
            "parent_id": None
        },
        {
            "name": "Roupas Femininas",
            "slug": "roupas-femininas",
            "description": "Roupas fitness femininas",
            "parent_id": None
        },
        {
            "name": "Roupas Masculinas",
            "slug": "roupas-masculinas",
            "description": "Roupas fitness masculinas",
            "parent_id": None
        },
        {
            "name": "Acessórios",
            "slug": "acessorios",
            "description": "Acessórios para treino",
            "parent_id": None
        },
        {
            "name": "Calçados",
            "slug": "calcados",
            "description": "Tênis e calçados esportivos",
            "parent_id": None
        },
        {
            "name": "Equipamentos",
            "slug": "equipamentos",
            "description": "Equipamentos de treino",
            "parent_id": None
        },
    ]
    
    async with async_session_maker() as session:
        try:
            # Verificar se já existem categorias
            from sqlalchemy import select
            result = await session.execute(select(Category))
            existing = result.scalars().all()
            
            if existing:
                print(f"[OK] Ja existem {len(existing)} categorias no banco:")
                for cat in existing:
                    print(f"  - {cat.name}")
                return
            
            # Criar categorias
            print("Criando categorias padrão...")
            
            for cat_data in categories_data:
                category = Category(**cat_data)
                session.add(category)
                print(f"  + {cat_data['name']}")
            
            await session.commit()
            
            print(f"\n[OK] {len(categories_data)} categorias criadas com sucesso!")

        except Exception as e:
            await session.rollback()
            print(f"\n[ERROR] Erro ao criar categorias: {str(e)}")
            raise


if __name__ == "__main__":
    print("=" * 60)
    print("CRIAÇÃO DE CATEGORIAS PADRÃO")
    print("=" * 60)
    print()
    
    asyncio.run(create_default_categories())
    
    print()
    print("=" * 60)
