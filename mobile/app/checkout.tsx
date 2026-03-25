/**
 * Tela de Checkout - Finalizar Venda
 * Permite adicionar pagamentos, ver resumo e confirmar venda
 */

import { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import KeyboardSafeView from '@/components/ui/KeyboardSafeView';
import { Text, Button, Card, Chip, TextInput, IconButton, ActivityIndicator, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import useBackToList from '@/hooks/useBackToList';
import { useCart } from '@/hooks/useCart';
import { useCreateSale } from '@/hooks';
import { getCustomerById } from '@/services/customerService';
import { getPaymentDiscounts, type PaymentDiscount } from '@/services/paymentDiscountService';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  validateCheckout,
  validatePayments,
  validateCartStock,
  formatValidationErrors,
} from '@/utils/validation';
import { PaymentMethod } from '@/types';
import type { Customer } from '@/types';

/**
 * Métodos de pagamento disponíveis
 */
const paymentMethods: { value: PaymentMethod | 'MIXED'; label: string; icon: string }[] = [
  { value: PaymentMethod.PIX, label: 'PIX', icon: 'qr-code-outline' },
  { value: PaymentMethod.DEBIT_CARD, label: 'Débito', icon: 'card-outline' },
  { value: PaymentMethod.CREDIT_CARD, label: 'Crédito', icon: 'card-outline' },
  { value: PaymentMethod.CASH, label: 'Dinheiro', icon: 'cash-outline' },
  { value: 'MIXED', label: '2 Métodos', icon: 'swap-horizontal-outline' },
];

/**
 * Opções de parcelamento
 */
const installmentOptions = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: i === 0 ? 'À vista' : `${i + 1}x`,
}));

