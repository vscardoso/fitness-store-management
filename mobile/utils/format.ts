/**
 * Funções utilitárias de formatação
 * Moeda, data, telefone, CPF, etc
 */

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
 * Formata data e hora (ajusta para timezone local do Brasil)
 */
export const formatDateTime = (date: string | Date): string => {
  let d: Date;
  
  if (typeof date === 'string') {
    // Se a string não tem timezone (ISO sem Z), o JS interpreta como UTC
    // Precisamos adicionar o offset local
    d = new Date(date);
    
    // Se a string termina com Z (UTC), converter para local
    if (date.endsWith('Z') || date.includes('+')) {
      // Já está em UTC, JS converte automaticamente
      d = new Date(date);
    } else {
      // String sem timezone, assumir que é UTC e converter
      // Backend salva em UTC, então precisamos subtrair 3h para BRT
      d = new Date(date + 'Z'); // Força interpretação como UTC
    }
  } else {
    d = date;
  }
  
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
