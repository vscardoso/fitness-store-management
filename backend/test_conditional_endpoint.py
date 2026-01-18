"""
Script para testar endpoint de conditional shipments.
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.repositories.conditional_shipment import ConditionalShipmentRepository
from app.services.conditional_shipment import ConditionalShipmentService


async def test_list_shipments():
    """Testa listagem de envios."""
    async for db in get_db():
        try:
            # Testar repository
            print("\n=== Testando Repository ===")
            repo = ConditionalShipmentRepository()
            
            # Pegar primeiro tenant
            from sqlalchemy import text
            result = await db.execute(text("SELECT id FROM stores WHERE is_active = 1 LIMIT 1"))
            row = result.fetchone()
            
            if not row:
                print("❌ Nenhum tenant encontrado")
                return
                
            tenant_id = row[0]
            print(f"✅ Tenant ID: {tenant_id}")
            
            # Listar envios
            shipments = await repo.list_by_tenant(db, tenant_id)
            print(f"✅ Encontrados {len(shipments)} envios")
            
            for shipment in shipments:
                print(f"  - ID: {shipment.id}, Status: {shipment.status}, Customer ID: {shipment.customer_id}")
            
            # Testar service
            print("\n=== Testando Service ===")
            service = ConditionalShipmentService()
            
            # Check overdue
            overdue = await service.check_overdue_shipments(db, tenant_id)
            print(f"✅ Envios atrasados: {len(overdue)}")
            
            print("\n✅ Todos os testes passaram!")
            
        except Exception as e:
            print(f"❌ Erro: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await db.close()
            break


if __name__ == "__main__":
    asyncio.run(test_list_shipments())
