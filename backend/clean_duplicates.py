"""
Script para limpar produtos duplicados no banco de dados.
Mantém apenas a cópia mais antiga (menor ID) de cada produto duplicado.
"""
import sqlite3
from datetime import datetime

def clean_duplicates():
    conn = sqlite3.connect("fitness_store.db")
    cursor = conn.cursor()
    
    print("\n" + "="*80)
    print("LIMPEZA DE PRODUTOS DUPLICADOS")
    print("="*80 + "\n")
    
    # 1. Identificar duplicatas (mesmo nome, ambos ativos)
    print("1. IDENTIFICANDO DUPLICATAS...")
    print("-" * 40)
    
    cursor.execute("""
        SELECT 
            LOWER(name) as name_lower,
            COUNT(*) as count,
            MIN(id) as keep_id,
            GROUP_CONCAT(id) as all_ids
        FROM products 
        WHERE is_active = 1
        GROUP BY name_lower
        HAVING count > 1
        ORDER BY count DESC
    """)
    
    duplicates = cursor.fetchall()
    
    if not duplicates:
        print("   ✅ Nenhuma duplicata encontrada!\n")
        conn.close()
        return
    
    print(f"   Encontradas {len(duplicates)} grupos de produtos duplicados\n")
    
    # 2. Mostrar duplicatas encontradas
    print("2. PRODUTOS DUPLICADOS:")
    print("-" * 80)
    print(f"   {'Nome':<40} | {'Cópias':>7} | {'ID a Manter':>12} | {'IDs a Remover'}")
    print(f"   {'-'*40}-+-{'-'*7}-+-{'-'*12}-+-{'-'*30}")
    
    total_to_remove = 0
    details = []
    
    for dup in duplicates:
        name_lower = dup[0]
        count = dup[1]
        keep_id = dup[2]
        all_ids = dup[3].split(',')
        
        # IDs para remover (todos exceto o menor)
        remove_ids = [int(id_str) for id_str in all_ids if int(id_str) != keep_id]
        
        # Buscar o nome real (com capitalização original)
        cursor.execute("SELECT name FROM products WHERE id = ?", (keep_id,))
        real_name = cursor.fetchone()[0][:40]
        
        print(f"   {real_name:<40} | {count:>7} | {keep_id:>12} | {', '.join(map(str, remove_ids[:5]))}")
        
        total_to_remove += len(remove_ids)
        details.append({
            'name': real_name,
            'keep_id': keep_id,
            'remove_ids': remove_ids
        })
    
    print(f"\n   Total de produtos a remover: {total_to_remove}\n")
    
    # 3. Confirmar remoção
    print("3. CONFIRMAÇÃO:")
    print("-" * 40)
    response = input(f"   Deseja remover {total_to_remove} produtos duplicados? (s/N): ").strip().lower()
    
    if response != 's':
        print("\n   ❌ Operação cancelada pelo usuário.\n")
        conn.close()
        return
    
    # 4. Remover duplicatas (soft delete)
    print("\n4. REMOVENDO DUPLICATAS...")
    print("-" * 40)
    
    removed_count = 0
    
    for detail in details:
        for remove_id in detail['remove_ids']:
            try:
                # Soft delete: is_active = 0
                cursor.execute("""
                    UPDATE products 
                    SET is_active = 0, 
                        updated_at = ? 
                    WHERE id = ?
                """, (datetime.utcnow().isoformat(), remove_id))
                
                removed_count += 1
                print(f"   ✅ Removido: ID {remove_id} (duplicata de '{detail['name']}')")
            
            except Exception as e:
                print(f"   ❌ Erro ao remover ID {remove_id}: {e}")
    
    conn.commit()
    
    # 5. Verificar resultado
    print(f"\n5. RESULTADO FINAL:")
    print("-" * 40)
    
    cursor.execute("SELECT COUNT(*) FROM products WHERE is_active = 1")
    active_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM products WHERE is_active = 0")
    inactive_count = cursor.fetchone()[0]
    
    print(f"   ✅ Produtos removidos: {removed_count}")
    print(f"   ✅ Produtos ativos restantes: {active_count}")
    print(f"   ✅ Total de produtos inativos: {inactive_count}\n")
    
    # 6. Verificar se ainda há duplicatas
    cursor.execute("""
        SELECT COUNT(*)
        FROM (
            SELECT LOWER(name) as name_lower, COUNT(*) as count
            FROM products 
            WHERE is_active = 1
            GROUP BY name_lower
            HAVING count > 1
        )
    """)
    remaining_dups = cursor.fetchone()[0]
    
    if remaining_dups == 0:
        print("   ✅ SUCESSO: Nenhuma duplicata restante!\n")
    else:
        print(f"   ⚠️  ATENÇÃO: Ainda há {remaining_dups} grupos duplicados.\n")
    
    print("="*80 + "\n")
    
    conn.close()

if __name__ == "__main__":
    try:
        clean_duplicates()
    except KeyboardInterrupt:
        print("\n\n❌ Operação cancelada pelo usuário.\n")
    except Exception as e:
        print(f"\n\n❌ ERRO: {e}\n")
