const cents = (v: number): number => Math.round((Number(v) + Number.EPSILON) * 100);

/**
 * Desconto geral que vale agora, em centavos: em % é refeito sobre o subtotal; em reais fica o valor dado.
 * Nunca passa do subtotal (o carrinho com menos peças não pode ficar com desconto maior que ele).
 */
export function effectiveGlobalDiscountCents(subtotalCents: number, discount: number, percent?: number | null): number {
  if (subtotalCents <= 0) return 0;
  const raw = percent != null && percent > 0 ? Math.round((subtotalCents * percent) / 100) : cents(discount || 0);
  return Math.max(0, Math.min(raw, subtotalCents));
}
