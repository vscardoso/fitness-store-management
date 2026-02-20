/**
 * Tipos para o sistema de variantes de produto
 */

export interface ProductVariant {
  id: number;
  product_id: number;
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
  cost_price: number | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  current_stock?: number;
  variant_label?: string;
}

export interface ProductVariantWithProduct extends ProductVariant {
  product_name?: string;
  product_brand?: string;
  product_image_url?: string;
  category_id?: number;
  category_name?: string;
}

export interface ProductVariantMinimal {
  id: number;
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
  current_stock?: number;
}

export interface ProductWithVariants {
  id: number;
  name: string;
  description?: string;
  brand?: string;
  category_id: number;
  gender?: string;
  material?: string;
  is_digital: boolean;
  is_activewear: boolean;
  is_catalog: boolean;
  image_url?: string;
  base_price?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variant_count: number;
  total_stock: number;
  price_range: [number, number] | null;
  variants: ProductVariant[];
}

export interface VariantGridItem {
  size: string | null;
  color: string | null;
  sku: string;
  price: number;
  stock: number;
  variant_id: number;
}

export interface VariantGrid {
  product_id: number;
  product_name: string;
  product_brand?: string;
  base_price?: number;
  available_sizes: string[];
  available_colors: string[];
  grid: VariantGridItem[];
}

// ================================
// Schemas para criação
// ================================

export interface ProductVariantCreate {
  sku: string;
  size?: string;
  color?: string;
  price: number;
  cost_price?: number;
  image_url?: string;
}

export interface ProductWithVariantsCreate {
  name: string;
  description?: string;
  brand?: string;
  category_id: number;
  gender?: string;
  material?: string;
  is_digital?: boolean;
  is_activewear?: boolean;
  is_catalog?: boolean;
  image_url?: string;
  base_price?: number;
  variants: ProductVariantCreate[];
}

export interface BulkVariantCreate {
  product_id: number;
  sizes: string[];
  colors: string[];
  base_price: number;
  price_adjustments?: Record<string, number>;
  sku_prefix?: string;
}

// ================================
// Tipos auxiliares para UI
// ================================

export interface SizeOption {
  label: string;
  value: string;
}

export interface ColorOption {
  label: string;
  value: string;
  hex?: string;
}

// Tamanhos comuns para roupas fitness
export const DEFAULT_SIZES: SizeOption[] = [
  { label: 'PP', value: 'PP' },
  { label: 'P', value: 'P' },
  { label: 'M', value: 'M' },
  { label: 'G', value: 'G' },
  { label: 'GG', value: 'GG' },
  { label: 'XG', value: 'XG' },
  { label: 'XGG', value: 'XGG' },
];

// Tamanhos numéricos para calçados
export const SHOE_SIZES: SizeOption[] = [
  { label: '34', value: '34' },
  { label: '35', value: '35' },
  { label: '36', value: '36' },
  { label: '37', value: '37' },
  { label: '38', value: '38' },
  { label: '39', value: '39' },
  { label: '40', value: '40' },
  { label: '41', value: '41' },
  { label: '42', value: '42' },
  { label: '43', value: '43' },
  { label: '44', value: '44' },
];

// Cores comuns para roupas fitness
export const DEFAULT_COLORS: ColorOption[] = [
  { label: 'Preto', value: 'Preto', hex: '#1a1a1a' },
  { label: 'Branco', value: 'Branco', hex: '#ffffff' },
  { label: 'Cinza', value: 'Cinza', hex: '#808080' },
  { label: 'Rosa', value: 'Rosa', hex: '#ff69b4' },
  { label: 'Roxo', value: 'Roxo', hex: '#800080' },
  { label: 'Azul', value: 'Azul', hex: '#0000ff' },
  { label: 'Azul Marinho', value: 'Azul Marinho', hex: '#000080' },
  { label: 'Verde', value: 'Verde', hex: '#008000' },
  { label: 'Vermelho', value: 'Vermelho', hex: '#ff0000' },
  { label: 'Laranja', value: 'Laranja', hex: '#ffa500' },
  { label: 'Amarelo', value: 'Amarelo', hex: '#ffff00' },
  { label: 'Bege', value: 'Bege', hex: '#f5f5dc' },
  { label: 'Nude', value: 'Nude', hex: '#e3bc9a' },
  { label: 'Estampado', value: 'Estampado' },
  { label: 'Outro', value: 'Outro' },
];