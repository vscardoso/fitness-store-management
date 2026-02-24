/**
 * Utilitários centralizados de formatação de preços / moeda.
 *
 * Use este arquivo em todos os formulários de produto, entrada e variante.
 * Isso elimina a duplicação de formatPriceInput / maskCurrencyBR em ~6 arquivos.
 */

// --------------------------------------------------------------------------
// Conversões de display
// --------------------------------------------------------------------------

/** Converte número para string no formato pt-BR ("12,50"). */
export const toBRNumber = (n: number): string => {
  try {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toFixed(2).replace('.', ',');
  }
};

/** Substitui ponto por vírgula para exibição ("1.50" → "1,50"). */
export const formatPriceDisplay = (value: string): string => {
  if (!value) return '';
  return value.replace('.', ',');
};

/**
 * Formata valor para exibição segura.
 * Retorna "—" se o valor for nulo, undefined ou NaN.
 */
export const formatMoneyDisplay = (
  value: number | string | null | undefined,
): string => {
  if (value == null) return '—';
  const num =
    typeof value === 'number'
      ? value
      : parseFloat(String(value).replace(',', '.'));
  if (isNaN(num)) return '—';
  return num.toFixed(2).replace('.', ',');
};

// --------------------------------------------------------------------------
// Máscara progressiva (para inputs com TextInput.onChangeText)
// --------------------------------------------------------------------------

/**
 * Aplica máscara progressiva de moeda em um input.
 * Cada dígito digitado representa centavos: "150" → "1,50".
 *
 * Uso: onChangeText={(t) => setValue(maskCurrencyBR(t))}
 */
export const maskCurrencyBR = (text: string): string => {
  const digits = (text || '').replace(/\D/g, '');
  if (!digits) return '';
  const value = parseInt(digits, 10) / 100;
  return toBRNumber(value);
};

/**
 * Remove a máscara BR e retorna float.
 * Exemplo: "1.234,56" → 1234.56
 */
export const unmaskCurrency = (text: string): number => {
  const digits = (text || '').replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
};

// --------------------------------------------------------------------------
// Input simples sem máscara progressiva (para campos que recebem paste de valor
// completo, como "123.45" ou "123,45")
// --------------------------------------------------------------------------

/**
 * Remove não-numéricos e converte para decimal string com 2 casas.
 * Exemplo: "15050" → "150.50"
 *
 * Uso: onChangeText={(t) => setValue(formatPriceInput(t))}
 */
export const formatPriceInput = (text: string): string => {
  const numbers = text.replace(/[^0-9]/g, '');
  if (numbers.length === 0) return '';
  const value = parseInt(numbers, 10) / 100;
  return value.toFixed(2);
};

/**
 * Faz parse de string no formato BR ou EN para float.
 * Exemplos: "12,50" → 12.5 | "12.50" → 12.5 | "" → 0
 */
export const parseBRL = (text: string): number => {
  if (!text) return 0;
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
};
