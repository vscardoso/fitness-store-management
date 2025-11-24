/**
 * Máscaras de formatação para inputs
 */

/**
 * Máscara de telefone: (99) 99999-9999
 */
export const phoneMask = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length <= 10) {
    // Telefone fixo: (99) 9999-9999
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .substring(0, 14);
  } else {
    // Celular: (99) 99999-9999
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .substring(0, 15);
  }
};

/**
 * Máscara de CPF: 999.999.999-99
 */
export const cpfMask = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  return numbers
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1-$2')
    .substring(0, 14);
};

/**
 * Máscara de CNPJ: 99.999.999/9999-99
 */
export const cnpjMask = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  return numbers
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .substring(0, 18);
};

/**
 * Máscara de CEP: 99999-999
 */
export const cepMask = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  return numbers
    .replace(/(\d{5})(\d)/, '$1-$2')
    .substring(0, 9);
};

/**
 * Máscara de data: DD/MM/AAAA
 */
export const dateMask = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  return numbers
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .substring(0, 10);
};

/**
 * Máscara de moeda: R$ 9.999,99
 */
export const currencyMask = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length === 0) return '';
  
  const numberValue = parseInt(numbers) / 100;
  
  return numberValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

/**
 * Remover máscara (retorna apenas números)
 */
export const removeMask = (value: string): string => {
  return value.replace(/\D/g, '');
};

/**
 * Máscara de cartão de crédito: 9999 9999 9999 9999
 */
export const creditCardMask = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  return numbers
    .replace(/(\d{4})(\d)/, '$1 $2')
    .replace(/(\d{4})(\d)/, '$1 $2')
    .replace(/(\d{4})(\d)/, '$1 $2')
    .substring(0, 19);
};
