/**
 * Custom hooks para produtos
 * React Query hooks para gerenciar estado de produtos
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getProducts,
  getProductById,
  searchProducts,
  getProductBySku,
  getProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  getLowStockProducts,
} from '@/services/productService';
import type { Product, ProductCreate, ProductUpdate, PaginationParams } from '@/types';

/**
 * Hook para listar produtos
 */
export const useProducts = (params?: PaginationParams & {
  category_id?: number;
  search?: string;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => getProducts(params),
  });
};

/**
 * Hook para obter produto por ID
 */
export const useProduct = (id: number) => {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => getProductById(id),
    enabled: !!id,
  });
};

/**
 * Hook para buscar produtos
 */
export const useSearchProducts = (query: string) => {
  return useQuery({
    queryKey: ['products', 'search', query],
    queryFn: () => searchProducts(query),
    enabled: query.length > 0,
  });
};

/**
 * Hook para obter produto por SKU
 */
export const useProductBySku = (sku: string) => {
  return useQuery({
    queryKey: ['products', 'sku', sku],
    queryFn: () => getProductBySku(sku),
    enabled: !!sku,
  });
};

/**
 * Hook para obter produto por código de barras
 */
export const useProductByBarcode = (barcode: string) => {
  return useQuery({
    queryKey: ['products', 'barcode', barcode],
    queryFn: () => getProductByBarcode(barcode),
    enabled: !!barcode,
  });
};

/**
 * Hook para criar produto
 */
export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productData: ProductCreate) => createProduct(productData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
};

/**
 * Hook para atualizar produto
 */
export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProductUpdate }) => 
      updateProduct(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products', variables.id] });
    },
  });
};

/**
 * Hook para deletar produto
 */
export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
};

/**
 * Hook para obter produtos com estoque baixo
 */
export const useLowStockProducts = () => {
  return useQuery({
    queryKey: ['products', 'low-stock'],
    queryFn: getLowStockProducts,
  });
};
