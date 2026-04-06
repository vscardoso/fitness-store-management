import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import useBackToList from '@/hooks/useBackToList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from 'react-native-paper';
import PageHeader from '@/components/layout/PageHeader';
import InfoRow from '@/components/ui/InfoRow';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getProductById, deleteProduct } from '@/services/productService';
import { getProductStock } from '@/services/inventoryService';
import { getProductVariants, formatVariantLabel } from '@/services/productVariantService';
import { formatCurrency, formatDate } from '@/utils/format';
import { getImageUrl } from '@/constants/Config';
import { Colors, theme } from '@/constants/Colors';
import { getEntryTypeLabel, getEntryTypeColor, getEntryTypeIcon } from '@/constants/entryTypes';
import { useTutorialContext } from '@/components/tutorial';
import { useBrandingColors } from '@/store/brandingStore';

export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/products');
  const brandingColors = useBrandingColors();
  const queryClient = useQueryClient();
  const { startTutorial } = useTutorialContext();

  // Validar ID do produto
  const productId = id ? parseInt(id as string) : NaN;
  const isValidId = !isNaN(productId) && productId > 0;

  // Se ID inválido, redirecionar imediatamente
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
    type: 'info',
    title: '',
    message: '',
    onConfirm: () => {},
  });

  /**
   * Query: Buscar produto por ID (funciona para produtos ativos e do catálogo)
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
   * Função de refresh
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchProduct(), refetchInventory(), refetchVariants()]);
    setRefreshing(false);
  };

  // Mutation de movimentação de estoque REMOVIDA - agora usa sistema FIFO com Entradas

  /**
   * Mutation: Deletar produto
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(productId),
    onSuccess: () => {
      // Navegar de volta IMEDIATAMENTE
      goBack();

      // Invalidar queries DEPOIS da navegação (com delay para garantir que a tela carregou)
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
        title: 'Não foi possível excluir',
        message: error.response?.data?.detail || error.message || 'Erro ao deletar produto',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => setDialog({ ...dialog, visible: false }),
      });
    },
  });

  /**
   * Confirmar deleção
   */
  const handleDelete = () => {
    const stock = inventory?.quantity ?? 0;
    const hasStock = stock > 0;

    setDialog({
      visible: true,
      type: hasStock ? 'warning' : 'danger',
      title: hasStock ? 'Excluir produto com estoque?' : 'Confirmar exclusão',
      message: hasStock
        ? `"${product?.name}" possui ${stock} unidade${stock !== 1 ? 's' : ''} em estoque sem vendas.\n\nO estoque será zerado e o produto excluído. Esta ação não pode ser desfeita.`
        : `Tem certeza que deseja excluir "${product?.name}"?`,
      confirmText: hasStock ? 'Sim, excluir e zerar estoque' : 'Excluir',
      cancelText: 'Cancelar',
      onConfirm: () => {
        setDialog({ ...dialog, visible: false });
        deleteMutation.mutate();
      },
    });
  };

  // Funções de movimentação de estoque REMOVIDAS - agora usa sistema FIFO com Entradas

  // Verificar ID inválido
  if (!isValidId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
        <Text style={styles.errorTitle}>ID inválido</Text>
        <Text style={styles.errorMessage}>O ID do produto fornecido não é válido.</Text>
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
  const hasSales = product.has_sales ?? false;
  const hasVariants = (variants ?? []).length > 0;
  const variantStockSum = (variants ?? []).reduce((sum, v) => sum + (v.current_stock ?? 0), 0);
  // inventory.quantity é a fonte autoritativa (atualizada por vendas e entradas FIFO).
  // Fallback para soma de variantes apenas se inventory ainda não carregou.
  const currentStock = inventory?.quantity ?? variantStockSum;
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
              return [product.brand, `${varCount} variações`].filter(Boolean).join(' • ') || undefined;
            }
            const parts = [product.brand, product.color, product.size].filter(Boolean);
            return parts.length > 0 ? parts.join(' • ') : undefined;
          })()
        }
        showBackButton
        onBack={goBack}
        rightActions={[
          { icon: 'help-circle-outline', onPress: () => startTutorial('product-details') },
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
        {/* ── ESTOQUE + PREÇO (quick cards) ── */}
        <View style={styles.quickGrid}>
          <View style={styles.quickCard}>
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
                <Text style={styles.quickSub}>mín: {minStock}</Text>
              )}
            </View>
          </View>

          <View style={styles.quickCard}>
            <View style={[styles.quickIconWrap, { backgroundColor: Colors.light.primary + '20' }]}>
              <Ionicons name="pricetag-outline" size={22} color={Colors.light.primary} />
            </View>
            <View style={styles.quickInfo}>
              <Text style={styles.quickLabel}>Preço</Text>
              <Text
                style={[styles.quickValue, { color: Colors.light.primary }]}
                numberOfLines={1}
              >
                {hasPriceRange
                  ? `${formatCurrency(minVariantPrice)} – ${formatCurrency(maxVariantPrice)}`
                  : formatCurrency(hasVariants ? minVariantPrice : product.price)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                <Ionicons name="image-outline" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.cardTitle}>Foto Vinculada</Text>
            </View>

            {product.image_url ? (
              <Image source={{ uri: getImageUrl(product.image_url) }} style={styles.productPhotoPreview} />
            ) : (
              <View style={styles.productPhotoPlaceholder}>
                <Ionicons name="image-outline" size={24} color={Colors.light.textTertiary} />
                <Text style={styles.productPhotoPlaceholderText}>Sem foto principal vinculada</Text>
              </View>
            )}

            <View style={styles.actionList}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => router.push(`/products/edit/${productId}` as any)}
                activeOpacity={0.75}
              >
                <View style={[styles.actionCardIcon, { backgroundColor: brandingColors.primary + '16' }]}>
                  <Ionicons name="create-outline" size={18} color={brandingColors.primary} />
                </View>
                <View style={styles.actionCardContent}>
                  <Text style={styles.actionCardTitle}>Editar foto</Text>
                  <Text style={styles.actionCardSub}>Trocar ou adicionar foto do produto</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
              </TouchableOpacity>

              {hasVariants && (
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.push(`/products/photos/${productId}` as any)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.actionCardIcon, { backgroundColor: Colors.light.info + '16' }]}>
                    <Ionicons name="images-outline" size={18} color={Colors.light.info} />
                  </View>
                  <View style={styles.actionCardContent}>
                    <Text style={styles.actionCardTitle}>Fotos das variações</Text>
                    <Text style={styles.actionCardSub}>Gerenciar foto de cada variação</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* ── VARIAÇÕES — grid 2 colunas ── */}
        {hasVariants && (
          <View style={styles.card}>
            <View style={styles.cardInner}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="layers-outline" size={20} color={Colors.light.primary} />
                </View>
                <Text style={styles.cardTitle}>Variações</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{variants?.length}</Text>
                </View>
              </View>

              <View style={styles.variantGrid}>
                {[...(variants ?? [])].sort((a, b) => a.id - b.id).map((variant) => {
                  const vStock = variant.current_stock ?? 0;
                  // Se nenhuma variante tem estoque próprio mas o produto tem estoque,
                  // o estoque foi registrado no nível do produto (entry_items sem variant_id).
                  // Nesse caso: 1 variante → mostra o total; N variantes → mostra '—'.
                  const variantCount = (variants ?? []).length;
                  const effectiveStock = variantStockSum > 0
                    ? vStock
                    : variantCount === 1
                      ? currentStock
                      : null; // múltiplas variantes sem rastreamento por variante
                  const displayStock = effectiveStock ?? 0;
                  const isEmpty = effectiveStock === null ? currentStock === 0 : displayStock === 0;
                  const isLowV = !isEmpty && displayStock > 0 && displayStock <= 3;
                  const vPrice = Number(variant.price) || 0;
                  const vCost = Number((variant as any).cost_price) || 0;
                  const margin = vCost > 0 && vPrice > 0 ? Math.round(((vPrice - vCost) / vPrice) * 100) : null;
                  const stockColor = isEmpty
                    ? Colors.light.error
                    : isLowV
                    ? Colors.light.warning
                    : Colors.light.success;

                  return (
                    <View
                      key={variant.id}
                      style={[
                        styles.variantCard,
                        !variant.is_active && styles.variantCardInactive,
                      ]}
                    >
                      {/* Topo: indicador de status + label */}
                      <View style={styles.variantCardTop}>
                        <View style={[styles.variantStatusDot, { backgroundColor: stockColor }]} />
                        <Text style={styles.variantCardLabel} numberOfLines={2}>
                          {formatVariantLabel(variant)}
                        </Text>
                      </View>

                      {/* SKU */}
                      <Text style={styles.variantCardSku} numberOfLines={1}>{variant.sku}</Text>

                      {/* Preço */}
                      <Text style={styles.variantCardPrice}>{formatCurrency(vPrice)}</Text>

                      {/* Rodapé: margem + estoque */}
                      <View style={styles.variantCardFooter}>
                        {margin !== null && (
                          <View style={styles.variantMarginPill}>
                            <Ionicons name="trending-up" size={9} color={Colors.light.success} />
                            <Text style={styles.variantMarginText}>{margin}%</Text>
                          </View>
                        )}
                        <View style={[styles.variantStockPill, { backgroundColor: stockColor + '20', borderColor: stockColor + '50' }]}>
                          <Text style={[styles.variantStockText, { color: effectiveStock === null ? Colors.light.textSecondary : stockColor }]}>
                            {effectiveStock === null ? '—' : `${displayStock} un`}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* ── INFORMAÇÕES DO PRODUTO ── */}
        <View style={styles.card}>
          <View style={styles.cardInner}>
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
                <InfoRow icon="scan-outline" label="Cód. de Barras" value={product.barcode} layout="vertical" />
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
          </View>
        </View>

        {/* ── PREÇOS (somente produto simples) ── */}
        {!hasVariants && (
          <View style={styles.card}>
            <View style={styles.cardInner}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
                </View>
                <Text style={styles.cardTitle}>Preços</Text>
              </View>
              <View style={styles.pricingRow}>
                {product.cost_price != null && product.cost_price > 0 && (
                  <View style={styles.pricingTile}>
                    <Ionicons name="trending-down" size={22} color={Colors.light.warning} style={{ marginBottom: 6 }} />
                    <Text style={styles.pricingLabel}>Custo</Text>
                    <Text style={[styles.pricingValue, { color: Colors.light.warning }]}>
                      {formatCurrency(product.cost_price)}
                    </Text>
                  </View>
                )}
                <View style={styles.pricingTile}>
                  <Ionicons name="pricetag" size={22} color={Colors.light.primary} style={{ marginBottom: 6 }} />
                  <Text style={styles.pricingLabel}>Venda</Text>
                  <Text style={[styles.pricingValue, { color: Colors.light.primary }]}>
                    {formatCurrency(product.price)}
                  </Text>
                </View>
                {product.cost_price != null && product.cost_price > 0 && (
                  <View style={styles.pricingTile}>
                    <Ionicons name="trending-up" size={22} color={Colors.light.success} style={{ marginBottom: 6 }} />
                    <Text style={styles.pricingLabel}>Margem</Text>
                    <Text style={[styles.pricingValue, { color: Colors.light.success }]}>
                      {(((product.price - product.cost_price) / product.price) * 100).toFixed(0)}%
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.minStockNote}>Estoque mínimo: {minStock} unidades</Text>
            </View>
          </View>
        )}

        {/* ── ENTRADAS DE ESTOQUE ── */}
        {(() => {
          const entryItems: any[] = (product as any).entry_items ?? [];
          if (entryItems.length === 0) return null;

          const totalReceived = entryItems.reduce((s: number, e: any) => s + e.quantity_received, 0);
          const totalRemaining = entryItems.reduce((s: number, e: any) => s + e.quantity_remaining, 0);
          const totalSold = totalReceived - totalRemaining;

          return (
            <View style={styles.card}>
              <View style={styles.cardInner}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderIcon}>
                    <Ionicons name="archive-outline" size={20} color={Colors.light.primary} />
                  </View>
                  <Text style={styles.cardTitle}>Histórico de Entradas</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{entryItems.length}</Text>
                  </View>
                </View>

                {/* Resumo compacto */}
                <View style={styles.entrySummaryRow}>
                  <View style={styles.entrySummaryItem}>
                    <Text style={styles.entrySummaryValue}>{totalReceived}</Text>
                    <Text style={styles.entrySummaryLabel}>recebido</Text>
                  </View>
                  <View style={styles.entrySummaryDivider} />
                  <View style={styles.entrySummaryItem}>
                    <Text style={[styles.entrySummaryValue, { color: Colors.light.error }]}>{totalSold}</Text>
                    <Text style={styles.entrySummaryLabel}>vendido</Text>
                  </View>
                  <View style={styles.entrySummaryDivider} />
                  <View style={styles.entrySummaryItem}>
                    <Text style={[styles.entrySummaryValue, { color: Colors.light.success }]}>{totalRemaining}</Text>
                    <Text style={styles.entrySummaryLabel}>em estoque</Text>
                  </View>
                </View>

                {/* Cards de entrada */}
                <View style={styles.entryList}>
                  {entryItems.map((entry: any) => {
                    const typeColor = getEntryTypeColor(entry.entry_type);
                    const typeIcon = getEntryTypeIcon(entry.entry_type);
                    const typeLabel = getEntryTypeLabel(entry.entry_type);
                    const remaining = entry.quantity_remaining as number;
                    const received = entry.quantity_received as number;
                    const consumedPct = received > 0 ? (received - remaining) / received : 0;
                    const isExausted = remaining === 0;
                    const progressColor = isExausted
                      ? Colors.light.textTertiary
                      : consumedPct >= 0.7
                        ? Colors.light.warning
                        : Colors.light.success;
                    const variantLabel = hasVariants && entry.variant_id
                      ? formatVariantLabel((variants ?? []).find((v: any) => v.id === entry.variant_id) ?? {})
                      : null;

                    return (
                      <TouchableOpacity
                        key={entry.entry_item_id}
                        style={[styles.entryCard, isExausted && styles.entryCardExausted]}
                        onPress={() => router.push({ pathname: `/entries/${entry.entry_id}` as any, params: { from: `/products/${id}` } })}
                        activeOpacity={0.7}
                      >
                        {/* Ícone do tipo */}
                        <View style={[styles.entryIconWrap, { backgroundColor: typeColor + '18' }]}>
                          <Ionicons name={typeIcon as any} size={18} color={isExausted ? Colors.light.textTertiary : typeColor} />
                        </View>

                        {/* Conteúdo principal */}
                        <View style={styles.entryContent}>
                          {/* Linha 1: badge tipo + data */}
                          <View style={styles.entryTopRow}>
                            <View style={[styles.entryTypeBadge, { backgroundColor: typeColor + '18' }]}>
                              <Text style={[styles.entryTypeBadgeText, { color: isExausted ? Colors.light.textTertiary : typeColor }]}>
                                {typeLabel}
                              </Text>
                            </View>
                            {entry.entry_date && (
                              <Text style={styles.entryDate}>{formatDate(entry.entry_date)}</Text>
                            )}
                          </View>

                          {/* Linha 2: código + fornecedor + variante */}
                          <View style={styles.entryCodeRow}>
                            <Text style={[styles.entryCode, isExausted && { color: Colors.light.textSecondary }]}>
                              {entry.entry_code}
                            </Text>
                            {entry.supplier_name ? (
                              <Text style={styles.entrySupplier} numberOfLines={1}> · {entry.supplier_name}</Text>
                            ) : null}
                            {variantLabel ? (
                              <Text style={styles.entryVariantTag} numberOfLines={1}> · {variantLabel}</Text>
                            ) : null}
                          </View>

                          {/* Linha 3: barra de consumo */}
                          <View style={styles.entryProgressRow}>
                            <View style={styles.entryProgressTrack}>
                              <View
                                style={[
                                  styles.entryProgressFill,
                                  {
                                    width: `${Math.round((1 - consumedPct) * 100)}%` as any,
                                    backgroundColor: progressColor,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={[styles.entryProgressLabel, { color: isExausted ? Colors.light.textTertiary : Colors.light.text }]}>
                              {isExausted ? 'Esgotado' : `${remaining} de ${received} restantes`}
                            </Text>
                          </View>

                          {/* Linha 4: custo unitário (se houver) */}
                          {entry.unit_cost > 0 && (
                            <Text style={styles.entryCostLabel}>
                              Custo unit.: {formatCurrency(entry.unit_cost)}
                            </Text>
                          )}
                        </View>

                        <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          );
        })()}

        {/* ── ETIQUETAS & QR CODE ── */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={[styles.cardHeaderIcon, { backgroundColor: brandingColors.primary + '15' }]}>
                <Ionicons name="print-outline" size={20} color={brandingColors.primary} />
              </View>
              <Text style={styles.cardTitle}>Impressao e Codigo</Text>
            </View>

            <View style={styles.actionList}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => router.push(`/products/qrcode/${productId}` as any)}
                activeOpacity={0.75}
              >
                <View style={[styles.actionCardIcon, { backgroundColor: Colors.light.info + '16' }]}>
                  <Ionicons name="qr-code-outline" size={18} color={Colors.light.info} />
                </View>
                <View style={styles.actionCardContent}>
                  <Text style={styles.actionCardTitle}>Identificação</Text>
                  <Text style={styles.actionCardSub}>QR e etiqueta na mesma tela</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => router.push('/products/label' as any)}
                activeOpacity={0.75}
              >
                <View style={[styles.actionCardIcon, { backgroundColor: Colors.light.success + '16' }]}>
                  <Ionicons name="albums-outline" size={18} color={Colors.light.success} />
                </View>
                <View style={styles.actionCardContent}>
                  <Text style={styles.actionCardTitle}>Estudio</Text>
                  <Text style={styles.actionCardSub}>Criar etiquetas em lote</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
              </TouchableOpacity>
            </View>
          </Card.Content>
        </Card>

        {/* Botões de ação */}
        <View style={styles.actions}>
          {hasVariants && (
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryActionButton]}
              onPress={() => router.push(`/products/photos/${productId}` as any)}
              activeOpacity={0.75}
            >
              <Ionicons name="images-outline" size={18} color={brandingColors.primary} />
              <Text style={[styles.secondaryActionButtonText, { color: brandingColors.primary }]}>Fotos</Text>
            </TouchableOpacity>
          )}
          {!hasSales && (
            <TouchableOpacity
              style={[styles.actionButton, styles.dangerActionButton]}
              onPress={handleDelete}
              activeOpacity={0.75}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.light.error} />
              <Text style={styles.dangerActionButtonText}>Excluir</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryActionButton]}
            onPress={() => router.push(`/products/edit/${productId}` as any)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={brandingColors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryActionButtonGradient}
            >
              <Ionicons name="pencil-outline" size={18} color="#fff" />
              <Text style={styles.primaryActionButtonText}>Editar</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={{ height: theme.spacing.md }} />
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
  // ── Layout ──
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: Colors.light.textSecondary, fontSize: 14 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  // ── Quick Stats Grid ──
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
  productPhotoPreview: {
    width: '100%',
    height: 220,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  productPhotoPlaceholder: {
    width: '100%',
    minHeight: 120,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.lg,
  },
  productPhotoPlaceholderText: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  quickValue: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  quickSub: { fontSize: 10, color: Colors.light.textTertiary, marginTop: 2 },

  // ── Cards ──
  card: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  cardInner: {
    padding: theme.spacing.md,
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

  // ── Variants grid ──
  variantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  variantCard: {
    width: '48%',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 6,
  },
  variantCardInactive: { opacity: 0.45 },
  variantCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  variantStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    flexShrink: 0,
  },
  variantCardLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
    lineHeight: 19,
  },
  variantCardSku: {
    fontSize: 10,
    color: Colors.light.textTertiary,
    fontFamily: 'monospace',
    letterSpacing: 0.3,
    marginLeft: 15,
  },
  variantCardPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.light.primary,
    marginLeft: 15,
  },
  variantCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 15,
    marginTop: 2,
  },
  variantMarginPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.light.success + '18',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.success + '35',
  },
  variantMarginText: { fontSize: 10, fontWeight: '700', color: Colors.light.success },
  variantStockPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  variantStockText: { fontSize: 10, fontWeight: '700' },

  // ── Info List ──
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

  // ── Pricing ──
  pricingRow: { flexDirection: 'row', gap: 10 },
  pricingTile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.border,
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

  // ── Acoes (Etiqueta, QR, Estudio) ──
  actionList: {
    gap: 10,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  actionCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardContent: {
    flex: 1,
    minWidth: 0,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  actionCardSub: {
    marginTop: 1,
    fontSize: 12,
    color: Colors.light.textSecondary,
  },

  // ── Botões de Ação (final da página) ──
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    minHeight: 52,
    overflow: 'hidden',
  },
  primaryActionButton: {
    ...theme.shadows.sm,
  },
  primaryActionButtonGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
  },
  primaryActionButtonText: {
    fontSize: theme.fontSize.base,
    color: '#fff',
    fontWeight: '700',
  },
  secondaryActionButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  dangerActionButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.error + '50',
    backgroundColor: Colors.light.error + '08',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerActionButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: Colors.light.error,
  },

  // ── Entradas de Estoque ──
  entrySummaryRow: {
    flexDirection: 'row',
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 16,
  },
  entrySummaryItem: { flex: 1, alignItems: 'center' },
  entrySummaryValue: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  entrySummaryLabel: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 2 },
  entrySummaryDivider: { width: 1, backgroundColor: Colors.light.border, marginVertical: 4 },
  entryList: { gap: 10 },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  entryCardExausted: { opacity: 0.55 },
  entryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  entryContent: { flex: 1, gap: 4 },
  entryTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryTypeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  entryTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  entryDate: { fontSize: 11, color: Colors.light.textSecondary, marginLeft: 'auto' as any },
  entryCodeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  entryCode: { fontSize: 13, fontWeight: '700', color: Colors.light.text },
  entrySupplier: { fontSize: 12, color: Colors.light.textSecondary },
  entryVariantTag: { fontSize: 12, color: Colors.light.primary, fontWeight: '500' },
  entryProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  entryProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.light.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  entryProgressFill: { height: '100%' as any, borderRadius: 2 },
  entryProgressLabel: { fontSize: 11, fontWeight: '600', flexShrink: 0 },
  entryCostLabel: { fontSize: 11, color: Colors.light.textSecondary },

  // ── Error States ──
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
