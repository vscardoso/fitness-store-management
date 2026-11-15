/**
 * Períodos de datas do extrato e do relatório de vendas (puras, testáveis com node: `node scripts/test-period-range.mts`).
 * Datas em AAAA-MM-DD do dia LOCAL (toISOString() usa UTC e, depois das 21h no Brasil, vira o dia seguinte).
 */
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export type RangeKey = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month';

/** De e até (inclusive) de cada atalho. "7 dias" conta hoje mais os 6 anteriores. */
export function rangeFor(key: RangeKey, now: Date = new Date()): { start: string; end: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case 'today': return { start: iso(today), end: iso(today) };
    case 'yesterday': return { start: iso(addDays(today, -1)), end: iso(addDays(today, -1)) };
    case 'last_7_days': return { start: iso(addDays(today, -6)), end: iso(today) };
    case 'last_30_days': return { start: iso(addDays(today, -29)), end: iso(today) };
    case 'this_month': return { start: iso(new Date(today.getFullYear(), today.getMonth(), 1)), end: iso(today) };
  }
}

/** DD/MM/AAAA -> AAAA-MM-DD; vazio se a data não existe (31/02, mês 13...). */
export function parseBr(value: string): string {
  const m = String(value ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getFullYear() !== Number(m[3]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[1])) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export type RangeCheck = { ok: true; start: string; end: string } | { ok: false; error: string };

/** Confere as duas datas digitadas. Data final no futuro vira hoje; no máximo 1 ano por vez. */
export function checkRange(startBr: string, endBr: string, now: Date = new Date()): RangeCheck {
  const s = parseBr(startBr);
  const e = parseBr(endBr);
  if (!s) return { ok: false, error: 'Escreva a data inicial no formato dia/mês/ano, por exemplo 01/11/2026.' };
  if (!e) return { ok: false, error: 'Escreva a data final no formato dia/mês/ano, por exemplo 15/11/2026.' };
  const today = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  if (s > today) return { ok: false, error: 'A data inicial ainda não chegou.' };
  const end = e > today ? today : e;
  if (s > end) return { ok: false, error: 'A data inicial vem depois da data final.' };
  const days = Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${s}T00:00:00Z`).getTime()) / 86400000);
  if (days > 366) return { ok: false, error: 'Escolha no máximo 1 ano por vez.' };
  return { ok: true, start: s, end };
}

/** AAAA-MM-DD -> DD/MM/AAAA (para mostrar o que foi escolhido). */
export function isoToBr(value: string): string {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
