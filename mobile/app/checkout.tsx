/**
 * Tela de Checkout - Finalizar Venda
 * Permite adicionar pagamentos, ver resumo e confirmar venda
 */

import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, Button, Card, Chip, TextInput, IconButton, ActivityIndicator, Divider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useCart } from '@/hooks/useCart';
import { createSale } from '@/services/saleService';
import { getCustomerById } from '@/services/customerService';
import { Colors } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
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
const paymentMethods: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: PaymentMethod.PIX, label: 'PIX', icon: 'qrcode' },
  { value: PaymentMethod.CASH, label: 'Dinheiro', icon: 'cash' },
  { value: PaymentMethod.DEBIT_CARD, label: 'Débito', icon: 'credit-card' },
  { value: PaymentMethod.CREDIT_CARD, label: 'Crédito', icon: 'credit-card-outline' },
  { value: PaymentMethod.TRANSFER, label: 'Transferência', icon: 'swap-horizontal' },
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
  const { goBack } = useBackToList('/(tabs)');

  // Estado local
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(PaymentMethod.PIX);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [installments, setInstallments] = useState(1);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [cashReceived, setCashReceived] = useState('');

  /**
   * Redirecionar se carrinho vazio
   */
  useEffect(() => {
    if (!cart.hasItems()) {
      Alert.alert('Carrinho vazio', 'Adicione produtos antes de finalizar a venda.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/sale') }
      ]);
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
      Alert.alert('Erro', 'Não foi possível carregar dados do cliente');
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
   * Adicionar pagamento
   */
  const handleAddPayment = () => {
    const amount = parseMoneyInput(paymentAmount);

    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Valor inválido', 'Digite um valor válido para o pagamento');
      haptics.warning();
      return;
    }

    // Verificar se excede total
    const totalRemaining = cart.total - cart.totalPaid;

    if (amount > totalRemaining) {
      Alert.alert(
        'Valor excede total',
        `O pagamento excede o valor restante. Deseja adicionar R$ ${formatCurrency(totalRemaining)}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Adicionar',
            onPress: () => {
              cart.addPayment(selectedMethod, totalRemaining, installments);
              setPaymentAmount('');
              setCashReceived('');
              haptics.success();
            }
          }
        ]
      );
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
      Alert.alert(
        'Validação falhou',
        formatValidationErrors(validation.errors),
        [{ text: 'Revisar', style: 'cancel' }]
      );
      return;
    }

    // Validação adicional: pagamento deve cobrir total
    if (!cart.canFinalizeSale()) {
      haptics.warning();
      Alert.alert(
        'Pagamento incompleto',
        `Valor pago: ${formatCurrency(cart.totalPaid)}\nTotal: ${formatCurrency(cart.total)}\n\nO valor pago deve cobrir o total da venda`
      );
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
        discount: item.discount,
      }));

      // Mapear payments para formato da API
      const payments = cart.payments.map(p => ({
        method: p.method,
        amount: p.amount,
        installments: p.installments,
      }));

      // Criar venda
      const sale = await createSale({
        customer_id: cart.customer_id,
        items,
        payments,
        discount: cart.discount,
        notes: cart.notes,
      });

      haptics.success();

      // Limpar carrinho
      cart.clear();

      // Navegar para tela de sucesso
      router.replace({
        pathname: '/checkout/success',
        params: { sale_number: sale.sale_number }
      });

    } catch (error: any) {
      haptics.error();
      console.error('Erro ao finalizar venda:', error);

      const message = error.response?.data?.detail || 'Erro ao processar venda. Tente novamente.';
      Alert.alert('Erro', message);
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconButton
            icon="arrow-left"
            size={24}
            onPress={goBack}
          />
          <View>
            <Text variant="titleLarge" style={styles.headerTitle}>
              Finalizar Venda
            </Text>
            <Text variant="bodySmall" style={styles.headerSubtitle}>
              {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'itens'}
            </Text>
          </View>
        </View>
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
                  onPress={goBack}
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

              {/* Métodos de pagamento */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.methodsScroll}
              >
                {paymentMethods.map((method) => (
                  <Chip
                    key={method.value}
                    selected={selectedMethod === method.value}
                    onPress={() => {
                      setSelectedMethod(method.value);
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

              {/* Parcelas (somente para cartão de crédito) */}
              {showInstallments && (
                <View style={styles.installmentsContainer}>
                  <Text variant="bodySmall" style={styles.installmentsLabel}>
                    Parcelas
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    {installmentOptions.map((option) => (
                      <Chip
                        key={option.value}
                        selected={installments === option.value}
                        onPress={() => {
                          setInstallments(option.value);
                          haptics.selection();
                        }}
                        style={styles.installmentChip}
                        compact
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Botão adicionar pagamento */}
              <Button
                mode="contained"
                onPress={handleAddPayment}
                icon="plus"
                style={styles.addPaymentButton}
              >
                Adicionar Pagamento
              </Button>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontWeight: '600',
  },
  headerSubtitle: {
    color: Colors.light.textSecondary,
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
