#!/usr/bin/env python3
"""
Limpa todas as fotos de produtos e variações para testes.
- Zera image_url de Product e ProductVariant
- Deleta registros de ProductMedia (se tabela existir)
"""
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings


async def clear_photos():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Zera image_url de todos os produtos
        r1 = await session.execute(
            text("UPDATE products SET image_url = NULL WHERE image_url IS NOT NULL")
        )
        print(f"Produtos zerados: {r1.rowcount}")

        # 2. Zera image_url de todas as variações
        r2 = await session.execute(
            text("UPDATE product_variants SET image_url = NULL WHERE image_url IS NOT NULL")
        )
        print(f"Variações zeradas: {r2.rowcount}")

        # 3. Deleta registros de product_media (se tabela existir)
        try:
            r3 = await session.execute(text("DELETE FROM product_media"))
            print(f"ProductMedia deletados: {r3.rowcount}")
        except Exception:
            print("Tabela product_media não encontrada — pulando.")

        await session.commit()
        print("Concluido.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(clear_photos())
