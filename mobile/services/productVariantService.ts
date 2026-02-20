/**
 * Serviço para operações com variantes de produto
 */

import api from './api';
import type {
  ProductVariant,
  ProductVariantWithProduct,
  ProductVariantMinimal,
  ProductWithVariants,
  VariantGrid,
  ProductVariantCreate,
  ProductWithVariantsCreate,
  BulkVariantCreate,
} from '@/types/productVariant';

/**
 * Cria um produto com múltiplas variantes
 */
export async function createProductWithVariants(
  data: ProductWithVariantsCreate
): Promise<ProductWithVariants> {
  const response = await api.post('/product-variants/with-product', data);
  return response.data;
}

/**
 * Cria uma variante para um produto existente
 */
export async function createVariant(
  productId: number,
  data: ProductVariantCreate
): Promise<ProductVariant> {
  const response = await api.post('/product-variants/', data, {
    params: { product_id: productId },
  });
  return response.data;
}

/**
 * Cria múltiplas variantes em massa (grade de tamanhos × cores)
 */
export async function createBulkVariants(
  data: BulkVariantCreate
): Promise<{ product_id: number; variants_created: number; variants: ProductVariant[] }> {
  const response = await api.post('/product-variants/bulk', data);
  return response.data;
}

/**
 * Busca uma variante por ID
 */
export async function getVariantById(id: number): Promise<ProductVariantWithProduct> {
  const response = await api.get(`/product-variants/${id}`);
  return response.data;
}

/**
 * Busca uma variante por SKU
 */
export async function getVariantBySku(sku: string): Promise<ProductVariantWithProduct> {
  const response = await api.get(`/product-variants/sku/${sku}`);
  return response.data;
}

/**
 * Lista todas as variantes de um produto
 */
export async function getProductVariants(productId: number): Promise<ProductVariant[]> {
  const response = await api.get(`/product-variants/product/${productId}`);
  return response.data;
}

/**
 * Busca a grade de variações de um produto
 */
export async function getVariantGrid(productId: number): Promise<VariantGrid> {
  const response = await api.get(`/product-variants/product/${productId}/grid`);
  return response.data;
}

/**
 * Busca variantes por termo
 */
export async function searchVariants(
  query: string,
  skip: number = 0,
  limit: number = 50
): Promise<ProductVariantMinimal[]> {
  const response = await api.get('/product-variants/search/', {
    params: { q: query, skip, limit },
  });
  return response.data;
}

/**
 * Atualiza uma variante
 */
export async function updateVariant(
  variantId: number,
  data: Partial<ProductVariantCreate>
): Promise<ProductVariant> {
  const response = await api.patch(`/product-variants/${variantId}`, data);
  return response.data;
}

/**
 * Desativa uma variante
 */
export async function deleteVariant(variantId: number): Promise<void> {
  await api.delete(`/product-variants/${variantId}`);
}

/**
 * Gera SKUs para variantes baseado em prefixo, cor e tamanho
 */
export function generateVariantSku(
  prefix: string,
  color?: string,
  size?: string,
  counter?: number
): string {
  let sku = prefix.toUpperCase();
  
  if (color) {
    sku += `-${color.substring(0, 3).toUpperCase()}`;
  }
  
  if (size) {
    sku += `-${size.toUpperCase()}`;
  }
  
  if (counter && counter > 1) {
    sku += `-${counter.toString().padStart(3, '0')}`;
  }
  
  return sku;
}

/**
 * Gera lista de SKUs para uma grade de variações
 */
export function generateVariantSkus(
  prefix: string,
  sizes: string[],
  colors: string[]
): { size: string; color: string; sku: string }[] {
  const result: { size: string; color: string; sku: string }[] = [];
  
  for (const color of colors) {
    for (const size of sizes) {
      const sku = generateVariantSku(prefix, color, size);
      result.push({ size, color, sku });
    }
  }
  
  return result;
}

/**
 * Formata label da variante para exibição
 */
export function formatVariantLabel(variant: { size?: string | null; color?: string | null }): string {
  const parts: string[] = [];
  
  if (variant.color) {
    parts.push(variant.color);
  }
  
  if (variant.size) {
    parts.push(variant.size);
  }
  
  return parts.length > 0 ? parts.join(' · ') : 'Único';
}

/**
 * Formata preço considerando faixa de preços
 */
export function formatPriceRange(
  minPrice: number,
  maxPrice: number | null
): string {
  if (!maxPrice || minPrice === maxPrice) {
    return `R$ ${minPrice.toFixed(2)}`;
  }
  
  return `R$ ${minPrice.toFixed(2)} - R$ ${maxPrice.toFixed(2)}`;
}

export default {
  createProductWithVariants,
  createVariant,
  createBulkVariants,
  getVariantById,
  getVariantBySku,
  getProductVariants,
  getVariantGrid,
  searchVariants,
  updateVariant,
  deleteVariant,
  generateVariantSku,
  generateVariantSkus,
  formatVariantLabel,
  formatPriceRange,
};