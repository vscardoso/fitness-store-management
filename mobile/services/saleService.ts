/**
 * Serviço de vendas
 * Criar vendas, listar, cancelar e relatórios
 */

import api from './api';
import type { 
  Sale, 
  SaleCreate, 
  SaleWithDetails,
  PaginationParams 
} from '@/types';

/**
 * Criar nova venda
 */
export const createSale = async (saleData: SaleCreate): Promise<Sale> => {
  try {
    const { data } = await api.post<Sale>('/sales', saleData);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Listar vendas
 */
export const getSales = async (params?: PaginationParams & {
  customer_id?: number;
  seller_id?: number;
  start_date?: string;
  end_date?: string;
}): Promise<Sale[]> => {
  try {
    const { data } = await api.get<Sale[]>('/sales/', { params });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter venda por ID
 */
export const getSaleById = async (id: number): Promise<SaleWithDetails> => {
  try {
    const { data } = await api.get<SaleWithDetails>(`/sales/${id}`);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter venda por sale_number
 */
export const getSaleBySaleNumber = async (saleNumber: string): Promise<SaleWithDetails> => {
  try {
    // Backend retorna array, pegamos o primeiro
    const { data } = await api.get<SaleWithDetails[]>(`/sales/`, {
      params: { sale_number: saleNumber },
    });
    if (data && data.length > 0) {
      return data[0];
    }
    throw new Error('Venda não encontrada');
  } catch (error) {
    throw error;
  }
};

/**
 * Cancelar venda
 */
export const cancelSale = async (id: number): Promise<Sale> => {
  try {
    const { data } = await api.post<Sale>(`/sales/${id}/cancel`);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter total de vendas do dia
 */
export const getDailySalesTotal = async (date?: string): Promise<{ total: number }> => {
  try {
    const { data } = await api.get('/sales/reports/daily', {
      params: { date },
    });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter relatório de vendas por período
 */
export const getSalesReport = async (startDate: string, endDate: string): Promise<any> => {
  try {
    const { data } = await api.get('/sales/reports/period', {
      params: {
        start_date: startDate,
        end_date: endDate,
      },
    });
    return data;
  } catch (error) {
    throw error;
  }
};
