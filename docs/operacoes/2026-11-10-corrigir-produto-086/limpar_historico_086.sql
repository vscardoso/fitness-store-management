-- Limpa o histórico solto do produto #086 (id 93, loja 2), a pedido do Victor (10/11/2026). Fica só a peça certa:
-- Preto G, custo 55,00, venda 149,90, fornecedor "Só para você Nakamura", 1 peça na entrada COMPRAS-SÃO-PAULO-09 (item 30780).
-- Nada aqui é venda (0 vendas do produto). Tudo é exclusão lógica (is_active = false), reversível por desfazer_historico_086.sql.
\set ON_ERROR_STOP on
\echo === ANTES ===
select id, total_cost from stock_entries where id = 6;
begin;
do $$
declare n int;
begin
  -- 1) itens de entrada antigos: Amarelo Manteiga G (R$ 70) e a duplicata Preto G na ESTOQUE-ANTINGO (R$ 55); ambos já estavam zerados
  update entry_items set is_active = false, updated_at = now()
    where id in (301, 30761) and tenant_id = 2 and product_id = 93 and is_active = true and quantity_remaining = 0;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'itens: esperava 2, atualizou %', n; end if;

  -- 2) o total da entrada ESTOQUE-ANTINGO passa a ser a soma dos itens que sobraram (sem despesa nem desconto nessa entrada)
  update stock_entries set total_cost = (select coalesce(sum(quantity_received * unit_cost), 0) from entry_items where entry_id = 6 and is_active = true),
    updated_at = now() where id = 6 and tenant_id = 2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'entrada: esperava 1, atualizou %', n; end if;

  -- 3) as duas baixas por ajuste desse produto (08/11 ao excluir a variação e 10/11 pela conferência)
  update inventory_movements set is_active = false, updated_at = now()
    where id in (14, 29) and tenant_id = 2 and inventory_id = 92 and is_active = true;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'movimentos: esperava 2, atualizou %', n; end if;

  -- 4) vínculos com fornecedor: o do fornecedor 5 só existia por causa da compra do Amarelo; o do 6 passa de 2 compras para 1
  update supplier_products set is_active = false, updated_at = now() where id = 91 and tenant_id = 2 and product_id = 93 and supplier_id = 5 and is_active = true;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'vinculo 5: esperava 1, atualizou %', n; end if;
  update supplier_products set purchase_count = 1, updated_at = now() where id = 4056 and tenant_id = 2 and product_id = 93 and supplier_id = 6 and purchase_count = 2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'vinculo 6: esperava 1, atualizou %', n; end if;

  -- 5) a etiqueta que está na fila agora (linha 229) é válida: só passa da entrada antiga (6) para a entrada certa (382)
  update label_queue_items set entry_id = 382, updated_at = now()
    where id = 229 and tenant_id = 2 and variant_id = 29373 and entry_id = 6 and is_active = true;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'fila: esperava 1, atualizou %', n; end if;
end $$;
commit;
\echo === DEPOIS ===
select id, total_cost, (select coalesce(sum(quantity_received * unit_cost), 0) from entry_items where entry_id = 6 and is_active = true) as soma_itens from stock_entries where id = 6;
select id, entry_id, variant_id, quantity_received, quantity_remaining, unit_cost, supplier_id, is_active from entry_items where product_id = 93 order by id;
select id, color, size, is_active, product_code, variant_number from product_variants where product_id = 93 order by id;
select (select quantity from inventory where product_id = 93 and tenant_id = 2) as estoque_inventario,
       (select coalesce(sum(quantity_remaining), 0) from entry_items where product_id = 93 and tenant_id = 2 and is_active = true) as soma_fifo;
select supplier_id, purchase_count, is_active from supplier_products where product_id = 93 order by supplier_id;
select id, variant_id, entry_id, quantity, is_active from label_queue_items where variant_id = 29373 and is_active = true;
