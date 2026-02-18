/**
 * Serviço de catálogo de produtos
 * Gestão de produtos do catálogo global (115 produtos template)
 */

import api from './api';
import type { Product } from '@/types';

interface GetCatalogParams {
  limit?: number;
  skip?: number;
  search?: string;
  category_id?: number;
}

/**
 * Buscar produtos do catálogo global com paginação
 */
export const getCatalogProducts = async (params?: GetCatalogParams): Promise<Product[]> => {
  try {
    const { data } = await api.get<any>('/products/catalog', { params });
    // Normaliza: API pode retornar array direto ou objeto paginado { items: [...] }
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  } catch (error) {
    throw error;
  }
};

/**
 * Ativar produto do catálogo para a loja do usuário
 */
export const activateCatalogProduct = async (
  productId: number,
  customPrice?: number,
  entryId?: number,
  quantity?: number
): Promise<Product> => {
  try {
    const { data } = await api.post<Product>(`/products/catalog/${productId}/activate`, {
      custom_price: customPrice,
      entry_id: entryId,
      quantity: quantity,
    });
    return data;
  } catch (error) {
    throw error;
  }
};
