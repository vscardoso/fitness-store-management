/**
 * Tela de Produtos Mais Vendidos
 * Ranking com metricas detalhadas
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import useBackToList from '@/hooks/useBackToList';
import {
  getTopProducts,
  TopProductsPeriod,
  TopProductsResponse,
  TopProductDetail,
} from '@/services/reportService';

const periodOptions: { value: TopProductsPeriod; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'this_month', label: 'Este mes', icon: 'calendar-outline' },
  { value: 'last_30_days', label: '30 dias', icon: 'time-outline' },
  { value: 'last_3_months', label: '3 meses', icon: 'calendar-number-outline' },
  { value: 'last_6_months', label: '6 meses', icon: 'calendar-clear-outline' },
  { value: 'this_year', label: 'Este ano', icon: 'today-outline' },
  { value: 'all_time', label: 'Sempre', icon: 'infinite-outline' },
];

const rankingColors = {
  1: { bg: '#FCD34D', text: '#11181C', icon: 'trophy-outline' as const },
  2: { bg: '#D1D5DB', text: '#11181C', icon: 'medal-outline' as const },
  3: { bg: '#D97706', text: '#fff', icon: 'ribbon-outline' as const },
};

function ProductCard({ product, onPress }: { product: TopProductDetail; onPress: () => void }) {
  const isTopThree = product.ranking <= 3;
  const rankStyle = rankingColors[product.ranking as 1 | 2 | 3];
  const variantLabel = product.variant_label || [product.variant_color, product.variant_size].filter(Boolean).join(' • ');

  return (
    <TouchableOpacity style={[styles.productCard, isTopThree && styles.productCardTop]} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.productMainRow}>
        <View
          style={[
            styles.rankBadge,
            isTopThree
              ? { backgroundColor: rankStyle.bg }
              : { backgroundColor: Colors.light.backgroundSecondary },
          ]}
        >
          {isTopThree ? (
            <Ionicons name={rankStyle.icon} size={16} color={rankStyle.text} />
          ) : (
            <Text style={styles.rankNumber}>{product.ranking}</Text>
          )}
        </View>

        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{product.product_name}</Text>
          {(variantLabel || product.sku) && (
            <View style={styles.variantRow}>
              {variantLabel ? (
                <View style={styles.variantChip}>
                  <Ionicons name="color-filter-outline" size={11} color={Colors.light.info} />
                  <Text style={styles.variantChipText} numberOfLines={1}>{variantLabel}</Text>
                </View>
              ) : null}
              {product.sku ? (
                <View style={styles.skuChip}>
                  <Text style={styles.skuChipText} numberOfLines={1}>SKU {product.sku}</Text>
                </View>
              ) : null}
            </View>
          )}
          <View style={styles.productMetaRow}>
            {product.brand ? <Text style={styles.productBrand} numberOfLines={1}>{product.brand}</Text> : null}
            <Text style={styles.productCategory} numberOfLines={1}>{product.category}</Text>
          </View>

          <View style={styles.progressBackground}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(0, Math.min(100, product.progress))}%` },
                isTopThree && { backgroundColor: rankStyle.bg },
              ]}
            />
          </View>
        </View>

        <View style={styles.productRightCol}>
          <Text style={styles.quantitySold}>{product.quantity_sold}</Text>
          <Text style={styles.quantityLabel}>vendidos</Text>
          <Text style={styles.revenue}>{formatCurrency(product.total_revenue)}</Text>
        </View>
      </View>

      <View style={styles.detailRow}>
        <View style={styles.detailItem}>
          <Ionicons name="trending-up-outline" size={14} color={VALUE_COLORS.positive} />
          <Text style={styles.detailLabel}>Lucro</Text>
          <Text style={[styles.detailValue, { color: VALUE_COLORS.positive }]}>{formatCurrency(product.total_profit)}</Text>
        </View>

        <View style={styles.detailItem}>
          <Ionicons name="pie-chart-outline" size={14} color={Colors.light.info} />
          <Text style={styles.detailLabel}>Margem</Text>
          <Text style={[styles.detailValue, { color: Colors.light.info }]}>{product.profit_margin.toFixed(1)}%</Text>
        </View>

        <View style={styles.detailItem}>
          <Ionicons name="analytics-outline" size={14} color={VALUE_COLORS.warning} />
          <Text style={styles.detailLabel}>Share</Text>
          <Text style={[styles.detailValue, { color: VALUE_COLORS.warning }]}>{product.share_revenue.toFixed(1)}%</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SummaryStats({ data, brandingPrimary }: { data: TopProductsResponse; brandingPrimary: string }) {
  return (
    <View style={styles.summaryGrid}>
      <View style={styles.summaryCard}>
        <Ionicons name="cube-outline" size={18} color={brandingPrimary} />
        <Text style={styles.summaryValue}>{data.total_products}</Text>
        <Text style={styles.summaryLabel}>Produtos</Text>
      </View>

      <View style={styles.summaryCard}>
        <Ionicons name="cart-outline" size={18} color={VALUE_COLORS.positive} />
        <Text style={styles.summaryValue}>{data.total_quantity_sold}</Text>
        <Text style={styles.summaryLabel}>Unid. vendidas</Text>
      </View>

      <View style={styles.summaryCardWide}>
        <Ionicons name="cash-outline" size={18} color={VALUE_COLORS.positive} />
        <Text style={styles.summaryValueWide} numberOfLines={1} adjustsFontSizeToFit>
          {formatCurrency(data.total_revenue)}
        </Text>
        <Text style={styles.summaryLabel}>Receita total</Text>
      </View>
    </View>
  );
}

export default function TopProductsScreen() {
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/reports');
  const brandingColors = useBrandingColors();

  const [selectedPeriod, setSelectedPeriod] = useState<TopProductsPeriod>('this_month');
  const [refreshing, setRefreshing] = useState(false);

  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(24);

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['top-products', selectedPeriod],
    queryFn: () => getTopProducts(selectedPeriod, 20),
  });

  useFocusEffect(
    useCallback(() => {
      headerOpacity.value  = 0;
      headerScale.value    = 0.94;
      contentOpacity.value = 0;
      contentTransY.value  = 24;

      headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
      headerScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
      const t = setTimeout(() => {
        contentOpacity.value = withTiming(1, { duration: 340 });
        contentTransY.value  = withSpring(0, { damping: 18, stiffness: 200 });
      }, 140);
      return () => clearTimeout(t);
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const subtitle = data?.period_label || 'Ranking por desempenho';

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Produtos Mais Vendidos"
          subtitle={subtitle}
          showBackButton
          onBack={goBack}
          rightActions={[{ icon: 'trending-up-outline', onPress: () => undefined }]}
        />
      </Animated.View>

      <Animated.View style={[styles.contentAnimation, contentAnimStyle]}>
        <View style={styles.filtersArea}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
            {periodOptions.map((option) => {
              const selected = selectedPeriod === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.filterChip,
                    selected && {
                      backgroundColor: brandingColors.primary + '14',
                      borderColor: brandingColors.primary + '35',
                    },
                  ]}
                  onPress={() => setSelectedPeriod(option.value)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={option.icon}
                    size={14}
                    color={selected ? brandingColors.primary : Colors.light.textSecondary}
                  />
                  <Text style={[styles.filterChipText, selected && { color: brandingColors.primary }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {isLoading ? (
          <View style={styles.stateCard}>
            <Ionicons name="hourglass-outline" size={38} color={brandingColors.primary} />
            <Text style={styles.stateText}>Carregando ranking...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="alert-circle-outline" size={38} color={VALUE_COLORS.negative} />
            <Text style={styles.stateText}>Erro ao carregar dados</Text>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: brandingColors.primary }]} onPress={() => refetch()}>
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : data && data.products.length > 0 ? (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[brandingColors.primary]}
                tintColor={brandingColors.primary}
              />
            }
          >
            <SummaryStats data={data} brandingPrimary={brandingColors.primary} />

            <View style={styles.sectionHeaderRow}>
              <Ionicons name="trophy-outline" size={16} color={brandingColors.primary} />
              <Text style={styles.sectionHeaderTitle}>Ranking</Text>
            </View>

            {data.products.map((product) => (
              <ProductCard
                key={`${product.product_id}-${product.variant_id ?? 'base'}`}
                product={product}
                onPress={() => router.push(`/products/${product.product_id}` as any)}
              />
            ))}

            {data.products.length >= 3 && (
              <View style={styles.insightsCard}>
                <View style={styles.insightsHeader}>
                  <Ionicons name="bulb-outline" size={16} color={VALUE_COLORS.warning} />
                  <Text style={styles.insightsTitle}>Insights</Text>
                </View>

                <Text style={styles.insightText}>
                  O produto <Text style={styles.insightHighlight}>{data.products[0].product_name}</Text> representa{' '}
                  <Text style={styles.insightHighlight}>{data.products[0].share_revenue.toFixed(1)}%</Text> da receita total.
                </Text>

                <Text style={styles.insightText}>
                  Top 3 produtos somam{' '}
                  <Text style={styles.insightHighlight}>
                    {(
                      data.products[0].share_revenue +
                      data.products[1].share_revenue +
                      data.products[2].share_revenue
                    ).toFixed(1)}%
                  </Text>{' '}
                  das vendas.
                </Text>

                {data.products.some((p) => p.profit_margin > 40) ? (
                  <Text style={styles.insightText}>
                    {data.products.filter((p) => p.profit_margin > 40).length} produtos estao com margem acima de 40%.
                  </Text>
                ) : null}
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.emptyStateCard}>
            <View style={[styles.emptyIconWrap, { backgroundColor: brandingColors.primary + '12' }]}>
              <Ionicons name="cube-outline" size={28} color={brandingColors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Sem dados</Text>
            <Text style={styles.emptyText}>Nenhum produto vendido no periodo selecionado.</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerAnimation: {
    zIndex: 2,
  },
  contentAnimation: {
    flex: 1,
  },
  filtersArea: {
    paddingTop: theme.spacing.sm,
  },
  filtersRow: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  filterChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs + 2,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.xs + 2,
  },
  stateCard: {
    margin: theme.spacing.md,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
    gap: theme.spacing.sm,
  },
  stateText: {
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  retryButton: {
    marginTop: theme.spacing.xs,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: theme.fontSize.sm,
  },
  emptyStateCard: {
    margin: theme.spacing.md,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
    marginBottom: theme.spacing.xs,
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs + 2,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 2,
    ...theme.shadows.sm,
    alignItems: 'center',
    gap: 2,
  },
  summaryCardWide: {
    width: '100%',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 2,
    ...theme.shadows.sm,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    color: Colors.light.text,
    letterSpacing: -0.4,
  },
  summaryValueWide: {
    width: '100%',
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    color: VALUE_COLORS.positive,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  sectionHeaderTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
    overflow: 'hidden',
  },
  productCardTop: {
    borderColor: VALUE_COLORS.warning + '60',
  },
  productMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
    padding: theme.spacing.sm + 2,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rankNumber: {
    fontSize: theme.fontSize.base,
    fontWeight: '800',
    color: Colors.light.textSecondary,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  productName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  productMetaRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  variantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xxs + 2,
    marginTop: 1,
  },
  variantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: Colors.light.info + '14',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 3,
    maxWidth: 170,
  },
  variantChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.light.info,
  },
  skuChip: {
    borderRadius: theme.borderRadius.full,
    backgroundColor: VALUE_COLORS.warning + '1f',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 3,
    maxWidth: 120,
  },
  skuChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: VALUE_COLORS.warning,
  },
  productBrand: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.info,
    fontWeight: '700',
    flexShrink: 1,
  },
  productCategory: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  progressBackground: {
    height: 6,
    borderRadius: 4,
    backgroundColor: Colors.light.backgroundSecondary,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.light.info,
    borderRadius: 4,
  },
  productRightCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  quantitySold: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.info,
    letterSpacing: -0.4,
  },
  quantityLabel: {
    fontSize: theme.fontSize.xxs + 1,
    color: Colors.light.textSecondary,
    marginTop: -2,
  },
  revenue: {
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
    color: VALUE_COLORS.positive,
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs + 3,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  detailItem: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  detailLabel: {
    fontSize: theme.fontSize.xxs + 1,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailValue: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  insightsCard: {
    marginTop: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 2,
    ...theme.shadows.sm,
    gap: theme.spacing.xs + 1,
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: 2,
  },
  insightsTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  insightText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    lineHeight: 19,
  },
  insightHighlight: {
    color: Colors.light.text,
    fontWeight: '800',
  },
});
