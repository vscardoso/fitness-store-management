import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import KeyboardSafeView from '@/components/ui/KeyboardSafeView';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
  TextInput,
  Text,
} from 'react-native';
import { useBrandingColors } from '@/store/brandingStore';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/layout/PageHeader';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import CustomerSelectionModal from '@/components/sale/CustomerSelectionModal';
import { getCustomerById } from '@/services/customerService';
import { getFIFOCosts } from '@/services/productService';
import AppButton from '@/components/ui/AppButton';
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const cart = useCart();
  const brandingColors = useBrandingColors();
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

  // Ao voltar para o PDV (ex.: após /checkout/success), forçar sincronização
  // das fontes de produto/estoque para evitar listagem stale.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-products'] });
      queryClient.invalidateQueries({ queryKey: ['products-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
    }, [queryClient])
  );

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

    const scannedProduct = product as Product & { variant_id?: number };
    const cart_key = scannedProduct.variant_id ? `v_${scannedProduct.variant_id}` : `p_${product.id}`;
    const existingItem = cart.getItem(cart_key);
    const newQty = (existingItem?.quantity ?? 0) + quantity;
    const availableStock = scannedProduct.current_stock ?? 0;

    if (availableStock <= 0) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Sem estoque',
        message: 'Este item não tem estoque disponível.',
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    if (newQty > availableStock) {
      haptics.warning();
      setDialog({
        visible: true,
        type: 'warning',
        title: 'Estoque insuficiente',
        message: `Apenas ${availableStock} unidade(s) disponíveis para este item.`,
        confirmText: 'Entendi',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
      return;
    }

    if (existingItem) {
      cart.updateQuantity(cart_key, newQty);
    } else {
      cart.addItem(product, quantity);
    }

    haptics.success();
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
            <View style={styles.customerCard}>
              <View style={[styles.customerAvatar, { backgroundColor: brandingColors.primary + '18' }]}>
                <Ionicons name="person" size={20} color={brandingColors.primary} />
              </View>
              <View style={styles.customerDetails}>
                <Text style={styles.customerName} numberOfLines={1}>
                  {selectedCustomer.full_name}
                </Text>
                <Text style={styles.customerType} numberOfLines={1}>
                  {selectedCustomer.email || selectedCustomer.phone || `ID: ${cart.customer_id}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => cart.setCustomer(undefined)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={22} color={Colors.light.textTertiary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.selectCustomerButton}
              onPress={() => setCustomerModalVisible(true)}
              activeOpacity={0.75}
            >
              <View style={[styles.selectCustomerIconContainer, { backgroundColor: brandingColors.primary + '12' }]}>
                <Ionicons name="person-add-outline" size={20} color={brandingColors.primary} />
              </View>
              <View style={styles.selectCustomerTextContainer}>
                <Text style={styles.selectCustomerText}>Selecionar Cliente (Opcional)</Text>
                <Text style={styles.selectCustomerSubtext}>Toque para escolher um cliente</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
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
              activeOpacity={0.75}
            >
              <View style={[styles.addProductIconContainer, { backgroundColor: brandingColors.primary + '12' }]}>
                <Ionicons name="search-outline" size={20} color={brandingColors.primary} />
              </View>
              <View style={styles.addProductTextContainer}>
                <Text style={styles.addProductText}>Buscar Produtos</Text>
                <Text style={styles.addProductSubtext}>Pesquisar por nome ou SKU</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
            </TouchableOpacity>

            {/* Botão de scanner QR Code */}
            <TouchableOpacity
              style={[styles.scanQRButton, { backgroundColor: brandingColors.primary }]}
              onPress={handleOpenScanner}
              activeOpacity={0.8}
            >
              <Ionicons name="qr-code-outline" size={26} color="#fff" />
              <Text style={styles.scanQRButtonText}>Escanear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Carrinho de compras */}
        <View style={styles.cartSection}>
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>
              Carrinho ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'itens'})
            </Text>
            {cart.items.length > 0 && (
              <TouchableOpacity
                onPress={handleClearCart}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearCartText}>Limpar</Text>
              </TouchableOpacity>
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
                <View key={item.cart_key} style={styles.cartItem}>
                  <View style={styles.cartItemContent}>
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName} numberOfLines={2}>
                        {item.product.name}
                        {item.variant_label ? (
                          <Text style={styles.variantLabel}> ({item.variant_label})</Text>
                        ) : null}
                      </Text>
                      <Text style={styles.cartItemSku}>
                        SKU: {item.product.sku}
                      </Text>
                      <View style={styles.cartItemPriceRow}>
                        <Text style={styles.cartItemPrice}>
                          {formatCurrency(item.unit_price)}
                        </Text>
                        {fifoCosts?.[String(item.product_id)]?.average_unit_cost != null && (() => {
                          const cost = fifoCosts[String(item.product_id)].average_unit_cost;
                          const marginPct = item.unit_price > 0
                            ? ((item.unit_price - cost) / item.unit_price) * 100
                            : 0;
                          return (
                            <View style={[styles.cartMarginBadge, { backgroundColor: marginPct >= 30 ? VALUE_COLORS.positive + '18' : VALUE_COLORS.warning + '18' }]}>
                              <Text style={[styles.cartMarginText, { color: marginPct >= 30 ? VALUE_COLORS.positive : VALUE_COLORS.warning }]}>
                                {marginPct.toFixed(0)}%
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                    </View>

                    <View style={styles.cartItemActions}>
                      <View style={styles.quantityControl}>
                        <TouchableOpacity
                          style={[styles.qtyBtn, { backgroundColor: VALUE_COLORS.negative }]}
                          onPress={() => handleUpdateQuantity(item.cart_key, item.quantity - 1)}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="remove" size={14} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.quantity}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={[styles.qtyBtn, { backgroundColor: brandingColors.primary }]}
                          onPress={() => handleUpdateQuantity(item.cart_key, item.quantity + 1)}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="add" size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.itemTotal}>
                        {formatCurrency(item.unit_price * item.quantity)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Footer com totais e botão de finalizar */}
        {cart.items.length > 0 && (
          <View style={styles.footer}>
            <View style={styles.totalsContainer}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{formatCurrency(cart.subtotal)}</Text>
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
                    <Text style={cart.discount > 0 ? styles.discountLabel : styles.discountAddLabel}>
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
                    placeholder="0,00"
                    placeholderTextColor={Colors.light.textTertiary}
                    style={styles.discountInputField}
                    returnKeyType="done"
                    onSubmitEditing={handleApplyDiscount}
                  />
                  <TouchableOpacity
                    style={styles.discountConfirmBtn}
                    onPress={handleApplyDiscount}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.discountCancelBtn}
                    onPress={() => { setDiscountVisible(false); setDiscountInput(''); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close" size={18} color={Colors.light.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              <View style={[styles.totalRow, styles.totalRowFinal]}>
                <Text style={styles.totalFinalLabel}>Total</Text>
                <Text style={styles.totalFinalValue}>{formatCurrency(cart.total)}</Text>
              </View>
              {cartProfit && (
                <View style={styles.profitRow}>
                  <View style={styles.profitRowLeft}>
                    <Ionicons name="trending-up" size={16} color={VALUE_COLORS.positive} />
                    <Text style={styles.profitRowLabel}>Lucro estimado</Text>
                  </View>
                  <View style={styles.profitRowRight}>
                    <Text style={[styles.profitRowValue, { color: cartProfit.profit >= 0 ? VALUE_COLORS.positive : VALUE_COLORS.negative }]}>
                      {formatCurrency(cartProfit.profit)}
                    </Text>
                    <View style={[styles.profitRowBadge, { backgroundColor: cartProfit.margin >= 30 ? VALUE_COLORS.positive + '18' : VALUE_COLORS.warning + '18' }]}>
                      <Text style={[styles.profitRowBadgeText, { color: cartProfit.margin >= 30 ? VALUE_COLORS.positive : VALUE_COLORS.warning }]}>
                        {cartProfit.margin.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            <AppButton
              variant="primary"
              size="lg"
              fullWidth
              icon="cash-outline"
              label="Finalizar Venda"
              onPress={handleCheckout}
              style={styles.checkoutButton}
            />
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
          hasStock={true}
        />

        {/* QR Code Scanner */}
        <QRCodeScanner
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onProductScanned={handleProductScanned}
          getCartQuantity={(product) => {
            const productWithVariant = product as Product & { variant_id?: number };
            const cartKey = productWithVariant.variant_id
              ? `v_${productWithVariant.variant_id}`
              : `p_${product.id}`;
            return cart.getItem(cartKey)?.quantity ?? 0;
          }}
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
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 4,
    ...theme.shadows.sm,
  },
  customerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  customerDetails: {
    flex: 1,
    minWidth: 0,
  },
  customerName: {
    fontSize: theme.fontSize.base - 1,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  customerType: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  selectCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 4,
    ...theme.shadows.sm,
  },
  selectCustomerIconContainer: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  selectCustomerTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  selectCustomerText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  selectCustomerSubtext: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  addProductSection: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  addProductRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  addProductButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    padding: theme.spacing.sm + 4,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  addProductButtonFlex: {
    flex: 1,
  },
  scanQRButton: {
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
  },
  scanQRButtonText: {
    color: '#fff',
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    marginTop: 3,
  },
  addProductIconContainer: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  addProductTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  addProductText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  addProductSubtext: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
  },
  cartSection: {
    flex: 1,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  cartTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
  },
  clearCartText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.error,
  },
  cartList: {
    flex: 1,
  },
  cartItem: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  cartItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing.sm + 4,
  },
  cartItemInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: theme.spacing.sm,
  },
  cartItemName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  cartItemSku: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  variantLabel: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  cartItemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cartItemPrice: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  cartMarginBadge: {
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  cartMarginText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
  },
  cartItemActions: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  qtyBtn: {
    width: 28, height: 28, borderRadius: theme.borderRadius.sm,
    justifyContent: 'center', alignItems: 'center',
  },
  quantity: {
    marginHorizontal: theme.spacing.sm,
    fontSize: theme.fontSize.base - 1,
    fontWeight: '700',
    color: Colors.light.text,
    minWidth: 24,
    textAlign: 'center',
  },
  itemTotal: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
    flexShrink: 0,
  },
  footer: {
    backgroundColor: Colors.light.card,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  totalsContainer: {
    marginBottom: theme.spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs + 2,
  },
  totalLabel: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  totalValue: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '500',
  },
  discountLabel: {
    fontSize: theme.fontSize.sm,
    color: VALUE_COLORS.positive,
    fontWeight: '500',
  },
  discountValue: {
    fontSize: theme.fontSize.sm,
    color: VALUE_COLORS.positive,
    fontWeight: '600',
  },
  totalRowFinal: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  totalFinalLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.text,
  },
  totalFinalValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  profitRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profitRowLabel: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  profitRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  profitRowValue: {
    fontSize: theme.fontSize.base - 1,
    fontWeight: '700',
  },
  profitRowBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  profitRowBadgeText: {
    fontSize: theme.fontSize.xxs + 1,
    fontWeight: '700',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs + 2,
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
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  discountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs + 2,
    gap: 6,
  },
  discountTypeToggle: {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.md,
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
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  discountTypeBtnTextActive: {
    color: '#fff',
  },
  discountInputField: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    height: 40,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.sm,
    color: Colors.light.text,
  },
  discountConfirmBtn: {
    width: 36, height: 36, borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.success,
    justifyContent: 'center', alignItems: 'center',
  },
  discountCancelBtn: {
    width: 36, height: 36, borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center', alignItems: 'center',
  },
  checkoutButton: {
    width: '100%',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 100,
  },
});
