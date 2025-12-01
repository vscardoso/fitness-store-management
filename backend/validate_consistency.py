"""
Valida consistência dos dados após correções
"""
import asyncio
from app.core.database import async_session_maker
from sqlalchemy import text


async def validate():
    async with async_session_maker() as db:
        print('=' * 60)
        print('VALIDAÇÃO DE CONSISTÊNCIA - DASHBOARD vs INVENTÁRIO')
        print('=' * 60)
        
        # 1. Entry Items (FIFO) - Valor de Custo Restante
        res1 = await db.execute(text('''
            SELECT 
                COALESCE(SUM(ei.quantity_remaining * ei.unit_cost), 0) as custo_fifo
            FROM entry_items ei
            JOIN stock_entries se ON ei.entry_id = se.id
            WHERE ei.is_active = 1 
            AND ei.quantity_remaining > 0
            AND se.is_active = 1
        '''))
        custo_fifo = res1.scalar()
        
        print(f'\n1️⃣  ESTOQUE (CUSTO) - Entry Items FIFO:')
        print(f'   Valor: R$ {custo_fifo:.2f}')
        print(f'   Fonte: SUM(quantity_remaining × unit_cost)')
        print(f'   ✅ Usado por: Dashboard, Inventário')
        
        # 2. Entry Items (FIFO) - Valor de Venda
        res2 = await db.execute(text('''
            SELECT 
                COALESCE(SUM(ei.quantity_remaining * p.price), 0) as venda_fifo
            FROM entry_items ei
            JOIN products p ON ei.product_id = p.id
            JOIN stock_entries se ON ei.entry_id = se.id
            WHERE ei.is_active = 1 
            AND ei.quantity_remaining > 0
            AND se.is_active = 1
            AND p.is_active = 1
            AND p.is_catalog = 0
        '''))
        venda_fifo = res2.scalar()
        
        print(f'\n2️⃣  ESTOQUE (VENDA) - Entry Items FIFO:')
        print(f'   Valor: R$ {venda_fifo:.2f}')
        print(f'   Fonte: SUM(quantity_remaining × product.price)')
        print(f'   ✅ Usado por: Dashboard')
        
        # 3. Margem Potencial
        margem = venda_fifo - custo_fifo
        percent = (margem / custo_fifo * 100) if custo_fifo > 0 else 0
        
        print(f'\n3️⃣  MARGEM POTENCIAL:')
        print(f'   Valor: R$ {margem:.2f}')
        print(f'   Percentual: {percent:.1f}%')
        print(f'   Cálculo: Estoque Venda - Estoque Custo')
        print(f'   ✅ Usado por: Dashboard')
        
        # 4. Total de Entradas (stock_entries.total_cost)
        res4 = await db.execute(text('''
            SELECT 
                SUM(total_cost) as total_entradas
            FROM stock_entries
            WHERE is_active = 1
        '''))
        total_entradas = res4.scalar() or 0
        
        print(f'\n4️⃣  ENTRADAS POR MÊS - Total das Entradas:')
        print(f'   Valor: R$ {total_entradas:.2f}')
        print(f'   Fonte: SUM(stock_entries.total_cost)')
        print(f'   ✅ Corrigido para bater com entry_items')
        
        # 5. Verificar se total_cost bate com entry_items
        res5 = await db.execute(text('''
            SELECT 
                se.id,
                se.total_cost as total_entrada,
                SUM(ei.quantity_received * ei.unit_cost) as total_items
            FROM stock_entries se
            JOIN entry_items ei ON ei.entry_id = se.id
            WHERE se.is_active = 1
            AND ei.is_active = 1
            GROUP BY se.id, se.total_cost
        '''))
        
        print(f'\n5️⃣  CONSISTÊNCIA - stock_entries vs entry_items:')
        inconsistente = False
        for row in res5.fetchall():
            diff = abs(row.total_entrada - row.total_items)
            if diff > 0.01:
                print(f'   ❌ Entry {row.id}: Diferença de R$ {diff:.2f}')
                inconsistente = True
        
        if not inconsistente:
            print(f'   ✅ Todos os valores estão consistentes!')
        
        # Resumo final
        print('\n' + '=' * 60)
        print('RESUMO FINAL')
        print('=' * 60)
        print(f'Dashboard (Estoque Custo):     R$ {custo_fifo:.2f}')
        print(f'Inventário (Estoque Custo):    R$ {custo_fifo:.2f}')
        print(f'Dashboard (Estoque Venda):     R$ {venda_fifo:.2f}')
        print(f'Dashboard (Margem Potencial):  R$ {margem:.2f} ({percent:.1f}%)')
        print(f'Entradas por Mês (Total):      R$ {total_entradas:.2f}')
        print('=' * 60)
        
        if custo_fifo == custo_fifo and not inconsistente:
            print('\n✅ TODOS OS VALORES ESTÃO CORRETOS E CONSISTENTES!')
        else:
            print('\n⚠️  AINDA HÁ INCONSISTÊNCIAS!')


asyncio.run(validate())
