/**
 * Custom Hooks para Stock Entries
 * Gerenciamento de estado e cache com React Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockEntry, StockEntryCreate, EntryType } from '@/types';
import {
  getStockEntries,
  getStockEntryById,
  createStockEntry,
  updateStockEntry,
  deleteStockEntry,
} from '@/services/stockEntryService';

/**
 * Hook para listar entradas com filtros
 */
export function useStockEntries(params?: {
  entry_type?: EntryType;
  trip_id?: number;
  start_date?: string;
  end_date?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['stock-entries', params],
    queryFn: () => getStockEntries(params),
  });
}

/**
 * Hook para buscar entrada por ID
 */
export function useStockEntry(id: number) {
  return useQuery({
    queryKey: ['stock-entry', id],
    queryFn: () => getStockEntryById(id),
    enabled: !!id && id > 0,
  });
}

/**
 * Hook para criar entrada
 */
export function useCreateStockEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entry: StockEntryCreate) => createStockEntry(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

/**
 * Hook para atualizar entrada
 */
export function useUpdateStockEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<StockEntryCreate> }) => 
      updateStockEntry(id, data),
    onSuccess: (_data: StockEntry, variables: { id: number; data: Partial<StockEntryCreate> }) => {
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
      queryClient.invalidateQueries({ queryKey: ['stock-entry', variables.id] });
    },
  });
}

/**
 * Hook para deletar entrada
 */
export function useDeleteStockEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteStockEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
    },
  });
}
