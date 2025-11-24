"""
Quick test to validate Subscription model and migration
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import async_session_maker
from app.models import Subscription, Store


async def test_subscription():
    print("\n🔍 Testando Subscription model...\n")
    
    async with async_session_maker() as db:
        # 1. Verificar se stores existem (com eager loading de subscription)
        result = await db.execute(
            select(Store)
            .where(Store.is_active == True)
            .options(selectinload(Store.subscription))
        )
        stores = result.scalars().all()
        print(f"✅ {len(stores)} stores encontradas")
        
        # 2. Verificar subscriptions existentes
        result = await db.execute(select(Subscription))
        subscriptions = result.scalars().all()
        print(f"✅ {len(subscriptions)} subscriptions encontradas")
        
        # 3. Verificar relationship Store <-> Subscription
        if subscriptions:
            sub = subscriptions[0]
            print(f"\n📦 Subscription #{sub.id}:")
            print(f"   Tenant ID: {sub.tenant_id}")
            print(f"   Plan: {sub.plan}")
            print(f"   Status: {sub.status}")
            print(f"   Trial: {sub.is_trial}")
            print(f"   Trial ends: {sub.trial_ends_at}")
            print(f"   Max products: {sub.max_products}")
            print(f"   Max users: {sub.max_users}")
            
            # Testar property is_trial_active
            print(f"\n🔧 Properties:")
            print(f"   is_trial_active: {sub.is_trial_active}")
            print(f"   trial_days_remaining: {sub.trial_days_remaining}")
            print(f"   is_paid_plan: {sub.is_paid_plan}")
            
            # Testar get_plan_limits()
            limits = sub.get_plan_limits()
            print(f"\n📊 Plan limits:")
            for key, value in limits.items():
                print(f"   {key}: {value}")
        
        # 4. Verificar novos campos em Store
        if stores:
            store = stores[0]
            print(f"\n🏪 Store #{store.id}:")
            print(f"   Name: {store.name}")
            print(f"   Subdomain: {store.subdomain}")
            print(f"   Plan: {store.plan}")
            print(f"   Trial ends: {store.trial_ends_at}")
            
            # Testar relationship subscription
            if hasattr(store, 'subscription') and store.subscription:
                print(f"   ✅ Subscription relationship: OK")
                print(f"   Subscription plan: {store.subscription.plan}")
    
    print("\n✅ Todos os testes passaram!\n")


if __name__ == "__main__":
    asyncio.run(test_subscription())
