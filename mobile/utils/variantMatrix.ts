/**
 * Monta a matriz tamanho x cor a partir da grade do backend.
 * Função pura (sem React) para facilitar teste.
 */
import type { VariantGrid } from '@/types/productVariant';

export const LOW_STOCK_THRESHOLD = 3;

export type CellStatus = 'out' | 'low' | 'ok';

export interface MatrixCell {
  variantId: number;
  stock: number;
  status: CellStatus;
}

export interface VariantMatrix {
  sizes: string[];
  colors: string[];
  /** cells[color][size]; ausente = combinação que não existe no produto */
  cells: Record<string, Record<string, MatrixCell | undefined>>;
  totalByColor: Record<string, number>;
  totalBySize: Record<string, number>;
  total: number;
  outCount: number;
  lowCount: number;
  existingCount: number;
}

export function stockStatus(stock: number): CellStatus {
  if (stock <= 0) return 'out';
  if (stock <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

export function buildVariantMatrix(grid: VariantGrid): VariantMatrix {
  const sizes = [...grid.available_sizes];
  const colors = [...grid.available_colors];

  // Variantes sem cor ou sem tamanho entram em linha/coluna "Único"
  if (grid.grid.some((g) => !g.color)) colors.push('Único');
  if (grid.grid.some((g) => !g.size)) sizes.push('Único');

  const cells: VariantMatrix['cells'] = {};
  const totalByColor: Record<string, number> = {};
  const totalBySize: Record<string, number> = {};
  let total = 0;
  let outCount = 0;
  let lowCount = 0;
  let existingCount = 0;

  for (const item of grid.grid) {
    const color = item.color ?? 'Único';
    const size = item.size ?? 'Único';
    const stock = Math.max(0, Number(item.stock) || 0);
    const status = stockStatus(stock);
    if (!cells[color]) cells[color] = {};
    cells[color][size] = { variantId: item.variant_id, stock, status };
    totalByColor[color] = (totalByColor[color] ?? 0) + stock;
    totalBySize[size] = (totalBySize[size] ?? 0) + stock;
    total += stock;
    existingCount += 1;
    if (status === 'out') outCount += 1;
    if (status === 'low') lowCount += 1;
  }

  return { sizes, colors, cells, totalByColor, totalBySize, total, outCount, lowCount, existingCount };
}
