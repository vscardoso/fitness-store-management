-- DESFAZER a limpeza do histórico do produto #086 (id 93, loja 2): volta ao estado de 10/11/2026 antes da limpeza.
\set ON_ERROR_STOP on
begin;
do $$
declare n int;
begin
  update entry_items set is_active = true, updated_at = now() where id in (301, 30761) and tenant_id = 2 and product_id = 93 and is_active = false;
  get diagnostics n = row_count; if n <> 2 then raise exception 'itens: %', n; end if;
  update stock_entries set total_cost = (select coalesce(sum(quantity_received * unit_cost), 0) from entry_items where entry_id = 6 and is_active = true), updated_at = now() where id = 6 and tenant_id = 2;
  update inventory_movements set is_active = true, updated_at = now() where id in (14, 29) and tenant_id = 2 and inventory_id = 92 and is_active = false;
  get diagnostics n = row_count; if n <> 2 then raise exception 'movimentos: %', n; end if;
  update supplier_products set is_active = true, updated_at = now() where id = 91 and tenant_id = 2 and product_id = 93 and supplier_id = 5 and is_active = false;
  get diagnostics n = row_count; if n <> 1 then raise exception 'vinculo 5: %', n; end if;
  update supplier_products set purchase_count = 2, updated_at = now() where id = 4056 and tenant_id = 2 and product_id = 93 and supplier_id = 6 and purchase_count = 1;
  get diagnostics n = row_count; if n <> 1 then raise exception 'vinculo 6: %', n; end if;
  update label_queue_items set entry_id = 6, updated_at = now() where id = 229 and tenant_id = 2 and variant_id = 29373 and entry_id = 382;
  get diagnostics n = row_count; if n <> 1 then raise exception 'fila: %', n; end if;
end $$;
commit;
