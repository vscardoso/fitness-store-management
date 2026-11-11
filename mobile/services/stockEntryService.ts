/**
 * Stock Entry Service - Gerenciamento de Entradas de Estoque
 * Comunicação com API de entradas (CRUD + Analytics)
 */

import api from './api';
import { skipLoading } from '@/utils/apiHelpers';
import type { StockEntry, StockEntryCreate, StockEntryWithItems, EntryType } from '@/types';

// Use trailing slash to avoid 307 redirects that may drop Authorization headers
const ENTRIES_ENDPOINT = '/stock-entries/';

/**
 * Listar todas as entradas com filtros opcionais
 */
export async function getStockEntries(params?: {
  entry_type?: EntryType;
  start_date?: string;
  end_date?: string;
  limit?: number;
  skip?: number;
}): Promise<StockEntry[]> {
  const response = await api.get<StockEntry[]>(ENTRIES_ENDPOINT, { params });
  return response.data;
}

/**
 * Buscar entrada por ID
 */
export async function getStockEntryById(id: number): Promise<StockEntryWithItems> {
  const response = await api.get<StockEntryWithItems>(`${ENTRIES_ENDPOINT}${id}`, skipLoading());
  return response.data;
}

/**
 * Buscar analytics de uma entrada
 * Retorna métricas detalhadas: sell-through, ROI, best sellers, etc.
 */
export interface LotAnalytics {
  entry_id: number;
  entry_code: string;
  total_quantity_received: number;
  total_quantity_sold: number;
  total_quantity_remaining: number;
  /** Mercadoria: o que foi pago ao fornecedor. */
  total_cost: number;
  /** Despesas lançadas neste lote (frete, embalagem...). */
  own_costs: number;
  /** Desconto do fornecedor (já abatido do custo). */
  discount_amount: number;
  /** Frete + despesas do lote, menos o desconto. */
  extra_costs_total: number;
  /** Mercadoria + custos do lote. */
  total_investment: number;
  /** Dinheiro que já entrou com as vendas deste lote (líquido de devolução). */
  real_revenue: number;
  /** Custo das peças já vendidas (com a parte do frete). */
  cost_of_sold: number;
  gross_profit: number;
  /** De cada R$ 100 vendidos, quanto virou lucro. */
  margin_pct: number;
  /** Quanto do dinheiro gasto já voltou em vendas (%). */
  recovered_pct: number;
  stock_value_remaining: number;
  projected_profit_if_all_sold: number;
  sell_through_rate: number;
  /** Se vender tudo desta entrada pelos preços de hoje. */
  potential_revenue_total: number;
  potential_profit_total: number;
  /** Lucro em cima do custo (markup). */
  markup_pct_total: number;
  /** Lucro em cima da venda. */
  potential_margin_pct: number;
  /** Por peça: custo com frete, preço, lucro, markup e margem. */
  items: LotItemNumbers[];
}

export interface LotItemNumbers {
  item_id: number;
  quantity_received: number;
  merchandise_unit_cost: number;
  extra_unit_cost: number;
  /** Parte do custo que é frete, por peça. */
  freight_unit_cost?: number;
  /** Preço de tabela por peça (opcional); o pago é o custo da mercadoria. */
  list_unit_cost?: number | null;
  /** Desconto negociado no preço da peça (tabela - pago); já está no custo, só é mostrado. */
  item_discount_unit?: number;
  /** Parte do custo que o desconto do fornecedor tirou, por peça. */
  discount_unit_cost?: number;
  landed_unit_cost: number;
  sell_price: number;
  profit_per_unit: number;
  markup_pct: number;
  margin_pct: number;
}

export async function getStockEntryAnalytics(id: number): Promise<LotAnalytics> {
  const response = await api.get<LotAnalytics>(`${ENTRIES_ENDPOINT}${id}/analytics`, skipLoading());
  return response.data;
}

export interface EntryTrackingEvent {
  when: string | null;
  reason: string;
  label: string;
  delta: number;
  after: number;
  note?: string | null;
  reconstructed: boolean;
}

export interface EntryTrackingRow {
  item_id: number;
  product_name?: string | null;
  variant_label?: string | null;
  variant_code?: string | null;
  received: number;
  sold: number;
  with_customer: number;
  removed: number;
  removed_recorded: number;
  removed_unrecorded: number;
  remaining: number;
  history: EntryTrackingEvent[];
}

