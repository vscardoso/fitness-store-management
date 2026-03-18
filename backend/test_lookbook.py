"""Teste manual dos endpoints de Lookbook (Fases 1 e 2)."""
import asyncio
from app.core.database import async_session_maker
from app.services.look_service import LookService
from app.services.wishlist_service import WishlistService
from app.schemas.look import LookCreate, LookItemCreate
from app.schemas.wishlist import WishlistCreate


async def run():
    async with async_session_maker() as db:
        tenant_id = 1
        ls = LookService()
        ws = WishlistService()

        print("=" * 50)
        print("TESTE LOOKBOOK - FASE 1 + 2")
        print("=" * 50)

        # --- Criar look ---
        print("\n[1] Criando look com 2 produtos...")
        look_data = LookCreate(
            name="TESTE - Look Completo Treino",
            description="Teste completo da fase 1",
            is_public=True,
            items=[
                LookItemCreate(product_id=1, position=1),
                LookItemCreate(product_id=2, position=2),
            ],
            discount_percentage=10.0,
        )
        look = await ls.create(db, tenant_id, look_data)
        print(f"  OK: id={look.id} name={look.name} items={len(look.items)} discount={look.discount_percentage}")

        # --- Listar looks ---
        print("\n[2] Listando looks ativos...")
        looks = await ls.list(db, tenant_id)
        print(f"  OK: {len(looks)} looks ativos")
        for l in looks[:3]:
            print(f"    - id={l.id} name={l.name[:40]} items={l.items_count}")

        # --- Buscar look por ID ---
        print(f"\n[3] Buscando look id={look.id}...")
        det = await ls.get(db, look.id, tenant_id)
        print(f"  OK: {det.name} | {len(det.items)} items")
        for item in det.items:
            pname = item.product_name or f"produto_id={item.product_id}"
            print(f"    - pos={item.position} prod={pname}")

        # --- Adicionar item ao look ---
        print("\n[4] Adicionando terceiro item ao look...")
        updated_look = await ls.add_item(db, look.id, tenant_id, product_id=3, variant_id=None, position=3)
        print(f"  OK: look agora tem {len(updated_look.items)} items")

        # --- Wishlist ---
        print("\n[5] Adicionando à wishlist (cliente=1, produto=5)...")
        wish_data = WishlistCreate(customer_id=1, product_id=5, notes="Quero no M preto")
        wish = await ws.add(db, tenant_id, wish_data)
        print(f"  OK: id={wish.id} prod={wish.product_name} cust={wish.customer_name}")

        # --- Wishlist por cliente ---
        print("\n[6] Listando wishlist do cliente 1...")
        items = await ws.list_by_customer(db, 1, tenant_id)
        print(f"  OK: {len(items)} itens na wishlist")

        # --- Demand report ---
        print("\n[7] Demand report...")
        demand = await ws.get_demand_report(db, tenant_id)
        print(f"  OK: {len(demand)} produtos na demanda")
        for d in demand[:5]:
            print(f"    - {d.product_name} x{d.waiting_count} potencial=R$ {d.potential_revenue:.2f}")

        # --- Update look ---
        print(f"\n[8] Atualizando look id={look.id}...")
        from app.schemas.look import LookUpdate
        updated = await ls.update(db, look.id, tenant_id, LookUpdate(name="TESTE - Look Atualizado", is_public=False))
        print(f"  OK: name={updated.name} public={updated.is_public}")

        # --- Delete look ---
        print(f"\n[9] Soft-deletando look id={look.id}...")
        deleted = await ls.delete(db, look.id, tenant_id)
        print(f"  OK: deleted={deleted}")

        print("\n" + "=" * 50)
        print("TODOS OS TESTES PASSARAM!")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(run())
