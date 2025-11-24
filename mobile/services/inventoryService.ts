/**
 * Serviço de estoque/inventário
 * Adicionar/remover estoque, alertas e movimentações
 */

import api from './api';
import type { 
  Inventory, 
  StockMovement, 
  StockMovementResponse,
  StockAlert 
} from '@/types';

/**
 * Adicionar estoque
 */
export const addStock = async (movement: StockMovement): Promise<Inventory> => {
  try {
    const { data } = await api.post<Inventory>('/inventory/add', movement);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Remover estoque
 */
export const removeStock = async (movement: StockMovement): Promise<Inventory> => {
  try {
    const { data } = await api.post<Inventory>('/inventory/remove', movement);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter estoque do produto
 */
export const getProductStock = async (productId: number): Promise<Inventory> => {
  try {
    const { data } = await api.get<Inventory>(`/inventory/product/${productId}`);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter alertas de estoque baixo
 */
export const getStockAlerts = async (): Promise<StockAlert[]> => {
  try {
    const { data } = await api.get<StockAlert[]>('/inventory/alerts');
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter histórico de movimentações
 */
export const getProductMovements = async (productId: number, limit: number = 50): Promise<StockMovementResponse[]> => {
  try {
    const { data } = await api.get<StockMovementResponse[]>(`/inventory/movements/${productId}`, {
      params: { limit },
    });
    return data;
  } catch (error) {
    throw error;
  }
};