export interface EntryTracking {
  entry_id: number;
  entry_code: string;
  totals: { received: number; sold: number; with_customer: number; removed: number; gifted?: number; remaining: number; removed_unrecorded: number; closed: boolean };
  items: EntryTrackingRow[];
}

/** Rastreio das peças da entrada: para onde foi cada uma (vendida, com a cliente, saiu sem venda, em estoque). */
export async function getEntryTracking(id: number): Promise<EntryTracking> {
  const response = await api.get<EntryTracking>(`${ENTRIES_ENDPOINT}${id}/tracking`, skipLoading());
  return response.data;
}

export type RemovalReason =
  | 'baixa_conferencia' | 'variacao_excluida' | 'produto_excluido' | 'entrada_excluida' | 'ajuste_estoque' | 'baixa_sem_registro';

export interface StockRemoval {
  id: number;
  when: string | null;
  reason: RemovalReason;
  label: string;
  quantity: number;
  product_id: number | null;
  product_name: string;
  variant_label: string | null;
  variant_code: string | null;
  entry_id: number | null;
  entry_code: string | null;
  unit_cost: number | string;
  cost_total: number | string;
  user_name: string | null;
  note: string | null;
  reconstructed: boolean;
}

export interface StockRemovals {
  totals: { pieces: number; cost: number | string; by_reason: Record<string, { label: string; pieces: number }> };
  total_count: number;
  items: StockRemoval[];
}

/** Peças que saíram do estoque sem venda (baixa, exclusão, ajuste), com motivo, quem fez e o custo. */
export async function getStockRemovals(params: {
  start_date?: string; end_date?: string; reason?: string; entry_id?: number; limit?: number; skip?: number;
}): Promise<StockRemovals> {
  const response = await api.get<StockRemovals>(`${ENTRIES_ENDPOINT}removals`, { ...skipLoading(), params });
  return response.data;
}

export interface LotCosts {
  entry_id: number;
  merchandise_cost: number;
  lot_expenses: Array<{ id: number; description: string; amount: number; date: string }>;
  lot_expenses_total: number;
  /** Desconto total (geral + por fornecedor). */
  discount_amount: number;
  /** Parte que vale para todos os itens da entrada. */
  general_discount?: number;
  /** Soma dos descontos negociados nos preços das peças (já dentro do custo pago). */
  item_discounts_total?: number;
  /** Fornecedores da entrada, com a mercadoria e o desconto de cada um. */
  suppliers?: Array<{ supplier_id: number; name: string; merchandise: number; discount: number }>;
  extra_costs_total: number;
  total_investment: number;
  cost_increase_pct: number;
}

export async function getStockEntryCosts(id: number): Promise<LotCosts> {
  const response = await api.get<LotCosts>(`${ENTRIES_ENDPOINT}${id}/costs`, skipLoading());
  return response.data;
}

export interface AddVariantToEntryResult {
  item_id: number;
  entry_id: number;
  product_id: number;
  variant_id: number;
  sku: string;
  color?: string | null;
  size?: string | null;
  quantity_received: number;
  variant_created: boolean;
}

/** Lança numa entrada existente uma peça de OUTRA variação de um produto já cadastrado (cria a variação se não existir). */
export async function addVariantToEntry(
  entryId: number,
  payload: {
    product_id: number; color?: string; size?: string; quantity: number; cost_price: number; price?: number; sku?: string;
    /** Fornecedor desta compra (padrão: o da entrada) e preço cheio dele (opcional). */
    supplier_id?: number; list_unit_cost?: number;
  }
): Promise<AddVariantToEntryResult> {
  const response = await api.post<AddVariantToEntryResult>(`${ENTRIES_ENDPOINT}${entryId}/variants`, payload);
  return response.data;
}

export interface AddVariantsBatchResult {
  entry_id: number;
  product_id: number;
  items: { variant_id: number; sku: string; color?: string | null; size?: string | null; quantity_received: number; variant_created: boolean }[];
  total_quantity: number;
  created: number;
}

