#!/usr/bin/env python3
"""
Script para criar clientes de teste no banco de dados.
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from app.core.database import engine
from app.models.customer import Customer
from datetime import datetime

# Lista de clientes de teste
CUSTOMERS = [
    {
        "full_name": "Maria Silva Santos",
        "email": "maria.silva@email.com",
        "phone": "(11) 98765-4321",
        "document_number": "123.456.789-01",
        "address": "Rua das Flores, 123, São Paulo - SP",
        "birth_date": "1990-05-15",
        "notes": "Cliente VIP - Compra regularmente"
    },
    {
        "full_name": "João Pedro Oliveira",
        "email": "joao.oliveira@email.com",
        "phone": "(11) 97654-3210",
        "document_number": "234.567.890-12",
        "address": "Av. Paulista, 456, São Paulo - SP",
        "birth_date": "1985-08-22",
        "notes": "Interessado em suplementos"
    },
    {
        "full_name": "Ana Carolina Costa",
        "email": "ana.costa@email.com",
        "phone": "(11) 96543-2109",
        "document_number": "345.678.901-23",
        "address": "Rua Augusta, 789, São Paulo - SP",
        "birth_date": "1992-11-30",
        "notes": "Praticante de crossfit"
    },
    {
        "full_name": "Carlos Eduardo Mendes",
        "email": "carlos.mendes@email.com",
        "phone": "(11) 95432-1098",
        "document_number": "456.789.012-34",
        "address": "Rua Oscar Freire, 321, São Paulo - SP",
        "birth_date": "1988-03-10",
        "notes": "Personal trainer"
    },
    {
        "full_name": "Fernanda Rodrigues Lima",
        "email": "fernanda.lima@email.com",
        "phone": "(11) 94321-0987",
        "document_number": "567.890.123-45",
        "address": "Av. Faria Lima, 654, São Paulo - SP",
        "birth_date": "1995-07-18",
        "notes": "Instrutora de yoga"
    },
    {
        "full_name": "Ricardo Alves Pereira",
        "email": "ricardo.pereira@email.com",
        "phone": "(11) 93210-9876",
        "document_number": "678.901.234-56",
        "address": "Rua dos Três Irmãos, 987, São Paulo - SP",
        "birth_date": "1982-12-05",
        "notes": "Cliente desde 2020"
    },
    {
        "full_name": "Juliana Martins Souza",
        "email": "juliana.souza@email.com",
        "phone": "(11) 92109-8765",
        "document_number": "789.012.345-67",
        "address": "Av. Brigadeiro, 147, São Paulo - SP",
        "birth_date": "1993-09-25",
        "notes": "Maratonista"
    },
    {
        "full_name": "Bruno Henrique Costa",
        "email": "bruno.costa@email.com",
        "phone": "(11) 91098-7654",
        "document_number": "890.123.456-78",
        "address": "Rua Haddock Lobo, 258, São Paulo - SP",
        "birth_date": "1987-04-14",
        "notes": "Fisiculturista profissional"
    }
]


async def create_customers():
    """Cria clientes de teste no banco."""
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        print("🔄 Criando clientes de teste...")
        
        for i, customer_data in enumerate(CUSTOMERS, 1):
            # Verificar se cliente já existe (por email)
            from sqlalchemy import select
            stmt = select(Customer).where(Customer.email == customer_data["email"])
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"  ⏭️  Cliente {i}: {customer_data['full_name']} já existe (ID: {existing.id})")
                continue
            
            # Converter birth_date de string para date object
            birth_date_obj = None
            if customer_data.get("birth_date"):
                birth_date_str = customer_data["birth_date"]
                birth_date_obj = datetime.strptime(birth_date_str, "%Y-%m-%d").date()
            
            # Criar novo cliente
            customer = Customer(
                full_name=customer_data["full_name"],
                email=customer_data["email"],
                phone=customer_data["phone"],
                document_number=customer_data["document_number"],
                address=customer_data.get("address"),
                birth_date=birth_date_obj,
                notes=customer_data.get("notes"),
                is_active=True
            )
            
            session.add(customer)
            print(f"  ✅ Cliente {i}: {customer_data['full_name']} - {customer_data['email']}")
        
        # Commit
        await session.commit()
        
        # Contar total
        stmt = select(Customer).where(Customer.is_active == True)
        result = await session.execute(stmt)
        total = len(result.scalars().all())
        
        print(f"\n✅ CLIENTES CRIADOS COM SUCESSO!")
        print(f"📊 Total de clientes ativos: {total}")


async def main():
    """Função principal."""
    try:
        await create_customers()
    except Exception as e:
        print(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
