/** Valores digitados no caixa (puros, testáveis com node): "1.234,56", "12,5", "R$ 10" ou "12.50" -> número. */

/** Texto digitado -> número em reais com 2 casas; null se vazio ou inválido. */
export function parseMoneyBr(raw: string): number | null {
  let s = (raw ?? '').replace(/R\$|\s/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');       // 1.234,56
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');      // 1.500 = mil e quinhentos
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100) / 100;
}

/** Máscara enquanto digita: só números e uma vírgula, no máximo 2 casas depois dela. */
export function moneyInput(raw: string): string {
  let s = (raw ?? '').replace(/[^\d,.]/g, '').replace(/\./g, ',');
  const first = s.indexOf(',');
  if (first >= 0) s = s.slice(0, first + 1) + s.slice(first + 1).replace(/,/g, '');
  const [int, dec] = s.split(',');
  const intPart = int.replace(/^0+(?=\d)/, '');
  return dec === undefined ? intPart : `${intPart},${dec.slice(0, 2)}`;
}

/** Diferença do fechamento em palavras: sobrou, faltou ou bateu. */
export function differenceText(diff: number, money: (n: number) => string): { text: string; kind: 'ok' | 'over' | 'short' } {
  const d = Math.round(diff * 100) / 100;
  if (d === 0) return { text: 'Bateu certinho', kind: 'ok' };
  return d > 0 ? { text: `Sobrou ${money(d)}`, kind: 'over' } : { text: `Faltou ${money(-d)}`, kind: 'short' };
}
