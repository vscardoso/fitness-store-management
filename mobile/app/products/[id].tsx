import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import InfoRow from '@/components/ui/InfoRow';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getProductById, deleteProduct } from '@/services/productService';
import { getProductStock } from '@/services/inventoryService';
import { getProductVariants, formatVariantLabel } from '@/services/productVariantService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useTutorialContext } from '@/components/tutorial';

export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/products');
  const queryClient = useQueryClient();
  const { startTutorial } = useTutorialContext();

  // Validar ID do produto
  const productId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(productId) && productId > 0;

  // Se ID invÃ¡lido, redirecionar imediatamente
  useEffect(() => {
    if (id && !isValidId) {
      router.replace('/(tabs)/products');
    }
  }, [id, isValidId]);

  // Estados do modal de estoque - REMOVIDOS (agora usa sistema FIFO com Entradas)

  const toBRNumber = (n: number) => {
    try {
      return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    } catch (e) {
      return n.toFixed(2).replace('.', ',');
    }
  };

  const maskCurrencyBR = (text: string) => {
    const digits = (text || '').replace(/\D/g, '');
    if (!digits) return '';
    const number = parseInt(digits, 10);
    const value = (number / 100);
    return toBRNumber(value);
  };

  // Estado para controlar diÃ¡logos de confirmaÃ§Ã£o
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
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {},
  });

  /**
   * Query: Buscar produto por ID (funciona para produtos ativos e do catÃ¡logo)
   */
  const { data: product, isLoading, refetch: refetchProduct } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProductById(productId),
    enabled: isValidId,
    retry: false,
  });

  /**
   * Query: Buscar estoque
   */
  const { data: inventory, refetch: refetchInventory } = useQuery({
    queryKey: ['inventory', productId],
    queryFn: () => getProductStock(productId),
    enabled: isValidId,
  });

  /**
   * Query: Buscar variantes do produto
   */
  const { data: variants, isLoading: isLoadingVariants, refetch: refetchVariants } = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: () => getProductVariants(productId),
    enabled: isValidId,
  });

  /**
   * Estado de refresh
   */
  const [refreshing, setRefreshing] = useState(false);

  /**
   * FunÃ§Ã£o de refresh
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchProduct(), refetchInventory(), refetchVariants()]);
    setRefreshing(false);
  };

  // Mutation de movimentaÃ§Ã£o de estoque REMOVIDA - agora usa sistema FIFO com Entradas

  /**
   * Mutation: Deletar produto
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(productId),
    onSuccess: () => {
      // Navegar de volta IMEDIATAMENTE
      goBack();

      // Invalidar queries DEPOIS da navegaÃ§Ã£o (com delay para garantir que a tela carregou)
      setTimeout(async () => {
        await Promise.all([
          queryClient.removeQueries({ queryKey: ['product', productId] }),
          queryClient.invalidateQueries({ queryKey: ['products'] }),
          queryClient.invalidateQueries({ queryKey: ['grouped-products'] }),
          queryClient.invalidateQueries({ queryKey: ['grouped-products-modal'] }),
          queryClient.invalidateQueries({ queryKey: ['active-products'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
          queryClient.invalidateQueries({ queryKey: ['low-stock'] }),
        ]);
      }, 100);
    },
    onError: (error: any) => {
      setDialog({
        visible: true,
        type: 'danger',
        title: 'Erro',
        message: error.message || 'Erro ao deletar produto',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
    },
  });

  /**
   * Confirmar deleÃ§Ã£o
   */
  const handleDelete = () => {
    setDialog({
      visible: true,
      type: 'danger',
      title: 'Confirmar exclusÃ£o',
      message: `Tem certeza que deseja deletar "${product?.name}"?`,
      confirmText: 'Deletar',
      cancelText: 'Cancelar',
      onConfirm: () => {
        setDialog({ ...dialog, visible: false });
        deleteMutation.mutate();
      },
    });
  };

  // FunÃ§Ãµes de movimentaÃ§Ã£o de estoque REMOVIDAS - agora usa sistema FIFO com Entradas

  // Verificar ID invÃ¡lido
  if (!isValidId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
        <Text style={styles.errorTitle}>ID invÃ¡lido</Text>
        <Text style={styles.errorMessage}>O ID do produto fornecido nÃ£o Ã© vÃ¡lido.</Text>
        <Text
          style={styles.errorLink}
          onPress={goBack}
        >
          Voltar para produtos
        </Text>
      </View>
    );
  }

  if (isLoading || !product) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando produto...</Text>
        </View>
      </View>
    );
  }

  // Variant-aware derived values
  const hasVariants = (variants ?? []).length > 0;
  const totalVariantStock = hasVariants
    ? (variants ?? []).reduce((sum, v) => sum + (v.current_stock ?? 0), 0)
    : (inventory?.quantity || 0);
  const currentStock = totalVariantStock;
  const variantPrices = hasVariants ? (variants ?? []).map(v => v.price) : [];
  const minVariantPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : product.price;
  const maxVariantPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : product.price;
  const hasPriceRange = minVariantPrice !== maxVariantPrice;
  const minStock = product.min_stock_threshold || inventory?.min_stock || 5;
  const isLowStock = currentStock > 0 && currentStock <= minStock;
  const isOutOfStock = currentStock === 0;

  const stockColor = isOutOfStock
    ? Colors.light.error
    : isLowStock
    ? Colors.light.warning
    : Colors.light.success;

  return (
    <View style={styles.container}>
      <PageHeader
        title={product.name}
        subtitle={
          (() => {
            const varCount = variants?.length ?? 0;
            if (varCount > 1) {
              return [product.brand, `${varCount} variaÃ§Ãµes`].filter(Boolean).join(' â€¢ ') || undefined;
            }
            const parts = [product.brand, product.color, product.size].filter(Boolean);
            return parts.length > 0 ? parts.join(' â€¢ ') : undefined;
          })()
        }
        showBackButton
        onBack={goBack}
        rightActions={[
          { icon: 'help-circle-outline', onPress: () => startTutorial('product-details') },
          { icon: 'pencil', onPress: () => router.push(`/products/edit/${productId}` as any) },
          { icon: 'trash', onPress: handleDelete },
        ]}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.light.primary]}
          />
        }
      >
        {/* â”€â”€ ESTOQUE + PREÃ‡O (quick cards) â”€â”€ */}
        <View style={styles.quickGrid}>
          <View style={[styles.quickCard, { borderLeftColor: stockColor }]}>
            <View style={[styles.quickIconWrap, { backgroundColor: stockColor + '20' }]}>
              <Ionicons
                name={isOutOfStock ? 'alert-circle-outline' : 'cube-outline'}
                size={22}
                color={stockColor}
              />
            </View>
            <View style={styles.quickInfo}>
              <Text style={styles.quickLabel}>
                {isOutOfStock ? 'Sem Estoque' : isLowStock ? 'Estoque Baixo' : 'Em Estoque'}
              </Text>
              <Text style={[styles.quickValue, { color: stockColor }]}>
                {currentStock} un{hasVariants ? ' totais' : ''}
              </Text>
              {minStock > 0 && (
                <Text style={styles.quickSub}>mÃ­n: {minStock}</Text>
              )}
            </View>
          </View>

          <View style={[styles.quickCard, { borderLeftColor: Colors.light.primary }]}>
            <View style={[styles.quickIconWrap, { backgroundColor: Colors.light.primary + '20' }]}>
              <Ionicons name="pricetag-outline" size={22} color={Colors.light.primary} />
            </View>
            <View style={styles.quickInfo}>
              <Text style={styles.quickLabel}>PreÃ§o</Text>
              <Text
                style={[styles.quickValue, { color: Colors.light.primary }]}
                numberOfLines={1}
              >
                {hasPriceRange
                  ? `${formatCurrency(minVariantPrice)} â€“ ${formatCurrency(maxVariantPrice)}`
                  : formatCurrency(hasVariants ? minVariantPrice : product.price)}
              </Text>
            </View>
          </View>
        </View>

        {/* â”€â”€ VARIAÃ‡Ã•ES (unificado: label + SKU + preÃ§o + margem + estoque) â”€â”€ */}
        {hasVariants && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="layers-outline" size={20} color={Colors.light.primary} />
                </View>
                <Text style={styles.cardTitle}>VariaÃ§Ãµes</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{variants?.length}</Text>
                </View>
              </View>

              {(variants ?? []).map((variant, idx) => {
                const vStock = variant.current_stock ?? 0;
                const isEmpty = vStock === 0;
                const isLowV = vStock > 0 && vStock <= 3;
                const vPrice = Number(variant.price) || 0;
                const vCost = Number((variant as any).cost_price) || 0;
                const margin = vCost > 0 ? Math.round(((vPrice - vCost) / vCost) * 100) : null;
                const dotColor = isEmpty
                  ? Colors.light.error
                  : isLowV
                  ? Colors.light.warning
                  : Colors.light.success;
                const isLast = idx === (variants?.length ?? 0) - 1;

                return (
                  <View
                    key={variant.id}
                    style={[
                      styles.variantRow,
                      !isLast && styles.variantRowBorder,
                      !variant.is_active && styles.variantRowInactive,
                    ]}
                  >
                    <View style={[styles.variantDot, { backgroundColor: dotColor }]} />
                    <View style={styles.variantRowMain}>
                      <Text style={styles.variantRowLabel}>{formatVariantLabel(variant)}</Text>
                      <Text style={styles.variantRowSku}>{variant.sku}</Text>
                    </View>
                    <View style={styles.variantRowRight}>
                      <Text style={styles.variantRowPrice}>{formatCurrency(vPrice)}</Text>
                      <View style={styles.variantBadges}>
                        {margin !== null && (
                          <View style={styles.marginBadge}>
                            <Text style={styles.marginBadgeText}>{margin}%</Text>
                          </View>
                        )}
                        <View
                          style={[
                            styles.stockBadge,
                            { backgroundColor: dotColor + '22', borderColor: dotColor + '55' },
                          ]}
                        >
                          <Text style={[styles.stockBadgeText, { color: dotColor }]}>
                            {vStock} un
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        )}

        {/* â”€â”€ INFORMAÃ‡Ã•ES DO PRODUTO â”€â”€ */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="clipboard-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Produto</Text>
            </View>
            <View style={styles.infoList}>
              {!hasVariants && product.sku && (
                <InfoRow icon="barcode-outline" label="SKU" value={product.sku} layout="vertical" />
              )}
              {product.barcode && (
                <InfoRow icon="scan-outline" label="CÃ³d. de Barras" value={product.barcode} layout="vertical" />
              )}
              {product.brand && (
                <InfoRow icon="ribbon-outline" label="Marca" value={product.brand} layout="vertical" />
              )}
              {!hasVariants && product.color && (
                <InfoRow icon="color-palette-outline" label="Cor" value={product.color} layout="vertical" />
              )}
              {!hasVariants && product.size && (
                <InfoRow icon="resize-outline" label="Tamanho" value={product.size} layout="vertical" />
              )}
              {(product as any).material && (
                <InfoRow icon="layers-outline" label="Material" value={(product as any).material} layout="vertical" />
              )}
              <InfoRow
                icon="grid-outline"
                label="Categoria"
                value={product.category?.name || 'Sem categoria'}
                layout="vertical"
              />
              <InfoRow
                icon="calendar-outline"
                label="Cadastrado"
                value={formatDate(product.created_at)}
                layout="vertical"
              />
            </View>
            {product.description && (
              <View style={styles.descriptionBox}>
                <Ionicons name="document-text-outline" size={14} color={Colors.light.textSecondary} />
                <Text style={styles.descriptionText}>{product.description}</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* â”€â”€ PREÃ‡OS (somente produto simples) â”€â”€ */}
        {!hasVariants && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
                </View>
                <Text style={styles.cardTitle}>PreÃ§os</Text>
              </View>
              <View style={styles.pricingRow}>
                {product.cost_price != null && product.cost_price > 0 && (
                  <View style={[styles.pricingTile, styles.pricingTileCost]}>
                    <Ionicons name="trending-down" size={22} color={Colors.light.warning} style={{ marginBottom: 6 }} />
                    <Text style={styles.pricingLabel}>Custo</Text>
                    <Text style={[styles.pricingValue, { color: Colors.light.warning }]}>
                      {formatCurrency(product.cost_price)}
                    </Text>
                  </View>
                )}
                <View style={[styles.pricingTile, styles.pricingTileSale]}>
                  <Ionicons name="pricetag" size={22} color={Colors.light.primary} style={{ marginBottom: 6 }} />
                  <Text style={styles.pricingLabel}>Venda</Text>
                  <Text style={[styles.pricingValue, { color: Colors.light.primary }]}>
                    {formatCurrency(product.price)}
                  </Text>
                </View>
                {product.cost_price != null && product.cost_price > 0 && (
                  <View style={[styles.pricingTile, styles.pricingTileMargin]}>
                    <Ionicons name="trending-up" size={22} color={Colors.light.success} style={{ marginBottom: 6 }} />
                    <Text style={styles.pricingLabel}>Margem</Text>
                    <Text style={[styles.pricingValue, { color: Colors.light.success }]}>
                      {(((product.price - product.cost_price) / product.cost_price) * 100).toFixed(0)}%
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.minStockNote}>Estoque mÃ­nimo: {minStock} unidades</Text>
            </Card.Content>
          </Card>
        )}

        {/* â”€â”€ GERAR ETIQUETA â”€â”€ */}
        <TouchableOpacity
          style={styles.labelCard}
          onPress={() => router.push(`/products/label/${productId}` as any)}
          activeOpacity={0.75}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: Colors.light.primary + '18' }]}>
            <Ionicons name="qr-code-outline" size={20} color={Colors.light.primary} />
          </View>
          <View style={styles.labelCardContent}>
            <Text style={styles.labelCardTitle}>Gerar Etiqueta</Text>
            <Text style={styles.labelCardSub}>QR Code para identificaÃ§Ã£o e venda</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

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
  // â”€â”€ Layout â”€â”€
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: Colors.light.textSecondary, fontSize: 14 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  // â”€â”€ Quick Stats Grid â”€â”€
  quickGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderLeftWidth: 4,
    elevation: 2,
  },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickInfo: { flex: 1 },
  quickLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  quickValue: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  quickSub: { fontSize: 10, color: Colors.light.textTertiary, marginTop: 2 },

  // â”€â”€ Cards â”€â”€
  card: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.light.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text, flex: 1 },
  countBadge: {
    backgroundColor: Colors.light.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.light.primary },

  // â”€â”€ Variants â”€â”€
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  variantRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  variantRowInactive: { opacity: 0.45 },
  variantDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  variantRowMain: { flex: 1 },
  variantRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 3,
  },
  variantRowSku: {
    fontSize: 11,
    color: Colors.light.textTertiary,
    fontFamily: 'monospace',
  },
  variantRowRight: { alignItems: 'flex-end', gap: 6 },
  variantRowPrice: { fontSize: 16, fontWeight: '700', color: Colors.light.primary },
  variantBadges: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  marginBadge: {
    backgroundColor: Colors.light.success + '18',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.success + '35',
  },
  marginBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.light.success },
  stockBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  stockBadgeText: { fontSize: 10, fontWeight: '700' },

  // â”€â”€ Info List â”€â”€
  infoList: { gap: 16 },
  descriptionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 10,
  },
  descriptionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },

  // â”€â”€ Pricing â”€â”€
  pricingRow: { flexDirection: 'row', gap: 10 },
  pricingTile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  pricingTileCost: {
    backgroundColor: Colors.light.warning + '10',
    borderColor: Colors.light.warning + '30',
  },
  pricingTileSale: {
    backgroundColor: Colors.light.primary + '08',
    borderColor: Colors.light.primary + '25',
  },
  pricingTileMargin: {
    backgroundColor: Colors.light.success + '10',
    borderColor: Colors.light.success + '30',
  },
  pricingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  pricingValue: { fontSize: 15, fontWeight: '800' },
  minStockNote: {
    fontSize: 12,
    color: Colors.light.textTertiary,
    marginTop: 12,
    textAlign: 'center',
  },

  // â”€â”€ Label Card â”€â”€
  labelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    elevation: 2,
  },
  labelCardContent: { flex: 1 },
  labelCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  labelCardSub: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },

  // â”€â”€ Error States â”€â”€
  errorTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.light.error, marginTop: 16 },
  errorMessage: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginHorizontal: 32,
  },
  errorLink: {
    fontSize: 14,
    color: Colors.light.primary,
    marginTop: 16,
    textDecorationLine: 'underline',
  },
  inactiveBadge: {
    backgroundColor: Colors.light.textSecondary + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  inactiveBadgeText: { fontSize: 10, fontWeight: '600', color: Colors.light.textSecondary },
});
