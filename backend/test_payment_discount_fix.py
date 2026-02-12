"""
Script de teste para validar correção do bug de update em PaymentDiscount
"""
import asyncio
import sys
from app.core.database import AsyncSessionLocal
from app.services.payment_discount_service import PaymentDiscountService
from app.schemas.payment_discount import PaymentDiscountUpdate


async def test_update_discount():
    """Testa atualização de desconto (toggle is_active)"""
    print("🧪 Testando atualização de desconto...")
    
    async with AsyncSessionLocal() as db:
        service = PaymentDiscountService(db)
        
        # Assumindo que existe um desconto com ID 1 e tenant_id 1
        try:
            # Buscar desconto atual
            discount = await service.get_discount(1, 1)
            if not discount:
                print("❌ Desconto ID 1 não encontrado")
                return False
            
            print(f"📋 Desconto atual: {discount.payment_method} - is_active={discount.is_active}")
            
            # Toggle is_active
            new_status = not discount.is_active
            update_data = PaymentDiscountUpdate(is_active=new_status)
            
            # Atualizar
            updated = await service.update_discount(1, 1, update_data)
            await db.commit()
            
            print(f"✅ Desconto atualizado: is_active={updated.is_active}")
            
            # Validar
            if updated.is_active == new_status:
                print("✅ Teste PASSOU: Update funcionou corretamente!")
                return True
            else:
                print("❌ Teste FALHOU: Valor não foi atualizado")
                return False
                
        except Exception as e:
            print(f"❌ Erro durante teste: {str(e)}")
            print(f"   Tipo: {type(e).__name__}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    print("=" * 60)
    print("  TESTE DE CORREÇÃO - Payment Discount Update")
    print("=" * 60)
    
    success = asyncio.run(test_update_discount())
    
    print("=" * 60)
    if success:
        print("✅ CORREÇÃO VALIDADA COM SUCESSO!")
        sys.exit(0)
    else:
        print("❌ TESTE FALHOU - Verificar implementação")
        sys.exit(1)
