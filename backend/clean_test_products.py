"""
Script para remover produtos de teste do banco de dados.
Remove produtos com nomes contendo: Test, test, FIFO, E2E, Teste
"""
import sqlite3
from datetime import datetime

def clean_test_products():
    conn = sqlite3.connect("fitness_store.db")
    cursor = conn.cursor()
    
    print("\n" + "="*80)
    print("LIMPEZA DE PRODUTOS DE TESTE")
    print("="*80 + "\n")
    
    # 1. Identificar produtos de teste
    print("1. IDENTIFICANDO PRODUTOS DE TESTE...")
    print("-" * 40)
    
    cursor.execute("""
        SELECT id, name, tenant_id, created_at
        FROM products 
        WHERE (
            name LIKE '%Test%' OR 
            name LIKE '%test%' OR 
            name LIKE '%FIFO%' OR 
            name LIKE '%E2E%' OR
            name LIKE '%Teste%'
        ) AND is_active = 1
        ORDER BY created_at DESC
    """)
    
    test_products = cursor.fetchall()
    
    if not test_products:
        print("   ✅ Nenhum produto de teste encontrado!\n")
        conn.close()
        return
    
    print(f"   Encontrados {len(test_products)} produtos de teste\n")
    
    # 2. Listar produtos de teste
    print("2. PRODUTOS DE TESTE ENCONTRADOS:")
    print("-" * 80)
    print(f"   {'ID':<6} | {'Tenant':<8} | {'Nome':<50} | {'Criado em'}")
    print(f"   {'-'*6}-+-{'-'*8}-+-{'-'*50}-+-{'-'*20}")
    
    product_ids = []
    
    for product in test_products:
        product_id = product[0]
        name = product[1][:50]
        tenant_id = product[2] if product[2] else "NULL"
        created_at = product[3][:16] if product[3] else "N/A"
        
        print(f"   {product_id:<6} | {str(tenant_id):<8} | {name:<50} | {created_at}")
        product_ids.append(product_id)
    
    print()
    
    # 3. Agrupar por tenant
    print("3. PRODUTOS POR TENANT:")
    print("-" * 40)
    
    cursor.execute("""
        SELECT tenant_id, COUNT(*) as count
        FROM products 
        WHERE (
            name LIKE '%Test%' OR 
            name LIKE '%test%' OR 
            name LIKE '%FIFO%' OR 
            name LIKE '%E2E%' OR
            name LIKE '%Teste%'
        ) AND is_active = 1
        GROUP BY tenant_id
        ORDER BY count DESC
    """)
    
    for row in cursor.fetchall():
        tenant_id = row[0] if row[0] else "NULL"
        count = row[1]
        print(f"   Tenant {tenant_id}: {count} produtos de teste")
    
    print()
    
    # 4. Confirmar remoção
    print("4. CONFIRMAÇÃO:")
    print("-" * 40)
    response = input(f"   Deseja remover {len(test_products)} produtos de teste? (s/N): ").strip().lower()
    
    if response != 's':
        print("\n   ❌ Operação cancelada pelo usuário.\n")
        conn.close()
        return
    
    # 5. Remover produtos de teste (soft delete)
    print("\n5. REMOVENDO PRODUTOS DE TESTE...")
    print("-" * 40)
    
    removed_count = 0
    
    for product_id in product_ids:
        try:
            # Soft delete: is_active = 0
            cursor.execute("""
                UPDATE products 
                SET is_active = 0, 
                    updated_at = ? 
                WHERE id = ?
            """, (datetime.utcnow().isoformat(), product_id))
            
            removed_count += 1
            print(f"   ✅ Removido: ID {product_id}")
        
        except Exception as e:
            print(f"   ❌ Erro ao remover ID {product_id}: {e}")
    
    conn.commit()
    
    # 6. Verificar resultado
    print(f"\n6. RESULTADO FINAL:")
    print("-" * 40)
    
    cursor.execute("SELECT COUNT(*) FROM products WHERE is_active = 1")
    active_count = cursor.fetchone()[0]
    
    cursor.execute("""
        SELECT COUNT(*) 
        FROM products 
        WHERE (
            name LIKE '%Test%' OR 
            name LIKE '%test%' OR 
            name LIKE '%FIFO%' OR 
            name LIKE '%E2E%' OR
            name LIKE '%Teste%'
        ) AND is_active = 1
    """)
    remaining_test = cursor.fetchone()[0]
    
    print(f"   ✅ Produtos de teste removidos: {removed_count}")
    print(f"   ✅ Produtos ativos restantes: {active_count}")
    
    if remaining_test == 0:
        print("   ✅ SUCESSO: Nenhum produto de teste restante!\n")
    else:
        print(f"   ⚠️  ATENÇÃO: Ainda há {remaining_test} produtos de teste.\n")
    
    print("="*80 + "\n")
    
    conn.close()

if __name__ == "__main__":
    try:
        clean_test_products()
    except KeyboardInterrupt:
        print("\n\n❌ Operação cancelada pelo usuário.\n")
    except Exception as e:
        print(f"\n\n❌ ERRO: {e}\n")
