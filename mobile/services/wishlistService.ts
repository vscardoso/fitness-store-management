/**
 * Serviço de API para Wishlist.
 */
import api from './api';
import type { WishlistItem, DemandItem } from '../types/look';

export const getCustomerWishlist = async (customerId: number): Promise<WishlistItem[]> => {
  const { data } = await api.get<WishlistItem[]>(`/wishlist/customer/${customerId}`);
  return data;
};

export const addToWishlist = async (payload: {
  customer_id: number;
  product_id: number;
  variant_id?: number;
  look_id?: number;
  notes?: string;
}): Promise<WishlistItem> => {
  const { data } = await api.post<WishlistItem>('/wishlist/', payload);
  return data;
};

export const removeFromWishlist = async (wishlistId: number): Promise<void> => {
  await api.delete(`/wishlist/${wishlistId}`);
};

export const getDemandReport = async (): Promise<DemandItem[]> => {
  const { data } = await api.get<DemandItem[]>('/wishlist/demand');
  return data;
};

export default {
  getCustomerWishlist,
  addToWishlist,
  removeFromWishlist,
  getDemandReport,
};
