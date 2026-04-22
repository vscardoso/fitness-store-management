import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency } from '@/utils/format';
import { getGroupedProducts } from '@/services/productService';
import EmptyState from '@/components/ui/EmptyState';
import type { ProductGrouped, ProductVariant } from '@/types';

interface ProductSelectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectProduct: (product: ProductGrouped, variant: ProductVariant) => void;
  hasStock?: boolean;
}

export default function ProductSelectionModal({
  visible,
  onDismiss,
  onSelectProduct,
  hasStock,
}: ProductSelectionModalProps) {
  const brandingColors = useBrandingColors();
  const insets = useSafeAreaInsets();
  const searchRef = useRef<TextInput>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductGrouped | null>(null);

  // Query: Lista de produtos agrupados
  const {
    data: products,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['grouped-products-modal', hasStock],
    queryFn: () => getGroupedProducts({ limit: 500, has_stock: hasStock }),
    enabled: visible,
  });

  // Reset search when modal opens
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setSelectedProduct(null);
      refetch();
    }
  }, [visible, refetch]);

  // Filter products by search query (client-side filtering)
  const filteredProducts = products?.filter((product: ProductGrouped) => {
    // Em fluxos de venda/condicional com hasStock=true, nunca listar produto zerado
    if (hasStock && (product.total_stock ?? 0) <= 0) {
      return false;
    }

    if (!searchQuery.trim()) {
      return true;
    }

    const search = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(search) ||
      product.brand?.toLowerCase().includes(search)
    );
  });

  const handleProductPress = (product: ProductGrouped) => {
    setSelectedProduct(prev => prev?.id === product.id ? null : product);
  };

  const handleVariantPress = (product: ProductGrouped, variant: ProductVariant) => {
    onSelectProduct(product, variant);
    onDismiss();
  };

  const renderProduct = ({ item }: { item: ProductGrouped }) => {
    const isSelected = selectedProduct?.id === item.id;
    const visibleVariants = item.variants;

    return (
      <View style={styles.productCard}>
        {/* Cabeçalho do produto */}
        <TouchableOpacity
          onPress={() => handleProductPress(item)}
          activeOpacity={0.75}
          style={[styles.productRow, isSelected && { borderColor: brandingColors.primary }]}
        >
          <View style={[styles.productIcon, { backgroundColor: brandingColors.primary + '16' }]}>
            <Ionicons name="cube-outline" size={18} color={brandingColors.primary} />
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
            {item.brand ? (
              <Text style={styles.productBrand} numberOfLines={1}>{item.brand}</Text>
            ) : null}
          </View>
          <View style={styles.productRight}>
            <Text style={[styles.productPrice, { color: brandingColors.primary }]}>
              {item.min_price === item.max_price
                ? formatCurrency(item.min_price)
                : `${formatCurrency(item.min_price)}+`}
            </Text>
            <View style={[styles.stockPill, { backgroundColor: (item.total_stock ?? 0) > 0 ? Colors.light.success + '18' : Colors.light.error + '18' }]}>
              <Text style={[styles.stockPillText, { color: (item.total_stock ?? 0) > 0 ? Colors.light.success : Colors.light.error }]}>
                {item.total_stock ?? 0}
              </Text>
            </View>
          </View>
          <Ionicons
            name={isSelected ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={isSelected ? brandingColors.primary : Colors.light.textTertiary}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>

        {/* Variantes expandidas */}
        {isSelected && visibleVariants.length > 0 && (
          <View style={styles.variantsWrap}>
            {visibleVariants.map((variant) => (
              // Keep all variants visible; when stock is required, disable selection for empty variants.
              (() => {
                const isOutOfStock = hasStock && (variant.current_stock ?? 0) <= 0;
                return (
              <TouchableOpacity
                key={`${item.id}-${variant.id}`}
                onPress={() => !isOutOfStock && handleVariantPress(item, variant)}
                activeOpacity={0.75}
                disabled={isOutOfStock}
                style={[styles.variantRow, isOutOfStock && styles.variantRowDisabled]}
              >
                <View style={styles.variantLeft}>
                  <View style={styles.variantDot} />
                  <View>
                    <Text style={styles.variantLabel}>
                      {[variant.size, variant.color].filter(Boolean).join(' · ') || 'Único'}
                    </Text>
                    {variant.sku ? (
                      <Text style={styles.variantSku}>SKU: {variant.sku}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.variantRight}>
                  <Text style={[styles.variantPrice, { color: brandingColors.primary }]}>
                    {formatCurrency(variant.price)}
                  </Text>
                  <View style={[styles.stockPill, { backgroundColor: isOutOfStock ? Colors.light.error + '18' : Colors.light.success + '18' }]}>
                    <Text style={[styles.stockPillText, { color: isOutOfStock ? Colors.light.error : Colors.light.success }]}>
                      {variant.current_stock}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
                );
              })()
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDismiss} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
        {/* Header gradiente — padrão BottomSheet */}
        <LinearGradient
          colors={[brandingColors.primary, brandingColors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="search-outline" size={20} color="#fff" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Buscar Produto</Text>
                <Text style={styles.headerSub}>
                  {filteredProducts?.length ?? 0} produto{(filteredProducts?.length ?? 0) !== 1 ? 's' : ''} disponíve{(filteredProducts?.length ?? 0) !== 1 ? 'is' : 'l'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Campo de busca */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={Colors.light.textTertiary} style={styles.searchIcon} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            placeholder="Nome, marca ou SKU..."
            placeholderTextColor={Colors.light.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Lista */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={brandingColors.primary} />
            <Text style={styles.loadingText}>Carregando produtos...</Text>
          </View>
        ) : isError ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Erro ao carregar"
            description="Verifique a conexão e tente novamente"
          />
        ) : (
          <FlatList
            data={filteredProducts}
            renderItem={renderProduct}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                icon="cube-outline"
                title={searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}
                description={searchQuery ? 'Tente outro termo de busca' : 'Cadastre produtos ativos para vendê-los'}
              />
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.light.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    minHeight: '50%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
    overflow: 'hidden',
  },
  // ── Header ──
  header: {
    flexDirection: 'column',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
  },
  headerSub: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Busca ──
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    height: 44,
  },
  // ── Lista ──
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 200,
  },
  loadingText: {
    marginTop: 12,
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  // ── Card de produto ──
  productCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.light.card,
    ...theme.shadows.sm,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  productIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  productBrand: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  productRight: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  productPrice: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  stockPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  stockPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // ── Variantes expandidas ──
  variantsWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  variantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  variantDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.textTertiary,
    flexShrink: 0,
  },
  variantRowDisabled: {
    opacity: 0.45,
  },
  variantLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.text,
  },
  variantSku: {
    fontSize: 11,
    color: Colors.light.textTertiary,
    marginTop: 1,
  },
  variantRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  variantPrice: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
});
