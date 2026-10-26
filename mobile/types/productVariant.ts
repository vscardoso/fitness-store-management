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
  short_code?: number | null; // código antigo por variação (#0123), único na loja
  display_code?: string | null; // código da etiqueta: produto e variação (#101-1)
  product_code?: number | null;
  variant_number?: number | null;
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
  short_code?: number | null;
  display_code?: string | null;
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
  total_stock?: number;
  stock_by_size?: Record<string, number>;
  stock_by_color?: Record<string, number>;
  out_of_stock_count?: number;
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
  // Peças que servem em dois tamanhos e peça de tamanho único (o servidor guarda "ÚNICO" e "P/M")
  { label: 'ÚNICO', value: 'ÚNICO' },
  { label: 'P/M', value: 'P/M' },
  { label: 'M/G', value: 'M/G' },
  { label: 'G/GG', value: 'G/GG' },
];

/** Tamanhos que o "Selecionar todos" marca (grade normal; ÚNICO e duplos são escolhidos à mão). */
export const GRID_SIZE_VALUES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];

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
// Paleta de cores agrupadas (moda fitness: mesclas, neons, rosados, terrosos e estampas)
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
      { label: 'Cinza Mescla', value: 'Cinza Mescla', hex: '#B8B8B8' },
      { label: 'Grafite', value: 'Grafite', hex: '#383838' },
      { label: 'Creme', value: 'Creme', hex: '#F3E8C8' },
      { label: 'Marfim', value: 'Marfim', hex: '#FFFFF0' },
      { label: 'Champanhe', value: 'Champanhe', hex: '#F7E7CE' },
      { label: 'Cappuccino', value: 'Cappuccino', hex: '#A9876A' },
      { label: 'Café', value: 'Café', hex: '#4B3621' },
      { label: 'Cacau', value: 'Cacau', hex: '#3D2314' },
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
      { label: 'Azul Céu', value: 'Azul Céu', hex: '#87CEEB' },
      { label: 'Azul Jeans', value: 'Azul Jeans', hex: '#5B7DA6' },
      { label: 'Azul Piscina', value: 'Azul Piscina', hex: '#2BB3D6' },
      { label: 'Cobalto', value: 'Cobalto', hex: '#0047AB' },
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
      { label: 'Rosa Bebê', value: 'Rosa Bebê', hex: '#F8C8DC' },
      { label: 'Rosa Chiclete', value: 'Rosa Chiclete', hex: '#FF8FB1' },
      { label: 'Rosa Neon', value: 'Rosa Neon', hex: '#FF2E93' },
      { label: 'Rosa Antigo', value: 'Rosa Antigo', hex: '#C08081' },
      { label: 'Blush', value: 'Blush', hex: '#DE98AB' },
      { label: 'Rosê', value: 'Rosê', hex: '#E8A598' },
      { label: 'Salmão', value: 'Salmão', hex: '#FA8072' },
      { label: 'Marsala', value: 'Marsala', hex: '#955251' },
      { label: 'Cereja', value: 'Cereja', hex: '#9B111E' },
      { label: 'Fúcsia', value: 'Fúcsia', hex: '#C71585' },
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
      { label: 'Verde Menta', value: 'Verde Menta', hex: '#A8E6CF' },
      { label: 'Verde Bandeira', value: 'Verde Bandeira', hex: '#009C3B' },
      { label: 'Verde Musgo', value: 'Verde Musgo', hex: '#4A5D23' },
      { label: 'Verde Limão', value: 'Verde Limão', hex: '#BFFF00' },
      { label: 'Verde Abacate', value: 'Verde Abacate', hex: '#568203' },
      { label: 'Verde Escuro', value: 'Verde Escuro', hex: '#006400' },
      { label: 'Verde Jade', value: 'Verde Jade', hex: '#00A86B' },
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
      { label: 'Amarelo Neon', value: 'Amarelo Neon', hex: '#E6FF00' },
      { label: 'Canário', value: 'Canário', hex: '#FFEF00' },
      { label: 'Terracota', value: 'Terracota', hex: '#C2653F' },
      { label: 'Telha', value: 'Telha', hex: '#B5502D' },
      { label: 'Cobre', value: 'Cobre', hex: '#B87333' },
      { label: 'Bronze', value: 'Bronze', hex: '#CD7F32' },
    ],
  },
  {
    label: 'Roxos',
    colors: [
      { label: 'Lilás',        value: 'Lilás',        hex: '#C8A2C8' },
      { label: 'Lavanda',       value: 'Lavanda',       hex: '#E6E6FA' },
      { label: 'Roxo',          value: 'Roxo',          hex: '#6A0DAD' },
      { label: 'Roxo Escuro',   value: 'Roxo Escuro',   hex: '#4B0082' },
      { label: 'Uva', value: 'Uva', hex: '#6F2DA8' },
      { label: 'Berinjela', value: 'Berinjela', hex: '#5B3256' },
      { label: 'Violeta', value: 'Violeta', hex: '#8F00FF' },
    ],
  },
  {
    label: 'Laranjas',
    colors: [
      { label: 'Laranja',        value: 'Laranja',           hex: '#FF8C00' },
      { label: 'Queimado',       value: 'Laranja Queimado',  hex: '#CC5500' },
      { label: 'Coral',          value: 'Coral',             hex: '#FF7F50' },
      { label: 'Laranja Neon', value: 'Laranja Neon', hex: '#FF6700' },
      { label: 'Pêssego', value: 'Pêssego', hex: '#FFCBA4' },
      { label: 'Tangerina', value: 'Tangerina', hex: '#F28500' },
    ],
  },
  {
    label: 'Especiais',
    colors: [
      { label: 'Prata',   value: 'Prata',   hex: '#C0C0C0' },
      { label: 'Dourado', value: 'Dourado', hex: '#D4AF37' },
      { label: 'Rose Gold', value: 'Rose Gold', hex: '#B76E79' },
    ],
  },
  {
    label: 'Estampas',
    colors: [
      { label: 'Estampado', value: 'Estampado', hex: '#A78BFA' },
      { label: 'Onça', value: 'Onça', hex: '#C68E3F' },
      { label: 'Zebra', value: 'Zebra', hex: '#E5E5E5' },
      { label: 'Floral', value: 'Floral', hex: '#E58FB0' },
      { label: 'Tie Dye', value: 'Tie Dye', hex: '#9B7EDE' },
      { label: 'Listrado', value: 'Listrado', hex: '#6B7280' },
      { label: 'Xadrez', value: 'Xadrez', hex: '#8B5E3C' },
      { label: 'Camuflado', value: 'Camuflado', hex: '#6B705C' },
      { label: 'Preto e Branco', value: 'Preto e Branco', hex: '#7A7A7A' },
      { label: 'Colorido', value: 'Colorido', hex: '#FF8C42' },
      { label: 'Degradê', value: 'Degradê', hex: '#B388EB' },
    ],
  },
];

// Lista plana para backward-compatibility
export const DEFAULT_COLORS: ColorOption[] = COLOR_GROUPS.flatMap(g => g.colors);