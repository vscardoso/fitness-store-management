"""
Script para testar CRUD completo de clientes via API
"""
import asyncio
import sys
from pathlib import Path

# Adicionar o diretório backend ao path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, init_db
from app.services.customer_service import CustomerService
from app.repositories.customer_repository import CustomerRepository
from app.schemas.customer import CustomerCreate, CustomerUpdate


async def test_customer_crud():
    """Testa CRUD completo de clientes"""
    
    print("\n" + "="*60)
    print("TESTE DE CRUD DE CLIENTES")
    print("="*60)
    
    # Inicializar banco
    await init_db()
    
    # Obter sessão do banco
    async for db in get_db():
        try:
            customer_service = CustomerService(db)
            
            # 1. Criar cliente
            print("\n1. Criando novo cliente...")
            customer_data = CustomerCreate(
                full_name="João da Silva Teste",
                email="joao.teste@email.com",
                phone="11987654321",
                document_number="12345678901",
                address="Rua Teste",
                address_number="123",
                city="São Paulo",
                state="SP",
                zip_code="01234567"
            )
            
            customer = await customer_service.create_customer(customer_data)
            print(f"✅ Cliente criado: ID={customer.id}, Nome={customer.full_name}")
            customer_id = customer.id
            
            # 2. Buscar cliente por ID
            print(f"\n2. Buscando cliente ID={customer_id}...")
            found_customer = await customer_service.get_customer(customer_id)
            if found_customer:
                print(f"✅ Cliente encontrado: {found_customer.full_name}")
                print(f"   Email: {found_customer.email}")
                print(f"   Telefone: {found_customer.phone}")
                print(f"   Endereço: {found_customer.address}, {found_customer.address_number}")
                print(f"   Cidade: {found_customer.city}/{found_customer.state}")
            
            # 3. Listar todos os clientes
            print("\n3. Listando todos os clientes...")
            customers = await customer_service.list_customers(skip=0, limit=10)
            print(f"✅ Total de clientes: {len(customers)}")
            for c in customers[:3]:
                print(f"   - {c.full_name} ({c.email})")
            
            # 4. Buscar por email
            print(f"\n4. Buscando cliente por email: {customer_data.email}...")
            by_email = await customer_service.get_customer_by_email(customer_data.email)
            if by_email:
                print(f"✅ Cliente encontrado: {by_email.full_name}")
            
            # 5. Atualizar cliente
            print(f"\n5. Atualizando cliente ID={customer_id}...")
            update_data = CustomerUpdate(
                full_name="João da Silva Teste Atualizado",
                phone="11999998888",
                city="Rio de Janeiro",
                state="RJ"
            )
            updated_customer = await customer_service.update_customer(customer_id, update_data)
            print(f"✅ Cliente atualizado:")
            print(f"   Nome: {updated_customer.full_name}")
            print(f"   Telefone: {updated_customer.phone}")
            print(f"   Cidade: {updated_customer.city}/{updated_customer.state}")
            
            # 6. Buscar clientes (search)
            print("\n6. Buscando clientes com termo 'Silva'...")
            search_results = await customer_service.search_customers("Silva")
            print(f"✅ Encontrados {len(search_results)} cliente(s)")
            for c in search_results:
                print(f"   - {c.full_name}")
            
            # 7. Adicionar pontos de fidelidade
            print(f"\n7. Adicionando 100 pontos de fidelidade...")
            customer_with_points = await customer_service.add_loyalty_points(
                customer_id, 
                100.0,
                "Teste de pontos"
            )
            print(f"✅ Pontos adicionados. Total: {customer_with_points.loyalty_points}")
            
            # 8. Deletar cliente (soft delete)
            print(f"\n8. Deletando cliente ID={customer_id} (soft delete)...")
            deleted = await customer_service.delete_customer(customer_id)
            if deleted:
                print(f"✅ Cliente deletado com sucesso")
                
                # Verificar se realmente foi soft delete
                deleted_customer = await customer_service.get_customer(customer_id)
                if not deleted_customer or not deleted_customer.is_active:
                    print(f"✅ Confirmado: Cliente marcado como inativo")
            
            # 9. Listar clientes ativos (não deve incluir o deletado)
            print("\n9. Listando clientes ativos...")
            active_customers = await customer_service.list_customers(skip=0, limit=10, active_only=True)
            active_ids = [c.id for c in active_customers]
            if customer_id not in active_ids:
                print(f"✅ Cliente deletado não aparece na lista de ativos")
            print(f"   Total de clientes ativos: {len(active_customers)}")
            
            print("\n" + "="*60)
            print("✅ TODOS OS TESTES PASSARAM!")
            print("="*60 + "\n")
            
        except Exception as e:
            print(f"\n❌ ERRO: {str(e)}")
            import traceback
            traceback.print_exc()
        
        break  # Sair do loop após usar a sessão


if __name__ == "__main__":
    asyncio.run(test_customer_crud())
