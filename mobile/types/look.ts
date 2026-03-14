// Types para Lookbook e Wishlist

export interface LookItemResponse {
  id: number;
  look_id: number;
  product_id: number;
  variant_id: number | null;
  position: number;
  product_name: string | null;
  variant_description: string | null;
  product_image_url: string | null;
  unit_price: number | null;
  created_at: string;
}

export interface Look {
  id: number;
  tenant_id: number | null;
  name: string;
  description: string | null;
  customer_id: number | null;
  is_public: boolean;
  discount_percentage: number;
  items: LookItemResponse[];
  total_price: number;
  items_count: number;
  created_at: string;
  updated_at: string;
}

export interface LookList {
  id: number;
  name: string;
  description: string | null;
  customer_id: number | null;
  is_public: boolean;
  discount_percentage: number;
  items_count: number;
  total_price: number;
  created_at: string;
}

export interface CreateLookDTO {
  name: string;
  description?: string;
  customer_id?: number;
  is_public?: boolean;
  discount_percentage?: number;
  items: {
    product_id: number;
    variant_id?: number;
    position?: number;
  }[];
}

export interface WishlistItem {
  id: number;
  customer_id: number;
  product_id: number;
  variant_id: number | null;
  look_id: number | null;
  notified: boolean;
  notified_at: string | null;
  notes: string | null;
  product_name: string | null;
  variant_description: string | null;
  customer_name: string | null;
  product_image_url: string | null;
  in_stock: boolean;
  created_at: string;
}

export interface DemandItem {
  product_id: number;
  product_name: string;
  variant_id: number | null;
  variant_description: string | null;
  waiting_count: number;
  potential_revenue: number;
  product_image_url: string | null;
}
