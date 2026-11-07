/**
 * Como mostrar uma venda que teve devolução nas listas (início e vendas do mês).
 * O número grande é SEMPRE o que a loja ficou de fato (venda menos o que foi devolvido); a linha pequena conta o que
 * aconteceu em palavras simples. Venda sem devolução continua igual.
 */
export type SaleRefundKind = 'normal' | 'partial' | 'refunded' | 'cancelled';

export interface SaleRefundView {
  kind: SaleRefundKind;
  /** Valor da linha, em reais: o que a loja ficou desta venda (nunca negativo) */
  amount: number;
  /** Pinta o valor de vermelho (a loja não ficou com nada) */
  negative: boolean;
  /** Selo ao lado do número da venda; null = nenhum */
  tag: string | null;
  /** Texto pequeno abaixo, em palavras simples */
  sub: string | null;
}

interface SaleLike {
  status: string;
  total_amount?: number | string | null;
  refunded_amount?: number | string | null;
}

export function saleRefundView(sale: SaleLike, fmt: (n: number) => string): SaleRefundView {
  const total = Number(sale.total_amount ?? 0);
  const refunded = Number(sale.refunded_amount ?? 0);
  const st = String(sale.status ?? '').toLowerCase();
  if (st === 'cancelled') {
    return { kind: 'cancelled', amount: 0, negative: true, tag: 'Cancelada', sub: `Venda cancelada (era ${fmt(total)})` };
  }
  if (st === 'refunded') {
    const devolvido = refunded > 0 ? refunded : total;
    return { kind: 'refunded', amount: 0, negative: true, tag: 'Devolvida', sub: `Vendeu ${fmt(total)} · devolveu ${fmt(devolvido)}` };
  }
  if (st === 'partially_refunded') {
    return {
      kind: 'partial', amount: Math.max(0, total - refunded), negative: false, tag: 'Devolução parcial',
      sub: refunded > 0 ? `Vendeu ${fmt(total)} · devolveu ${fmt(refunded)}` : null,
    };
  }
  return { kind: 'normal', amount: total, negative: false, tag: null, sub: null };
}
