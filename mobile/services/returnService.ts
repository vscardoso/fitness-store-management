/**
 * Serviço de devoluções
 * Verificar elegibilidade, processar devoluções e histórico
 */

import api from './api';

/**
 * Verificar elegibilidade para devolução
 */
export const checkReturnEligibility = async (saleId: number): Promise<ReturnEligibility> => {
  try {
    const { data } = await api.get<ReturnEligibility>(`/returns/eligibility/${saleId}`);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Processar devolução
 */
export const processReturn = async (saleId: number, returnData: ReturnRequest): Promise<SaleReturn> => {
  try {
    const { data } = await api.post<SaleReturn>(`/returns/${saleId}`, returnData);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Buscar histórico de devoluções de uma venda
 */
export const getReturnHistory = async (saleId: number): Promise<SaleReturn[]> => {
  try {
    const { data } = await api.get<SaleReturn[]>(`/returns/history/${saleId}`);
    return data;
  } catch (error) {
    throw error;
  }
};

// Tipos
export interface ReturnableItem {
  sale_item_id: number;
  product_id: number;
  product_name: string;
  quantity_purchased: number;
  quantity_already_returned: number;
  quantity_available_for_return: number;
  unit_price: number;
  max_refund_amount: number;
}

export interface ReturnEligibility {
  sale_id: number;
  sale_number: string;
  sale_date: string;
  days_since_sale: number;
  is_eligible: boolean;
  reason: string | null;
  max_return_days: number;
  items: ReturnableItem[];
}

export interface ReturnItemRequest {
  sale_item_id: number;
  quantity: number;
}

export interface ReturnRequest {
  items: ReturnItemRequest[];
  reason: string;
  refund_method?: 'original' | 'store_credit' | 'cash';
}

export interface ReturnItemResponse {
  sale_item_id: number;
  product_id: number;
  product_name: string;
  quantity_returned: number;
  unit_price: number;
  unit_cost: number;
  refund_amount: number;
}

export interface SaleReturn {
  id: number;
  sale_id: number;
  sale_number: string;
  return_number: string;
  status: string;
  reason: string;
  total_refund: number;
  items: ReturnItemResponse[];
  created_at: string;
  processed_by_id: number;
  processed_by_name: string;
}