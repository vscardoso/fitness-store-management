/**
 * useSupplierInsights: React Query para ranking, comparação de custo e reposição de fornecedores.
 */
import { useQuery } from '@tanstack/react-query';
import { getCostComparison, getRestockList, getSupplierRanking } from '@/services/supplierInsightsService';

export const useSupplierRanking = (days: number) =>
  useQuery({
    queryKey: ['supplier-ranking', days],
    queryFn: () => getSupplierRanking(days),
  });

export const useCostComparison = () =>
  useQuery({
    queryKey: ['supplier-cost-comparison'],
    queryFn: getCostComparison,
  });

export const useRestockList = (coverDays: number) =>
  useQuery({
    queryKey: ['supplier-restock-list', coverDays],
    queryFn: () => getRestockList(coverDays),
  });
