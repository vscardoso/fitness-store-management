"""
Script de diagnóstico completo para erros 403 e 500.
"""
import asyncio
from sqlalchemy import text

async def run_diagnostics():
    """Executa diagnósticos completos."""
    from app.core.database import engine
    from app.core.config import settings
    import jose
    from jose import jwt
    
    print("=" * 60)
    print("🔍 DIAGNÓSTICO COMPLETO DO SISTEMA")
    print("=" * 60)
    
    # 1. Verificar configuração JWT
    print("\n1️⃣ Configuração JWT:")
    print(f"   SECRET_KEY configurada: {'✅' if settings.SECRET_KEY else '❌'}")
    print(f"   ALGORITHM: {settings.ALGORITHM}")
    print(f"   Expire minutes: {settings.ACCESS_TOKEN_EXPIRE_MINUTES}")
    
    # 2. Verificar tabelas
    print("\n2️⃣ Verificando tabelas:")
    async with engine.begin() as conn:
        # Users
        result = await conn.execute(text("SELECT COUNT(*) FROM users WHERE is_active = 1"))
        user_count = result.scalar()
        print(f"   users: {user_count} ativos {'✅' if user_count > 0 else '⚠️'}")
        
        # Sales
        result = await conn.execute(text("SELECT COUNT(*) FROM sales WHERE is_active = 1"))
        sale_count = result.scalar()
        print(f"   sales: {sale_count} registros")
        
        # Batches
        result = await conn.execute(text("SELECT COUNT(*) FROM batches WHERE is_active = 1"))
        batch_count = result.scalar()
        print(f"   batches: {batch_count} registros")
        
        # Schema da tabela batches
        result = await conn.execute(text("PRAGMA table_info(batches)"))
        batch_columns = [row[1] for row in result.fetchall()]
        print(f"   batches columns: {', '.join(batch_columns)}")
        if 'batch_code' in batch_columns:
            print("   ✅ batch_code existe")
        if 'batch_number' in batch_columns:
            print("   ⚠️ batch_number AINDA EXISTE (deve ser removido)")
    
    # 3. Testar geração de token
    print("\n3️⃣ Testando geração de token:")
    try:
        test_payload = {"sub": "1", "role": "admin"}
        test_token = jwt.encode(test_payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        print(f"   Token gerado: {test_token[:50]}...")
        
        # Decodificar
        decoded = jwt.decode(test_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        print(f"   Token decodificado: {decoded}")
        print("   ✅ JWT funcionando")
    except Exception as e:
        print(f"   ❌ Erro JWT: {e}")
    
    # 4. Verificar CORS
    print("\n4️⃣ Configuração CORS:")
    print(f"   Origins permitidas: {settings.CORS_ORIGINS[:3] if len(settings.CORS_ORIGINS) > 3 else settings.CORS_ORIGINS}")
    
    print("\n" + "=" * 60)
    print("✅ Diagnóstico completo!")
    print("=" * 60)
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run_diagnostics())
