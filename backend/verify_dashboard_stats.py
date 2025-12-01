import sqlite3

DB_PATH = 'fitness_store.db'
TENANT_ID = 2

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

print('=== VERIFICAÇÃO DASHBOARD (TENANT', TENANT_ID, ') ===')

# Novo cálculo (com StockEntry ativo)
cur.execute('''
SELECT COALESCE(SUM(ei.quantity_remaining * ei.unit_cost),0)
FROM entry_items ei
JOIN stock_entries se ON ei.entry_id = se.id
WHERE ei.tenant_id = ?
  AND ei.is_active = 1
  AND se.is_active = 1
  AND ei.quantity_remaining > 0
''', (TENANT_ID,))
new_invested = cur.fetchone()[0]

# Antigo cálculo (ignorava se entrada foi desativada)
cur.execute('''
SELECT COALESCE(SUM(ei.quantity_remaining * ei.unit_cost),0)
FROM entry_items ei
WHERE ei.tenant_id = ?
  AND ei.is_active = 1
  AND ei.quantity_remaining > 0
''', (TENANT_ID,))
old_invested = cur.fetchone()[0]

# Detalhe dos itens considerados (novo)
cur.execute('''
SELECT ei.id, ei.product_id, ei.quantity_remaining, ei.unit_cost, se.is_active
FROM entry_items ei
JOIN stock_entries se ON ei.entry_id = se.id
WHERE ei.tenant_id = ?
  AND ei.is_active = 1
  AND ei.quantity_remaining > 0
''', (TENANT_ID,))
rows = cur.fetchall()

print('\nItens considerados no NOVO cálculo:')
for r in rows:
    print(f'  EntryItem {r[0]} Prod {r[1]} QtyRem {r[2]} Cost {r[3]:.2f} StockEntryAtiva={bool(r[4])}')

print('\nResumo:')
print(f'  Investido ANTIGO (sem filtro StockEntry): R$ {old_invested:.2f}')
print(f'  Investido NOVO   (com filtro StockEntry): R$ {new_invested:.2f}')
print(f'  Diferença: R$ {(old_invested - new_invested):.2f}')

# Total de produtos com estoque (novo)
cur.execute('''
SELECT COUNT(DISTINCT ei.product_id)
FROM entry_items ei
JOIN stock_entries se ON ei.entry_id = se.id
WHERE ei.tenant_id = ?
  AND ei.is_active = 1
  AND se.is_active = 1
  AND ei.quantity_remaining > 0
''', (TENANT_ID,))
prod_new = cur.fetchone()[0]

# Total de produtos com estoque (antigo)
cur.execute('''
SELECT COUNT(DISTINCT ei.product_id)
FROM entry_items ei
WHERE ei.tenant_id = ?
  AND ei.is_active = 1
  AND ei.quantity_remaining > 0
''', (TENANT_ID,))
prod_old = cur.fetchone()[0]

print(f'  Produtos com estoque ANTIGO: {prod_old}')
print(f'  Produtos com estoque NOVO  : {prod_new}')

conn.close()
