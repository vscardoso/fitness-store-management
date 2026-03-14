/**
 * Serviço de API para Looks (conjuntos de produtos).
 */
import api from './api';
import type { Look, LookList, CreateLookDTO, LookItemResponse } from '../types/look';

export const listLooks = async (params?: {
  customer_id?: number;
  is_public?: boolean;
  skip?: number;
  limit?: number;
}): Promise<LookList[]> => {
  const { data } = await api.get<LookList[]>('/looks/', { params });
  return data;
};

export const getLook = async (id: number): Promise<Look> => {
  const { data } = await api.get<Look>(`/looks/${id}`);
  return data;
};

export const createLook = async (payload: CreateLookDTO): Promise<Look> => {
  const { data } = await api.post<Look>('/looks/', payload);
  return data;
};

export const updateLook = async (
  id: number,
  payload: Partial<Pick<CreateLookDTO, 'name' | 'description' | 'is_public' | 'discount_percentage'>>
): Promise<Look> => {
  const { data } = await api.put<Look>(`/looks/${id}`, payload);
  return data;
};

export const deleteLook = async (id: number): Promise<void> => {
  await api.delete(`/looks/${id}`);
};

export const addItemToLook = async (
  lookId: number,
  item: { product_id: number; variant_id?: number; position?: number }
): Promise<Look> => {
  const { data } = await api.post<Look>(`/looks/${lookId}/items`, item);
  return data;
};

export const removeItemFromLook = async (lookId: number, itemId: number): Promise<void> => {
  await api.delete(`/looks/${lookId}/items/${itemId}`);
};

export default {
  listLooks,
  getLook,
  createLook,
  updateLook,
  deleteLook,
  addItemToLook,
  removeItemFromLook,
};
