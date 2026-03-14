// ── Product Types ────────────────────────────────────────────────────────────

export interface Category {
  id: number;
  name: string;
  description?: string;
}

export interface ProductVariant {
  id: number;
  sku: string;
  size?: string;
  color?: string;
  price: number;
  is_active: boolean;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  sku: string;
  price: number;
  sale_price: number;
  cost_price?: number;
  brand?: string;
  color?: string;
  size?: string;
  gender?: string;
  material?: string;
  image_url?: string;
  current_stock?: number;
  is_active: boolean;
  is_activewear: boolean;
  is_catalog: boolean;
  category_id: number;
  category?: Category;
  variants?: ProductVariant[];
  variant_count?: number;
  base_price?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductListItem {
  id: number;
  name: string;
  sku: string;
  price: number;
  sale_price: number;
  image_url?: string;
  current_stock?: number;
  category?: Category;
  variants?: ProductVariant[];
  variant_count?: number;
  brand?: string;
  gender?: string;
  color?: string;
  size?: string;
  is_active: boolean;
}

// ── Look Types ───────────────────────────────────────────────────────────────

export interface LookItem {
  id: number;
  look_id: number;
  product_id: number;
  variant_id?: number;
  position: number;
  product_name?: string;
  variant_description?: string;
  product_image_url?: string;
  unit_price?: number;
  created_at: string;
}

export interface Look {
  id: number;
  name: string;
  description?: string;
  customer_id?: number;
  is_public: boolean;
  discount_percentage: number;
  items: LookItem[];
  total_price: number;
  items_count: number;
  created_at: string;
  updated_at: string;
}

export interface LookListItem {
  id: number;
  name: string;
  description?: string;
  customer_id?: number;
  is_public: boolean;
  discount_percentage: number;
  items_count: number;
  total_price: number;
  created_at: string;
}

// ── API Response Types ────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
