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

/**
 * Máscara de valor enquanto digita, igual ao resto do app (maskCurrencyBR): cada dígito entra pelos centavos.
 * "7" -> "0,07", "700" -> "7,00", "70000" -> "700,00", "123456" -> "1.234,56". (05/11/2026: a versão antiga só
 * filtrava os caracteres e "700" ficava "700", sem centavos nem ponto de milhar.)
 */
export function moneyInput(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
  if (!digits) return '';
  const cents = digits.padStart(3, '0');
  const int = cents.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${int},${cents.slice(-2)}`;
}

/** Diferença do fechamento em palavras: sobrou, faltou ou bateu. */
export function differenceText(diff: number, money: (n: number) => string): { text: string; kind: 'ok' | 'over' | 'short' } {
  const d = Math.round(diff * 100) / 100;
  if (d === 0) return { text: 'Bateu certinho', kind: 'ok' };
  return d > 0 ? { text: `Sobrou ${money(d)}`, kind: 'over' } : { text: `Faltou ${money(-d)}`, kind: 'short' };
}
