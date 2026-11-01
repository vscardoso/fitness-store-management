/**
 * Regras de "a peça já está nesta entrada" (puras, sem React, testáveis com node):
 * achar a linha existente, decidir se dá para somar nela e avisar variação repetida.
 * Em OUTRA entrada a mesma peça é normal (custo FIFO diferente) e nunca avisa.
 */
export interface EntryLineLike {
  id?: number;
  is_active?: boolean;
  product_id?: number | null;
  variant_id?: number | null;
  quantity_received: number | string;
  quantity_sold?: number | null;
  unit_cost: number | string;
  supplier_name?: string | null;
  list_unit_cost?: number | string | null;
}

export interface SumInput {
  qty: number;
  /** custo digitado, em reais */
  cost: number;
  /** preço cheio do fornecedor digitado, em reais (0 = não informado) */
  listPrice: number;
  /** fornecedor escolhido para esta peça (null = o da entrada) */
  supplierName?: string | null;
  entrySupplierName?: string | null;
}

const cents = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);

export function findExistingLine<T extends EntryLineLike>(
  items: T[] | undefined,
  productId: number,
  variantId?: number | null,
): T | undefined {
  return (items ?? []).find(
    (i) => i.is_active !== false && i.product_id === productId && (i.variant_id ?? null) === (variantId ?? null),
  );
}

/** Texto do motivo que impede somar na linha existente; vazio = pode somar. */
export function sumBlockReason(
  line: EntryLineLike | undefined,
  input: SumInput,
  money: (n: number) => string = (n) => n.toFixed(2),
): string {
  if (!line) return '';
  if (!(input.qty >= 1)) return '';
  if ((line.quantity_sold ?? 0) > 0) return 'Esta linha já vendeu peças: o histórico de custo não pode ser mexido.';
  if (cents(input.cost) !== cents(line.unit_cost))
    return `Somar só vale com o mesmo custo (a linha atual está a ${money(Number(line.unit_cost))}).`;
  const lineSupplier = line.supplier_name ?? input.entrySupplierName ?? null;
  const newSupplier = input.supplierName ?? input.entrySupplierName ?? null;
  if (lineSupplier !== newSupplier) return 'O fornecedor é diferente do da linha atual.';
  if (cents(input.listPrice) !== cents(line.list_unit_cost)) return 'O preço cheio do fornecedor é diferente do da linha atual.';
  return '';
}

/** Quantidade final da linha depois de somar. */
export function summedQuantity(line: EntryLineLike, qty: number): number {
  return Number(line.quantity_received) + (qty || 0);
}
