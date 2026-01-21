/**
 * Custom hooks para vendas
 * React Query hooks para gerenciar estado de vendas
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  createSale,
  getSales,
  getSaleById,
  getSaleBySaleNumber,
  cancelSale,
  getDailySalesTotal,
  getSalesReport,
} from '@/services/saleService';
import type { Sale, SaleCreate, SaleWithDetails, PaginationParams } from '@/types';

/**
 * Hook para listar vendas
 */
export const useSales = (params?: PaginationParams & {
  customer_id?: number;
  seller_id?: number;
  start_date?: string;
  end_date?: string;
}) => {
  return useQuery({
    queryKey: ['sales', params],
    queryFn: () => getSales(params),
  });
};

/**
 * Hook para obter venda por ID
 */
export const useSale = (id: number) => {
  return useQuery({
    queryKey: ['sales', id],
    queryFn: () => getSaleById(id),
    enabled: !!id,
  });
};

/**
 * Hook para obter venda por sale_number
 */
export const useSaleBySaleNumber = (saleNumber: string) => {
  return useQuery({
    queryKey: ['sales', 'number', saleNumber],
    queryFn: () => getSaleBySaleNumber(saleNumber),
    enabled: !!saleNumber,
  });
};

/**
 * Hook para criar venda
 */
export const useCreateSale = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (saleData: SaleCreate) => createSale(saleData),
    onSuccess: () => {
      // Invalida lista de vendas e totais do dia
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['recent-sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'reports', 'daily'] });
      // Invalida produtos (estoque pode ter mudado)
      queryClient.invalidateQueries({ queryKey: ['products'] });
      // Invalida dashboard (metricas foram atualizadas)
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-health'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales-by-period'] });
    },
  });
};

/**
 * Hook para cancelar venda
 */
export const useCancelSale = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => cancelSale(id),
    onSuccess: (_, id) => {
      // Invalida lista de vendas, detalhe da venda e totais
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sales', id] });
      queryClient.invalidateQueries({ queryKey: ['sales', 'reports', 'daily'] });
      // Invalida produtos (estoque foi restaurado)
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
};

/**
 * Hook para obter total de vendas do dia
 */
export const useDailySalesTotal = (date?: string) => {
  return useQuery({
    queryKey: ['sales', 'reports', 'daily', date],
    queryFn: () => getDailySalesTotal(date),
  });
};

/**
 * Hook para obter relatório de vendas por período
 */
export const useSalesReport = (startDate: string, endDate: string) => {
  return useQuery({
    queryKey: ['sales', 'reports', 'period', startDate, endDate],
    queryFn: () => getSalesReport(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
};
