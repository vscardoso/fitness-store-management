/**
 * Data sem hora ("2026-11-02", como `entry_date`): é um dia de calendário, não um instante.
 * `new Date("2026-11-02")` vira meia-noite UTC e, no Brasil, aparece como o dia anterior (01/11).
 * Devolve DD/MM/AAAA direto das partes, ou null se a string não for só a data.
 */
export function formatDateOnly(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}
