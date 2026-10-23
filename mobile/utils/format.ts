/**
 * Funções utilitárias de formatação
 * Moeda, data, telefone, CPF, etc
 */
import { VALUE_COLORS, type ValueColorType } from '@/constants/Colors';

/**
 * Formata número para moeda brasileira (R$)
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

/**
 * Converte string formatada de moeda para número
 * Ex: "1.234,56" -> 1234.56
 */
export const parseCurrency = (value: string): number => {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
};

/**
 * Formata data para padrão brasileiro
 */
export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR');
};

/**
 * Converte uma data vinda da API em Date.
 * O backend grava e devolve em UTC; quando a string não traz fuso (ISO sem "Z"/offset),
 * o JavaScript a interpretaria como horário LOCAL e a hora sairia errada (+3h no Brasil).
 * Por isso, sem fuso, assumimos UTC.
 */
export const parseApiDate = (value: string | Date): Date => {
  if (value instanceof Date) return value;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : `${value}Z`);
};

/** Hora do dia no fuso do aparelho. Ex.: 09:52 */
export const formatClock = (date: string | Date): string =>
  parseApiDate(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Dia e mês abreviado. Ex.: 21 de out. */
export const formatDayMonth = (date: string | Date): string =>
  parseApiDate(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

/**
 * Formata data e hora no fuso local do aparelho. Ex.: 21/10/2026 09:52
 */
export const formatDateTime = (date: string | Date): string => {
  return parseApiDate(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(',', '');
};

/**
 * Formata telefone brasileiro
 * (34) 99999-9999
 */
export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

/**
 * Formata CPF
 * 123.456.789-00
 */
export const formatCPF = (cpf: string): string => {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
  }
  return cpf;
};

/**
 * Trunca texto longo
 */
export const truncate = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

/**
 * Capitaliza primeira letra
 */
export const capitalize = (text: string): string => {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

/**
 * Retorna a cor semântica correta para um campo de valor.
 *
 * @param value  - número a avaliar
 * @param type   - 'profit' | 'revenue' | 'cost' | 'neutral' | 'auto'
 *
 * Exemplos:
 *   valueColor(lucro, 'profit')   → verde se > 0, vermelho se < 0
 *   valueColor(receita, 'revenue') → sempre verde
 *   valueColor(custo, 'cost')     → sempre neutro
 *   valueColor(qty, 'neutral')    → sempre neutro
 *   valueColor(percent, 'auto')   → verde se >= 0, vermelho se < 0
 */
export function valueColor(
  value: number,
  type: 'profit' | 'revenue' | 'cost' | 'neutral' | 'auto' = 'auto'
): string {
  switch (type) {
    case 'revenue': return VALUE_COLORS.positive;
    case 'cost':    return VALUE_COLORS.neutral;
    case 'neutral': return VALUE_COLORS.neutral;
    case 'profit':
    case 'auto':
    default:
      if (value > 0) return VALUE_COLORS.positive;
      if (value < 0) return VALUE_COLORS.negative;
      return VALUE_COLORS.neutral;
  }
}

/**
 * Capitaliza primeira letra de cada palavra
 * Ex: "joão da silva" -> "João Da Silva"
 */
/**
 * Para campo de nome enquanto a pessoa digita: primeira letra de CADA palavra em maiúscula (também depois de - e /),
 * o resto em minúscula. Mantém o espaço do fim para dar para continuar escrevendo.
 */
export const titleCaseInput = (text: string): string =>
  text
    .replace(/\s{2,}/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s\-/])([^\W\d_])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

export const capitalizeWords = (text: string): string => {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
