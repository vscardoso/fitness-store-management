import React, { useState, useMemo, useRef, useEffect } from 'react';
import KeyboardSafeView from '@/components/ui/KeyboardSafeView';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
  TextInput as RNTextInput,
} from 'react-native';
import {
  Text,
  Card,
  Button,
  IconButton,
  TextInput,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/layout/PageHeader';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import CustomerSelectionModal from '@/components/sale/CustomerSelectionModal';
import { getCustomerById } from '@/services/customerService';
import { getFIFOCosts } from '@/services/productService';
import {
  validateProductForCart,
  validateCartStock,
  formatValidationErrors,
} from '@/utils/validation';
import type { Product, Customer } from '@/types';
import type { ProductGrouped, ProductVariant as GroupedVariant } from '@/types';
import ProductSelectionModal from '@/components/sale/ProductSelectionModal';
import QRCodeScanner from '@/components/sale/QRCodeScanner';

export default function SaleScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const cart = useCart();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [productModalVisible, setProductModalVisible] = useState(false);

  // Desconto avulso
  const [discountVisible, setDiscountVisible] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState<'value' | 'percent'>('value');
  const discountInputRef = useRef<any>(null);

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

  // Query: Selected customer details
  // retry: false para não repetir em 404 (cliente removido/DB recriado)
  const { data: selectedCustomer, error: customerError } = useQuery({
    queryKey: ['customer', cart.customer_id],
    queryFn: () => getCustomerById(cart.customer_id!),
    enabled: !!cart.customer_id,
    retry: false,
  });

  // Se o cliente não existe mais (404), limpa do carrinho silenciosamente
  useEffect(() => {
    if (customerError && cart.customer_id) {
      cart.setCustomer(undefined);
    }
  }, [customerError]);

  // Query: FIFO costs para margem em tempo real
  const cartProductIds = useMemo(
    () => cart.items.map((i) => i.product_id),
    [cart.items]
  );

  const { data: fifoCosts } = useQuery({
    queryKey: ['fifo-costs', cartProductIds],
    queryFn: () => getFIFOCosts(cartProductIds),
    enabled: cartProductIds.length > 0,
    staleTime: 30000,
  });

  // Calcula lucro estimado do carrinho (desconta o discount do lucro)
  const cartProfit = useMemo(() => {
    if (!fifoCosts || cart.items.length === 0) return null;
    let totalCost = 0;
    let totalRevenue = 0;
    let hasData = false;
    for (const item of cart.items) {
      const costInfo = fifoCosts[String(item.product_id)];
      if (costInfo && costInfo.average_unit_cost > 0) {
        totalCost += costInfo.average_unit_cost * item.quantity;
        hasData = true;
      }
      totalRevenue += item.unit_price * item.quantity;
    }
    if (!hasData) return null;
    const effectiveRevenue = totalRevenue - (cart.discount ?? 0);
    const profit = effectiveRevenue - totalCost;
    const margin = effectiveRevenue > 0 ? (profit / effectiveRevenue) * 100 : 0;
    return { totalCost, profit, margin };
  }, [fifoCosts, cart.items, cart.discount]);

  /**
   * Aplicar desconto avulso ao carrinho
   */
  const handleApplyDiscount = () => {
    const raw = parseFloat(discountInput.replace(',', '.'));
    if (isNaN(raw) || raw < 0) {
      haptics.warning();
      return;
    }
    const discountValue = discountType === 'percent'
      ? (cart.subtotal * raw) / 100
      : raw;
    if (discountValue > cart.subtotal) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Desconto inválido',
        message: 'O desconto não pode ser maior que o subtotal.',
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }
    haptics.success();
    cart.setDiscount(discountValue);
    setDiscountVisible(false);
    setDiscountInput('');
    Keyboard.dismiss();
  };

  const handleRemoveDiscount = () => {
    haptics.light();
    cart.setDiscount(0);
    setDiscountInput('');
    setDiscountVisible(false);
  };

  const handleOpenDiscount = () => {
    // Preenche o input com o valor atual formatado
    if (cart.discount > 0) {
      setDiscountType('value');
      setDiscountInput(cart.discount.toFixed(2).replace('.', ','));
    }
    setDiscountVisible(true);
    setTimeout(() => discountInputRef.current?.focus(), 100);
  };

  /**
   * Adicionar produto simples ao carrinho (usado pelo scanner QR)
   */
  const handleAddToCart = (product: Product) => {
    if (!product.is_active) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Produto inativo',
        message: 'Este produto está inativo e não pode ser adicionado ao carrinho. Ative o produto antes de vendê-lo.',
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    if (product.is_catalog) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Produto de catálogo',
        message: 'Este é um produto de catálogo e não pode ser vendido. Importe o produto para seu estoque primeiro.',
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    const cart_key = `p_${product.id}`;
    const existingItem = cart.getItem(cart_key);
    const requestedQuantity = existingItem ? existingItem.quantity + 1 : 1;

    const validation = validateProductForCart(product, requestedQuantity);
    if (!validation.isValid) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Não é possível adicionar produto',
        message: formatValidationErrors(validation.errors),
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    if (existingItem) {
      haptics.light();
      cart.updateQuantity(cart_key, requestedQuantity);
    } else {
      haptics.medium();
      cart.addItem(product, 1);
    }
  };

  const handleUpdateQuantity = (cart_key: string, newQuantity: number) => {
    const item = cart.getItem(cart_key);
    if (!item) return;

    const displayName = `${item.product.name}${item.variant_label ? ` (${item.variant_label})` : ''}`;

    if (newQuantity <= 0) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Remover produto',
        message: `Deseja remover ${displayName} do carrinho?`,
        confirmText: 'Remover',
        cancelText: 'Cancelar',
        onConfirm: () => {
          haptics.success();
          cart.removeItem(cart_key);
          setDialog({ ...dialog, visible: false });
        },
      });
      return;
    }

    const validation = validateProductForCart(item.product, newQuantity);
    if (!validation.isValid) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Quantidade inválida',
        message: formatValidationErrors(validation.errors),
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    haptics.light();
    cart.updateQuantity(cart_key, newQuantity);
  };

  const handleClearCart = () => {
    haptics.warning();
    setDialog({
      visible: true,
      type: 'danger',
      title: 'Limpar carrinho',
      message: 'Tem certeza que deseja remover todos os itens?',
      confirmText: 'Limpar',
      cancelText: 'Cancelar',
      onConfirm: () => {
        haptics.success();
        cart.clearItems();
        setDialog({ ...dialog, visible: false });
      },
    });
  };

  /**
   * Iniciar nova venda (limpa tudo)
   */
  const handleNewSale = () => {
    haptics.warning();
    setDialog({
      visible: true,
      type: 'warning',
      title: 'Iniciar nova venda',
      message: 'Isso irá limpar todos os itens do carrinho, cliente e pagamentos. Deseja continuar?',
      confirmText: 'Sim, iniciar nova venda',
      cancelText: 'Cancelar',
      onConfirm: () => {
        haptics.success();
        cart.clear(); // Limpa tudo: items, pagamentos, cliente, notas, descontos
        setDialog({ ...dialog, visible: false });
      },
    });
  };

  const handleCheckout = () => {
    if (!cart.hasItems()) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Carrinho vazio',
        message: 'Adicione produtos ao carrinho para finalizar a venda',
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    // Validar carrinho completo antes de ir para o checkout
    const validation = validateCartStock(cart.items);

    if (!validation.isValid) {
      haptics.error();
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Validação do carrinho',
        message: formatValidationErrors(validation.errors),
        confirmText: 'Revisar carrinho',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    haptics.heavy();
    router.push('/checkout');
  };

  /**
   * Abrir scanner de código de barras
   */
  const handleOpenScanner = () => {
    haptics.light();
    setScannerVisible(true);
  };

  /**
   * Handler quando produto é encontrado pelo scanner de QR Code
   */
  const handleProductScanned = (product: Product, quantity: number = 1) => {
    setScannerVisible(false);

    const cart_key = `p_${product.id}`;
    const existingItem = cart.getItem(cart_key);
    const newQty = (existingItem?.quantity ?? 0) + quantity;

    if (existingItem) {
      cart.updateQuantity(cart_key, newQty);
    } else {
      cart.addItem(product, quantity);
    }

    haptics.success();
    setDialog({
      visible: true,
      type: 'success',
      title: 'Produto adicionado',
      message: `${quantity}x ${product.name} foi adicionado ao carrinho`,
      confirmText: 'OK',
      cancelText: '',
      onConfirm: () => {
        haptics.light();
        setDialog({ ...dialog, visible: false });
      },
    });
  };

  /**
   * Handler para selecionar variante de produto do modal
   */
  const handleSelectProduct = (product: ProductGrouped, variant: GroupedVariant) => {
    haptics.light();

    if (variant.current_stock <= 0) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Sem estoque',
        message: `Variante ${[variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku} não tem estoque disponível.`,
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    const cart_key = `v_${variant.id}`;
    const existingItem = cart.getItem(cart_key);
    const requestedQuantity = existingItem ? existingItem.quantity + 1 : 1;

    if (requestedQuantity > variant.current_stock) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Estoque insuficiente',
        message: `Apenas ${variant.current_stock} unidade(s) disponíveis.`,
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    if (existingItem) {
      cart.updateQuantity(cart_key, requestedQuantity);
    } else {
      cart.addVariantItem(product, variant, 1);
    }

    haptics.medium();
  };

  /**
   * Handler para selecionar cliente
   */
  const handleSelectCustomer = (customer: Customer) => {
    haptics.light();
    cart.setCustomer(customer.id);
  };

  return (
    <KeyboardSafeView style={styles.container}>
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
    <View style={{ flex: 1 }}>
      
      {/* Header */}
      <PageHeader
        title={user?.store_name || 'WA Moda Fitness'}
        subtitle="Realize vendas rapidamente"
        rightActions={[
          {
            icon: 'help-circle-outline',
            onPress: () => {},
          },
          ...(cart.itemCount > 0 ? [{
            icon: 'refresh' as keyof typeof Ionicons.glyphMap,
            onPress: handleNewSale,
          }] : []),
          {
            icon: 'cart' as keyof typeof Ionicons.glyphMap,
            onPress: () => {},
          },
        ]}
      />

        {/* Cliente selecionado */}
        <View style={styles.customerSection}>
          {cart.customer_id && selectedCustomer ? (
            <Card style={styles.customerCard}>
              <Card.Content style={styles.customerCardContent}>
                <View style={styles.customerInfo}>
                  <Ionicons name="person" size={40} color={Colors.light.primary} />
                  <View style={styles.customerDetails}>
                    <Text variant="titleMedium" style={styles.customerName}>
                      {selectedCustomer.full_name}
                    </Text>
                    <Text variant="bodySmall" style={styles.customerType}>
                      {selectedCustomer.email || selectedCustomer.phone || `ID: ${cart.customer_id}`}
                    </Text>
                  </View>
                </View>
                <IconButton
                  icon="close"
                  size={20}
                  onPress={() => cart.setCustomer(undefined)}
                />
              </Card.Content>
            </Card>
          ) : (
            <TouchableOpacity
              style={styles.selectCustomerButton}
              onPress={() => setCustomerModalVisible(true)}
            >
              <View style={styles.selectCustomerIconContainer}>
                <Ionicons name="person-add" size={32} color={Colors.light.primary} />
              </View>
              <View style={styles.selectCustomerTextContainer}>
                <Text variant="titleMedium" style={styles.selectCustomerText}>
                  Selecionar Cliente (Opcional)
                </Text>
                <Text variant="bodySmall" style={styles.selectCustomerSubtext}>
                  Toque para escolher um cliente
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Adicionar produtos */}
        <View style={styles.addProductSection}>
          <View style={styles.addProductRow}>
            {/* Botão de buscar produtos */}
            <TouchableOpacity
              style={[styles.addProductButton, styles.addProductButtonFlex]}
              onPress={() => setProductModalVisible(true)}
            >
              <View style={styles.addProductIconContainer}>
                <Ionicons name="search" size={28} color={Colors.light.primary} />
              </View>
              <View style={styles.addProductTextContainer}>
                <Text variant="titleMedium" style={styles.addProductText}>
                  Buscar Produtos
                </Text>
                <Text variant="bodySmall" style={styles.addProductSubtext}>
                  Pesquisar por nome ou SKU
                </Text>
              </View>
            </TouchableOpacity>

            {/* Botão de scanner QR Code */}
            <TouchableOpacity
              style={styles.scanQRButton}
              onPress={handleOpenScanner}
            >
              <Ionicons name="qr-code-outline" size={32} color="#fff" />
              <Text style={styles.scanQRButtonText}>Escanear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Carrinho de compras */}
        <View style={styles.cartSection}>
          <View style={styles.cartHeader}>
            <Text variant="titleLarge" style={styles.cartTitle}>
              Carrinho ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'itens'})
            </Text>
            {cart.items.length > 0 && (
              <Button
                mode="text"
                onPress={handleClearCart}
                textColor={Colors.light.error}
                compact
              >
                Limpar
              </Button>
            )}
          </View>

          {cart.items.length === 0 ? (
            <EmptyState
              icon="cart-outline"
              title="Carrinho vazio"
              description="Use a barra de busca acima para encontrar e adicionar produtos à venda"
            />
          ) : (
            <ScrollView style={styles.cartList} showsVerticalScrollIndicator={false}>
              {cart.items.map((item) => (
                <Card key={item.cart_key} style={styles.cartItem}>
                  <Card.Content style={styles.cartItemContent}>
                    <View style={styles.cartItemInfo}>
                      <Text variant="titleMedium" style={styles.cartItemName} numberOfLines={2}>
                        {item.product.name}
                        {item.variant_label ? (
                          <Text style={styles.variantLabel}> ({item.variant_label})</Text>
                        ) : null}
                      </Text>
                      <Text variant="bodySmall" style={styles.cartItemSku}>
                        SKU: {item.product.sku}
                      </Text>
                      <View style={styles.cartItemPriceRow}>
                        <Text variant="titleSmall" style={styles.cartItemPrice}>
                          {formatCurrency(item.unit_price)}
                        </Text>
                        {fifoCosts?.[String(item.product_id)]?.average_unit_cost != null && (() => {
                          const cost = fifoCosts[String(item.product_id)].average_unit_cost;
                          const marginPct = item.unit_price > 0
                            ? ((item.unit_price - cost) / item.unit_price) * 100
                            : 0;
                          return (
                            <View style={[styles.cartMarginBadge, { backgroundColor: marginPct >= 30 ? '#E8F5E9' : '#FFF3E0' }]}>
                              <Text style={[styles.cartMarginText, { color: marginPct >= 30 ? '#2E7D32' : '#F57C00' }]}>
                                {marginPct.toFixed(0)}%
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                    </View>

                    <View style={styles.cartItemActions}>
                      <View style={styles.quantityControl}>
                        <IconButton
                          icon="minus"
                          size={20}
                          mode="contained"
                          containerColor={Colors.light.error}
                          iconColor="#fff"
                          onPress={() => handleUpdateQuantity(item.cart_key, item.quantity - 1)}
                        />
                        <Text variant="titleMedium" style={styles.quantity}>
                          {item.quantity}
                        </Text>
                        <IconButton
                          icon="plus"
                          size={20}
                          mode="contained"
                          containerColor={Colors.light.primary}
                          iconColor="#fff"
                          onPress={() => handleUpdateQuantity(item.cart_key, item.quantity + 1)}
                        />
                      </View>
                      <Text variant="titleLarge" style={styles.itemTotal}>
                        {formatCurrency(item.unit_price * item.quantity)}
                      </Text>
                    </View>
                  </Card.Content>
                </Card>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Footer com totais e botão de finalizar */}
        {cart.items.length > 0 && (
          <View style={styles.footer}>
            <View style={styles.totalsContainer}>
              <View style={styles.totalRow}>
                <Text variant="bodyLarge" style={styles.totalLabel}>
                  Subtotal
                </Text>
                <Text variant="bodyLarge" style={styles.totalValue}>
                  {formatCurrency(cart.subtotal)}
                </Text>
              </View>
              {/* Linha de desconto avulso */}
              {!discountVisible && (
                <TouchableOpacity
                  onPress={cart.discount > 0 ? handleOpenDiscount : handleOpenDiscount}
                  style={styles.discountRow}
                  activeOpacity={0.7}
                >
                  <View style={styles.discountRowLeft}>
                    <Ionicons name="pricetag-outline" size={15} color={cart.discount > 0 ? Colors.light.success : Colors.light.textSecondary} />
                    <Text variant="bodyMedium" style={cart.discount > 0 ? styles.discountLabel : styles.discountAddLabel}>
                      {cart.discount > 0 ? `Desconto  -${formatCurrency(cart.discount)}` : 'Adicionar desconto'}
                    </Text>
                  </View>
                  <View style={styles.discountRowRight}>
                    {cart.discount > 0 ? (
                      <TouchableOpacity onPress={handleRemoveDiscount} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color={Colors.light.error} />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name="add-circle-outline" size={18} color={Colors.light.textSecondary} />
                    )}
                  </View>
                </TouchableOpacity>
              )}

              {/* Input inline de desconto */}
              {discountVisible && (
                <View style={styles.discountInputContainer}>
                  {/* Toggle R$ / % */}
                  <View style={styles.discountTypeToggle}>
                    <TouchableOpacity
                      onPress={() => setDiscountType('value')}
                      style={[styles.discountTypeBtn, discountType === 'value' && styles.discountTypeBtnActive]}
                    >
                      <Text style={[styles.discountTypeBtnText, discountType === 'value' && styles.discountTypeBtnTextActive]}>R$</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDiscountType('percent')}
                      style={[styles.discountTypeBtn, discountType === 'percent' && styles.discountTypeBtnActive]}
                    >
                      <Text style={[styles.discountTypeBtnText, discountType === 'percent' && styles.discountTypeBtnTextActive]}>%</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    ref={discountInputRef}
                    value={discountInput}
                    onChangeText={setDiscountInput}
                    keyboardType="decimal-pad"
                    placeholder={discountType === 'percent' ? '0,00' : '0,00'}
                    style={styles.discountInputField}
                    dense
                    mode="outlined"
                    left={<TextInput.Affix text={discountType === 'value' ? 'R$' : ''} />}
                    right={<TextInput.Affix text={discountType === 'percent' ? '%' : ''} />}
                    onSubmitEditing={handleApplyDiscount}
                  />
                  <IconButton icon="check" size={22} iconColor="#fff" containerColor={Colors.light.success} onPress={handleApplyDiscount} style={styles.discountConfirmBtn} />
                  <IconButton icon="close" size={22} iconColor={Colors.light.textSecondary} onPress={() => { setDiscountVisible(false); setDiscountInput(''); }} style={styles.discountCancelBtn} />
                </View>
              )}
              <View style={[styles.totalRow, styles.totalRowFinal]}>
                <Text variant="headlineSmall" style={styles.totalFinalLabel}>
                  Total
                </Text>
                <Text variant="headlineSmall" style={styles.totalFinalValue}>
                  {formatCurrency(cart.total)}
                </Text>
              </View>
              {cartProfit && (
                <View style={styles.profitRow}>
                  <View style={styles.profitRowLeft}>
                    <Ionicons name="trending-up" size={16} color="#2E7D32" />
                    <Text style={styles.profitRowLabel}>Lucro estimado</Text>
                  </View>
                  <View style={styles.profitRowRight}>
                    <Text style={[styles.profitRowValue, { color: cartProfit.profit >= 0 ? '#2E7D32' : '#C62828' }]}>
                      {formatCurrency(cartProfit.profit)}
                    </Text>
                    <View style={[styles.profitRowBadge, { backgroundColor: cartProfit.margin >= 30 ? '#E8F5E9' : '#FFF3E0' }]}>
                      <Text style={[styles.profitRowBadgeText, { color: cartProfit.margin >= 30 ? '#2E7D32' : '#F57C00' }]}>
                        {cartProfit.margin.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            <Button
              mode="contained"
              onPress={handleCheckout}
              style={styles.checkoutButton}
              labelStyle={styles.checkoutButtonLabel}
              icon="cash-register"
            >
              Finalizar Venda
            </Button>
          </View>
        )}

        {/* FAB para escanear código de barras - Desabilitado temporariamente */}
        {/* <FAB
          icon="barcode-scan"
          style={styles.fab}
          onPress={handleOpenScanner}
          label="Escanear"
        /> */}

        {/* Scanner de código de barras - Desabilitado temporariamente */}
        {/* <BarcodeScanner
          visible={scannerVisible}
          onDismiss={() => setScannerVisible(false)}
          onProductFound={handleProductScanned}
        /> */}

        {/* Customer Selection Modal */}
        <CustomerSelectionModal
          visible={customerModalVisible}
          onDismiss={() => setCustomerModalVisible(false)}
          onSelectCustomer={handleSelectCustomer}
        />

        {/* Product Selection Modal */}
        <ProductSelectionModal
          visible={productModalVisible}
          onDismiss={() => setProductModalVisible(false)}
          onSelectProduct={handleSelectProduct}
        />

        {/* QR Code Scanner */}
        <QRCodeScanner
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onProductScanned={handleProductScanned}
          getCartQuantity={(productId) => cart.getItem(`p_${productId}`)?.quantity ?? 0}
        />

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
    </TouchableWithoutFeedback>
    </KeyboardSafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  customerSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  customerCard: {
    borderRadius: theme.borderRadius.lg,
    elevation: 2,
  },
  customerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerDetails: {
    marginLeft: 12,
    flex: 1,
  },
  customerName: {
    fontWeight: '600',
  },
  customerType: {
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  selectCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.light.primary,
    borderStyle: 'solid',
  },
  selectCustomerIconContainer: {
    marginRight: 12,
  },
  selectCustomerTextContainer: {
    flex: 1,
  },
  selectCustomerText: {
    fontWeight: '600',
    color: Colors.light.primary,
    marginBottom: 2,
  },
  selectCustomerSubtext: {
    color: Colors.light.textSecondary,
  },
  addProductSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  addProductRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addProductButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.light.primary,
    borderStyle: 'solid',
  },
  addProductButtonFlex: {
    flex: 1,
  },
  scanQRButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  scanQRButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  addProductIconContainer: {
    marginRight: 12,
  },
  addProductTextContainer: {
    flex: 1,
  },
  addProductText: {
    fontWeight: '600',
    color: Colors.light.primary,
    marginBottom: 2,
  },
  addProductSubtext: {
    color: Colors.light.textSecondary,
  },
  cartSection: {
    flex: 1,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cartTitle: {
    fontWeight: '700',
  },
  cartList: {
    flex: 1,
  },
  cartItem: {
    marginBottom: 12,
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
  },
  cartItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cartItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  cartItemName: {
    fontWeight: '600',
    marginBottom: 4,
  },
  cartItemSku: {
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  variantLabel: {
    fontSize: 13,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  cartItemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cartItemPrice: {
    color: Colors.light.primary,
    fontWeight: '600',
  },
  cartMarginBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cartMarginText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cartItemActions: {
    alignItems: 'flex-end',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  quantity: {
    marginHorizontal: 12,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  itemTotal: {
    fontWeight: '700',
    color: Colors.light.text,
  },
  footer: {
    backgroundColor: Colors.light.background,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
    elevation: 8,
  },
  totalsContainer: {
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    color: Colors.light.textSecondary,
  },
  totalValue: {
    color: Colors.light.text,
    fontWeight: '500',
  },
  discountLabel: {
    color: Colors.light.success,
  },
  discountValue: {
    color: Colors.light.success,
    fontWeight: '600',
  },
  totalRowFinal: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  totalFinalLabel: {
    fontWeight: '700',
  },
  totalFinalValue: {
    fontWeight: '700',
    color: Colors.light.primary,
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8F5E9',
  },
  profitRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profitRowLabel: {
    fontSize: 13,
    color: '#666',
  },
  profitRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profitRowValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  profitRowBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  profitRowBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 2,
  },
  discountRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  discountRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discountAddLabel: {
    color: Colors.light.textSecondary,
  },
  discountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  discountTypeToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.light.primary,
  },
  discountTypeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  discountTypeBtnActive: {
    backgroundColor: Colors.light.primary,
  },
  discountTypeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  discountTypeBtnTextActive: {
    color: '#fff',
  },
  discountInputField: {
    flex: 1,
    fontSize: 14,
    height: 40,
  },
  discountConfirmBtn: {
    margin: 0,
  },
  discountCancelBtn: {
    margin: 0,
  },
  checkoutButton: {
    paddingVertical: 6,
    borderRadius: theme.borderRadius.lg,
  },
  checkoutButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    backgroundColor: Colors.light.secondary,
  },
});
