/**
 * Tela de Produtos Mais Vendidos
 * Ranking com métricas detalhadas e visualização premium
 */

import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { Text, Card, Chip, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import {
  getTopProducts,
  TopProductsPeriod,
  TopProductsResponse,
  TopProductDetail,
} from '@/services/reportService';

/**
 * Opções de período para filtro
 */
const periodOptions: { value: TopProductsPeriod; label: string; icon: string }[] = [
  { value: 'this_month', label: 'Este mês', icon: 'calendar' },
  { value: 'last_30_days', label: '30 dias', icon: 'time' },
  { value: 'last_3_months', label: '3 meses', icon: 'calendar-outline' },
  { value: 'last_6_months', label: '6 meses', icon: 'calendar-outline' },
  { value: 'this_year', label: 'Este ano', icon: 'today' },
  { value: 'all_time', label: 'Sempre', icon: 'infinite' },
];

/**
 * Cores para os rankings
 */
const rankingColors = {
  1: { bg: '#FFD700', text: '#000', icon: 'trophy' },
  2: { bg: '#C0C0C0', text: '#000', icon: 'medal' },
  3: { bg: '#CD7F32', text: '#fff', icon: 'ribbon' },
};

/**
 * Componente de card de produto
 */
function ProductCard({ product, onPress }: { product: TopProductDetail; onPress: () => void }) {
  const isTopThree = product.ranking <= 3;
  const rankStyle = rankingColors[product.ranking as 1 | 2 | 3];

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <Card style={[styles.productCard, isTopThree && styles.productCardTop]}>
        <View style={styles.productContent}>
          {/* Ranking Badge */}
          <View
            style={[
              styles.rankingBadge,
              isTopThree
                ? { backgroundColor: rankStyle?.bg }
                : { backgroundColor: Colors.light.backgroundSecondary },
            ]}
          >
            {isTopThree ? (
              <Ionicons name={rankStyle?.icon as any} size={18} color={rankStyle?.text} />
            ) : (
              <Text
                style={[
                  styles.rankingText,
                  { color: Colors.light.textSecondary },
                ]}
              >
                {product.ranking}
              </Text>
            )}
          </View>

          {/* Info do Produto */}
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={1}>
              {product.product_name}
            </Text>
            <View style={styles.productMeta}>
              {product.brand && (
                <Text style={styles.productBrand}>{product.brand}</Text>
              )}
              <Text style={styles.productCategory}>{product.category}</Text>
            </View>

            {/* Barra de Progresso */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBackground}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${product.progress}%` },
                    isTopThree && { backgroundColor: rankStyle?.bg },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Métricas */}
          <View style={styles.productMetrics}>
            <Text style={styles.quantitySold}>{product.quantity_sold}</Text>
            <Text style={styles.quantityLabel}>vendidos</Text>
            <Text style={styles.revenue}>{formatCurrency(product.total_revenue)}</Text>
          </View>
        </View>

        {/* Linha de detalhes expandidos */}
        <View style={styles.productDetails}>
          <View style={styles.detailItem}>
            <Ionicons name="trending-up" size={14} color={Colors.light.success} />
            <Text style={styles.detailLabel}>Lucro</Text>
            <Text style={[styles.detailValue, { color: Colors.light.success }]}>
              {formatCurrency(product.total_profit)}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="pie-chart" size={14} color={Colors.light.info} />
            <Text style={styles.detailLabel}>Margem</Text>
            <Text style={[styles.detailValue, { color: Colors.light.info }]}>
              {product.profit_margin.toFixed(1)}%
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="analytics" size={14} color={Colors.light.warning} />
            <Text style={styles.detailLabel}>Share</Text>
            <Text style={[styles.detailValue, { color: Colors.light.warning }]}>
              {product.share_revenue.toFixed(1)}%
            </Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

/**
 * Componente de estatísticas resumidas
 */
function SummaryStats({ data }: { data: TopProductsResponse }) {
  return (
    <View style={styles.summaryContainer}>
      <View style={styles.summaryCard}>
        <Ionicons name="cube" size={24} color={Colors.light.primary} />
        <Text style={styles.summaryValue}>{data.total_products}</Text>
        <Text style={styles.summaryLabel}>Produtos</Text>
      </View>
      <View style={styles.summaryCard}>
        <Ionicons name="cart" size={24} color={Colors.light.success} />
        <Text style={styles.summaryValue}>{data.total_quantity_sold}</Text>
        <Text style={styles.summaryLabel}>Unid. Vendidas</Text>
      </View>
      <View style={styles.summaryCard}>
        <Ionicons name="cash" size={24} color={Colors.light.warning} />
        <Text style={styles.summaryValueSmall}>{formatCurrency(data.total_revenue)}</Text>
        <Text style={styles.summaryLabel}>Receita Total</Text>
      </View>
    </View>
  );
}

export default function TopProductsScreen() {
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<TopProductsPeriod>('this_month');
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['top-products', selectedPeriod],
    queryFn: () => getTopProducts(selectedPeriod, 20),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleProductPress = (productId: number) => {
    router.push(`/products/${productId}`);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>Produtos Mais Vendidos</Text>
              <Text style={styles.headerSubtitle}>
                {data?.period_label || 'Carregando...'}
              </Text>
            </View>
            <View style={styles.headerIcon}>
              <Ionicons name="trending-up" size={28} color="rgba(255,255,255,0.9)" />
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Filtro de Período */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {periodOptions.map((option) => (
            <Chip
              key={option.value}
              selected={selectedPeriod === option.value}
              onPress={() => setSelectedPeriod(option.value)}
              style={[
                styles.filterChip,
                selectedPeriod === option.value && styles.filterChipSelected,
              ]}
              textStyle={[
                styles.filterChipText,
                selectedPeriod === option.value && styles.filterChipTextSelected,
              ]}
              icon={() => (
                <Ionicons
                  name={option.icon as any}
                  size={16}
                  color={
                    selectedPeriod === option.value
                      ? '#fff'
                      : Colors.light.textSecondary
                  }
                />
              )}
            >
              {option.label}
            </Chip>
          ))}
        </ScrollView>
      </View>

      {/* Conteúdo */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando ranking...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.light.error} />
          <Text style={styles.errorText}>Erro ao carregar dados</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : data && data.products.length > 0 ? (
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
          {/* Estatísticas Resumidas */}
          <SummaryStats data={data} />

          {/* Ranking de Produtos */}
          <View style={styles.rankingSection}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="trophy" size={18} color={Colors.light.primary} /> Ranking
            </Text>

            {data.products.map((product) => (
              <ProductCard
                key={product.product_id}
                product={product}
                onPress={() => handleProductPress(product.product_id)}
              />
            ))}
          </View>

          {/* Insights */}
          {data.products.length >= 3 && (
            <Card style={styles.insightsCard}>
              <View style={styles.insightsContent}>
                <View style={styles.insightsHeader}>
                  <Ionicons name="bulb" size={20} color={Colors.light.secondary} />
                  <Text style={styles.insightsTitle}>Insights</Text>
                </View>
                <View style={styles.insightItem}>
                  <Text style={styles.insightText}>
                    O produto <Text style={styles.insightHighlight}>{data.products[0].product_name}</Text> representa{' '}
                    <Text style={styles.insightHighlight}>{data.products[0].share_revenue.toFixed(1)}%</Text> da receita total.
                  </Text>
                </View>
                <View style={styles.insightItem}>
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
                </View>
                {data.products.some(p => p.profit_margin > 40) && (
                  <View style={styles.insightItem}>
                    <Text style={styles.insightText}>
                      <Ionicons name="star" size={14} color={Colors.light.success} />{' '}
                      {data.products.filter(p => p.profit_margin > 40).length} produtos com margem acima de 40%.
                    </Text>
                  </View>
                )}
              </View>
            </Card>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={64} color={Colors.light.textTertiary} />
          <Text style={styles.emptyTitle}>Sem dados</Text>
          <Text style={styles.emptyText}>
            Nenhum produto vendido no período selecionado.
          </Text>
        </View>
      )}
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
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xxs,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    paddingVertical: 12,
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderColor: Colors.light.border,
    marginRight: 8,
  },
  filterChipSelected: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  filterChipText: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  filterChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  errorText: {
    color: Colors.light.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.light.primary,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  emptyText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginTop: 8,
  },
  summaryValueSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  rankingSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 12,
  },
  productCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  productCardTop: {
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  productContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  rankingBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankingText: {
    fontSize: 16,
    fontWeight: '700',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  productMeta: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  productBrand: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  productCategory: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  progressContainer: {
    marginTop: 4,
  },
  progressBackground: {
    height: 6,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.light.primary,
    borderRadius: 3,
  },
  productMetrics: {
    alignItems: 'flex-end',
  },
  quantitySold: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  quantityLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: -2,
  },
  revenue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.success,
    marginTop: 4,
  },
  productDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  detailItem: {
    alignItems: 'center',
    gap: 2,
  },
  detailLabel: {
    fontSize: 10,
    color: Colors.light.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  insightsCard: {
    borderRadius: 12,
    backgroundColor: Colors.light.secondaryLight,
    borderWidth: 1,
    borderColor: Colors.light.secondary,
  },
  insightsContent: {
    padding: 16,
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  insightsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.secondary,
  },
  insightItem: {
    marginBottom: 8,
  },
  insightText: {
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 20,
  },
  insightHighlight: {
    fontWeight: '700',
    color: Colors.light.primary,
  },
  bottomSpacer: {
    height: 24,
  },
});
