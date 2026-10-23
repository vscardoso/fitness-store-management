/** Devolução ao fornecedor: peça com defeito ou de condicional que volta para troca ou crédito. */
import api from './api';

export interface SupplierReturn {
  id: number;
  supplier_id?: number | null;
  entry_id: number;
  entry_item_id: number;
  variant_id?: number | null;
  product_id?: number | null;
  return_item_id?: number | null;
  quantity: number;
  unit_cost: number;
  from_stock: boolean;
  reason: string;
  status: 'sent' | 'exchanged' | 'credited' | 'rejected';
  resolved_at?: string | null;
  credit_amount?: number | null;
  resolution_note?: string | null;
  created_at: string;
}

export interface DefectivePending {
  return_item_id: number;
  product_id?: number | null;
  variant_id?: number | null;
  quantity_pending: number;
  unit_cost: number;
}

export const listSupplierReturns = async (status?: string): Promise<SupplierReturn[]> => {
  const { data } = await api.get<SupplierReturn[]>('/supplier-returns/', { params: status ? { status } : {} });
  return data;
};

export const getDefectivePending = async (): Promise<DefectivePending[]> => {
  const { data } = await api.get<DefectivePending[]>('/supplier-returns/defective-pending');
  return data;
};

export const createSupplierReturn = async (payload: {
  quantity: number;
  reason: string;
  entry_item_id?: number;
  return_item_id?: number;
}): Promise<SupplierReturn> => {
  const { data } = await api.post<SupplierReturn>('/supplier-returns/', payload);
  return data;
};

export const resolveSupplierReturn = async (
  id: number,
  payload: { outcome: 'exchanged' | 'credited' | 'rejected'; note?: string; replacement_variant_id?: number; credit_amount?: number },
): Promise<SupplierReturn> => {
  const { data } = await api.post<SupplierReturn>(`/supplier-returns/${id}/resolve`, payload);
  return data;
};
