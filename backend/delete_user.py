"""Script para deletar usuário específico por email"""
import asyncio
from sqlalchemy import delete
from app.core.database import async_session_maker
from app.models.user import User
from app.models.store import Store
from app.models.subscription import Subscription
from app.models.product import Product
from app.models.category import Category


async def delete_user_and_store(email: str):
    """Deleta usuário, loja e todos os dados associados"""
    async with async_session_maker() as db:
        try:
            # Buscar usuário
            from sqlalchemy import select
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            
            if not user:
                print(f"❌ Usuário com email '{email}' não encontrado")
                return
            
            tenant_id = user.tenant_id
            print(f"✅ Usuário encontrado: {user.full_name} (ID: {user.id}, Tenant: {tenant_id})")
            
            # Deletar na ordem correta (respeitando foreign keys)
            if tenant_id:
                # 1. Products (referencia categories e stores)
                result = await db.execute(delete(Product).where(Product.tenant_id == tenant_id))
                print(f"✅ {result.rowcount} produtos deletados")
                
                # 2. Categories (referencia stores)
                result = await db.execute(delete(Category).where(Category.tenant_id == tenant_id))
                print(f"✅ {result.rowcount} categorias deletadas")
                
                # 3. Subscription
                await db.execute(delete(Subscription).where(Subscription.tenant_id == tenant_id))
                print(f"✅ Subscription deletada (tenant_id={tenant_id})")
            
            # 4. User
            await db.execute(delete(User).where(User.email == email))
            print(f"✅ Usuário deletado (email={email})")
            
            # 5. Store (por último)
            if tenant_id:
                await db.execute(delete(Store).where(Store.id == tenant_id))
                print(f"✅ Store deletada (id={tenant_id})")
            
            await db.commit()
            print("\n✅ Tudo deletado com sucesso! Você pode fazer signup novamente.\n")
            
        except Exception as e:
            await db.rollback()
            print(f"\n❌ Erro ao deletar: {e}\n")
            raise


if __name__ == "__main__":
    import sys
    
    # Email padrão ou via argumento
    email = sys.argv[1] if len(sys.argv) > 1 else "vscardoso2005@gmail.com"
    
    print(f"\n🗑️  Deletando usuário: {email}\n")
    asyncio.run(delete_user_and_store(email))
