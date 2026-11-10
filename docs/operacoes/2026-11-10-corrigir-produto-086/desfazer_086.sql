-- DESFAZER a correção do produto #086 (id 93, loja 2): volta ao estado de 10/11/2026 antes de corrigir
-- (variação Preto G desativada e item de entrada 30780 sem variação).
\set ON_ERROR_STOP on
begin;
do $$
declare n1 int; n2 int;
begin
  update entry_items set variant_id = null, updated_at = now() where id = 30780 and tenant_id = 2 and variant_id = 29373;
  get diagnostics n2 = row_count;
  update product_variants set is_active = false, updated_at = now() where id = 29373 and tenant_id = 2 and is_active = true;
  get diagnostics n1 = row_count;
  if n1 <> 1 or n2 <> 1 then raise exception 'Contagem inesperada: variacao=%, item=%', n1, n2; end if;
end $$;
commit;
