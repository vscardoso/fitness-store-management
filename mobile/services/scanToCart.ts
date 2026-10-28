/** Do resultado da leitura (`lookupCode`) para o item do carrinho do PDV, sem outra ida ao servidor. */
import type { Product } from '@/types';
import { variantLabel, type LookupResult } from './codeResolver';

export function buildCartProduct(r: LookupResult): Product {
  const v = r.variant;
  return {
    id: r.product.id,
    name: r.product.name,
    brand: r.product.brand ?? undefined,
    image_url: r.product.image_url ?? undefined,
    category_id: r.product.category_id ?? undefined,
    sku: v.sku ?? '',
    price: v.price,
    current_stock: v.current_stock,
    size: v.size ?? undefined,
    color: v.color ?? undefined,
    is_active: true,
    variant_id: v.id,
    variant_label: [v.size, v.color].filter(Boolean).join(' / ') || undefined,
  } as unknown as Product;
}

export const lookupTitle = (r: LookupResult) => `${r.product.name} · ${variantLabel(r.variant)}`;