/** Lança de uma vez VÁRIAS variações de um produto numa entrada existente (tudo ou nada): peças que já existem e combinações novas. */
export async function addVariantsBatchToEntry(
  entryId: number,
  payload: {
    product_id: number;
    items: { variant_id?: number; color?: string; size?: string; quantity: number; cost_price: number; list_unit_cost?: number }[];
    supplier_id?: number;
  },
): Promise<AddVariantsBatchResult> {
  const response = await api.post<AddVariantsBatchResult>(`${ENTRIES_ENDPOINT}${entryId}/variants/batch`, payload);
  return response.data;
}

export interface LotProfitRow {
  entry_id: number;
  entry_code: string;
  entry_date: string;
  supplier_name: string;
  total_investment: number;
  real_revenue: number;
  gross_profit: number;
  margin_pct: number;
  recovered_pct: number;
  sell_through_rate: number;
  projected_profit_if_all_sold: number;
}

export async function getLotProfitRanking(): Promise<LotProfitRow[]> {
  const response = await api.get<LotProfitRow[]>(`${ENTRIES_ENDPOINT}profit-ranking`, skipLoading());
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
 * Criar nova entrada de estoque com NOVO produto em transação atômica
 * Garante que o produto só é criado se a entrada for criada com sucesso
 */
export async function createStockEntryWithNewProduct(
  productData: {
    product_name: string;
    product_sku: string;
    product_barcode?: string;
    product_description?: string;
    product_brand?: string;
    product_color?: string;
    product_size?: string;
    product_category_id: number;
    product_cost_price?: number;
    product_price: number;
  },
  entryData: {
    entry_code: string;
    entry_date?: string;
    entry_type?: 'online' | 'local';
      supplier_id?: number;
    supplier_name?: string;
    supplier_cnpj?: string;
    supplier_contact?: string;
    invoice_number?: string;
    payment_method?: string;
    notes?: string;
    discount_amount?: number;
    paid_account_id?: number | null;
    paid_outside?: boolean;
    paid_with_cash?: boolean;
    extra_costs?: Array<{ description: string; amount: number }>;
  },
  quantity: number
): Promise<StockEntry> {
  const response = await api.post<StockEntry>(`${ENTRIES_ENDPOINT}with-new-product`, {
    ...productData,
    ...entryData,
    quantity,
  });
  return response.data;
}

/**
 * Criar nova entrada de estoque com NOVO produto com variantes em transação atômica.
 * Produto, variantes, entrada e FIFO são criados em uma única transação no backend.
 * Se qualquer passo falhar, tudo é revertido (nenhum dado parcial).
 */
export async function createStockEntryWithNewProductVariants(
  atomicData: {
    product_name: string;
    product_barcode?: string;
    product_description?: string;
    product_brand?: string;
    product_category_id: number;
    base_price: number;
    variants: Array<{
      sku: string;
      color?: string | null;
      size?: string | null;
      price: number;
      cost_price?: number;
      quantity: number;
    }>;
  },
  entryData: {
    entry_code: string;
    entry_date?: string;
    entry_type?: string;
      supplier_id?: number;
    supplier_name?: string;
    supplier_cnpj?: string;
    supplier_contact?: string;
    invoice_number?: string;
    payment_method?: string;
    notes?: string;
    discount_amount?: number;
    paid_account_id?: number | null;
    paid_outside?: boolean;
    paid_with_cash?: boolean;
    extra_costs?: Array<{ description: string; amount: number }>;
  }
): Promise<StockEntry> {
  const response = await api.post<StockEntry>(`${ENTRIES_ENDPOINT}with-new-product-variants`, {
    ...atomicData,
    ...entryData,
  });
  return response.data;
}

/**
 * Verificar se código de entrada já existe
 */
export async function checkEntryCode(entryCode: string): Promise<{ exists: boolean; message: string }> {
  const response = await api.get<{ exists: boolean; message: string }>(
    `${ENTRIES_ENDPOINT}check-code/${encodeURIComponent(entryCode)}`,
    {
      headers: { 'X-Skip-Loading': 'true' }
    }
  );
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
export async function deleteStockEntry(id: number, confirmCode: string): Promise<{
  success: boolean;
  orphan_products_deleted: number;
  orphan_products: Array<{ id: number; name: string; sku: string }>;
  total_stock_removed: number;
  entry_code: string;
}> {
  // o código digitado vai junto: o servidor recusa se não for o da entrada
  const response = await api.delete(`${ENTRIES_ENDPOINT}${id}`, { params: { confirm_code: confirmCode } });
  return response.data;
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

/**
 * Buscar estatísticas gerais de todas as entradas
 * Retorna total investido, número de entradas, etc.
 */
export async function getStockEntriesStats(): Promise<{
  total_invested: number;
  total_entries: number;
  total_items: number;
  total_quantity: number;
}> {
  const response = await api.get(`${ENTRIES_ENDPOINT}stats`);
  return response.data;
}

/**
 * Excluir um produto da entrada. O servidor só aceita se nenhuma peça foi vendida ou reservada.
 */
export async function deleteEntryItem(itemId: number): Promise<{
  item_id: number;
  entry_id: number;
  quantity_removed: number;
  variant_removed: boolean;
  product_removed: boolean;
}> {
  const response = await api.delete(`${ENTRIES_ENDPOINT}entry-items/${itemId}`);
  return response.data;
}

/**
 * Atualizar item de entrada (quantity_received, unit_cost, sell_price, notes)
 * VALIDAÇÃO: Bloqueia edição se o item já teve vendas (rastreabilidade FIFO)
 * Recalcula inventário automaticamente quando quantidade muda
 * Atualiza preço de venda do produto quando sell_price é fornecido
 */
export async function updateEntryItem(
  itemId: number,
  data: {
    quantity_received?: number;
    unit_cost?: number;
    sell_price?: number;
    /** Preço de tabela por peça; 0 limpa. */
    list_unit_cost?: number;
    notes?: string;
    /** Troca o fornecedor desta peça (o produto passa a ser dele no cadastro de fornecedores). */
    supplier_id?: number;
  }
): Promise<{
  id: number;
  entry_id: number;
  product_id: number;
  quantity_received: number;
  quantity_remaining: number;
  quantity_sold: number;
  unit_cost: number;
  total_cost: number;
  notes?: string;
}> {
  const response = await api.put(`${ENTRIES_ENDPOINT}entry-items/${itemId}`, data);
  return response.data;
}

/**
 * Corrigir item com auditoria (mesmo após vendas)
 */
export async function correctEntryItem(
  itemId: number,
  quantityDiff: number,
  reason: string
): Promise<{ message: string; quantity_diff: number; new_quantity_remaining: number }> {
  const response = await api.post(`${ENTRIES_ENDPOINT}entry-items/${itemId}/correct`, {
    quantity_diff: quantityDiff,
    reason,
  });
  return response.data;
}

/**
 * Adicionar item a uma entrada existente
 * Vincula um produto a uma entrada de estoque já criada
 */
export async function addItemToEntry(
  entryId: number,
  data: {
    product_id: number;
    variant_id?: number;
    quantity_received: number;
    unit_cost: number;
    selling_price?: number;
    notes?: string;
    /** Fornecedor deste item (padrão: o da entrada). */
    supplier_id?: number | null;
    /** Preço de tabela por peça (opcional). */
    list_unit_cost?: number;
  }
): Promise<{
  id: number;
  entry_id: number;
  product_id: number;
  product_name: string;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  total_cost: number;
}> {
  const response = await api.post(`${ENTRIES_ENDPOINT}${entryId}/items`, data);
  return response.data;
}

export interface NewProductForEntry {
  product_name: string;
  product_description?: string;
  product_brand?: string;
  product_category_id: number;
  product_gender?: string;
  product_material?: string;
  base_price: number;
  /** Fornecedor deste produto (padrão: o da entrada). */
  supplier_id?: number | null;
  variants: Array<{
    sku?: string | null;
    size?: string | null;
    color?: string | null;
    price?: number | null;
    cost_price?: number | null;
    quantity: number;
  }>;
}

/**
 * Cria um produto NOVO e o lança numa entrada existente numa transação só:
 * se falhar, o produto não existe (nada fica gravado pela metade).
 */
export async function addNewProductToEntry(
  entryId: number,
  data: NewProductForEntry
): Promise<{ entry_id: number; product_id: number; total_cost: number }> {
  const response = await api.post(`${ENTRIES_ENDPOINT}${entryId}/with-new-product`, data);
  return response.data;
}
