/**
 * Funções utilitárias de validação
 * Email, CPF, telefone, senha, etc
 */

/**
 * Valida email
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valida CPF brasileiro
 */
export const isValidCPF = (cpf: string): boolean => {
  const cleaned = cpf.replace(/\D/g, '');
  
  if (cleaned.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleaned)) return false; // Todos dígitos iguais
  
  // Validação dos dígitos verificadores
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleaned.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleaned.charAt(10))) return false;
  
  return true;
};

/**
 * Valida telefone brasileiro
 */
export const isValidPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10 || cleaned.length === 11;
};

/**
 * Valida se o valor é um número positivo
 */
export const isPositiveNumber = (value: number): boolean => {
  return !isNaN(value) && value > 0;
};

/**
 * Valida se a senha é forte
 */
export const isStrongPassword = (password: string): boolean => {
  // Mínimo 8 caracteres
  return password.length >= 8;
};

/**
 * ========================================
 * VALIDAÇÕES ESPECÍFICAS DO PDV
 * ========================================
 */

import type { Product, CartItem, Payment } from '@/types';
import { PaymentMethod } from '@/types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Valida se um produto pode ser adicionado ao carrinho
 */
export const validateProductForCart = (
  product: Product,
  requestedQuantity: number = 1
): ValidationResult => {
  const errors: string[] = [];

  // Verificar se produto existe
  if (!product || !product.id) {
    errors.push('Produto inválido');
    return { isValid: false, errors };
  }

  // Verificar se produto está ativo
  if (!product.is_active) {
    errors.push('Este produto não está mais disponível');
  }

  // Verificar se não é produto de catálogo
  if (product.is_catalog) {
    errors.push('Produtos de catálogo não podem ser vendidos');
  }

  // Verificar quantidade mínima
  if (requestedQuantity < 1) {
    errors.push('Quantidade deve ser maior que zero');
  }

  // Verificar se é número inteiro
  if (!Number.isInteger(requestedQuantity)) {
    errors.push('Quantidade deve ser um número inteiro');
  }

  // Verificar estoque disponível
  const availableStock = product.current_stock || 0;
  if (availableStock <= 0) {
    errors.push('Produto sem estoque disponível');
  } else if (requestedQuantity > availableStock) {
    errors.push(`Apenas ${availableStock} unidades disponíveis em estoque`);
  }

  // Verificar se preço é válido
  if (!product.price || product.price <= 0) {
    errors.push('Produto sem preço de venda definido');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Valida estoque antes do checkout
 */
export const validateCartStock = (items: CartItem[]): ValidationResult => {
  const errors: string[] = [];

  if (!items || items.length === 0) {
    errors.push('Carrinho vazio');
    return { isValid: false, errors };
  }

  items.forEach((item) => {
    const availableStock = item.product?.current_stock || 0;

    if (availableStock <= 0) {
      errors.push(`${item.product.name}: sem estoque disponível`);
    } else if (item.quantity > availableStock) {
      errors.push(
        `${item.product.name}: quantidade no carrinho (${item.quantity}) excede estoque disponível (${availableStock})`
      );
    }

    if (item.quantity <= 0) {
      errors.push(`${item.product.name}: quantidade inválida`);
    }

    if (item.unit_price <= 0) {
      errors.push(`${item.product.name}: preço inválido`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Valida pagamentos no checkout
 */
export const validatePayments = (
  payments: Payment[],
  totalAmount: number
): ValidationResult => {
  const errors: string[] = [];

  // Verificar se há pelo menos um pagamento
  if (!payments || payments.length === 0) {
    errors.push('Nenhuma forma de pagamento selecionada');
    return { isValid: false, errors };
  }

  // Validar cada pagamento
  payments.forEach((payment, index) => {
    if (!payment.method) {
      errors.push(`Pagamento ${index + 1}: forma de pagamento não selecionada`);
    }

    if (!payment.amount || payment.amount <= 0) {
      errors.push(`Pagamento ${index + 1}: valor inválido`);
    }

    // Validar campos específicos por método
    if (payment.method === PaymentMethod.CASH) {
      // amount_received não está na interface Payment, então comentamos essa validação
      // A validação de troco é feita no componente checkout
      // if (payment.amount_received && payment.amount_received < payment.amount) {
      //   errors.push(
      //     `Pagamento ${index + 1}: valor recebido menor que o valor do pagamento`
      //   );
      // }
    }
  });

  // Verificar se soma dos pagamentos cobre o total
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  if (totalPaid < totalAmount) {
    const missing = totalAmount - totalPaid;
    errors.push(`Faltam R$ ${missing.toFixed(2)} para completar o pagamento`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Valida desconto aplicado
 */
export const validateDiscount = (
  discount: number,
  subtotal: number
): ValidationResult => {
  const errors: string[] = [];

  if (discount < 0) {
    errors.push('Desconto não pode ser negativo');
  }

  if (discount > subtotal) {
    errors.push('Desconto não pode ser maior que o subtotal');
  }

  // Verificar se desconto é muito alto (> 50%)
  const discountPercentage = (discount / subtotal) * 100;
  if (discountPercentage > 50) {
    errors.push(
      `Desconto de ${discountPercentage.toFixed(0)}% muito alto. Confirme com gerente.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validação completa antes de finalizar venda
 */
export const validateCheckout = (
  items: CartItem[],
  payments: Payment[],
  totalAmount: number
): ValidationResult => {
  const errors: string[] = [];

  // Validar carrinho
  const cartValidation = validateCartStock(items);
  if (!cartValidation.isValid) {
    errors.push(...cartValidation.errors);
  }

  // Validar pagamentos
  const paymentsValidation = validatePayments(payments, totalAmount);
  if (!paymentsValidation.isValid) {
    errors.push(...paymentsValidation.errors);
  }

  // Validar total
  if (totalAmount <= 0) {
    errors.push('Total da venda inválido');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Formata erros de validação para exibição
 */
export const formatValidationErrors = (errors: string[]): string => {
  if (errors.length === 0) return '';
  if (errors.length === 1) return errors[0];
  return errors.map((error, index) => `${index + 1}. ${error}`).join('\n');
};
