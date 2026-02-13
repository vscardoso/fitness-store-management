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
import { getProducts } from '@/services/productService';
import EmptyState from '@/components/ui/EmptyState';
import type { Product } from '@/types';

interface ProductSelectionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectProduct: (product: Product) => void;
}

export default function ProductSelectionModal({
  visible,
  onDismiss,
  onSelectProduct,
}: ProductSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Query: Lista de produtos
  const {
    data: products,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts({ limit: 1000 }), // Buscar até 1000 produtos
    enabled: visible, // Only fetch when modal is visible
  });

  // Reset search when modal opens
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
    }
  }, [visible]);

  // Filter products by search query (client-side filtering)
  const filteredProducts = products?.filter((product: Product) => {
    // Apenas produtos ativos e não catálogo
    if (!product.is_active || product.is_catalog) {
      return false;
    }

    // Se não há busca, mostra todos
    if (!searchQuery.trim()) {
      return true;
    }

    const search = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(search) ||
      product.sku.toLowerCase().includes(search) ||
      product.barcode?.toLowerCase().includes(search) ||
      product.brand?.toLowerCase().includes(search) ||
      product.description?.toLowerCase().includes(search)
    );
  });

  const handleSelectProduct = (product: Product) => {
    onSelectProduct(product);
    onDismiss();
  };

  const renderProduct = ({ item }: { item: Product }) => {
    const stock = item.current_stock || 0;
    const minStock = item.min_stock_threshold || 5;
    const hasNoStock = stock === 0;
    const hasLowStock = stock > 0 && stock <= minStock;

    return (
      <TouchableOpacity
        onPress={() => handleSelectProduct(item)}
        activeOpacity={0.7}
      >
        <Card style={styles.productCard}>
          <Card.Content style={styles.productCardContent}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name="cube" size={24} color={Colors.light.primary} />
            </View>

            {/* Product Info */}
            <View style={styles.productInfo}>
              <Text variant="titleMedium" style={styles.productName} numberOfLines={1}>
                {[item.name, item.color, item.size].filter(Boolean).join(' - ')}
              </Text>
              <Text variant="bodySmall" style={styles.productSku} numberOfLines={1}>
                {item.sku}
              </Text>
              <View style={styles.priceStockRow}>
                <Text variant="titleSmall" style={styles.productPrice}>
                  {formatCurrency(item.price)}
                </Text>
                <View style={[
                  styles.stockBadge,
                  hasNoStock && styles.stockBadgeEmpty,
                  hasLowStock && styles.stockBadgeLow,
                ]}>
                  <Ionicons
                    name={hasNoStock ? "close-circle" : hasLowStock ? "alert-circle" : "checkmark-circle"}
                    size={12}
                    color="#fff"
                  />
                  <Text style={styles.stockText}>{stock}</Text>
                </View>
              </View>
            </View>

            {/* Selection icon */}
            <Ionicons
              name="chevron-forward"
              size={24}
              color={Colors.light.textTertiary}
            />
          </Card.Content>
        </Card>
      </TouchableOpacity>
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
  productCard: {
    marginBottom: 12,
    borderRadius: theme.borderRadius.lg,
    elevation: 1,
  },
  productCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: `${Colors.light.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontWeight: '600',
    marginBottom: 2,
  },
  productSku: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    marginBottom: 6,
  },
  priceStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productPrice: {
    color: Colors.light.primary,
    fontWeight: '700',
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  stockBadgeLow: {
    backgroundColor: Colors.light.warning,
  },
  stockBadgeEmpty: {
    backgroundColor: Colors.light.error,
  },
  stockText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
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
});
