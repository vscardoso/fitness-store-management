import asyncio
from app.core.database import async_session_maker
from app.repositories.sale_repository import SaleRepository
from app.schemas.sale import SaleResponse

async def main():
    async with async_session_maker() as db:
        repo = SaleRepository(db)
        sales = await repo.get_multi(skip=0, limit=5, tenant_id=2, include_relationships=True)
        print("Serializando vendas...")
        for s in sales:
            sr = SaleResponse.model_validate(s)
            print(f"Venda {sr.id} ok - seller={sr.seller_name} customer={sr.customer_name} total={sr.total_amount}")

if __name__ == '__main__':
    asyncio.run(main())
