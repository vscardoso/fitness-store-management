/**
 * Custom hooks para clientes
 * React Query hooks para gerenciar estado de clientes
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getCustomers,
  getCustomerById,
  searchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerPurchases,
} from '@/services/customerService';
import type { Customer, CustomerCreate, CustomerUpdate, PaginationParams } from '@/types';

/**
 * Hook para listar clientes
 */
export const useCustomers = (params?: PaginationParams & {
  search?: string;
}) => {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => getCustomers(params),
  });
};

/**
 * Hook para obter cliente por ID
 */
export const useCustomer = (id: number) => {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => getCustomerById(id),
    enabled: !!id,
  });
};

/**
 * Hook para buscar clientes
 */
export const useSearchCustomers = (query: string) => {
  return useQuery({
    queryKey: ['customers', 'search', query],
    queryFn: () => searchCustomers(query),
    enabled: query.length > 0,
  });
};

/**
 * Hook para criar cliente
 */
export const useCreateCustomer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (customerData: CustomerCreate) => createCustomer(customerData),
    onSuccess: () => {
      // Invalida lista de clientes para forçar atualização
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};

/**
 * Hook para atualizar cliente
 */
export const useUpdateCustomer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CustomerUpdate }) => 
      updateCustomer(id, data),
    onSuccess: (_, variables) => {
      // Invalida lista e detalhe do cliente
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers', variables.id] });
    },
  });
};

/**
 * Hook para deletar cliente
 */
export const useDeleteCustomer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteCustomer(id),
    onSuccess: () => {
      // Invalida lista de clientes
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
};

/**
 * Hook para obter histórico de compras do cliente
 */
export const useCustomerPurchases = (customerId: number) => {
  return useQuery({
    queryKey: ['customers', customerId, 'purchases'],
    queryFn: () => getCustomerPurchases(customerId),
    enabled: !!customerId,
  });
};
