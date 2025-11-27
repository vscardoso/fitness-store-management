import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  StatusBar,
} from 'react-native';
import {
  Text,
  Searchbar,
  Card,
  Button,
  Chip,
  FAB,
  IconButton,
  List,
  ActivityIndicator,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import EmptyState from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
// import BarcodeScanner from '@/components/sale/BarcodeScanner'; // Desabilitado temporariamente - requer build nativo
import CustomerSelectionModal from '@/components/sale/CustomerSelectionModal';
import { searchProducts } from '@/services/productService';
import { getCustomerById } from '@/services/customerService';
import {
  validateProductForCart,
  validateCartStock,
  formatValidationErrors,
} from '@/utils/validation';
import type { Product, Customer } from '@/types';

export default function SaleScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const cart = useCart();
  const [searchQuery, setSearchQuery] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);

  // Query: Selected customer details
  const { data: selectedCustomer } = useQuery({
    queryKey: ['customer', cart.customer_id],
    queryFn: () => getCustomerById(cart.customer_id!),
    enabled: !!cart.customer_id,
  });

  /**
   * Debounced search effect
   */
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        setShowSearchResults(true);
        try {
          const results = await searchProducts(searchQuery);
          setSearchResults(results);
        } catch (error) {
          console.error('Search error:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddToCart = (product: any) => {
    const existingItem = cart.getItem(product.id);
    const requestedQuantity = existingItem ? existingItem.quantity + 1 : 1;

    // Validar produto antes de adicionar
    const validation = validateProductForCart(product, requestedQuantity);

    if (!validation.isValid) {
      haptics.warning();
      Alert.alert('Não é possível adicionar produto', formatValidationErrors(validation.errors));
      return;
    }

    if (existingItem) {
      haptics.light();
      cart.updateQuantity(product.id, requestedQuantity);
    } else {
      haptics.medium();
      cart.addItem(product, 1);
    }
  };

  const handleUpdateQuantity = (productId: number, newQuantity: number) => {
    // Obter item do carrinho
    const item = cart.getItem(productId);
    if (!item) return;

    // Se quantidade for zero ou menor, remover do carrinho
    if (newQuantity <= 0) {
      haptics.warning();
      Alert.alert(
        'Remover produto',
        `Deseja remover ${item.product.name} do carrinho?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Remover',
            style: 'destructive',
            onPress: () => {
              haptics.success();
              cart.removeItem(productId);
            },
          },
        ]
      );
      return;
    }

    // Validar nova quantidade
    const validation = validateProductForCart(item.product, newQuantity);

    if (!validation.isValid) {
      haptics.warning();
      Alert.alert('Quantidade inválida', formatValidationErrors(validation.errors));
      return;
    }

    haptics.light();
    cart.updateQuantity(productId, newQuantity);
  };

  const handleClearCart = () => {
    haptics.warning();
    Alert.alert(
      'Limpar carrinho',
      'Tem certeza que deseja remover todos os itens?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: () => {
            haptics.success();
            cart.clearItems();
          },
        },
      ]
    );
  };

  const handleCheckout = () => {
    if (!cart.hasItems()) {
      haptics.warning();
      Alert.alert('Carrinho vazio', 'Adicione produtos ao carrinho para finalizar a venda');
      return;
    }

    // Validar carrinho completo antes de ir para o checkout
    const validation = validateCartStock(cart.items);

    if (!validation.isValid) {
      haptics.error();
      Alert.alert(
        'Validação do carrinho',
        formatValidationErrors(validation.errors),
        [
          {
            text: 'Revisar carrinho',
            style: 'cancel',
          },
        ]
      );
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
   * Handler quando produto é encontrado pelo scanner
   */
  const handleProductScanned = (product: Product) => {
    // Adicionar produto ao carrinho
    handleAddToCart(product);

    // Exibir feedback
    Alert.alert(
      'Produto adicionado',
      `${product.name} foi adicionado ao carrinho`,
      [{ text: 'OK', onPress: () => haptics.light() }]
    );
  };

  /**
   * Handler para selecionar produto da busca
   */
  const handleSelectProduct = (product: Product) => {
    haptics.light();
    handleAddToCart(product);

    // Limpar busca
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  /**
   * Handler para limpar busca
   */
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  /**
   * Handler para selecionar cliente
   */
  const handleSelectCustomer = (customer: Customer) => {
    haptics.light();
    cart.setCustomer(customer.id);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>
                {user?.store_name || 'WA Moda Fitness'}
              </Text>
              <Text style={styles.headerSubtitle}>
                Realize vendas rapidamente
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cartBadgeContainer}
              onPress={() => {}}
            >
              <View style={styles.cartIconContainer}>
                <Ionicons name="cart" size={28} color="#fff" />
                {cart.itemCount > 0 && (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{cart.itemCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

        {/* Cliente selecionado */}
        <View style={styles.customerSection}>
          {cart.customer_id && selectedCustomer ? (
            <Card style={styles.customerCard}>
              <Card.Content style={styles.customerCardContent}>
                <View style={styles.customerInfo}>
                  <Ionicons name="person-circle" size={40} color={Colors.light.primary} />
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
              <Ionicons name="person-add-outline" size={24} color={Colors.light.primary} />
              <Text variant="bodyMedium" style={styles.selectCustomerText}>
                Selecionar Cliente (Opcional)
              </Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Buscar produtos */}
        <View style={styles.searchSection}>
          <Searchbar
            placeholder="Buscar produto por nome, SKU ou código de barras..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchbar}
            icon="barcode"
            elevation={0}
            onClearIconPress={handleClearSearch}
          />

          {/* Resultados da busca */}
          {showSearchResults && (
            <Card style={styles.searchResultsCard}>
              {isSearching ? (
                <View style={styles.searchLoadingContainer}>
                  <ActivityIndicator size="small" color={Colors.light.primary} />
                  <Text style={styles.searchLoadingText}>Buscando...</Text>
                </View>
              ) : searchResults.length > 0 ? (
                <ScrollView style={styles.searchResultsList} nestedScrollEnabled>
                  {searchResults.map((product) => (
                    <List.Item
                      key={product.id}
                      title={product.name}
                      description={`SKU: ${product.sku} | ${formatCurrency(product.price)}`}
                      left={(props) => (
                        <List.Icon {...props} icon="cube-outline" color={Colors.light.primary} />
                      )}
                      right={(props) => (
                        <IconButton
                          {...props}
                          icon="plus-circle"
                          iconColor={Colors.light.primary}
                          onPress={() => handleSelectProduct(product)}
                        />
                      )}
                      onPress={() => handleSelectProduct(product)}
                      style={styles.searchResultItem}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.searchEmptyContainer}>
                  <Ionicons
                    name="search-outline"
                    size={32}
                    color={Colors.light.textSecondary}
                  />
                  <Text style={styles.searchEmptyText}>
                    Nenhum produto encontrado para "{searchQuery}"
                  </Text>
                </View>
              )}
            </Card>
          )}
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
                <Card key={item.product_id} style={styles.cartItem}>
                  <Card.Content style={styles.cartItemContent}>
                    <View style={styles.cartItemInfo}>
                      <Text variant="titleMedium" style={styles.cartItemName} numberOfLines={2}>
                        {item.product.name}
                      </Text>
                      <Text variant="bodySmall" style={styles.cartItemSku}>
                        SKU: {item.product.sku}
                      </Text>
                      <Text variant="titleSmall" style={styles.cartItemPrice}>
                        {formatCurrency(item.unit_price)}
                      </Text>
                    </View>

                    <View style={styles.cartItemActions}>
                      <View style={styles.quantityControl}>
                        <IconButton
                          icon="remove"
                          size={20}
                          mode="contained"
                          containerColor={Colors.light.error}
                          iconColor="#fff"
                          onPress={() => handleUpdateQuantity(item.product_id, item.quantity - 1)}
                        />
                        <Text variant="titleMedium" style={styles.quantity}>
                          {item.quantity}
                        </Text>
                        <IconButton
                          icon="add"
                          size={20}
                          mode="contained"
                          containerColor={Colors.light.primary}
                          iconColor="#fff"
                          onPress={() => handleUpdateQuantity(item.product_id, item.quantity + 1)}
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
              {cart.discount > 0 && (
                <View style={styles.totalRow}>
                  <Text variant="bodyMedium" style={styles.discountLabel}>
                    Desconto
                  </Text>
                  <Text variant="bodyMedium" style={styles.discountValue}>
                    -{formatCurrency(cart.discount)}
                  </Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
  cartBadgeContainer: {
    padding: theme.spacing.xs,
  },
  cartIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.light.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
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
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderStyle: 'dashed',
  },
  selectCustomerText: {
    flex: 1,
    marginLeft: 12,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  searchSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  searchbar: {
    backgroundColor: Colors.light.background,
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
  },
  searchResultsCard: {
    marginTop: 8,
    borderRadius: theme.borderRadius.lg,
    elevation: 2,
    maxHeight: 300,
  },
  searchResultsList: {
    maxHeight: 300,
  },
  searchResultItem: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  searchLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  searchLoadingText: {
    marginLeft: 12,
    color: Colors.light.textSecondary,
  },
  searchEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  searchEmptyText: {
    marginTop: 12,
    color: Colors.light.textSecondary,
    textAlign: 'center',
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
  cartItemPrice: {
    color: Colors.light.primary,
    fontWeight: '600',
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
