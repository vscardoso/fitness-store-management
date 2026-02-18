/**
 * Serviço de produtos
 * CRUD completo + busca por SKU/barcode + estoque baixo
 */

import api from './api';
import type {
  Product,
  ProductCreate,
  ProductUpdate,
  PaginationParams,
  ProductQuantityAdjustRequest,
  ProductQuantityAdjustResponse,
  FIFOCostInfo,
} from '@/types';

/**
 * Listar produtos ATIVOS da loja (não inclui catálogo)
 * Produtos que o lojista já ativou ou criou manualmente
 */
export const getActiveProducts = async (params?: PaginationParams): Promise<Product[]> => {
  try {
    const { data } = await api.get<Product[]>('/products/active', { params });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Listar produtos (endpoint antigo - use getActiveProducts)
 * @deprecated Use getActiveProducts para listar apenas produtos da loja
 */
export const getProducts = async (params?: PaginationParams & {
  category_id?: number;
  search?: string;
  has_stock?: boolean;
}): Promise<Product[]> => {
  try {
    const { data } = await api.get<Product[]>('/products/', { params });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter produto por ID
 */
export const getProductById = async (id: number): Promise<Product> => {
  try {
    const { data } = await api.get<Product>(`/products/${id}`);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Buscar produtos
 */
export const searchProducts = async (query: string): Promise<Product[]> => {
  try {
    const { data } = await api.get<Product[]>('/products/', {
      params: { search: query },
    });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter produto por SKU
 */
export const getProductBySku = async (sku: string): Promise<Product> => {
  try {
    const { data } = await api.get<Product>(`/products/sku/${sku}`);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter produto por código de barras
 */
export const getProductByBarcode = async (barcode: string): Promise<Product> => {
  try {
    const { data } = await api.get<Product>(`/products/barcode/${barcode}`);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Criar produto
 */
export const createProduct = async (productData: ProductCreate): Promise<Product> => {
  try {
    const { data } = await api.post<Product>('/products/', productData);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Atualizar produto
 */
export const updateProduct = async (id: number, productData: ProductUpdate): Promise<Product> => {
  try {
    const { data } = await api.put<Product>(`/products/${id}`, productData);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Deletar produto
 */
export const deleteProduct = async (id: number): Promise<void> => {
  try {
    await api.delete(`/products/${id}`);
  } catch (error) {
    throw error;
  }
};

/**
 * Obter produtos com estoque baixo
 */
export const getLowStockProducts = async (): Promise<any[]> => {
  try {
    const { data } = await api.get('/products/low-stock');
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Buscar produtos de catálogo
 */
export const getCatalogProducts = async (params?: {
  skip?: number;
  limit?: number;
  category_id?: number;
  search?: string;
}): Promise<Product[]> => {
  try {
    const { data } = await api.get<Product[]>('/products/catalog', { params });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Ajustar quantidade do produto (FIFO)
 */
export const adjustProductQuantity = async (
  productId: number,
  payload: ProductQuantityAdjustRequest,
): Promise<ProductQuantityAdjustResponse> => {
  try {
    const { data } = await api.post<ProductQuantityAdjustResponse>(
      `/products/${productId}/adjust-quantity`,
      payload,
    );
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Buscar custos FIFO para lista de produtos (usado pelo carrinho)
 */
export const getFIFOCosts = async (
  productIds: number[],
): Promise<Record<string, FIFOCostInfo>> => {
  const { data } = await api.post<Record<string, FIFOCostInfo>>(
    '/products/fifo-costs',
    productIds,
  );
  return data;
};

// ============================================
// CÓDIGO DE BARRAS
// ============================================

export interface GenerateBarcodeResponse {
  barcode: string;
  product_id?: number;
  valid?: boolean;
  format?: string;
  message: string;
}

/**
 * Gerar código de barras para um produto existente
 */
export const generateProductBarcode = async (
  productId: number,
): Promise<GenerateBarcodeResponse> => {
  const { data } = await api.post<GenerateBarcodeResponse>(
    `/products/${productId}/generate-barcode`,
  );
  return data;
};

/**
 * Gerar código de barras standalone (sem associar a produto)
 * Útil para pré-gerar durante criação de produto
 */
export const generateStandaloneBarcode = async (): Promise<GenerateBarcodeResponse> => {
  const { data } = await api.post<GenerateBarcodeResponse>(
    '/products/generate-barcode',
  );
  return data;
};
