#!/usr/bin/env python3
"""
Teste simples para criacao de produto com variante.
"""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

import asyncio
import sys
from decimal import Decimal
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from app.core.database import async_session_maker, engine
from app.models.base import BaseModel
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.category import Category
from app.models.user import User
from app.services.product_service import ProductService
from app.schemas.product import ProductCreate

TEST_TENANT_ID = 1
TEST_USER_ID = 1


async def main():
    print("=" * 50)
    print("TESTE: Criar Produto com Variante")
    print("=" * 50)
    
    # Criar tabelas
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
    print("[OK] Tabelas verificadas")
    
    async with async_session_maker() as db:
        # Verificar/criar categoria
        result = await db.execute(
            select(Category).where(Category.tenant_id == TEST_TENANT_ID).limit(1)
        )
        category = result.scalar_one_or_none()
        
        if not category:
            category = Category(
                name="Roupas Fitness",
                description="Categoria para testes",
                slug="roupas-fitness-test",
                tenant_id=TEST_TENANT_ID
            )
            db.add(category)
            await db.commit()
            await db.refresh(category)
        print(f"[OK] Categoria: {category.name} (ID: {category.id})")
        
        # Verificar/criar usuario
        result = await db.execute(
            select(User).where(User.id == TEST_USER_ID)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            user = User(
                id=TEST_USER_ID,
                email="test@test.com",
                full_name="Test User",
                hashed_password="test_hashed_password",
                role="admin",
                tenant_id=TEST_TENANT_ID,
                is_active=True
            )
            db.add(user)
            await db.commit()
        print(f"[OK] Usuario: {user.full_name} (ID: {user.id})")
        
        # Criar produto com variante
        print("\n--- Criando Produto ---")
        
        product_service = ProductService(db)
        
        product_data = ProductCreate(
            name="Legging Premium Test",
            description="Legging para testes",
            sku="LEG-TEST-001",
            price=Decimal("99.90"),
            cost_price=Decimal("45.00"),
            category_id=category.id,
            brand="TestBrand",
            gender="Feminino",
            material="Poliamida",
            is_catalog=False,
            initial_stock=0
        )
        
        try:
            product = await product_service.create_product(
                product_data,
                tenant_id=TEST_TENANT_ID,
                user_id=TEST_USER_ID
            )
            print(f"[OK] Produto criado: {product.name} (ID: {product.id})")
            
            # Verificar variante
            result = await db.execute(
                select(ProductVariant).where(
                    ProductVariant.product_id == product.id,
                    ProductVariant.tenant_id == TEST_TENANT_ID
                )
            )
            variants = result.scalars().all()
            print(f"[OK] Variantes criadas: {len(variants)}")
            
            for v in variants:
                print(f"  - SKU: {v.sku}, Cor: {v.color}, Tamanho: {v.size}, Preco: {v.price}")
            
            print("\n[SUCCESS] Teste passou!")
            
        except Exception as e:
            print(f"[ERROR] Falha ao criar produto: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())