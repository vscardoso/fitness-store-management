import api from '@/services/api';
import type { Category, CategoryCreate } from '@/types';

export interface CategoryUpdate {
  name?: string;
  description?: string;
  parent_id?: number | null;
}

/**
 * Listar todas as categorias (plana)
 */
export const getCategories = async (): Promise<Category[]> => {
  const { data } = await api.get<any>('/categories/');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.categories)) return data.categories;
  return [];
};

/**
 * Buscar categoria por ID (com subcategorias)
 */
export const getCategoryById = async (id: number): Promise<Category> => {
  const { data } = await api.get<Category>(`/categories/${id}`);
  return data;
};

/**
 * Criar nova categoria
 */
export const createCategory = async (category: CategoryCreate): Promise<Category> => {
  const { data } = await api.post<Category>('/categories/', category);
  return data;
};

/**
 * Atualizar categoria
 */
export const updateCategory = async (id: number, category: CategoryUpdate): Promise<Category> => {
  const { data } = await api.put<Category>(`/categories/${id}`, category);
  return data;
};

/**
 * Deletar categoria (soft delete)
 */
export const deleteCategory = async (id: number): Promise<void> => {
  await api.delete(`/categories/${id}`);
};
