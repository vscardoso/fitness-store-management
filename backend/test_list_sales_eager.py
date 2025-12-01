import asyncio
from app.core.database import async_session_maker
from app.repositories.sale_repository import SaleRepository

async def main():
    async with async_session_maker() as db:
        repo = SaleRepository(db)
        sales = await repo.get_multi(skip=0, limit=5, tenant_id=2, include_relationships=True)
        print(f"Total retornado: {len(sales)}")
        for s in sales:
            print(f"Venda {s.id} #{s.sale_number} total={s.total_amount} itens={len(s.items)} pagamentos={len(s.payments)}")

if __name__ == "__main__":
    asyncio.run(main())
