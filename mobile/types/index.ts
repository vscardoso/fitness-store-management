/**
 * Definições de tipos TypeScript do app
 * Parte 1: User & Auth Types
 */

// ============================================
// USER & AUTH TYPES
// ============================================

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  SELLER = 'seller',
  CASHIER = 'cashier',
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  is_active: boolean;
  created_at: string;
  tenant_id?: number;
  store_name?: string;  // Nome da loja do usuário
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role?: UserRole;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
  refresh_token?: string; // opcional: backend de login pode não retornar
}

export interface TokenPayload {
  sub: number; // user_id
  exp: number;
}

// ============================================
// SIGNUP & ONBOARDING TYPES
// ============================================

export interface SignupData {
  // User data
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  
  // Store data
  store_name: string;
  store_slug?: string;
  plan?: string;
  
  // Address data
  zip_code: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface SignupResponse {
  // User info
  user_id: number;
  user_email: string;
  user_full_name: string;
  user_role: string;
  
  // Store info
  store_id: number;
  store_name: string;
  store_slug: string;
  store_subdomain: string;
  
  // Subscription info
  subscription_plan: string;
  subscription_status: string;
  is_trial: boolean;
  trial_ends_at?: string;
  trial_days_remaining?: number;
  
  // Auth tokens
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface CheckEmailResponse {
  available: boolean;
  message: string;
}

export interface CheckSlugResponse {
  available: boolean;
  message: string;
  subdomain?: string;
}

// ============================================
// PRODUCT TYPES
// ============================================

export interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  brand?: string;
  cost_price?: number;
  price: number; // Preço de venda
  category_id: number;
  batch_id?: number;
  color?: string;
  size?: string;
  gender?: string;
  material?: string;
  is_digital?: boolean;
  is_activewear?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  current_stock?: number; // Estoque atual
  min_stock_threshold?: number; // Estoque mínimo
  category?: Category;
  batch?: Batch;
}

export interface ProductCreate {
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  brand?: string;
  cost_price?: number;
  price: number; // Preço de venda (campo obrigatório no backend)
  category_id: number;
  batch_id?: number;
  color?: string;
  size?: string;
  gender?: string;
  material?: string;
  is_digital?: boolean;
  is_activewear?: boolean;
  initial_stock?: number; // Estoque inicial
  min_stock?: number; // Estoque mínimo
}

export interface ProductUpdate {
  name?: string;
  sku?: string;
  barcode?: string;
  description?: string;
  brand?: string;
  cost_price?: number;
  price?: number;
  category_id?: number;
  batch_id?: number;
  color?: string;
  size?: string;
  gender?: string;
  material?: string;
  is_digital?: boolean;
  is_activewear?: boolean;
  is_active?: boolean;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// ============================================
// BATCH TYPES
// ============================================

export interface Batch {
  id: number;
  batch_number: string;
  name: string;
  production_date: string;
  expiration_date?: string;
  supplier?: string;
  supplier_batch_number?: string;
  notes?: string;
  total_quantity: number;
  product_count: number;
  is_expired: boolean;
  days_until_expiration?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BatchCreate {
  batch_number: string;
  name: string;
  production_date: string;
  expiration_date?: string;
  supplier?: string;
  supplier_batch_number?: string;
  notes?: string;
  total_quantity?: number;
}

export interface BatchUpdate {
  batch_number?: string;
  name?: string;
  production_date?: string;
  expiration_date?: string;
  supplier?: string;
  supplier_batch_number?: string;
  notes?: string;
  total_quantity?: number;
}

export interface BatchSummary {
  id: number;
  batch_number: string;
  name: string;
  production_date: string;
  expiration_date?: string;
  total_quantity: number;
  product_count: number;
  is_expired: boolean;
}

// ============================================
// CATEGORY TYPES
// ============================================

export interface Category {
  id: number;
  name: string;
  description?: string;
  parent_id?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryWithChildren extends Category {
  subcategories: Category[];
}

export interface CategoryCreate {
  name: string;
  description?: string;
  parent_id?: number;
}

// ============================================
// SALE TYPES
// ============================================

export enum SaleStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  CASH = 'cash',
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  PIX = 'pix',
  TRANSFER = 'transfer',
}

export interface SaleItem {
  product_id: number;
  variant_id?: number;
  quantity: number;
  unit_price: number;
  discount: number;
}

export interface SaleItemResponse extends SaleItem {
  id: number;
  sale_id: number;
  subtotal: number;
  product?: Product;
}

/**
 * CartItem: SaleItem com produto completo (usado no carrinho)
 */
export interface CartItem extends SaleItem {
  product: Product;
}

export interface Payment {
  method: PaymentMethod;
  amount: number;
  installments: number;
}

export interface PaymentResponse extends Payment {
  id: number;
  sale_id: number;
  created_at: string;
}

export interface SaleCreate {
  customer_id?: number;
  items: SaleItem[];
  payments: Payment[];
  discount: number;
  notes?: string;
}

export interface Sale {
  id: number;
  sale_number: string;
  customer_id?: number;
  seller_id: number;
  subtotal: number;
  discount: number;
  total: number;
  status: SaleStatus;
  created_at: string;
  completed_at?: string;
  notes?: string;
}

export interface SaleWithDetails extends Sale {
  items: SaleItemResponse[];
  payments: PaymentResponse[];
  customer_name?: string;
  seller_name?: string;
}

// ============================================
// CUSTOMER TYPES
// ============================================

export interface Customer {
  id: number;
  full_name: string;
  email?: string;
  phone: string;
  document_number?: string;
  birth_date?: string;
  address?: string;
  address_number?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  loyalty_points: number;
  total_spent: number;
  total_purchases: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreate {
  full_name: string;
  email?: string;
  phone: string;
  document_number?: string;
  birth_date?: string;
  address?: string;
  address_number?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

export interface CustomerUpdate {
  full_name?: string;
  email?: string;
  phone?: string;
  document_number?: string;
  birth_date?: string;
  address?: string;
  address_number?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

// ============================================
// INVENTORY TYPES
// ============================================

export enum MovementType {
  IN = 'entrada',
  OUT = 'saida',
  SALE = 'sale',
  RETURN = 'devolucao',
  ADJUSTMENT = 'ajuste',
  TRANSFER = 'transferencia',
}

export interface Inventory {
  id: number;
  product_id: number;
  quantity: number;
  min_stock: number;
  max_stock?: number;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  product_id: number;
  movement_type: MovementType;
  quantity: number;
  notes?: string;
}

export interface StockMovementResponse extends StockMovement {
  id: number;
  user_id: number;
  created_at: string;
}

export interface StockAlert {
  product_id: number;
  product_name: string;
  current_stock: number;
  min_stock: number;
  deficit: number;
}

// ============================================
// TRIP TYPES
// ============================================

export enum TripStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export interface Trip {
  id: number;
  trip_code: string;
  trip_date: string;
  destination: string;
  departure_time?: string;
  return_time?: string;
  travel_cost_fuel: number;
  travel_cost_food: number;
  travel_cost_toll: number;
  travel_cost_hotel: number;
  travel_cost_other: number;
  travel_cost_total: number;
  status: TripStatus;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TripCreate {
  trip_date: string;
  destination: string;
  departure_time?: string;
  return_time?: string;
  travel_cost_fuel?: number;
  travel_cost_food?: number;
  travel_cost_toll?: number;
  travel_cost_hotel?: number;
  travel_cost_other?: number;
  notes?: string;
}

export interface TripUpdate {
  trip_date?: string;
  destination?: string;
  departure_time?: string;
  return_time?: string;
  travel_cost_fuel?: number;
  travel_cost_food?: number;
  travel_cost_toll?: number;
  travel_cost_hotel?: number;
  travel_cost_other?: number;
  status?: TripStatus;
  notes?: string;
}

export interface TripAnalytics {
  total_purchases: number;
  total_cost: number;
  total_pieces: number;
  total_revenue?: number;
  total_profit?: number;
  roi?: number;
  sell_through_rate?: number;
}

// ============================================
// STOCK ENTRY TYPES
// ============================================

export enum EntryType {
  TRIP = 'trip',
  ONLINE = 'online',
  LOCAL = 'local',
}

export interface EntryItem {
  product_id: number;
  quantity_received: number;
  unit_cost: number;
  notes?: string;
}

export interface EntryItemResponse extends EntryItem {
  id: number;
  entry_id: number;
  quantity_remaining: number;
  total_cost: number;
  quantity_sold: number;
  depletion_percentage: number;
  is_depleted: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockEntry {
  id: number;
  entry_code: string;
  entry_date: string;
  entry_type: EntryType;
  trip_id?: number;
  supplier_name: string;
  supplier_cnpj?: string;
  supplier_contact?: string;
  invoice_number?: string;
  payment_method?: string;
  notes?: string;
  total_cost: number;
  total_items: number;
  total_quantity: number;
  items_sold: number;
  sell_through_rate: number;
  roi?: number;
  trip_code?: string;
  trip_destination?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockEntryCreate {
  entry_date: string;
  entry_type: EntryType;
  trip_id?: number;
  supplier_name: string;
  supplier_cnpj?: string;
  supplier_contact?: string;
  invoice_number?: string;
  payment_method?: string;
  notes?: string;
  items: EntryItem[];
}

export interface StockEntryWithItems extends StockEntry {
  entry_items: EntryItemResponse[];
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiError {
  detail: string;
}

export interface PaginationParams {
  skip?: number;
  limit?: number;
}
