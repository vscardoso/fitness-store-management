/**
 * Como mostrar uma venda que teve devolução nas listas (início e vendas do mês).
 * Regra: devolução PARCIAL não é estorno da venda inteira. A venda continua valendo, e o que foi estornado aparece à
 * parte (com o líquido). Só a devolvida por inteiro e a cancelada aparecem como valor negativo.
 */
export type SaleRefundKind = 'normal' | 'partial' | 'refunded' | 'cancelled';

export interface SaleRefundView {
  kind: SaleRefundKind;
  /** Valor da linha, em reais (o sinal vem de `negative`) */
  amount: number;
  negative: boolean;
  /** Selo ao lado do número da venda; null = nenhum */
  tag: string | null;
  /** Texto pequeno abaixo (estornado e líquido) */
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
  if (st === 'cancelled') return { kind: 'cancelled', amount: total, negative: true, tag: 'Cancelada', sub: null };
  if (st === 'refunded') {
    return { kind: 'refunded', amount: refunded > 0 ? refunded : total, negative: true, tag: 'Estorno total', sub: null };
  }
  if (st === 'partially_refunded') {
    const net = Math.max(0, total - refunded);
    return {
      kind: 'partial', amount: total, negative: false, tag: 'Estorno parcial',
      sub: refunded > 0 ? `estornado −${fmt(refunded)} · líquido ${fmt(net)}` : null,
    };
  }
  return { kind: 'normal', amount: total, negative: false, tag: null, sub: null };
}
