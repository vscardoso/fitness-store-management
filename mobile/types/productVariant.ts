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

export interface ColorGroup {
  label: string;
  colors: ColorOption[];
}

// ──────────────────────────────────────────────
// Paleta profissional de 48 cores agrupadas
// ──────────────────────────────────────────────
export const COLOR_GROUPS: ColorGroup[] = [
  {
    label: 'Neutros',
    colors: [
      { label: 'Branco',       value: 'Branco',       hex: '#FFFFFF' },
      { label: 'Off-White',    value: 'Off-White',    hex: '#F5F5F0' },
      { label: 'Preto',        value: 'Preto',        hex: '#000000' },
      { label: 'Cinza Claro',  value: 'Cinza Claro',  hex: '#D3D3D3' },
      { label: 'Cinza Médio',  value: 'Cinza Médio',  hex: '#A9A9A9' },
      { label: 'Cinza Escuro', value: 'Cinza Escuro', hex: '#4F4F4F' },
      { label: 'Chumbo',       value: 'Chumbo',       hex: '#2F2F2F' },
      { label: 'Bege',         value: 'Bege',         hex: '#D9C7A3' },
      { label: 'Nude',         value: 'Nude',         hex: '#E3C7B5' },
      { label: 'Areia',        value: 'Areia',        hex: '#CDB79E' },
    ],
  },
  {
    label: 'Azuis',
    colors: [
      { label: 'Azul Claro',    value: 'Azul Claro',    hex: '#ADD8E6' },
      { label: 'Azul Bebê',     value: 'Azul Bebê',     hex: '#89CFF0' },
      { label: 'Azul Médio',    value: 'Azul Médio',    hex: '#4682B4' },
      { label: 'Azul Royal',    value: 'Azul Royal',    hex: '#4169E1' },
      { label: 'Azul Marinho',  value: 'Azul Marinho',  hex: '#1F2A44' },
      { label: 'Azul Petróleo', value: 'Azul Petróleo', hex: '#003F5C' },
      { label: 'Turquesa',      value: 'Turquesa',      hex: '#40E0D0' },
      { label: 'Tiffany',       value: 'Tiffany',       hex: '#81D8D0' },
    ],
  },
  {
    label: 'Vermelhos e Rosados',
    colors: [
      { label: 'Vermelho',       value: 'Vermelho',        hex: '#C00000' },
      { label: 'Verm. Escuro',   value: 'Vermelho Escuro', hex: '#8B0000' },
      { label: 'Vinho',          value: 'Vinho',           hex: '#722F37' },
      { label: 'Bordô',          value: 'Bordô',           hex: '#800020' },
      { label: 'Rosa Claro',     value: 'Rosa Claro',      hex: '#F4C2C2' },
      { label: 'Rosa Médio',     value: 'Rosa Médio',      hex: '#E75480' },
      { label: 'Pink',           value: 'Pink',            hex: '#FF1493' },
      { label: 'Goiaba',         value: 'Goiaba',          hex: '#FF6F61' },
    ],
  },
  {
    label: 'Verdes',
    colors: [
      { label: 'Verde Claro',    value: 'Verde Claro',    hex: '#90EE90' },
      { label: 'Verde Militar',  value: 'Verde Militar',  hex: '#4B5320' },
      { label: 'Verde Oliva',    value: 'Verde Oliva',    hex: '#556B2F' },
      { label: 'Esmeralda',      value: 'Esmeralda',      hex: '#2E8B57' },
      { label: 'Verde Água',     value: 'Verde Água',     hex: '#00BFA6' },
      { label: 'Verde Neon',     value: 'Verde Neon',     hex: '#39FF14' },
    ],
  },
  {
    label: 'Amarelos e Terrosos',
    colors: [
      { label: 'Am. Claro',      value: 'Amarelo Claro',  hex: '#FFF9C4' },
      { label: 'Amarelo',        value: 'Amarelo',        hex: '#FFD700' },
      { label: 'Mostarda',       value: 'Mostarda',       hex: '#C9A227' },
      { label: 'Ocre',           value: 'Ocre',           hex: '#CC7722' },
      { label: 'Caramelo',       value: 'Caramelo',       hex: '#AF6F09' },
      { label: 'Marrom Claro',   value: 'Marrom Claro',   hex: '#A0522D' },
      { label: 'Marrom Escuro',  value: 'Marrom Escuro',  hex: '#5C4033' },
    ],
  },
  {
    label: 'Roxos',
    colors: [
      { label: 'Lilás',        value: 'Lilás',        hex: '#C8A2C8' },
      { label: 'Lavanda',       value: 'Lavanda',       hex: '#E6E6FA' },
      { label: 'Roxo',          value: 'Roxo',          hex: '#6A0DAD' },
      { label: 'Roxo Escuro',   value: 'Roxo Escuro',   hex: '#4B0082' },
    ],
  },
  {
    label: 'Laranjas',
    colors: [
      { label: 'Laranja',        value: 'Laranja',           hex: '#FF8C00' },
      { label: 'Queimado',       value: 'Laranja Queimado',  hex: '#CC5500' },
      { label: 'Coral',          value: 'Coral',             hex: '#FF7F50' },
    ],
  },
  {
    label: 'Especiais',
    colors: [
      { label: 'Prata',   value: 'Prata',   hex: '#C0C0C0' },
      { label: 'Dourado', value: 'Dourado', hex: '#D4AF37' },
    ],
  },
];

// Lista plana para backward-compatibility
export const DEFAULT_COLORS: ColorOption[] = COLOR_GROUPS.flatMap(g => g.colors);