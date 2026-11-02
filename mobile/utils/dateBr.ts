/** Datas digitadas em DD/MM/AAAA (puras, testáveis com node). */
const pad = (n: number) => String(n).padStart(2, '0');

export function todayBr(now: Date = new Date()): string {
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
}

/** DD/MM/AAAA -> AAAA-MM-DD; vazio se a data não existe (31/02, mês 13...). */
export function brToIso(value: string): string {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return '';
  return `${y}-${mo}-${d}`;
}

/** Máscara enquanto digita: só números, barras no lugar. */
export function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
