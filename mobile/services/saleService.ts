/**
 * Serviço de vendas
 * Criar vendas, listar, cancelar e relatórios
 */

import api from './api';
import { finishSaleKey, saleKeyFor } from '@/utils/saleIdempotency';
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
    // Idempotency-Key: repetir a mesma venda (duplo clique, nova tentativa após erro de rede) devolve a mesma venda
    const { data } = await api.post<Sale>('/sales/', saleData, { headers: { 'Idempotency-Key': saleKeyFor(saleData) } });
    finishSaleKey();
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
  sale_number?: string;
  q?: string;
  /** filtros sugeridos da lista de vendas (ver utils/salesFilters.ts) */
  fiado?: 'open' | 'overdue' | 'paid';
  payment?: 'cash' | 'pix' | 'card' | 'on_account';
  refunded?: boolean;
  no_customer?: boolean;
}, opts?: { skipLoading?: boolean }): Promise<Sale[]> => {
  try {
    // skipLoading: busca digitada não pode cobrir a tela com o carregando global a cada letra
    const { data } = await api.get<Sale[]>('/sales/', { params, ...(opts?.skipLoading ? { headers: { 'X-Skip-Loading': 'true' } } : {}) });
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
    return normalizeSale(data);
  } catch (error) {
    throw error;
  }
};

/**
 * Obter venda por sale_number
 */
export const getSaleBySaleNumber = async (saleNumber: string): Promise<SaleWithDetails> => {
  try {
    const { data } = await api.get<SaleWithDetails[]>(`/sales/`, {
      params: { sale_number: saleNumber },
    });
    // confere o número: nunca mostrar (nem mandar comprovante de) outra venda
    const found = (data || []).find((s) => s.sale_number === saleNumber);
    if (found) {
      return normalizeSale(found);
    }
    throw new Error('Venda não encontrada');
  } catch (error) {
    throw error;
  }
};

// Normaliza campos: backend envia payment_method nos pagamentos, frontend usa method
const normalizePayments = (payments: any[]): any[] =>
  (payments || []).map(p => ({
    ...p,
    // backend: payment_method → frontend: method
    method: p.method ?? p.payment_method,
    installments: p.installments ?? 1,
  }));

const normalizeSale = <T extends Partial<SaleWithDetails>>(sale: T): SaleWithDetails => {
  return {
    ...sale,
    total_amount: (sale as any).total_amount ?? (sale as any).total ?? 0,
    discount_amount: (sale as any).discount_amount ?? (sale as any).discount ?? 0,
    tax_amount: (sale as any).tax_amount ?? 0,
    items: (sale as any).items || [],
    payments: normalizePayments((sale as any).payments),
  } as SaleWithDetails;
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
 * Atribuir cliente a uma venda concluída que ficou sem cliente (só administrador ou gerente)
 */
export const assignSaleCustomer = async (id: number, customerId: number): Promise<{ id: number; customer_id: number; customer_name: string }> => {
  const { data } = await api.patch(`/sales/${id}/customer`, { customer_id: customerId });
  return data;
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
