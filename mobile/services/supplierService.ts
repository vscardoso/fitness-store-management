/**
 * Supplier Service — Catálogo de fornecedores
 * CRUD de fornecedores + relações produto↔fornecedor
 */

import api from './api';
import type { Supplier, SupplierCreate, SupplierUpdate, SupplierProduct, ProductSupplier } from '@/types';

const BASE = '/suppliers';

export async function getSuppliers(): Promise<Supplier[]> {
  const response = await api.get<Supplier[]>(BASE);
  return response.data;
}

export async function getSupplierById(id: number): Promise<Supplier> {
  const response = await api.get<Supplier>(`${BASE}/${id}`);
  return response.data;
}

export async function createSupplier(data: SupplierCreate): Promise<Supplier> {
  const response = await api.post<Supplier>(BASE, data);
  return response.data;
}

export async function updateSupplier(id: number, data: SupplierUpdate): Promise<Supplier> {
  const response = await api.put<Supplier>(`${BASE}/${id}`, data);
  return response.data;
}

export async function deleteSupplier(id: number): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}

/** Produtos comprados de um fornecedor específico */
export async function getSupplierProducts(id: number): Promise<SupplierProduct[]> {
  const response = await api.get<SupplierProduct[]>(`${BASE}/${id}/products`);
  return response.data;
}

/** Fornecedores de um produto específico */
export async function getProductSuppliers(productId: number): Promise<ProductSupplier[]> {
  const response = await api.get<ProductSupplier[]>(`/products/${productId}/suppliers`);
  return response.data;
}
