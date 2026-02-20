import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import type { Category } from '@/types';

/**
 * Buscar todas as categorias
 */
const getCategories = async (): Promise<Category[]> => {
  try {
    const { data } = await api.get<any>('/categories');
    // Normaliza: API pode retornar array direto ou objeto paginado { items: [...] }
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.categories)) return data.categories;
    return [];
  } catch (error) {
    throw error;
  }
};

/**
 * Hook para gerenciar categorias
 */
export const useCategories = () => {
  const { data: categories, isLoading, isError, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  });

  return {
    categories: categories || [],
    isLoading,
    isError,
    refetch,
  };
};
