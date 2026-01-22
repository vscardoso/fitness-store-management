/**
 * Tela de Checkout - Finalizar Venda
 * Permite adicionar pagamentos, ver resumo e confirmar venda
 */

import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { Text, Button, Card, Chip, TextInput, IconButton, ActivityIndicator, Divider } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import useBackToList from '@/hooks/useBackToList';
import { useCart } from '@/hooks/useCart';
import { useCreateSale } from '@/hooks';
import { getCustomerById } from '@/services/customerService';
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
  { value: PaymentMethod.PIX, label: 'PIX', icon: 'qrcode' },
  { value: PaymentMethod.DEBIT_CARD, label: 'Cartão', icon: 'credit-card' },
  { value: PaymentMethod.CASH, label: 'Dinheiro', icon: 'cash' },
  { value: 'MIXED', label: '2 Métodos', icon: 'swap-horizontal' },
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
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | 'MIXED'>(PaymentMethod.PIX);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [installments, setInstallments] = useState(1);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [isMixedMode, setIsMixedMode] = useState(false);

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
      setSelectedMethod(PaymentMethod.PIX);
      setInstallments(1);
      setIsMixedMode(false);
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
   * Carregar dados do cliente
   */
  const loadCustomer = async () => {
    if (!cart.customer_id) return;

    try {
      setLoadingCustomer(true);
      const data = await getCustomerById(cart.customer_id);
      setCustomer(data);
    } catch (error) {
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
   * Adicionar pagamento direto (PIX, Cartão, Dinheiro)
   * Adiciona o valor total restante automaticamente
   */
  const handleAddDirectPayment = (method: PaymentMethod) => {
    const totalRemaining = cart.total - cart.totalPaid;

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

    // Adicionar pagamento com valor total
    cart.addPayment(method, totalRemaining, 1);
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
    if (selectedMethod === 'MIXED') {
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
    const totalRemaining = cart.total - cart.totalPaid;

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
    const remaining = cart.total - cart.totalPaid;
    setPaymentAmount(formatMoneyInput((remaining * 100).toString()));
    haptics.light();
  };

  /**
   * Finalizar venda
   */
  const handleFinalizeSale = async () => {
    // Validação completa usando validation utils
    const validation = validateCheckout(cart.items, cart.payments, cart.total);

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
    if (!cart.canFinalizeSale()) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Pagamento incompleto',
        message: `Valor pago: ${formatCurrency(cart.totalPaid)}\nTotal: ${formatCurrency(cart.total)}\n\nO valor pago deve cobrir o total da venda`,
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
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount,
      }));

      // Mapear payments para formato da API
      // Backend espera payment_method, não method
      // Backend não aceita installments
      const payments = cart.payments.map(p => ({
        payment_method: p.method,
        amount: p.amount,
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
      createSaleMutation.mutate(saleData, {
        onSuccess: (sale) => {
          haptics.success();

          // Limpar carrinho
          cart.clear();

          // Navegar para tela de sucesso
          router.replace({
            pathname: '/checkout/success',
            params: { sale_number: sale.sale_number }
          });
        },
        onError: (error: any) => {
          haptics.error();
          console.error('Erro ao finalizar venda:', error);

          const message = error.response?.data?.detail || 'Erro ao processar venda. Tente novamente.';
          setDialog({
            visible: true,
            type: 'danger',
            title: 'Erro',
            message: message,
            confirmText: 'OK',
            cancelText: '',
            onConfirm: () => setDialog({ ...dialog, visible: false }),
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>Finalizar Venda</Text>
              <Text style={styles.headerSubtitle}>
                {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'itens'}
              </Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>
        </LinearGradient>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
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
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Cliente
                </Text>

                {loadingCustomer ? (
                  <ActivityIndicator size="small" style={styles.loader} />
                ) : customer ? (
                  <View style={styles.customerInfo}>
                    <View style={styles.customerRow}>
                      <IconButton icon="account" size={20} />
                      <View>
                        <Text variant="bodyLarge">{customer.full_name}</Text>
                        {customer.phone && (
                          <Text variant="bodySmall" style={styles.customerDetail}>
                            {customer.phone}
                          </Text>
                        )}
                      </View>
                    </View>
                    {customer.loyalty_points > 0 && (
                      <Chip icon="star" compact>
                        {customer.loyalty_points} pontos
                      </Chip>
                    )}
                  </View>
                ) : null}
              </Card.Content>
            </Card>
          )}

          {/* Formas de Pagamento */}
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Formas de Pagamento
              </Text>

              {/* Seleção de modo: Pagamento direto ou misto */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.methodsScroll}
              >
                {paymentMethods.map((method) => (
                  <Chip
                    key={method.value}
                    selected={method.value === 'MIXED' ? isMixedMode : (!isMixedMode && selectedMethod === method.value)}
                    onPress={() => {
                      if (method.value === 'MIXED') {
                        setIsMixedMode(true);
                        setSelectedMethod(PaymentMethod.PIX);
                        haptics.selection();
                      } else {
                        setIsMixedMode(false);
                        setSelectedMethod(method.value as PaymentMethod);
                        // Pagamento direto: adiciona total automaticamente
                        handleAddDirectPayment(method.value as PaymentMethod);
                      }
                    }}
                    icon={method.icon}
                    style={styles.methodChip}
                  >
                    {method.label}
                  </Chip>
                ))}
              </ScrollView>

              {/* Modo misto: mostrar inputs para digitar valores */}
              {isMixedMode && (
                <>
                  <Text variant="bodySmall" style={styles.mixedModeHelp}>
                    💡 No modo 2 Métodos, escolha a forma e digite o valor para cada pagamento.
                  </Text>

                  {/* Seleção de método no modo misto */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.methodsScroll}
                  >
                    {paymentMethods.slice(0, 3).map((method) => (
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

              {/* Lista de pagamentos adicionados */}
              {cart.payments.length > 0 && (
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
            </Card.Content>
          </Card>

          {/* Cálculo de Troco (se tiver dinheiro) */}
          {hasCashPayment && (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Cálculo de Troco
                </Text>

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
              </Card.Content>
            </Card>
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
                    Desconto
                  </Text>
                  <Text variant="bodyLarge" style={styles.discountText}>
                    - {formatCurrency(cart.discount)}
                  </Text>
                </View>
              )}

              <View style={styles.totalDivider} />

              <View style={styles.totalRow}>
                <Text variant="headlineSmall" style={styles.totalLabel}>
                  TOTAL
                </Text>
                <Text variant="headlineSmall" style={styles.totalValue}>
                  {formatCurrency(cart.total)}
                </Text>
              </View>

              {cart.payments.length > 0 && (
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
                      style={cart.remaining > 0 ? styles.remainingText : styles.changeText}
                    >
                      {cart.remaining > 0 ? 'Restante' : 'Troco'}
                    </Text>
                    <Text
                      variant="bodyLarge"
                      style={cart.remaining > 0 ? styles.remainingText : styles.changeText}
                    >
                      {formatCurrency(Math.abs(cart.remaining))}
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
            disabled={!cart.canFinalizeSale() || loading}
            loading={loading}
            icon="check"
            style={[
              styles.finalizeButton,
              cart.canFinalizeSale() && styles.finalizeButtonEnabled
            ]}
            labelStyle={styles.finalizeButtonLabel}
          >
            {loading ? 'Processando...' : 'Confirmar Venda'}
          </Button>
        </View>
      </KeyboardAvoidingView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerContainer: {
    overflow: 'hidden',
  },
  headerGradient: {
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  headerInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  headerSpacer: {
    width: 40,
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
  customerInfo: {
    gap: 12,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customerDetail: {
    color: Colors.light.textSecondary,
  },
  methodsScroll: {
    marginBottom: 16,
  },
  methodChip: {
    marginRight: 8,
  },
  mixedModeHelp: {
    color: Colors.light.textSecondary,
    marginBottom: 12,
    fontStyle: 'italic',
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
  installmentChip: {
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
});
