-- DESFAZER a restauração do produto #039 (id 41, loja 2). Volta ao estado de 10/11/2026 antes da restauração:
-- produto desativado em 04/11/2026 23:48:18 UTC e as 4 variações desativadas com SKU terminado em _del_<id>.
\set ON_ERROR_STOP on
begin;
do $$
declare n1 int; n2 int;
begin
  update product_variants set is_active = false, sku = sku || '_del_' || id, updated_at = now()
    where product_id = 41 and tenant_id = 2 and id in (125, 126, 127, 128) and is_active = true;
  get diagnostics n2 = row_count;
  update products set is_active = false, updated_at = '2026-11-04 23:48:18.201436+00'
    where id = 41 and tenant_id = 2 and is_active = true;
  get diagnostics n1 = row_count;
  if n1 <> 1 or n2 <> 4 then raise exception 'Contagem inesperada: produtos=%, variacoes=%', n1, n2; end if;
end $$;
commit;
