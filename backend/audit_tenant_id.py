"""
Script para auditar tenant_id em todas as tabelas do sistema.
"""
import sqlite3

conn = sqlite3.connect('fitness_store.db')
cur = conn.cursor()

# Buscar todas as tabelas
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
tables = [row[0] for row in cur.fetchall()]

print("="*80)
print("AUDITORIA DE TENANT_ID NO SISTEMA")
print("="*80)

for table in sorted(tables):
    # Verificar schema da tabela
    cur.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in cur.fetchall()]
    
    has_tenant_id = 'tenant_id' in columns
    
    if has_tenant_id:
        # Contar registros sem tenant_id
        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE tenant_id IS NULL")
        null_count = cur.fetchone()[0]
        
        # Contar total de registros
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        total_count = cur.fetchone()[0]
        
        if null_count > 0:
            print(f"\n❌ {table}")
            print(f"   - Tem coluna tenant_id: SIM")
            print(f"   - Total registros: {total_count}")
            print(f"   - Registros sem tenant_id: {null_count}")
        else:
            print(f"\n✅ {table}")
            print(f"   - Tem coluna tenant_id: SIM")
            print(f"   - Total registros: {total_count}")
            print(f"   - Todos têm tenant_id")
    else:
        # Tabelas que não precisam de tenant_id (system tables)
        system_tables = ['alembic_version', 'stores', 'subscriptions']
        if table in system_tables:
            print(f"\n🔧 {table}")
            print(f"   - Tabela de sistema (não precisa tenant_id)")
        else:
            print(f"\n⚠️  {table}")
            print(f"   - NÃO tem coluna tenant_id")

print("\n" + "="*80)
print("FIM DA AUDITORIA")
print("="*80)

conn.close()
