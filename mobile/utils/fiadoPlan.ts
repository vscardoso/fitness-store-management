/**
 * Fiado no checkout (regra pura, testes em scripts/test-fiado-plan.mts): mesmas contas do servidor
 * (`receivable_service.split_amount` e `due_dates`), para a prévia mostrar exatamente as parcelas que serão gravadas.
 */
export type FiadoInterval = 7 | 15 | 30;

export const FIADO_INTERVALS: { value: FiadoInterval; label: string }[] = [
  { value: 7, label: 'Semanal' },
  { value: 15, label: 'Quinzenal' },
  { value: 30, label: 'Mensal' },
];

export function addMonths(d: Date, n: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
}

/** Primeiro vencimento padrão: daqui a uma semana, 15 dias ou um mês. */
export function defaultFirstDue(interval: FiadoInterval, today: Date = new Date()): Date {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (interval === 30) return addMonths(base, 1);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + interval);
}

export function dueDates(first: Date, count: number, interval: FiadoInterval): Date[] {
  return Array.from({ length: count }, (_, k) =>
    interval === 30 ? addMonths(first, k) : new Date(first.getFullYear(), first.getMonth(), first.getDate() + interval * k));
}

/** Parcelas iguais em centavos; a sobra fica na última (100 em 3 = 33,33 + 33,33 + 33,34). */
export function splitAmount(total: number, count: number): number[] {
  const cents = Math.round(total * 100);
  const part = Math.floor(cents / count);
  return Array.from({ length: count }, (_, k) => (k === count - 1 ? cents - part * (count - 1) : part) / 100);
}
