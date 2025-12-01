import sqlite3

conn = sqlite3.connect('fitness_store.db')
cur = conn.cursor()

print('='*80)
print('ANÁLISE DE CUSTO - TENANT 2')
print('='*80)

print('\n1. ENTRADAS (STOCK_ENTRIES):')
cur.execute('SELECT id, entry_code, total_cost FROM stock_entries WHERE tenant_id = 2')
for r in cur.fetchall():
    print(f'  Entry {r[0]}: {r[1]} - R$ {r[2]:.2f}')

print('\n2. ITENS DAS ENTRADAS (ENTRY_ITEMS):')
cur.execute('''
    SELECT id, product_id, quantity_received, quantity_remaining, unit_cost, 
           (quantity_received * unit_cost) as total_rec,
           (quantity_remaining * unit_cost) as total_rem
    FROM entry_items 
    WHERE tenant_id = 2 
    ORDER BY product_id
''')

total_received = 0
total_remaining = 0

for r in cur.fetchall():
    print(f'  Item {r[0]}: Product {r[1]}, Rec: {r[2]}, Rem: {r[3]}, Cost: R$ {r[4]:.2f}')
    print(f'    Total Rec: R$ {r[5]:.2f}, Total Rem: R$ {r[6]:.2f}')
    total_received += r[5]
    total_remaining += r[6]

print(f'\n  TOTAL RECEBIDO (qty_received * cost): R$ {total_received:.2f}')
print(f'  TOTAL RESTANTE (qty_remaining * cost): R$ {total_remaining:.2f}')

print('\n3. VENDAS:')
cur.execute('SELECT COUNT(*), SUM(total_amount) FROM sales WHERE tenant_id = 2')
r = cur.fetchone()
print(f'  Total vendas: {r[0]}')
print(f'  Valor vendido (preço): R$ {r[1]:.2f}')

print('\n4. VENDAS - CUSTO REAL (via FIFO):')
cur.execute('''
    SELECT si.id, si.sale_id, si.product_id, si.quantity, si.sale_sources
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.id
    WHERE s.tenant_id = 2
    ORDER BY si.sale_id
''')

total_cost_sold = 0
for row in cur.fetchall():
    sale_item_id, sale_id, product_id, qty, sources_json = row
    print(f'  Sale {sale_id}, Item {sale_item_id}: Product {product_id}, Qty {qty}')
    
    # Parse sale_sources JSON
    if sources_json:
        import json
        try:
            sources = json.loads(sources_json)
            if 'sources' in sources:
                for src in sources['sources']:
                    cost = src.get('total_cost', 0)
                    total_cost_sold += cost
                    print(f'    -> Custo FIFO: R$ {cost:.2f}')
        except:
            print(f'    -> Erro ao ler sources')

print(f'\n  TOTAL CUSTO VENDIDO (FIFO): R$ {total_cost_sold:.2f}')

print('\n' + '='*80)
print('RESUMO:')
print('='*80)
print(f'  Valor investido (entradas): R$ {total_received:.2f}')
print(f'  Custo do que foi vendido (FIFO): R$ {total_cost_sold:.2f}')
print(f'  ESPERADO em estoque (custo): R$ {total_received - total_cost_sold:.2f}')
print(f'  REAL em estoque (calculado): R$ {total_remaining:.2f}')
print(f'  DIFERENÇA: R$ {total_remaining - (total_received - total_cost_sold):.2f}')

print('\n' + '='*80)

conn.close()
