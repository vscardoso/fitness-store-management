"""
Test signup endpoint manually
"""
import asyncio
import json
from sqlalchemy import select
from app.core.database import async_session_maker
from app.services.signup_service import SignupService
from app.schemas.signup import SignupRequest
from app.models import User, Store, Subscription


async def test_signup():
    print("\n🧪 Testando SignupService...\n")
    
    async with async_session_maker() as db:
        signup_service = SignupService(db)
        
        # 1. Test check email
        print("1️⃣ Verificando email disponível...")
        available, message = await signup_service.check_email_available("test@example.com")
        print(f"   Email disponível: {available} - {message}")
        
        # 2. Test check slug
        print("\n2️⃣ Verificando slug disponível...")
        available, suggested, message = await signup_service.check_slug_available("minha-loja-teste")
        print(f"   Slug disponível: {available} - {message}")
        if suggested:
            print(f"   Sugestão: {suggested}")
        
        # 3. Test signup
        print("\n3️⃣ Criando conta completa...")
        signup_data = SignupRequest(
            full_name="João Silva Teste",
            email="joao.teste@example.com",
            password="Senha123!",
            phone="11987654321",
            store_name="Loja do João Teste",
            store_slug="loja-joao-teste",
            plan="trial"
        )
        
        try:
            response = await signup_service.signup(signup_data)
            
            print(f"\n✅ Signup concluído com sucesso!")
            print(f"\n👤 Usuário:")
            print(f"   ID: {response.user_id}")
            print(f"   Email: {response.user_email}")
            print(f"   Nome: {response.user_name}")
            
            print(f"\n🏪 Loja:")
            print(f"   ID: {response.store_id}")
            print(f"   Nome: {response.store_name}")
            print(f"   Slug: {response.store_slug}")
            print(f"   Subdomínio: {response.subdomain}")
            
            print(f"\n💳 Assinatura:")
            print(f"   ID: {response.subscription_id}")
            print(f"   Plano: {response.plan}")
            print(f"   Trial: {response.is_trial}")
            print(f"   Expira em: {response.trial_ends_at}")
            print(f"   Dias restantes: {response.trial_days_remaining}")
            
            print(f"\n🔑 Tokens:")
            print(f"   Access token: {response.access_token[:50]}...")
            print(f"   Refresh token: {response.refresh_token[:50]}...")
            
            print(f"\n📩 Mensagem: {response.message}")
            
            # 4. Validate database records
            print("\n4️⃣ Validando registros no banco...")
            
            # Check user
            result = await db.execute(
                select(User).where(User.email == signup_data.email)
            )
            user = result.scalar_one_or_none()
            print(f"   ✅ User criado: {user.full_name if user else 'NOT FOUND'}")
            
            # Check store
            result = await db.execute(
                select(Store).where(Store.slug == response.store_slug)
            )
            store = result.scalar_one_or_none()
            print(f"   ✅ Store criado: {store.name if store else 'NOT FOUND'}")
            
            # Check subscription
            result = await db.execute(
                select(Subscription).where(Subscription.tenant_id == response.store_id)
            )
            subscription = result.scalar_one_or_none()
            print(f"   ✅ Subscription criado: Plan {subscription.plan if subscription else 'NOT FOUND'}")
            
            # Test duplicate email
            print("\n5️⃣ Testando email duplicado...")
            try:
                await signup_service.signup(signup_data)
                print("   ❌ ERRO: Deveria ter rejeitado email duplicado!")
            except ValueError as e:
                print(f"   ✅ Email duplicado detectado: {str(e)}")
            
            print("\n✅ Todos os testes passaram!\n")
            
        except ValueError as e:
            print(f"\n❌ Erro de validação: {str(e)}")
        except Exception as e:
            print(f"\n❌ Erro inesperado: {str(e)}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_signup())
