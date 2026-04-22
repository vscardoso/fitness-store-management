/**
 * Tela de Checkout - Finalizar Venda
 * Permite adicionar pagamentos, ver resumo e confirmar venda
 */

import { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text, TextInput, ActivityIndicator } from 'react-native';
import KeyboardSafeView from '@/components/ui/KeyboardSafeView';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useBackToList from '@/hooks/useBackToList';
import { useCart } from '@/hooks/useCart';
import { useCreateSale } from '@/hooks';
import { getCustomerById } from '@/services/customerService';
import { getPaymentDiscounts, type PaymentDiscount } from '@/services/paymentDiscountService';
import { pixStart, listTerminals, createOrder, terminalStart } from '@/services/pdvService';
import type { PDVTerminal } from '@/types/pdv';
import { getProductById } from '@/services/productService';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AppButton from '@/components/ui/AppButton';
import { skipLoading } from '@/utils/apiHelpers';
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
const paymentMethods: { value: PaymentMethod | 'MIXED' | 'TERMINAL'; label: string; icon: string }[] = [
  { value: PaymentMethod.PIX, label: 'PIX', icon: 'qr-code-outline' },
  { value: PaymentMethod.DEBIT_CARD, label: 'Débito', icon: 'card-outline' },
  { value: PaymentMethod.CREDIT_CARD, label: 'Crédito', icon: 'card-outline' },
  { value: PaymentMethod.CASH, label: 'Dinheiro', icon: 'cash-outline' },
  { value: 'TERMINAL' as any, label: 'Maquininha', icon: 'card-outline' },
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
  const queryClient = useQueryClient();
  const { goBack } = useBackToList('/(tabs)/sale');
  const createSaleMutation = useCreateSale();

  // Estado local
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | 'MIXED' | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [installments, setInstallments] = useState(1);
  const [pendingCreditCard, setPendingCreditCard] = useState(false);
  const [pendingTerminal, setPendingTerminal] = useState(false);
  const [terminalPaymentType, setTerminalPaymentType] = useState<'credit_card' | 'debit_card'>('credit_card');
  const [terminalInstallments, setTerminalInstallments] = useState(1);
  const [selectedTerminal, setSelectedTerminal] = useState<PDVTerminal | null>(null);
  const [terminals, setTerminals] = useState<PDVTerminal[]>([]);
  const [loadingTerminals, setLoadingTerminals] = useState(false);
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
   * Carregar terminais PDV disponíveis
   */
  const loadTerminals = async () => {
    setLoadingTerminals(true);
    try {
      const list = await listTerminals();
      setTerminals(list.filter((t: PDVTerminal) => t.is_active && t.is_configured));
    } catch {
      // silencioso
    } finally {
      setLoadingTerminals(false);
    }
  };

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
      setPendingTerminal(false);
      setSelectedTerminal(null);
      setTerminalInstallments(1);
      setTerminalPaymentType('credit_card');
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
      const stockChecks = await Promise.all(
        cart.items.map(async (item) => {
          const itemLabel = item.variant_label
            ? `${item.product.name} (${item.variant_label})`
            : item.product.name;

          let latestProduct: any;
          try {
            latestProduct = await getProductById(item.product_id, skipLoading());
          } catch (error: any) {
            const detail = error?.response?.data?.detail || error?.message || 'Falha ao consultar produto.';
            throw new Error(`Não foi possível validar estoque de ${itemLabel}. ${detail}`);
          }

          const latestVariant = item.variant_id
            ? latestProduct?.variants?.find((variant: any) => variant?.id === item.variant_id)
            : undefined;
          const availableStock = item.variant_id
            ? Number(latestVariant?.current_stock ?? 0)
            : Number(latestProduct?.current_stock ?? 0);

          return {
            item,
            itemLabel,
            availableStock,
          };
        })
      );

      const unavailableItem = stockChecks.find(({ item, availableStock }) => item.quantity > availableStock);

      if (unavailableItem) {
        haptics.warning();
        setDialog({
          visible: true,
          type: 'warning',
          title: 'Estoque insuficiente',
          message: `${unavailableItem.itemLabel}: disponível ${unavailableItem.availableStock}, solicitado ${unavailableItem.item.quantity}.`,
          confirmText: 'Voltar ao carrinho',
          cancelText: 'Fechar',
          onConfirm: () => {
            setDialog({ ...dialog, visible: false });
            router.back();
          },
        });
        return;
      }

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

      // Calcular troco antes de limpar o carrinho
      const change = Math.max(0, cart.totalPaid - finalTotal);

      const isPixOnly =
        cart.payments.length === 1 &&
        cart.payments[0].method === PaymentMethod.PIX;

      // PIX: criar venda como PENDING + gerar QR Code atomicamente (sem race condition)
      if (isPixOnly) {
        try {
          setLoading(true);
          const result = await pixStart({
            ...saleData,
            items: saleData.items.map((i: any) => ({ ...i, discount_amount: i.discount_amount ?? 0 })),
          });
          haptics.success();
          queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
          queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
          queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['low-stock'] });
          cart.clear();
          router.replace({
            pathname: '/(tabs)/pdv/pix-checkout',
            params: {
              sale_id: String(result.sale_id),
              amount: String(result.total_amount),
              sale_number: result.sale_number,
              payment_id: result.payment_id,
              qr_code: result.qr_code,
              qr_code_base64: result.qr_code_base64,
              expires_at: result.expires_at ?? '',
            },
          });
        } catch (error: any) {
          haptics.error();
          const detail: string = error.response?.data?.detail || error.message || '';
          const isStockError = detail.toLowerCase().includes('estoque insuficiente');
          setDialog({
            visible: true,
            type: 'danger',
            title: isStockError ? 'Estoque insuficiente' : 'Erro ao gerar PIX',
            message: detail || 'Erro ao processar venda PIX. Tente novamente.',
            confirmText: isStockError ? 'Voltar ao carrinho' : 'OK',
            cancelText: isStockError ? 'Fechar' : '',
            onConfirm: () => {
              setDialog({ ...dialog, visible: false });
              if (isStockError) router.back();
            },
          });
        } finally {
          setLoading(false);
        }
        return;
      }

      const isTerminalPayment = !!selectedTerminal && (
        cart.payments.length === 1 &&
        (cart.payments[0].method === PaymentMethod.CREDIT_CARD || cart.payments[0].method === PaymentMethod.DEBIT_CARD)
      ) && !isMixedMode;

      if (isTerminalPayment && selectedTerminal) {
        try {
          setLoading(true);
          const result = await terminalStart({
            ...saleData,
            terminal_id: selectedTerminal.id,
            payment_type: terminalPaymentType,
            installments: terminalInstallments,
            items: saleData.items.map((i: any) => ({ ...i, discount_amount: i.discount_amount ?? 0 })),
          });
          haptics.success();
          queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
          queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
          queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['low-stock'] });
          cart.clear();
          router.replace({
            pathname: '/(tabs)/pdv/terminal-checkout',
            params: {
              sale_id: String(result.sale_id),
              amount: String(result.total_amount),
              sale_number: result.sale_number,
              terminal_name: `${result.terminal_name} (${result.provider})`,
              payment_type: terminalPaymentType,
              installments: String(terminalInstallments),
            },
          });
        } catch (err: any) {
          haptics.error();
          const detail = err?.response?.data?.detail || err?.message || 'Erro ao enviar para maquininha.';
          setDialog({
            visible: true,
            type: 'danger',
            title: 'Erro na maquininha',
            message: detail,
            confirmText: 'OK',
            cancelText: '',
            onConfirm: () => setDialog({ ...dialog, visible: false }),
          });
        } finally {
          setLoading(false);
        }
        return;
      }

      // Demais métodos de pagamento: fluxo normal
      createSaleMutation.mutate(saleData, {
        onSuccess: (sale) => {
          haptics.success();

          // Sincronizar listagens de produto/estoque usadas no PDV e inventário
          queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
          queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
          queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['low-stock'] });

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
      console.error('Erro inesperado:', error);
      haptics.error();

      const message = error?.message || 'Erro ao validar estoque antes da venda. Tente novamente.';
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Erro ao validar venda',
        message,
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
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
          <View style={styles.card}>
            <View style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Resumo do Carrinho
                </Text>
                <AppButton
                  variant="outlined"
                  size="sm"
                  icon="create-outline"
                  label="Editar"
                  onPress={handleGoBack}
                  style={styles.editCartButton}
                />
              </View>

              {cart.items.map((item, index) => (
                <View key={item.cart_key ?? `${item.product_id}-${item.variant_id ?? 'base'}-${index}`}>
                  {index > 0 && <View style={styles.itemDivider} />}
                  <View style={styles.cartItem}>
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName} numberOfLines={1}>
                        {item.product.name}
                      </Text>
                      {item.variant_label ? (
                        <Text style={styles.cartItemVariant} numberOfLines={1}>
                          {item.variant_label}
                        </Text>
                      ) : null}
                      <Text style={styles.cartItemQty}>
                        {item.quantity}x {formatCurrency(item.unit_price)}
                      </Text>
                    </View>
                    <Text style={styles.cartItemTotal}>
                      {formatCurrency(item.quantity * item.unit_price - item.discount)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

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

                        // Maquininha: mostrar seletor de terminal
                        if (method.value === 'TERMINAL') {
                          if (cart.payments.length > 0) cart.clearPayments();
                          setPendingTerminal(true);
                          setPendingCreditCard(false);
                          setTerminalPaymentType('credit_card');
                          setTerminalInstallments(1);
                          setSelectedTerminal(null);
                          loadTerminals();
                          haptics.selection();
                          return;
                        }

                        const paymentMethod = method.value as PaymentMethod;

                        // Cartão de crédito: mostrar seletor de parcelas antes de confirmar
                        if (paymentMethod === PaymentMethod.CREDIT_CARD) {
                          if (cart.payments.length > 0) cart.clearPayments();
                          setSelectedMethod(paymentMethod);
                          setInstallments(1);
                          setPendingCreditCard(true);
                          setPendingTerminal(false);
                          haptics.selection();
                          return;
                        }

                        // Outros métodos: fechar pickers se abertos
                        setPendingCreditCard(false);
                        setPendingTerminal(false);
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

                {cart.payments.length === 0 && !pendingCreditCard && (
                  <TouchableOpacity
                    style={[styles.paymentMethodChip, styles.mixedModeButton]}
                    onPress={() => {
                      setIsMixedMode(true);
                      setSelectedMethod(null);
                      haptics.selection();
                    }}
                  >
                    <Ionicons name="swap-horizontal-outline" size={16} color={Colors.light.primary} />
                    <Text style={styles.mixedModeButtonText}>Usar 2 métodos</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Seletor de parcelas (crédito, modo simples) */}
            {pendingCreditCard && !isMixedMode && (
              <View style={styles.installmentPicker}>
                <View style={styles.installmentPickerHeader}>
                  <View style={styles.installmentPickerIconWrap}>
                    <Ionicons name="card-outline" size={14} color={Colors.light.primary} />
                  </View>
                  <View style={styles.installmentPickerHeaderText}>
                    <Text style={styles.installmentPickerLabel}>Pagamento no cartão</Text>
                    <Text style={styles.installmentPickerHint}>Escolha a quantidade de parcelas</Text>
                  </View>
                </View>
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
                <AppButton
                  variant="primary"
                  size="md"
                  fullWidth
                  icon="checkmark-circle-outline"
                  label={installments === 1 ? 'Confirmar à Vista' : `Confirmar ${installments}x`}
                  onPress={() => {
                    handleAddDirectPayment(PaymentMethod.CREDIT_CARD, installments);
                    setPendingCreditCard(false);
                  }}
                  style={{ marginTop: 12 }}
                />
              </View>
            )}

            {/* Sub-UI da maquininha */}
            {pendingTerminal && !isMixedMode && (
              <View style={styles.installmentPicker}>
                {/* Header */}
                <View style={styles.installmentPickerHeader}>
                  <View style={styles.installmentPickerIconWrap}>
                    <Ionicons name="card-outline" size={14} color={Colors.light.primary} />
                  </View>
                  <View style={styles.installmentPickerHeaderText}>
                    <Text style={styles.installmentPickerLabel}>Pagamento na maquininha</Text>
                    <Text style={styles.installmentPickerHint}>Selecione o tipo e o terminal</Text>
                  </View>
                </View>

                {/* Tipo: Crédito | Débito */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  {(['credit_card', 'debit_card'] as const).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.installmentChip, terminalPaymentType === type && styles.installmentChipActive, { flex: 1, alignItems: 'center' }]}
                      onPress={() => { setTerminalPaymentType(type); if (type === 'debit_card') setTerminalInstallments(1); haptics.selection(); }}
                    >
                      <Text style={[styles.installmentChipText, terminalPaymentType === type && styles.installmentChipTextActive]}>
                        {type === 'credit_card' ? 'Crédito' : 'Débito'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Parcelas (apenas crédito) */}
                {terminalPaymentType === 'credit_card' && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.installmentScroll}>
                    <View style={styles.installmentChipsRow}>
                      {installmentOptions.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.installmentChip, terminalInstallments === opt.value && styles.installmentChipActive]}
                          onPress={() => { setTerminalInstallments(opt.value); haptics.selection(); }}
                        >
                          <Text style={[styles.installmentChipText, terminalInstallments === opt.value && styles.installmentChipTextActive]}>
                            {opt.label}
                          </Text>
                          {opt.value > 1 && (
                            <Text style={[styles.installmentChipSub, terminalInstallments === opt.value && styles.installmentChipSubActive]}>
                              {formatCurrency(finalTotal / opt.value)}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                {/* Selecionar terminal */}
                <Text style={[styles.installmentPickerHint, { marginTop: 12, marginBottom: 8 }]}>Terminal</Text>
                {loadingTerminals ? (
                  <ActivityIndicator size="small" color={Colors.light.primary} />
                ) : terminals.length === 0 ? (
                  <View style={{ padding: 12, backgroundColor: Colors.light.backgroundSecondary, borderRadius: 8 }}>
                    <Text style={{ color: Colors.light.textSecondary, fontSize: 13, textAlign: 'center' }}>
                      Nenhum terminal configurado.{' '}
                      <Text style={{ color: Colors.light.primary }} onPress={() => router.push('/(tabs)/pdv/terminals' as any)}>
                        Adicionar terminal
                      </Text>
                    </Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {terminals.map((t) => (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.installmentChip, selectedTerminal?.id === t.id && styles.installmentChipActive]}
                          onPress={() => { setSelectedTerminal(t); haptics.selection(); }}
                        >
                          <Ionicons name="card-outline" size={12} color={selectedTerminal?.id === t.id ? Colors.light.primary : Colors.light.textSecondary} />
                          <Text style={[styles.installmentChipText, selectedTerminal?.id === t.id && styles.installmentChipTextActive]}>
                            {t.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                {/* Confirmar seleção */}
                <AppButton
                  variant="primary"
                  size="md"
                  fullWidth
                  icon="checkmark-circle-outline"
                  label={selectedTerminal ? `Usar ${selectedTerminal.name}` : 'Selecione um terminal'}
                  disabled={!selectedTerminal}
                  onPress={() => {
                    if (!selectedTerminal) return;
                    const method = terminalPaymentType === 'credit_card' ? PaymentMethod.CREDIT_CARD : PaymentMethod.DEBIT_CARD;
                    cart.addPayment(method, finalTotal, terminalInstallments);
                    setPendingTerminal(false);
                    haptics.success();
                  }}
                  style={{ marginTop: 12 }}
                />
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

              {/* Modo misto: mostrar inputs para digitar valores */}
              {isMixedMode && (
                <>
                  <View style={styles.mixedModeHeader}>
                    <Text style={styles.mixedModeHelp}>
                      💡 No modo 2 Métodos, escolha a forma e digite o valor para cada pagamento.
                    </Text>
                    <AppButton
                      variant="outlined"
                      size="sm"
                      icon="close-outline"
                      label="Cancelar"
                      onPress={() => {
                        setIsMixedMode(false);
                        cart.clearPayments();
                        setSelectedMethod(null);
                        haptics.light();
                      }}
                      style={styles.cancelMixedButton}
                    />
                  </View>

                  {/* Seleção de método no modo misto */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.methodsScroll}
                  >
                    {paymentMethods.filter(m => m.value !== 'MIXED').map((method) => (
                      <TouchableOpacity
                        key={method.value}
                        style={[
                          styles.methodChip,
                          selectedMethod === method.value && { backgroundColor: Colors.light.primary + '15', borderColor: Colors.light.primary },
                        ]}
                        onPress={() => {
                          setSelectedMethod(method.value as PaymentMethod);
                          setInstallments(1);
                          haptics.selection();
                        }}
                      >
                        <Ionicons
                          name={method.icon as any}
                          size={14}
                          color={selectedMethod === method.value ? Colors.light.primary : Colors.light.textSecondary}
                        />
                        <Text style={[
                          styles.methodChipText,
                          selectedMethod === method.value && { color: Colors.light.primary },
                        ]}>
                          {method.label}
                        </Text>
                      </TouchableOpacity>
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
                    <View style={styles.paymentInputContainer}>
                      <Text style={styles.inputPrefix}>R$</Text>
                      <TextInput
                        value={paymentAmount}
                        onChangeText={(text) => setPaymentAmount(formatMoneyInput(text))}
                        keyboardType="numeric"
                        style={styles.paymentInput}
                        placeholder="0,00"
                        placeholderTextColor={Colors.light.textTertiary}
                      />
                    </View>
                    <AppButton
                      variant="outlined"
                      size="md"
                      icon="sparkles-outline"
                      label="Preencher"
                      onPress={handleFillRemaining}
                      style={styles.fillButton}
                    />
                  </View>

                  {/* Botão adicionar pagamento */}
                  <AppButton
                    variant="primary"
                    size="lg"
                    fullWidth
                    onPress={handleAddPayment}
                    icon="add-circle-outline"
                    label="Adicionar Pagamento"
                    style={styles.addPaymentButton}
                  />
                </>
              )}

            {/* Lista de pagamentos adicionados - APENAS para modo misto */}
            {isMixedMode && cart.payments.length > 0 && (
                <View style={styles.paymentsListContainer}>
                  <Text style={styles.paymentsListTitle}>
                    Pagamentos adicionados:
                  </Text>
                  {cart.payments.map((payment, index) => (
                    <View key={index} style={styles.paymentItem}>
                      <View style={styles.paymentItemInfo}>
                        <Text style={styles.paymentItemMethod}>
                          {getPaymentMethodLabel(payment.method)}
                        </Text>
                        <Text style={styles.paymentItemDetail}>
                          {payment.installments > 1
                            ? `${payment.installments}x de ${formatCurrency(payment.amount / payment.installments)}`
                            : formatCurrency(payment.amount)
                          }
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemovePayment(index)}
                        style={styles.deletePaymentBtn}
                      >
                        <Ionicons name="trash-outline" size={20} color={Colors.light.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
          </View>

          {/* Cálculo de Troco (se tiver dinheiro) */}
          {hasCashPayment && (
            <View style={styles.section}>
              <Text style={styles.label}>Cálculo de Troco</Text>

              <View style={styles.cashInputContainer}>
                <Text style={styles.inputPrefix}>R$</Text>
                <TextInput
                  value={cashReceived}
                  onChangeText={(text) => setCashReceived(formatMoneyInput(text))}
                  keyboardType="numeric"
                  style={styles.cashInput}
                  placeholder="0,00"
                  placeholderTextColor={Colors.light.textTertiary}
                />
              </View>

              {cashReceived && (
                <View style={styles.changeContainer}>
                  <Text style={styles.changeLabel}>Troco:</Text>
                  <Text style={styles.changeValue}>
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
          <View style={[styles.card, styles.totalsCard]}>
            <View style={styles.cardContent}>
              <View style={styles.totalsStack}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(cart.subtotal)}</Text>
                </View>

                {cart.discount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, styles.discountText]}>
                      Desconto Manual
                    </Text>
                    <Text style={[styles.summaryValue, styles.discountText]}>
                      - {formatCurrency(cart.discount)}
                    </Text>
                  </View>
                )}

                {appliedDiscount && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, styles.discountText]}>
                      Desconto {appliedDiscount.payment_method.toUpperCase()} ({appliedDiscount.discount_percentage}%)
                    </Text>
                    <Text style={[styles.summaryValue, styles.discountText]}>
                      - {formatCurrency((cart.total * appliedDiscount.discount_percentage) / 100)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.totalHighlightBox}>
                <Text style={styles.totalCaption}>Total da Venda</Text>
                <Text style={styles.totalMainValue}>{formatCurrency(finalTotal)}</Text>
              </View>

              {/* Mostrar Total Pago e Restante APENAS no modo misto */}
              {isMixedMode && cart.payments.length > 0 && (
                <View style={styles.paymentBalanceBox}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, styles.paidText]}>Total Pago</Text>
                    <Text style={[styles.summaryValue, styles.paidText]}>
                      {formatCurrency(cart.totalPaid)}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, (finalTotal - cart.totalPaid) > 0 ? styles.remainingText : styles.changeText]}>
                      {(finalTotal - cart.totalPaid) > 0 ? 'Restante' : 'Troco'}
                    </Text>
                    <Text style={[styles.summaryValue, (finalTotal - cart.totalPaid) > 0 ? styles.remainingText : styles.changeText]}>
                      {formatCurrency(Math.abs(finalTotal - cart.totalPaid))}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Espaçamento para botão fixo */}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Footer com botão de finalizar */}
        <View style={styles.footer}>
          <AppButton
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleFinalizeSale}
            disabled={cart.items.length === 0 || cart.totalPaid < finalTotal || loading}
            loading={loading}
            icon="checkmark-circle-outline"
            label={loading ? 'Processando...' : 'Confirmar Venda'}
            style={styles.finalizeButton}
          />
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
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.sm,
  },
  cardContent: {
    padding: theme.spacing.md,
  },
  cartItemName: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '500',
  },
  cartItemVariant: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 1,
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
  editCartButton: {
    minWidth: 104,
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
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  paymentMethodChip: {
    width: '31.5%',
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  methodsScroll: {
    marginBottom: 16,
  },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  methodChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  mixedModeHelp: {
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  cancelMixedButton: {
    minWidth: 116,
  },
  paymentInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    alignItems: 'stretch',
  },
  paymentInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.background,
    overflow: 'hidden',
  },
  paymentInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
  },
  inputPrefix: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    borderRightWidth: 1,
    borderRightColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  fillButton: {
    minWidth: 132,
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
  paymentItemMethod: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
  },
  paymentItemDetail: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  deletePaymentBtn: {
    padding: 8,
  },
  cashInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.background,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cashInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
  },
  changeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.light.successLight,
    borderRadius: 8,
    padding: 16,
  },
  changeLabel: {
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
  },
  changeValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: Colors.light.success,
  },
  totalsCard: {
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  totalsStack: {
    gap: 6,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  summaryLabel: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '700',
  },
  totalHighlightBox: {
    backgroundColor: `${Colors.light.primary}10`,
    borderWidth: 1,
    borderColor: `${Colors.light.primary}28`,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    marginBottom: 10,
  },
  totalCaption: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  totalMainValue: {
    fontSize: theme.fontSize.xxl,
    color: Colors.light.primary,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  paymentBalanceBox: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: 10,
    gap: 6,
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
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  installmentPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  installmentPickerIconWrap: {
    width: 26,
    height: 26,
    borderRadius: theme.borderRadius.full,
    backgroundColor: `${Colors.light.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  installmentPickerHeaderText: {
    flex: 1,
  },
  installmentPickerMixed: {
    marginBottom: 12,
  },
  installmentPickerLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
    color: Colors.light.text,
  },
  installmentPickerHint: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 1,
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
    paddingVertical: 9,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    minWidth: 52,
  },
  installmentChipActive: {
    borderColor: Colors.light.primary,
    backgroundColor: `${Colors.light.primary}14`,
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: Colors.light.background,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  finalizeButton: {
    alignSelf: 'stretch',
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




