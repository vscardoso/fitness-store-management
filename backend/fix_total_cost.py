"""
Corrige o total_cost da entrada baseado na soma dos entry_items
"""
import asyncio
from app.core.database import async_session_maker
from sqlalchemy import text


async def fix_total_cost():
    async with async_session_maker() as db:
        # Buscar entrada com problema
        res = await db.execute(text('''
            SELECT 
                se.id,
                se.total_cost as total_atual,
                SUM(ei.quantity_received * ei.unit_cost) as total_correto
            FROM stock_entries se
            JOIN entry_items ei ON ei.entry_id = se.id
            WHERE se.is_active = 1
            AND ei.is_active = 1
            GROUP BY se.id, se.total_cost
        '''))
        
        entries = res.fetchall()
        
        print('=== ENTRADAS COM DIVERGÊNCIA ===\n')
        
        for entry in entries:
            diff = abs(entry.total_atual - entry.total_correto)
            if diff > 0.01:  # Diferença maior que 1 centavo
                print(f'Entry ID: {entry.id}')
                print(f'  Total ATUAL (errado): R$ {entry.total_atual:.2f}')
                print(f'  Total CORRETO: R$ {entry.total_correto:.2f}')
                print(f'  Diferença: R$ {diff:.2f}')
                
                # Corrigir
                await db.execute(text('''
                    UPDATE stock_entries 
                    SET total_cost = :total_correto
                    WHERE id = :entry_id
                '''), {'total_correto': entry.total_correto, 'entry_id': entry.id})
                
                print(f'  ✅ CORRIGIDO!\n')
        
        await db.commit()
        
        # Verificar após correção
        res2 = await db.execute(text('''
            SELECT id, entry_date, entry_type, total_cost 
            FROM stock_entries 
            WHERE is_active = 1
        '''))
        
        print('\n=== ENTRADAS APÓS CORREÇÃO ===')
        for r in res2.fetchall():
            print(f'ID: {r.id} | Data: {r.entry_date} | Tipo: {r.entry_type} | Total: R$ {r.total_cost:.2f}')


asyncio.run(fix_total_cost())
