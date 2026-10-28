/** Resolvedor único de código lido (QR do adesivo ou SKU): uma chamada traz a peça, o preço, o estoque e as outras variações. */
import api from './api';
import { normalizeScan } from '@/utils/scanLogic';

export interface LookupVariant {
  id: number;
  sku: string | null;
  size: string | null;
  color: string | null;
  price: number;
  current_stock: number;
  short_code: number | null;
  display_code: string | null;
}

export interface LookupResult {
  match: 'label' | 'sku';
  variant: LookupVariant;
  product: {
    id: number;
    name: string;
    brand: string | null;
    image_url: string | null;
    category_id: number | null;
    category_name: string | null;
    base_price: number;
  };
  siblings: LookupVariant[];
  product_stock: number;
}

/** null quando o código não existe nesta loja; erro de rede continua sendo erro (a tela mostra a mensagem). */
export async function lookupCode(code: string): Promise<LookupResult | null> {
  const text = normalizeScan(code);
  if (!text) return null;
  try {
    const { data } = await api.get<LookupResult>('/product-variants/lookup', {
      params: { code: text },
      headers: { 'X-Skip-Loading': 'true' },
    });
    return data;
  } catch (e: any) {
    if (e?.response?.status === 404 || /não encontrado/i.test(e?.message || '')) return null;
    throw e;
  }
}

export const variantLabel = (v: { color: string | null; size: string | null }) =>
  [v.color, v.size].filter(Boolean).join(' / ') || 'Única';
