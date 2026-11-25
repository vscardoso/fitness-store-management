/**
 * Filtros sugeridos da lista de Vendas (chips abaixo da busca): fiado vencido, em aberto ou pago, devolvidas, sem cliente e
 * forma de pagamento. Combinam com a busca e o período. Fiado tem um estado só e pagamento uma forma só (tocar de novo desliga);
 * devolvidas e sem cliente ligam e desligam. Sem imports do React Native (testes: node scripts/test-sales-filters.mts).
 */
export type FiadoFlag = 'overdue' | 'open' | 'paid';
export type PaymentFlag = 'cash' | 'pix' | 'card';

export type SalesFlags = { fiado: FiadoFlag | null; payment: PaymentFlag | null; refunded: boolean; noCustomer: boolean };

export const NO_FLAGS: SalesFlags = { fiado: null, payment: null, refunded: false, noCustomer: false };

export type FlagChip = { id: string; label: string; icon: string; tone?: 'danger'; flag: Partial<SalesFlags> };

export const FLAG_CHIPS: FlagChip[] = [
  { id: 'fiado-overdue', label: 'Fiado vencido', icon: 'alert-circle-outline', tone: 'danger', flag: { fiado: 'overdue' } },
  { id: 'fiado-open', label: 'Fiado em aberto', icon: 'time-outline', flag: { fiado: 'open' } },
  { id: 'fiado-paid', label: 'Fiado pago', icon: 'checkmark-circle-outline', flag: { fiado: 'paid' } },
  { id: 'refunded', label: 'Devolvidas', icon: 'return-down-back-outline', flag: { refunded: true } },
  { id: 'no-customer', label: 'Sem cliente', icon: 'person-outline', flag: { noCustomer: true } },
  { id: 'pay-cash', label: 'Dinheiro', icon: 'cash-outline', flag: { payment: 'cash' } },
  { id: 'pay-pix', label: 'PIX', icon: 'qr-code-outline', flag: { payment: 'pix' } },
  { id: 'pay-card', label: 'Cartão', icon: 'card-outline', flag: { payment: 'card' } },
];

export function isChipOn(flags: SalesFlags, chip: FlagChip): boolean {
  const f = chip.flag;
  if (f.fiado) return flags.fiado === f.fiado;
  if (f.payment) return flags.payment === f.payment;
  if (f.refunded) return flags.refunded;
  if (f.noCustomer) return flags.noCustomer;
  return false;
}

/** Tocar liga o chip; tocar no que já está ligado desliga. Fiado e forma de pagamento trocam entre si dentro do grupo. */
export function toggleChip(flags: SalesFlags, chip: FlagChip): SalesFlags {
  if (isChipOn(flags, chip)) {
    const f = chip.flag;
    return {
      ...flags,
      fiado: f.fiado ? null : flags.fiado,
      payment: f.payment ? null : flags.payment,
      refunded: f.refunded ? false : flags.refunded,
      noCustomer: f.noCustomer ? false : flags.noCustomer,
    };
  }
  return { ...flags, ...chip.flag };
}

export function hasFlags(flags: SalesFlags): boolean {
  return !!flags.fiado || !!flags.payment || flags.refunded || flags.noCustomer;
}

/** Parâmetros de GET /sales/ para os filtros ligados (só o que está ligado vai). */
export function flagsToParams(flags: SalesFlags): Record<string, string | boolean> {
  const p: Record<string, string | boolean> = {};
  if (flags.fiado) p.fiado = flags.fiado;
  if (flags.payment) p.payment = flags.payment;
  if (flags.refunded) p.refunded = true;
  if (flags.noCustomer) p.no_customer = true;
  return p;
}
