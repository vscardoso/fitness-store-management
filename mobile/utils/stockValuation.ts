/**
 * Valor do estoque deixando categorias de fora (ex.: "sem Tênis"). Conta: total menos as categorias tiradas,
 * usando o detalhe por categoria que o servidor já manda (mesma fonte dos totais).
 */
export interface CategoryValue {
  category_id: number;
  category_name: string;
  cost_value: number;
  retail_value: number;
}

export interface StockTotals {
  cost: number;
  retail: number;
  profit: number;
}

export function stockWithout(
  totals: { cost_value?: number; retail_value?: number } | null | undefined,
  byCategory: CategoryValue[] | null | undefined,
  excluded: number[],
): StockTotals {
  const out = new Set(excluded);
  let cost = Number(totals?.cost_value) || 0;
  let retail = Number(totals?.retail_value) || 0;
  for (const c of byCategory ?? []) {
    if (!out.has(c.category_id)) continue;
    cost -= Number(c.cost_value) || 0;
    retail -= Number(c.retail_value) || 0;
  }
  // arredonda centavos (somas de float) e nunca mostra negativo
  cost = Math.max(0, Math.round(cost * 100) / 100);
  retail = Math.max(0, Math.round(retail * 100) / 100);
  return { cost, retail, profit: Math.round((retail - cost) * 100) / 100 };
}
