"""
Script para testar isolamento de dados entre tenants.
"""
import sqlite3

conn = sqlite3.connect('fitness_store.db')
cur = conn.cursor()

print("="*80)
print("TESTE DE ISOLAMENTO ENTRE TENANTS")
print("="*80)

# Listar tenants (stores)
print("\n📊 TENANTS NO SISTEMA:")
cur.execute("SELECT id, name, domain FROM stores")
stores = cur.fetchall()
for store in stores:
    print(f"   Tenant {store[0]}: {store[1]} ({store[2]})")

# Para cada tenant, mostrar dados
for store_id, store_name, _ in stores:
    print(f"\n{'='*80}")
    print(f"TENANT {store_id}: {store_name}")
    print(f"{'='*80}")
    
    # Produtos
    cur.execute("SELECT COUNT(*) FROM products WHERE tenant_id = ? AND is_active = 1", (store_id,))
    products_count = cur.fetchone()[0]
    print(f"   📦 Produtos: {products_count}")
    
    # Clientes
    cur.execute("SELECT COUNT(*) FROM customers WHERE tenant_id = ? AND is_active = 1", (store_id,))
    customers_count = cur.fetchone()[0]
    print(f"   👥 Clientes: {customers_count}")
    
    # Vendas
    cur.execute("SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM sales WHERE tenant_id = ? AND is_active = 1", (store_id,))
    sales_data = cur.fetchone()
    print(f"   💰 Vendas: {sales_data[0]} (Total: R$ {sales_data[1]:.2f})")
    
    # Entradas
    cur.execute("SELECT COUNT(*), COALESCE(SUM(total_cost), 0) FROM stock_entries WHERE tenant_id = ? AND is_active = 1", (store_id,))
    entries_data = cur.fetchone()
    print(f"   📥 Entradas: {entries_data[0]} (Total: R$ {entries_data[1]:.2f})")
    
    # Estoque
    cur.execute("SELECT COALESCE(SUM(quantity_remaining), 0) FROM entry_items WHERE tenant_id = ? AND is_active = 1", (store_id,))
    stock = cur.fetchone()[0]
    print(f"   📊 Estoque (entry_items): {stock} unidades")
    
    # Usuários
    cur.execute("SELECT COUNT(*) FROM users WHERE tenant_id = ? AND is_active = 1", (store_id,))
    users_count = cur.fetchone()[0]
    print(f"   👤 Usuários: {users_count}")

print(f"\n{'='*80}")
print("VERIFICAÇÃO DE VAZAMENTO DE DADOS")
print(f"{'='*80}")

# Verificar se há dados sem tenant_id (exceto stores e alembic)
tables_to_check = [
    'products', 'customers', 'sales', 'sale_items', 'payments',
    'stock_entries', 'entry_items', 'inventory', 'inventory_movements',
    'trips', 'users', 'categories', 'subscriptions'
]

has_leak = False
for table in tables_to_check:
    cur.execute(f"SELECT COUNT(*) FROM {table} WHERE tenant_id IS NULL")
    null_count = cur.fetchone()[0]
    if null_count > 0:
        print(f"   ⚠️  {table}: {null_count} registros sem tenant_id")
        has_leak = True

if not has_leak:
    print("   ✅ Nenhum vazamento detectado - todos os dados têm tenant_id")

print(f"\n{'='*80}")

conn.close()