export default function CheckoutScreen() {
  const cart = useCart();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/sale');
  const createSaleMutation = useCreateSale();

  // Estado local
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | 'MIXED' | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [installments, setInstallments] = useState(1);
  const [pendingCreditCard, setPendingCreditCard] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [isMixedMode, setIsMixedMode] = useState(false);
  const [paymentDiscounts, setPaymentDiscounts] = useState<PaymentDiscount[]>([]);
  const [availableDiscount, setAvailableDiscount] = useState<PaymentDiscount | null>(null);

  // Calcular total final com desconto aplicável
  // Se modo misto ou sem pagamentos: usa availableDiscount
  // Se tem pagamento único: busca desconto do método usado
  const finalTotal = useMemo(() => {
    if (isMixedMode) {
      return cart.total; // Sem desconto em modo misto
    }

    // Se tem pagamento único, usar desconto do método do pagamento
    if (cart.payments.length === 1) {
      const paymentMethod = cart.payments[0].method;
      const discount = paymentDiscounts.find(
        d => d.payment_method === paymentMethod && d.is_active
      );
      if (discount) {
        return cart.total - (cart.total * discount.discount_percentage) / 100;
      }
    }

    // Se não tem pagamentos, usar availableDiscount do método selecionado
    if (cart.payments.length === 0 && availableDiscount) {
      return cart.total - (cart.total * availableDiscount.discount_percentage) / 100;
    }

    return cart.total;
  }, [cart.total, cart.payments, isMixedMode, availableDiscount, paymentDiscounts]);

  // Desconto aplicado (para exibição)
  const appliedDiscount = useMemo(() => {
    if (isMixedMode) return null;
    
    // Se tem pagamento único, buscar desconto do método
    if (cart.payments.length === 1) {
      const paymentMethod = cart.payments[0].method;
      return paymentDiscounts.find(
        d => d.payment_method === paymentMethod && d.is_active
      ) || null;
    }
    
    // Se não tem pagamentos, usar availableDiscount
    if (cart.payments.length === 0) {
      return availableDiscount;
    }
    
    return null;
  }, [cart.payments, isMixedMode, availableDiscount, paymentDiscounts]);

  /**
   * Voltar para tela de vendas
   * Nota: A limpeza de estado é feita automaticamente pelo useFocusEffect
   */
  const handleGoBack = () => {
    goBack();
  };

  // Estado para controlar diálogos de confirmação
  const [dialog, setDialog] = useState<{
    visible: boolean;
    type: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }>({
    visible: false,
    type: 'warning',
    title: '',
    message: '',
    onConfirm: () => {},
  });

  /**
   * Limpar pagamentos sempre que a tela ganhar foco
   * Isso garante que cada entrada no checkout inicia com estado limpo de pagamentos
   */
  useFocusEffect(
    useCallback(() => {
      // Limpar todos os pagamentos ao entrar na tela
      cart.clearPayments();

      // Resetar estados locais
      setPaymentAmount('');
      setCashReceived('');
      setSelectedMethod(null);
      setInstallments(1);
      setIsMixedMode(false);
      setPendingCreditCard(false);
    }, [])
  );

  /**
   * Redirecionar se carrinho vazio
   */
  useEffect(() => {
    if (!cart.hasItems()) {
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Carrinho vazio',
        message: 'Adicione produtos antes de finalizar a venda.',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => {
          setDialog({ ...dialog, visible: false });
          router.replace('/(tabs)/sale');
        },
      });
    }
  }, [cart.items]);

  /**
   * Buscar dados do cliente
   */
  useEffect(() => {
    if (cart.customer_id) {
      loadCustomer();
    }
  }, [cart.customer_id]);

  /**
   * Buscar descont configure dos
   */
  useEffect(() => {
    const loadDiscounts = async () => {
      try {
        const discounts = await getPaymentDiscounts(true);
        setPaymentDiscounts(discounts);
      } catch (error) {
        console.error('Erro ao carregar descontos:', error);
      }
    };
    loadDiscounts();
  }, []);

  /**
   * Calcular desconto disponível quando mudar método de pagamento
   */
  useEffect(() => {
    if (!selectedMethod || selectedMethod === 'MIXED' || isMixedMode) {
      setAvailableDiscount(null);
      return;
    }

    const discount = paymentDiscounts.find(
      d => d.payment_method === selectedMethod && d.is_active
    );
    setAvailableDiscount(discount || null);
  }, [selectedMethod, paymentDiscounts, isMixedMode]);

  /**

  /**
   * Carregar dados do cliente
   */
  const loadCustomer = async () => {
    if (!cart.customer_id) return;

    try {
      setLoadingCustomer(true);
      const data = await getCustomerById(cart.customer_id);
      setCustomer(data);
    } catch (error: any) {
      const is404 = error?.response?.status === 404 || error?.status === 404;
      if (is404) {
        // Cliente não existe mais (DB recriado ou excluído) — limpa silenciosamente
        cart.setCustomer(undefined);
        setCustomer(null);
        return;
      }
      console.error('Erro ao carregar cliente:', error);
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Erro',
        message: 'Não foi possível carregar dados do cliente',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
    } finally {
      setLoadingCustomer(false);
    }
  };

  /**
   * Formatar entrada de valor
   */
  const formatMoneyInput = (text: string): string => {
    // Remove tudo exceto números
    const numbers = text.replace(/\D/g, '');

    if (!numbers) return '';

    // Converte para número com centavos
    const value = parseFloat(numbers) / 100;

    // Formata como moeda sem o símbolo R$
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  /**
   * Parse do valor formatado para número
   */
  const parseMoneyInput = (text: string): number => {
    const numbers = text.replace(/\D/g, '');
    return parseFloat(numbers) / 100;
  };

  /**
   * Calcular total com desconto para um método específico
   * Usado para evitar race condition do useEffect
   */
  const calculateTotalWithDiscount = (method: PaymentMethod): number => {
    if (isMixedMode) {
      return cart.total;
    }

    const discount = paymentDiscounts.find(
      d => d.payment_method === method && d.is_active
    );

    if (discount) {
      return cart.total - (cart.total * discount.discount_percentage) / 100;
    }

    return cart.total;
  };

  /**
   * Adicionar pagamento direto (PIX, Cartão, Dinheiro)
   * Adiciona o valor total restante automaticamente
   */
  const handleAddDirectPayment = (method: PaymentMethod, installmentCount: number = 1) => {
    // Calcular o total com desconto diretamente para evitar race condition
    const totalWithDiscount = calculateTotalWithDiscount(method);
    const totalRemaining = totalWithDiscount - cart.totalPaid;

    if (totalRemaining <= 0) {
      setDialog({
        visible: true,
        type: 'info',
        title: 'Pagamento completo',
        message: 'O valor total já foi pago.',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    // Adicionar pagamento com valor total (já com desconto aplicado)
    cart.addPayment(method, totalRemaining, installmentCount);
    haptics.success();
  };

  /**
   * Adicionar pagamento
   */
  const handleAddPayment = () => {
    // Se não está no modo misto, mostrar aviso
    if (!isMixedMode) {
      setDialog({
        visible: true,
        type: 'info',
        title: 'Modo de pagamento',
        message: 'Para pagamento único, toque diretamente no botão PIX, Cartão ou Dinheiro. Use "2 Métodos" apenas para dividir o pagamento.',
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    const amount = parseMoneyInput(paymentAmount);

    if (isNaN(amount) || amount <= 0) {
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Valor inválido',
        message: 'Digite um valor válido para o pagamento',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      haptics.warning();
      return;
    }

    // selectedMethod deve ser um PaymentMethod válido no modo misto
    if (!selectedMethod || selectedMethod === 'MIXED') {
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Selecione a forma',
        message: 'Escolha PIX, Cartão ou Dinheiro para adicionar o pagamento.',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    // Verificar se excede total
    const totalRemaining = finalTotal - cart.totalPaid;

    if (amount > totalRemaining) {
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Valor excede total',
        message: `O pagamento excede o valor restante. Deseja adicionar ${formatCurrency(totalRemaining)}?`,
        confirmText: 'Adicionar',
        cancelText: 'Cancelar',
        onConfirm: () => {
          cart.addPayment(selectedMethod, totalRemaining, installments);
          setPaymentAmount('');
          setCashReceived('');
          haptics.success();
          setDialog({ ...dialog, visible: false });
        },
      });
      return;
    }

    // Adicionar pagamento
    cart.addPayment(selectedMethod, amount, installments);
    setPaymentAmount('');
    setCashReceived('');
    haptics.light();
  };

  /**
   * Remover pagamento
   */
  const handleRemovePayment = (index: number) => {
    haptics.light();
    cart.removePayment(index);
  };

  /**
   * Calcular troco
   */
  const calculateChange = (): number => {
    if (!cashReceived) return 0;

    const received = parseMoneyInput(cashReceived);
    const cashPayments = cart.payments
      .filter(p => p.method === 'cash')
      .reduce((sum, p) => sum + p.amount, 0);

    return Math.max(0, received - cashPayments);
  };

  /**
   * Preencher valor restante
   */
  const handleFillRemaining = () => {
    const remaining = finalTotal - cart.totalPaid;
    setPaymentAmount(formatMoneyInput((remaining * 100).toString()));
    haptics.light();
  };

  /**
   * Finalizar venda
   */
  const handleFinalizeSale = async () => {
    // Validação completa usando validation utils
    const validation = validateCheckout(cart.items, cart.payments, finalTotal);

    if (!validation.isValid) {
      haptics.error();
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Validação falhou',
        message: formatValidationErrors(validation.errors),
        confirmText: 'Revisar',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    // Validação adicional: pagamento deve cobrir total
    if (cart.totalPaid < finalTotal) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Pagamento incompleto',
        message: `Valor pago: ${formatCurrency(cart.totalPaid)}\nTotal: ${formatCurrency(finalTotal)}\n\nO valor pago deve cobrir o total da venda`,
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    haptics.heavy();
    setLoading(true);

    try {
      // Mapear items para formato da API
      const items = cart.items.map(item => ({
        product_id: item.product_id,
        ...(item.variant_id ? { variant_id: item.variant_id } : {}),
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount,
      }));

      // Mapear payments para formato da API
      const payments = cart.payments.map(p => ({
        payment_method: p.method,
        amount: p.amount,
        installments: p.installments || 1,
      }));

      // Determinar método de pagamento principal
      // Se há múltiplos pagamentos, usa o de maior valor
      const mainPaymentMethod = cart.payments.length > 0
        ? cart.payments.reduce((prev, current) =>
            (current.amount > prev.amount) ? current : prev
          ).method
        : PaymentMethod.CASH;

      // Preparar dados da venda
      const saleData: any = {
        payment_method: mainPaymentMethod,
        items,
        payments,
        discount_amount: cart.discount,
        tax_amount: 0,
        notes: cart.notes,
      };

      // Adicionar customer_id apenas se houver cliente selecionado
      if (cart.customer_id) {
        saleData.customer_id = cart.customer_id;
      }

      // Criar venda usando mutation hook
      // Calcular troco antes de limpar o carrinho
      const change = Math.max(0, cart.totalPaid - finalTotal);

      createSaleMutation.mutate(saleData, {
        onSuccess: (sale) => {
          haptics.success();

          // Limpar carrinho
          cart.clear();

          // Navegar para tela de sucesso com troco (se houver)
          router.replace({
            pathname: '/checkout/success',
            params: {
              sale_number: sale.sale_number,
              ...(change > 0 ? { change: change.toFixed(2) } : {}),
            }
          });
        },
        onError: (error: any) => {
          haptics.error();
          console.error('Erro ao finalizar venda:', error);

          const detail: string = error.response?.data?.detail || error.message || '';
          const isStockError = detail.toLowerCase().includes('estoque insuficiente');

          const title = isStockError ? 'Estoque insuficiente' : 'Erro ao finalizar';
          const message = detail
            ? isStockError
              ? `${detail}\n\nVolte ao carrinho e ajuste a quantidade.`
              : detail
            : 'Erro ao processar venda. Tente novamente.';

          setDialog({
            visible: true,
            type: 'danger',
            title,
            message,
            confirmText: isStockError ? 'Voltar ao carrinho' : 'OK',
            cancelText: isStockError ? 'Fechar' : '',
            onConfirm: () => {
              setDialog({ ...dialog, visible: false });
              if (isStockError) router.back();
            },
          });
        },
      });

    } catch (error: any) {
      // Error handling agora é feito no callback onError da mutation
      console.error('Erro inesperado:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verificar se deve mostrar seletor de parcelas
   */
  const showInstallments = selectedMethod === PaymentMethod.CREDIT_CARD;

  /**
   * Verificar se há pagamento em dinheiro
   */
  const hasCashPayment = cart.payments.some(p => p.method === PaymentMethod.CASH);

  /**
   * Obter label do método de pagamento
   */
  const getPaymentMethodLabel = (method: PaymentMethod): string => {
    return paymentMethods.find(m => m.value === method)?.label || method;
  };

  return (
    <KeyboardSafeView style={styles.container}>
      <PageHeader
        title="Finalizar Venda"
        subtitle={`${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'itens'}`}
        showBackButton
        onBack={handleGoBack}
      />

      <View style={styles.content}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Resumo do Carrinho */}
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Resumo do Carrinho
                </Text>
                <Button
                  mode="text"
                  compact
                  onPress={handleGoBack}
                >
                  Editar
                </Button>
              </View>

              {cart.items.map((item, index) => (
                <View key={item.product_id}>
                  {index > 0 && <View style={styles.itemDivider} />}
                  <View style={styles.cartItem}>
                    <View style={styles.cartItemInfo}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {item.product.name}
                      </Text>
                      <Text variant="bodySmall" style={styles.cartItemQty}>
                        {item.quantity}x {formatCurrency(item.unit_price)}
                      </Text>
                    </View>
                    <Text variant="bodyMedium" style={styles.cartItemTotal}>
                      {formatCurrency(item.quantity * item.unit_price - item.discount)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>

          {/* Cliente */}
          {cart.customer_id && (
            <View style={styles.section}>
              <Text style={styles.label}>Cliente</Text>
              {loadingCustomer ? (
                <ActivityIndicator size="small" style={styles.loader} />
              ) : customer ? (
                <View style={styles.customerCard}>
                  <View style={styles.customerInfo}>
                    <Ionicons name="person" size={20} color={Colors.light.primary} />
                    <View style={styles.customerDetails}>
                      <Text style={styles.customerName}>{customer.full_name}</Text>
                      {customer.phone && (
                        <Text style={styles.customerPhone}>{customer.phone}</Text>
                      )}
                    </View>
                  </View>
                  {customer.loyalty_points > 0 && (
                    <View style={styles.loyaltyBadge}>
                      <Ionicons name="star" size={14} color={Colors.light.warning} />
                      <Text style={styles.loyaltyPoints}>{customer.loyalty_points}</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          )}

          {/* Formas de Pagamento */}
          <View style={styles.section}>
            <Text style={styles.label}>Formas de Pagamento</Text>

            {/* Chips de seleção sempre visíveis (exceto em modo misto) */}
            {!isMixedMode && (
              <View style={styles.paymentMethodsContainer}>
                {paymentMethods.filter(m => m.value !== 'MIXED').map((method) => {
                  const isSelected = cart.payments.length > 0
                    ? cart.payments[0].method === method.value
                    : (pendingCreditCard && method.value === PaymentMethod.CREDIT_CARD);

                  return (
                    <TouchableOpacity
                      key={method.value}
                      style={[styles.paymentMethodChip, isSelected && styles.paymentMethodChipActive]}
                      onPress={() => {
                        // Se já está selecionado com pagamento, não fazer nada
                        if (isSelected && cart.payments.length > 0) {
                          return;
                        }

                        const paymentMethod = method.value as PaymentMethod;

                        // Cartão de crédito: mostrar seletor de parcelas antes de confirmar
                        if (paymentMethod === PaymentMethod.CREDIT_CARD) {
                          if (cart.payments.length > 0) cart.clearPayments();
                          setSelectedMethod(paymentMethod);
                          setInstallments(1);
                          setPendingCreditCard(true);
                          haptics.selection();
                          return;
                        }

                        // Outros métodos: fechar picker de crédito se aberto
                        setPendingCreditCard(false);
                        const totalWithDiscount = calculateTotalWithDiscount(paymentMethod);

                        if (cart.payments.length > 0 && !isSelected) {
                          cart.clearPayments();
                          cart.addPayment(paymentMethod, totalWithDiscount, 1);
                          setSelectedMethod(paymentMethod);
                          haptics.success();
                        } else {
                          setSelectedMethod(paymentMethod);
                          handleAddDirectPayment(paymentMethod);
                        }
                      }}
                    >
                      <Ionicons
                        name={method.icon as any}
                        size={18}
                        color={isSelected ? Colors.light.primary : Colors.light.textSecondary}
                      />
                      <Text style={[styles.paymentMethodChipText, isSelected && styles.paymentMethodChipTextActive]}>
                        {method.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Seletor de parcelas (crédito, modo simples) */}
            {pendingCreditCard && !isMixedMode && (
              <View style={styles.installmentPicker}>
                <Text style={styles.installmentPickerLabel}>Parcelas:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.installmentScroll}>
                  <View style={styles.installmentChipsRow}>
                    {installmentOptions.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.installmentChip, installments === opt.value && styles.installmentChipActive]}
                        onPress={() => { setInstallments(opt.value); haptics.selection(); }}
                      >
                        <Text style={[styles.installmentChipText, installments === opt.value && styles.installmentChipTextActive]}>
                          {opt.label}
                        </Text>
                        {opt.value > 1 && (
                          <Text style={[styles.installmentChipSub, installments === opt.value && styles.installmentChipSubActive]}>
                            {formatCurrency(finalTotal / opt.value)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Button
                  mode="contained"
                  onPress={() => {
                    handleAddDirectPayment(PaymentMethod.CREDIT_CARD, installments);
                    setPendingCreditCard(false);
                  }}
                  icon="check"
                  style={styles.confirmInstallmentBtn}
                >
                  {installments === 1 ? 'Confirmar à Vista' : `Confirmar ${installments}x`}
                </Button>
              </View>
            )}

            {/* Resumo do crédito após confirmar */}
            {!isMixedMode && !pendingCreditCard && cart.payments.length > 0 && cart.payments[0].method === PaymentMethod.CREDIT_CARD && (
              <View style={styles.creditSummary}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.light.success} />
                <Text style={styles.creditSummaryText}>
                  {cart.payments[0].installments > 1
                    ? `${cart.payments[0].installments}x de ${formatCurrency(cart.payments[0].amount / cart.payments[0].installments)}`
                    : 'À vista'}
                </Text>
                <TouchableOpacity onPress={() => {
                  const prev = cart.payments[0]?.installments || 1;
                  cart.clearPayments();
                  setInstallments(prev);
                  setPendingCreditCard(true);
                }}>
                  <Text style={styles.creditSummaryChange}>Alterar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Botão para modo misto */}
            {!isMixedMode && cart.payments.length === 0 && !pendingCreditCard && (
              <TouchableOpacity
                style={styles.mixedModeButton}
                onPress={() => {
                  setIsMixedMode(true);
                  setSelectedMethod(null);
                  haptics.selection();
                }}
              >
                <Ionicons name="swap-horizontal-outline" size={16} color={Colors.light.primary} />
                <Text style={styles.mixedModeButtonText}>Usar 2 métodos de pagamento</Text>
              </TouchableOpacity>
            )}

              {/* Modo misto: mostrar inputs para digitar valores */}
              {isMixedMode && (
                <>
                  <View style={styles.mixedModeHeader}>
                    <Text variant="bodySmall" style={styles.mixedModeHelp}>
                      💡 No modo 2 Métodos, escolha a forma e digite o valor para cada pagamento.
                    </Text>
                    <Button
                      mode="text"
                      compact
                      onPress={() => {
                        setIsMixedMode(false);
                        cart.clearPayments();
                        setSelectedMethod(null);
                        haptics.light();
                      }}
                      labelStyle={{ fontSize: 11 }}
                    >
                      Cancelar
                    </Button>
                  </View>

                  {/* Seleção de método no modo misto */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.methodsScroll}
                  >
                    {paymentMethods.filter(m => m.value !== 'MIXED').map((method) => (
                      <Chip
                        key={method.value}
                        selected={selectedMethod === method.value}
                        onPress={() => {
                          setSelectedMethod(method.value as PaymentMethod);
                          setInstallments(1);
                          haptics.selection();
                        }}
                        icon={method.icon}
                        style={styles.methodChip}
                      >
                        {method.label}
                      </Chip>
                    ))}
                  </ScrollView>

                  {/* Parcelas no modo misto (apenas crédito) */}
                  {selectedMethod === PaymentMethod.CREDIT_CARD && (
                    <View style={styles.installmentPickerMixed}>
                      <Text style={styles.installmentPickerLabel}>Parcelas:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.installmentScroll}>
                        <View style={styles.installmentChipsRow}>
                          {installmentOptions.map((opt) => (
                            <TouchableOpacity
                              key={opt.value}
                              style={[styles.installmentChip, installments === opt.value && styles.installmentChipActive]}
                              onPress={() => { setInstallments(opt.value); haptics.selection(); }}
                            >
                              <Text style={[styles.installmentChipText, installments === opt.value && styles.installmentChipTextActive]}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  )}

                  {/* Input de valor */}
                  <View style={styles.paymentInputRow}>
                    <TextInput
                      label="Valor"
                      value={paymentAmount}
                      onChangeText={(text) => setPaymentAmount(formatMoneyInput(text))}
                      keyboardType="numeric"
                      mode="outlined"
                      dense
                      left={<TextInput.Affix text="R$" />}
                      style={styles.paymentInput}
                    />
                    <Button
                      mode="outlined"
                      onPress={handleFillRemaining}
                      style={styles.fillButton}
                      compact
                    >
                      Preencher
                    </Button>
                  </View>

                  {/* Botão adicionar pagamento */}
                  <Button
                    mode="contained"
                    onPress={handleAddPayment}
                    icon="plus"
                    style={styles.addPaymentButton}
                  >
                    Adicionar Pagamento
                  </Button>
                </>
              )}

            {/* Lista de pagamentos adicionados - APENAS para modo misto */}
            {isMixedMode && cart.payments.length > 0 && (
                <View style={styles.paymentsListContainer}>
                  <Text variant="bodySmall" style={styles.paymentsListTitle}>
                    Pagamentos adicionados:
                  </Text>
                  {cart.payments.map((payment, index) => (
                    <View key={index} style={styles.paymentItem}>
                      <View style={styles.paymentItemInfo}>
                        <Text variant="bodyMedium">
                          {getPaymentMethodLabel(payment.method)}
                        </Text>
                        <Text variant="bodySmall" style={styles.paymentItemDetail}>
                          {payment.installments > 1
                            ? `${payment.installments}x de ${formatCurrency(payment.amount / payment.installments)}`
                            : formatCurrency(payment.amount)
                          }
                        </Text>
                      </View>
                      <IconButton
                        icon="delete"
                        size={20}
                        onPress={() => handleRemovePayment(index)}
                      />
                    </View>
                  ))}
                </View>
              )}
          </View>

          {/* Cálculo de Troco (se tiver dinheiro) */}
          {hasCashPayment && (
            <View style={styles.section}>
              <Text style={styles.label}>Cálculo de Troco</Text>

              <TextInput
                label="Valor Recebido"
                value={cashReceived}
                onChangeText={(text) => setCashReceived(formatMoneyInput(text))}
                keyboardType="numeric"
                mode="outlined"
                dense
                left={<TextInput.Affix text="R$" />}
                style={styles.cashInput}
              />

              {cashReceived && (
                <View style={styles.changeContainer}>
                  <Text variant="bodyLarge">Troco:</Text>
                  <Text variant="headlineSmall" style={styles.changeValue}>
                    {formatCurrency(calculateChange())}
                  </Text>
                </View>
              )}
            </View>
          )}



          {/* Desconto Disponivel */}
          {appliedDiscount && cart.payments.length === 0 && (
            <View style={styles.discountBanner}>
              <View style={styles.discountBannerContent}>
                <Ionicons name="pricetag" size={16} color={Colors.light.success} />
                <Text style={styles.discountBannerText}>
                  <Text style={styles.discountBannerHighlight}>{appliedDiscount.discount_percentage}% OFF</Text>
                  {' '}pagando com {appliedDiscount.payment_method.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.discountBannerAmount}>
                -{formatCurrency((cart.total * appliedDiscount.discount_percentage) / 100)}
              </Text>
            </View>
          )}

          {/* Totais */}
          <Card style={[styles.card, styles.totalsCard]}>
            <Card.Content>
              <View style={styles.totalRow}>
                <Text variant="bodyLarge">Subtotal</Text>
                <Text variant="bodyLarge">{formatCurrency(cart.subtotal)}</Text>
              </View>

              {cart.discount > 0 && (
                <View style={styles.totalRow}>
                  <Text variant="bodyLarge" style={styles.discountText}>
                    Desconto Manual
                  </Text>
                  <Text variant="bodyLarge" style={styles.discountText}>
                    - {formatCurrency(cart.discount)}
                  </Text>
                </View>
              )}

              {appliedDiscount && (
                <View style={styles.totalRow}>
                  <Text variant="bodyLarge" style={styles.discountText}>
                    Desconto {appliedDiscount.payment_method.toUpperCase()} ({appliedDiscount.discount_percentage}%)
                  </Text>
                  <Text variant="bodyLarge" style={styles.discountText}>
                    - {formatCurrency((cart.total * appliedDiscount.discount_percentage) / 100)}
                  </Text>
                </View>
              )}

              <View style={styles.totalDivider} />

              <View style={styles.totalRow}>
                <Text variant="headlineSmall" style={styles.totalLabel}>
                  TOTAL
                </Text>
                <Text variant="headlineSmall" style={styles.totalValue}>
                  {formatCurrency(finalTotal)}
                </Text>
              </View>

              {/* Mostrar Total Pago e Restante APENAS no modo misto */}
              {isMixedMode && cart.payments.length > 0 && (
                <>
                  <View style={styles.totalDivider} />

                  <View style={styles.totalRow}>
                    <Text variant="bodyLarge" style={styles.paidText}>
                      Total Pago
                    </Text>
                    <Text variant="bodyLarge" style={styles.paidText}>
                      {formatCurrency(cart.totalPaid)}
                    </Text>
                  </View>

                  <View style={styles.totalRow}>
                    <Text
                      variant="bodyLarge"
                      style={(finalTotal - cart.totalPaid) > 0 ? styles.remainingText : styles.changeText}
                    >
                      {(finalTotal - cart.totalPaid) > 0 ? 'Restante' : 'Troco'}
                    </Text>
                    <Text
                      variant="bodyLarge"
                      style={(finalTotal - cart.totalPaid) > 0 ? styles.remainingText : styles.changeText}
                    >
                      {formatCurrency(Math.abs(finalTotal - cart.totalPaid))}
                    </Text>
                  </View>
                </>
              )}
            </Card.Content>
          </Card>

          {/* Espaçamento para botão fixo */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Footer com botão de finalizar */}
        <View style={styles.footer}>
          <Button
            mode="contained"
            onPress={handleFinalizeSale}
            disabled={cart.items.length === 0 || cart.totalPaid < finalTotal || loading}
            loading={loading}
            icon="check"
            style={[
              styles.finalizeButton,
              cart.totalPaid >= finalTotal && styles.finalizeButtonEnabled
            ]}
            labelStyle={styles.finalizeButtonLabel}
          >
            {loading ? 'Processando...' : 'Confirmar Venda'}
          </Button>
        </View>
      </View>

      {/* Confirm Dialog */}
      <ConfirmDialog
        visible={dialog.visible}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm}
        onCancel={() => setDialog({ ...dialog, visible: false })}
      />
    </KeyboardSafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  cartItemInfo: {
    flex: 1,
    marginRight: 16,
  },
  cartItemQty: {
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  cartItemTotal: {
    fontWeight: '600',
  },
  itemDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 8,
  },
  loader: {
    marginVertical: 16,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: Colors.light.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  customerPhone: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  loyaltyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  loyaltyPoints: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.warning,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customerDetail: {
    color: Colors.light.textSecondary,
  },
  paymentMethodsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  paymentMethodChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  paymentMethodChipActive: {
    backgroundColor: Colors.light.primary + '15',
    borderColor: Colors.light.primary,
  },
  paymentMethodChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  paymentMethodChipTextActive: {
    color: Colors.light.primary,
  },
  mixedModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderStyle: 'dashed',
  },
  mixedModeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  mixedModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  methodsScroll: {
    marginBottom: 16,
  },
  methodChip: {
    marginRight: 8,
  },
  mixedModeHelp: {
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  paymentInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  paymentInput: {
    flex: 1,
  },
  fillButton: {
    justifyContent: 'center',
  },
  installmentsContainer: {
    marginBottom: 16,
  },
  installmentsLabel: {
    marginBottom: 8,
    color: Colors.light.textSecondary,
  },
  installmentChipLegacy: {
    marginRight: 8,
  },
  addPaymentButton: {
    marginTop: 8,
  },
  paymentsListContainer: {
    marginTop: 16,
  },
  paymentsListTitle: {
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  paymentItemInfo: {
    flex: 1,
  },
  paymentItemDetail: {
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  cashInput: {
    marginBottom: 16,
  },
  changeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.light.successLight,
    borderRadius: 8,
    padding: 16,
  },
  changeValue: {
    fontWeight: '700',
    color: Colors.light.success,
  },
  totalsCard: {
    backgroundColor: Colors.light.background,
    borderWidth: 2,
    borderColor: Colors.light.primary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 12,
  },
  totalLabel: {
    fontWeight: '700',
  },
  totalValue: {
    fontWeight: '700',
    color: Colors.light.primary,
  },
  discountText: {
    color: Colors.light.error,
  },
  paidText: {
    color: Colors.light.success,
    fontWeight: '600',
  },
  remainingText: {
    color: Colors.light.warning,
    fontWeight: '600',
  },
  changeText: {
    color: Colors.light.success,
    fontWeight: '600',
  },
  // ── Parcelamento ──────────────────────────────────────────
  installmentPicker: {
    marginTop: 12,
    padding: 12,
    backgroundColor: `${Colors.light.primary}08`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.light.primary}30`,
  },
  installmentPickerMixed: {
    marginBottom: 12,
  },
  installmentPickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  installmentScroll: {
    marginBottom: 12,
  },
  installmentChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  installmentChip: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    minWidth: 52,
  },
  installmentChipActive: {
    borderColor: Colors.light.primary,
    backgroundColor: `${Colors.light.primary}12`,
  },
  installmentChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  installmentChipTextActive: {
    color: Colors.light.primary,
  },
  installmentChipSub: {
    fontSize: 10,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  installmentChipSubActive: {
    color: Colors.light.primary,
  },
  confirmInstallmentBtn: {
    borderRadius: 10,
  },
  creditSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  creditSummaryText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.success,
  },
  creditSummaryChange: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.primary,
    textDecorationLine: 'underline',
  },

  bottomSpacer: {
    height: 80,
  },
  footer: {
    padding: 16,
    backgroundColor: Colors.light.background,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  finalizeButton: {
    backgroundColor: Colors.light.textSecondary,
  },
  finalizeButtonEnabled: {
    backgroundColor: Colors.light.success,
  },
  finalizeButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 4,
  },
  discountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.successLight,
    borderWidth: 1,
    borderColor: Colors.light.success,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  discountBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  discountBannerText: {
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
  },
  discountBannerHighlight: {
    fontWeight: '700',
    color: Colors.light.success,
    fontSize: 15,
  },
  discountBannerAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.success,
  },
});




