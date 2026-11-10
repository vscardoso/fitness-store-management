-- Restaura o produto #039 (id 41, loja 2) como cadastro reutilizável: produto e 4 variações ativos, SKU original.
-- Os itens da entrada ROLETTE (125 a 128) NÃO voltam: ficam desativados, o produto volta com 0 peças.
\set ON_ERROR_STOP on
\echo === ANTES ===
select id, is_active, updated_at from products where id = 41 and tenant_id = 2;
select id, sku, is_active from product_variants where product_id = 41 and tenant_id = 2 order by id;
begin;
do $$
declare n1 int; n2 int;
begin
  update products set is_active = true, updated_at = now() where id = 41 and tenant_id = 2 and is_active = false;
  get diagnostics n1 = row_count;
  update product_variants set is_active = true, sku = regexp_replace(sku, '_del_[0-9]+$', ''), updated_at = now()
    where product_id = 41 and tenant_id = 2 and id in (125, 126, 127, 128) and is_active = false and sku ~ '_del_[0-9]+$';
  get diagnostics n2 = row_count;
  if n1 <> 1 or n2 <> 4 then raise exception 'Contagem inesperada: produtos=%, variacoes=%', n1, n2; end if;
end $$;
commit;
\echo === DEPOIS ===
select id, name, is_active, is_catalog, code_number, updated_at from products where id = 41 and tenant_id = 2;
select id, sku, color, size, is_active, product_code, variant_number, short_code from product_variants where product_id = 41 and tenant_id = 2 order by id;
select id, quantity, is_active from inventory where product_id = 41 and tenant_id = 2;
select count(*) as itens_de_entrada_ativos from entry_items where product_id = 41 and tenant_id = 2 and is_active = true;
