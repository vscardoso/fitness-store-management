import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Text, Searchbar, Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { getGroupedProducts } from '@/services/productService';
import EmptyState from '@/components/ui/EmptyState';
import type { ProductGrouped, ProductVariant } from '@/types';

interface ProductSelectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectProduct: (product: ProductGrouped, variant: ProductVariant) => void;
}

export default function ProductSelectionModal({
  visible,
  onDismiss,
  onSelectProduct,
}: ProductSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductGrouped | null>(null);

  // Query: Lista de produtos agrupados
  const {
    data: products,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['grouped-products-modal'],
    queryFn: () => getGroupedProducts({ limit: 1000 }),
    enabled: visible,
  });

  // Reset search when modal opens
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setSelectedProduct(null);
    }
  }, [visible]);

  // Filter products by search query (client-side filtering)
  const filteredProducts = products?.filter((product: ProductGrouped) => {
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
    setSelectedProduct(product);
  };

  const handleVariantPress = (product: ProductGrouped, variant: ProductVariant) => {
    onSelectProduct(product, variant);
    onDismiss();
  };

  const renderProduct = ({ item }: { item: ProductGrouped }) => {
    const isSelected = selectedProduct?.id === item.id;
    const hasNoStock = item.total_stock === 0;

    return (
      <View>
        <TouchableOpacity
          onPress={() => handleProductPress(item)}
          activeOpacity={0.7}
          style={[
            styles.productGroupHeader,
            isSelected && styles.productGroupHeaderSelected,
          ]}
        >
          <View style={styles.productGroupInfo}>
            <View style={styles.iconContainer}>
              <Ionicons name="cube" size={20} color={isSelected ? Colors.light.primary : Colors.light.textSecondary} />
            </View>
            <View style={styles.productGroupDetails}>
              <Text variant="titleMedium" style={styles.productName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.brand && (
                <Text variant="bodySmall" style={styles.brand} numberOfLines={1}>
                  {item.brand}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.productGroupRight}>
            <Text variant="titleSmall" style={styles.priceRange}>
              {item.min_price === item.max_price
                ? formatCurrency(item.min_price)
                : `${formatCurrency(item.min_price)} - ${formatCurrency(item.max_price)}`
              }
            </Text>
            <Ionicons
              name={isSelected ? "chevron-up" : "chevron-down"}
              size={20}
              color={Colors.light.textTertiary}
            />
          </View>
        </TouchableOpacity>

        {/* Variantes - apenas se selecionado */}
        {isSelected && (
          <View style={styles.variantsContainer}>
            {item.variants.map((variant) => {
              const hasVariantStock = variant.current_stock > 0;
              return (
                <TouchableOpacity
                  key={variant.id}
                  onPress={() => handleVariantPress(item, variant)}
                  activeOpacity={0.7}
                  disabled={!hasVariantStock}
                  style={styles.variantItem}
                >
                  <View style={styles.variantInfo}>
                    <View style={styles.variantDetails}>
                      <Text variant="bodyMedium" style={styles.variantLabel}>
                        {variant.size || 'Único'}
                      </Text>
                      {variant.color && (
                        <Text variant="bodySmall" style={styles.variantColor}>
                          {variant.color}
                        </Text>
                      )}
                    </View>
                    <Text variant="titleSmall" style={styles.variantPrice}>
                      {formatCurrency(variant.price)}
                    </Text>
                  </View>
                  <View style={[
                    styles.variantStockBadge,
                    !hasVariantStock && styles.variantStockBadgeEmpty,
                  ]}>
                    <Text style={styles.variantStockText}>
                      {variant.current_stock}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
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
      <Pressable style={styles.modalOverlay} onPress={onDismiss}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text variant="headlineSmall" style={styles.title}>
              Buscar Produto
            </Text>
            <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.light.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <Searchbar
            placeholder="Buscar por nome, SKU, código de barras..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchbar}
            elevation={0}
          />

          {/* Product List */}
          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
              <Text style={styles.loadingText}>Carregando produtos...</Text>
            </View>
          ) : isError ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Erro ao carregar produtos"
              description="Verifique sua conexão e tente novamente"
            />
          ) : (
            <FlatList
              data={filteredProducts}
              renderItem={renderProduct}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <EmptyState
                  icon="cube-outline"
                  title={searchQuery ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}
                  description={
                    searchQuery
                      ? 'Tente outro termo de busca'
                      : 'Cadastre produtos ativos para vendê-los'
                  }
                />
              }
            />
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.continueButton} onPress={onDismiss}>
              <Text style={styles.continueButtonText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: theme.borderRadius.xxl,
    borderTopRightRadius: theme.borderRadius.xxl,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  title: {
    fontWeight: '700',
    color: Colors.light.text,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchbar: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.textSecondary,
  },
  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  continueButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueButtonText: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
  },
  // Product Group Styles
  productGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 1,
  },
  productGroupHeaderSelected: {
    backgroundColor: `${Colors.light.primary}10`,
    borderBottomWidth: 2,
    borderBottomColor: Colors.light.primary,
  },
  productGroupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  productGroupDetails: {
    marginLeft: 12,
    flex: 1,
  },
  productName: {
    fontWeight: '600',
    marginBottom: 2,
  },
  brand: {
    color: Colors.light.textSecondary,
    fontSize: 11,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.full,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productGroupRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  priceRange: {
    color: Colors.light.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  // Variants Styles
  variantsContainer: {
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  variantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  variantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  variantDetails: {
    marginLeft: 12,
    flex: 1,
  },
  variantLabel: {
    fontWeight: '600',
    marginBottom: 2,
  },
  variantColor: {
    color: Colors.light.textSecondary,
    fontSize: 11,
    marginBottom: 4,
  },
  variantPrice: {
    color: Colors.light.primary,
    fontWeight: '700',
  },
  variantStockBadge: {
    backgroundColor: Colors.light.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  variantStockBadgeEmpty: {
    backgroundColor: Colors.light.error,
  },
  variantStockText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
