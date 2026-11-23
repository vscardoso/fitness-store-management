-- Só leitura. Confere a venda da Yasmim recusada em 23/11/2026 por "abaixo do custo" (loja 2).
-- 1) a recusa gravada no registro de erros
select id, created_at, status_code, path, left(message, 220) msg
from error_logs where path like '%/sales%' and created_at > now() - interval '1 day'
order by id desc limit 10;

-- 2) custo de cada peça em estoque das 3 variações (o FIFO usa a camada mais antiga com saldo)
select p.name, v.color, v.size, ei.id lote, se.entry_code, se.entry_date,
       ei.quantity_remaining saldo, ei.unit_cost mercadoria, ei.extra_unit_cost despesas_do_lote,
       ei.unit_cost + ei.extra_unit_cost custo_posto, v.price preco
from entry_items ei
join product_variants v on v.id = ei.variant_id
join products p on p.id = v.product_id
join stock_entries se on se.id = ei.entry_id
where p.tenant_id = 2 and ei.is_active and se.is_active and ei.quantity_remaining > 0
  and (p.name ilike 'Conjunto Short Top Tipo Lupo%' or p.name ilike 'Conjunto Cal_a Ciclista%')
order by p.name, v.color, v.size, se.entry_date, ei.id;
