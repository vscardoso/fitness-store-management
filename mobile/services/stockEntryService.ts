/**
 * Stock Entry Service - Gerenciamento de Entradas de Estoque
 * Comunicação com API de entradas (CRUD + Analytics)
 */

import api from './api';
import type { StockEntry, StockEntryCreate, StockEntryWithItems, EntryType } from '@/types';

// Use trailing slash to avoid 307 redirects that may drop Authorization headers
const ENTRIES_ENDPOINT = '/stock-entries/';

/**
 * Listar todas as entradas com filtros opcionais
 */
export async function getStockEntries(params?: {
  entry_type?: EntryType;
  trip_id?: number;
  start_date?: string;
  end_date?: string;
  limit?: number;
  skip?: number;
}): Promise<StockEntry[]> {
  const response = await api.get<StockEntry[]>(ENTRIES_ENDPOINT, { params });
  return response.data;
}

/**
 * Listar entradas por viagem específica
 */
export async function getEntriesByTrip(trip_id: number): Promise<StockEntry[]> {
  const response = await api.get<StockEntry[]>(ENTRIES_ENDPOINT, { params: { trip_id } });
  return response.data;
}

/**
 * Buscar entrada por ID
 */
export async function getStockEntryById(id: number): Promise<StockEntryWithItems> {
  const response = await api.get<StockEntryWithItems>(`${ENTRIES_ENDPOINT}${id}`);
  return response.data;
}

/**
 * Buscar analytics de uma entrada
 * Retorna métricas detalhadas: sell-through, ROI, best sellers, etc.
 */
export async function getStockEntryAnalytics(id: number): Promise<{
  sell_through_rate: number;
  roi: number;
  total_revenue: number;
  total_profit: number;
  best_sellers: Array<{ product_id: number; product_name: string; quantity_sold: number }>;
  slow_movers: Array<{ product_id: number; product_name: string; quantity_remaining: number }>;
}> {
  const response = await api.get(`${ENTRIES_ENDPOINT}${id}/analytics`);
  return response.data;
}

/**
 * Criar nova entrada de estoque com items
 */
export async function createStockEntry(entry: StockEntryCreate): Promise<StockEntry> {
  const response = await api.post<StockEntry>(ENTRIES_ENDPOINT, entry);
  return response.data;
}

/**
 * Atualizar entrada de estoque
 */
export async function updateStockEntry(id: number, entry: Partial<StockEntryCreate>): Promise<StockEntry> {
  const response = await api.put<StockEntry>(`${ENTRIES_ENDPOINT}${id}`, entry);
  return response.data;
}

/**
 * Deletar entrada (soft delete)
 */
export async function deleteStockEntry(id: number): Promise<void> {
  await api.delete(`${ENTRIES_ENDPOINT}${id}`);
}

/**
 * Buscar produtos com baixa movimentação
 * @param params.days_threshold - Dias mínimos sem venda (padrão: 30)
 * @param params.depletion_threshold - % máxima de depleção para considerar lento (padrão: 30)
 */
export async function getSlowMovingProducts(params?: {
  days_threshold?: number;
  depletion_threshold?: number;
}): Promise<Array<{
  entry_id: number;
  entry_code: string;
  product_id: number;
  product_name: string;
  quantity_remaining: number;
  quantity_received: number;
  depletion_percentage: number;
  days_in_stock: number;
}>> {
  const response = await api.get(`${ENTRIES_ENDPOINT}slow-moving`, { params });
  return response.data;
}

/**
 * Buscar entradas com melhor performance
 * Ordenado por ROI e sell-through rate
 */
export async function getBestPerformingEntries(limit: number = 10): Promise<Array<{
  entry_id: number;
  entry_code: string;
  supplier_name: string;
  total_cost: number;
  sell_through_rate: number;
  roi: number;
  entry_date: string;
  entry_type: EntryType;
}>> {
  const response = await api.get(`${ENTRIES_ENDPOINT}best-performing`, { params: { limit } });
  return response.data;
}
