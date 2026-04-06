/**
 * useSuppliers — React Query hooks para fornecedores
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierProducts,
  getProductSuppliers,
} from '@/services/supplierService';
import type { SupplierCreate, SupplierUpdate } from '@/types';

export const useSuppliers = () =>
  useQuery({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
  });

export const useSupplier = (id: number) =>
  useQuery({
    queryKey: ['supplier', id],
    queryFn: () => getSupplierById(id),
    enabled: !!id && id > 0,
  });

export const useSupplierProducts = (id: number) =>
  useQuery({
    queryKey: ['supplier-products', id],
    queryFn: () => getSupplierProducts(id),
    enabled: !!id && id > 0,
  });

export const useProductSuppliers = (productId: number) =>
  useQuery({
    queryKey: ['product-suppliers', productId],
    queryFn: () => getProductSuppliers(productId),
    enabled: !!productId && productId > 0,
  });

export const useCreateSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SupplierCreate) => createSupplier(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
};

export const useUpdateSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SupplierUpdate }) =>
      updateSupplier(id, data),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
};

export const useDeleteSupplier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSupplier(id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['product-suppliers'] });
    },
  });
};
