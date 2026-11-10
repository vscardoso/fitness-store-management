-- Corrige o produto #086 (id 93, loja 2): a peça lançada em COMPRAS-SÃO-PAULO-09 às 16:46:59 (item 30780) ficou SEM variação
-- porque a variação Preto G (29373) tinha sido excluída 40 segundos antes. Reativa a variação e liga o item a ela.
\set ON_ERROR_STOP on
\echo === ANTES ===
select id, is_active from product_variants where id = 29373;
select id, variant_id, quantity_remaining from entry_items where id = 30780;
begin;
do $$
declare n1 int; n2 int;
begin
  update product_variants set is_active = true, updated_at = now()
    where id = 29373 and tenant_id = 2 and product_id = 93 and is_active = false;
  get diagnostics n1 = row_count;
  update entry_items set variant_id = 29373, updated_at = now()
    where id = 30780 and tenant_id = 2 and product_id = 93 and variant_id is null and is_active = true;
  get diagnostics n2 = row_count;
  if n1 <> 1 or n2 <> 1 then raise exception 'Contagem inesperada: variacao=%, item=%', n1, n2; end if;
end $$;
commit;
\echo === DEPOIS ===
select id, sku, color, size, is_active, product_code, variant_number, short_code from product_variants where product_id = 93 and is_active = true;
select id, entry_id, variant_id, quantity_received, quantity_remaining from entry_items where product_id = 93 and is_active = true order by id;
\echo === estoque do produto x soma do FIFO (tem que ser igual) ===
select (select quantity from inventory where product_id = 93 and tenant_id = 2) as estoque_inventario,
       (select coalesce(sum(quantity_remaining), 0) from entry_items where product_id = 93 and tenant_id = 2 and is_active = true) as soma_fifo,
       (select coalesce(sum(quantity_remaining), 0) from entry_items where variant_id = 29373 and is_active = true) as soma_fifo_da_variacao;
