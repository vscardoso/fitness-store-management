/**
 * Serviço de clientes
 * CRUD completo + histórico de compras
 */

import api from './api';
import type { 
  Customer, 
  CustomerCreate, 
  CustomerUpdate,
  PaginationParams 
} from '@/types';

/**
 * Listar clientes
 */
export const getCustomers = async (params?: PaginationParams & {
  search?: string;
}): Promise<Customer[]> => {
  try {
    // Use trailing slash para evitar redirect 307 que pode perder Authorization
    const { data } = await api.get<Customer[]>('/customers/', { params });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter cliente por ID
 */
export const getCustomerById = async (id: number): Promise<Customer> => {
  try {
    const { data } = await api.get<Customer>(`/customers/${id}`);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Criar cliente
 */
export const createCustomer = async (customerData: CustomerCreate): Promise<Customer> => {
  try {
    // Trailing slash evita problemas de redirect em POST
    const { data } = await api.post<Customer>('/customers/', customerData);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Atualizar cliente
 */
export const updateCustomer = async (id: number, customerData: CustomerUpdate): Promise<Customer> => {
  try {
    const { data } = await api.put<Customer>(`/customers/${id}`, customerData);
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Deletar cliente
 */
export const deleteCustomer = async (id: number): Promise<void> => {
  try {
    await api.delete(`/customers/${id}`);
  } catch (error) {
    throw error;
  }
};

/**
 * Buscar clientes
 */
export const searchCustomers = async (query: string): Promise<Customer[]> => {
  try {
    const { data } = await api.get<Customer[]>('/customers/', {
      params: { search: query },
    });
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * Obter histórico de compras do cliente
 */
export const getCustomerPurchases = async (customerId: number): Promise<any[]> => {
  try {
    const { data } = await api.get(`/customers/${customerId}/purchases`);
    return data;
  } catch (error) {
    throw error;
  }
};

// ─── LGPD: direitos do titular ────────────────────────────────────────────────

export interface CustomerAccessEntry {
  data: string;
  acao: string;
  codigo: string;
  usuario: string | null;
  ip: string | null;
}

/** Tudo que a loja guarda sobre o cliente (JSON), para entregar a quem pediu. */
export const exportCustomerData = async (id: number): Promise<Record<string, any>> => {
  const { data } = await api.get(`/customers/${id}/export`, {
    headers: { 'X-Loading-Message': 'Reunindo os dados...' },
  });
  return data;
};

/** Apaga os dados pessoais (não tem volta). O servidor exige a palavra ANONIMIZAR. */
export const anonymizeCustomer = async (id: number, confirmacao: string): Promise<{ message: string }> => {
  const { data } = await api.post(`/customers/${id}/anonymize`, { confirmacao }, {
    headers: { 'X-Loading-Message': 'Anonimizando...' },
  });
  return data;
};

/** Quem abriu, alterou, exportou ou anonimizou o cadastro (só admin). */
export const getCustomerAccessLog = async (id: number): Promise<CustomerAccessEntry[]> => {
  const { data } = await api.get<CustomerAccessEntry[]>(`/customers/${id}/access-log`, {
    headers: { 'X-Skip-Loading': 'true' },
  });
  return data;
};
