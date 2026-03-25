import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Text, Card } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { getDashboardStats, getInventoryValuation, getPeriodSalesStats, getPeriodPurchases, getDailySales, getTopProducts, getFifoPerformance, getYoYComparison } from '@/services/dashboardService';
import { getMonthlyResult } from '@/services/expenseService';
import type { DailySalesData } from '@/services/dashboardService';
import { getSales } from '@/services/saleService';
import type { Sale } from '@/types';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import FAB from '@/components/FAB';
import PeriodFilter, { type PeriodFilterValue, PERIOD_OPTIONS } from '@/components/PeriodFilter';
import { HelpButton } from '@/components/tutorial';
import PageHeader from '@/components/layout/PageHeader';

const { width } = Dimensions.get('window');

// Interface para ações rápidas
interface QuickAction {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilterValue>('this_month');

  // Queries
  const { data: dashboardStats, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    enabled: !!user,
  });

  const { data: valuation, refetch: refetchValuation } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: getInventoryValuation,
    enabled: !!user,
  });

  const { data: periodStats, refetch: refetchPeriod } = useQuery({
    queryKey: ['period-sales', selectedPeriod],
    queryFn: () => getPeriodSalesStats(selectedPeriod),
    enabled: !!user,
  });

  const { data: purchasesStats, refetch: refetchPurchases } = useQuery({
    queryKey: ['period-purchases', selectedPeriod],
    queryFn: () => getPeriodPurchases(selectedPeriod),
    enabled: !!user,
  });

  const { data: recentSales, refetch: refetchRecentSales } = useQuery({
    queryKey: ['recent-sales'],
    queryFn: () => getSales({ limit: 5, skip: 0 }),
    enabled: !!user,
    // Garante que sempre sera um array, mesmo se o backend retornar objeto paginado
    select: (data) => {
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object' && Array.isArray((data as any).items)) {
        return (data as any).items;
      }
      return [];
    },
  });

  // Query para vendas diárias (gráfico)
  const { data: dailySales, refetch: refetchDailySales } = useQuery({
    queryKey: ['daily-sales'],
    queryFn: () => getDailySales(7),
    enabled: !!user,
  });

  // Query top produtos do período
  const { data: topProducts, refetch: refetchTopProducts } = useQuery({
    queryKey: ['top-products', selectedPeriod],
    queryFn: () => getTopProducts(selectedPeriod, 5),
    enabled: !!user,
  });

  // Query performance FIFO
  const { data: fifoPerf, refetch: refetchFifo } = useQuery({
    queryKey: ['fifo-performance'],
    queryFn: getFifoPerformance,
    enabled: !!user,
  });

  // Query YoY (ano a ano)
  const { data: yoyData, refetch: refetchYoY } = useQuery({
    queryKey: ['yoy-comparison'],
    queryFn: getYoYComparison,
    enabled: !!user,
  });

  // Query resultado do mês (P&L)
  const now = new Date();
  const { data: monthlyResult, refetch: refetchMonthly } = useQuery({
    queryKey: ['monthly-result', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => getMonthlyResult(now.getFullYear(), now.getMonth() + 1),
    enabled: !!user,
  });

  // Refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchStats(),
      refetchValuation(),
      refetchPeriod(),
      refetchPurchases(),
      refetchRecentSales(),
      refetchDailySales(),
      refetchTopProducts(),
      refetchFifo(),
      refetchYoY(),
      refetchMonthly(),
    ]);
    setRefreshing(false);
  };

  // Auto-refresh no foco
  useFocusEffect(
    useCallback(() => {
      refetchStats();
      refetchValuation();
      refetchPeriod();
      refetchPurchases();
      refetchRecentSales();
      refetchDailySales();
      refetchTopProducts();
      refetchFifo();
      refetchYoY();
      refetchMonthly();
    }, [refetchStats, refetchValuation, refetchPeriod, refetchPurchases, refetchRecentSales, refetchDailySales, refetchTopProducts, refetchFifo, refetchYoY, refetchMonthly])
  );

  // Dados extraídos (optional chaining em todos os níveis para evitar crash quando API muda)
  const totalSalesToday = dashboardStats?.sales?.total_today || 0;
  const salesCountToday = dashboardStats?.sales?.count_today || 0;
  const salesTrendPercent = dashboardStats?.sales?.trend_percent || 0;
  const profitToday = dashboardStats?.sales?.profit_today || 0;
  const marginToday = dashboardStats?.sales?.margin_today || 0;
  const lowStockCount = dashboardStats?.stock?.low_stock_count || 0;
  const totalProducts = dashboardStats?.stock?.total_products || 0;
  const totalCustomers = dashboardStats?.customers?.total || 0;

  // Período selecionado
  const periodTotal = periodStats?.total || 0;
  const periodCount = periodStats?.count || 0;
  const periodProfit = periodStats?.profit || 0;
  const periodMargin = periodStats?.margin_percent || 0;
  const periodLabel = periodStats?.period?.label || 'Este Mês';

  // Comparação com período anterior
  const comparison = periodStats?.comparison;
  const totalChangePercent = comparison?.total_change_percent || 0;
  const profitChangePercent = comparison?.profit_change_percent || 0;

  // Compras do período
  const purchasesTotal = purchasesStats?.total_invested || 0;
  const purchasesCount = purchasesStats?.entries_count || 0;
  const purchasesItems = purchasesStats?.items_count || 0;
  const purchasesComparison = purchasesStats?.comparison;
  const purchasesChangePercent = purchasesComparison?.total_change_percent || 0;

  // Estoque
  const stockCost = valuation?.cost_value || dashboardStats?.stock?.invested_value || 0;
  const stockRetail = valuation?.retail_value || dashboardStats?.stock?.potential_revenue || 0;
  const stockProfit = valuation?.potential_margin || (stockRetail - stockCost);
  const stockMarginPercent = stockCost > 0 ? ((stockRetail - stockCost) / stockCost) * 100 : 0;

  // Saudação
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // Ações rápidas
  const quickActions: QuickAction[] = [
    {
      id: 'new-sale',
      title: 'Nova Venda',
      icon: 'cart',
      color: '#10B981',
      onPress: () => router.push('/(tabs)/sale'),
    },
    {
      id: 'products',
      title: 'Produtos',
      icon: 'cube',
      color: '#8B5CF6',
      onPress: () => router.push('/(tabs)/products'),
    },
    {
      id: 'customers',
      title: 'Clientes',
      icon: 'people',
      color: '#3B82F6',
      onPress: () => router.push('/(tabs)/customers'),
    },
    {
      id: 'conditional-shipments',
      title: 'Condicionais',
      icon: 'swap-horizontal',
      color: '#EC4899',
      onPress: () => router.push('/(tabs)/conditional'),
    },
    {
      id: 'entries',
      title: 'Entradas',
      icon: 'albums',
      color: '#F59E0B',
      onPress: () => router.push('/entries'),
    },
    {
      id: 'reports',
      title: 'Relatórios',
      icon: 'bar-chart',
      color: '#8B5CF6',
      onPress: () => router.push('/reports/sales-period' as any),
    },
  ];

  return (
    <View style={styles.container}>
      <PageHeader
        title={`${getGreeting()}, ${user?.full_name?.split(' ')[0] || 'Usuário'}!`}
        subtitle={user?.store_name || 'Fitness Store'}
        rightActions={[
          { icon: 'help-circle-outline', onPress: () => {} },
          { icon: 'person-circle-outline', onPress: () => router.push('/(tabs)/more') },
        ]}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.light.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ========== CARD PRINCIPAL: VENDAS HOJE ========== */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/(tabs)/sales')}
        >
          <LinearGradient
            colors={['#10B981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mainCard}
          >
            <View style={styles.mainCardHeader}>
              <View style={styles.mainCardIcon}>
                <Ionicons name="trending-up" size={24} color="#fff" />
              </View>
              {salesTrendPercent !== 0 && (
                <View style={[
                  styles.trendBadge,
                  { backgroundColor: salesTrendPercent >= 0 ? 'rgba(255,255,255,0.25)' : 'rgba(239,68,68,0.3)' }
                ]}>
                  <Ionicons
                    name={salesTrendPercent >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color="#fff"
                  />
                  <Text style={styles.trendText}>
                    {salesTrendPercent > 0 ? '+' : ''}{salesTrendPercent.toFixed(0)}% vs ontem
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.mainCardLabel}>Vendas Hoje</Text>
            <Text style={styles.mainCardValue}>{formatCurrency(totalSalesToday)}</Text>
            <Text style={styles.mainCardSubtitle}>
              {salesCountToday} {salesCountToday === 1 ? 'venda realizada' : 'vendas realizadas'}
            </Text>
            {salesCountToday > 0 && (
              <View style={styles.todayProfitRow}>
                <Ionicons name="trending-up" size={14} color="rgba(255,255,255,0.9)" />
                <Text style={styles.todayProfitText}>
                  Lucro: {formatCurrency(profitToday)}
                </Text>
                <View style={styles.todayMarginBadge}>
                  <Text style={styles.todayMarginText}>{marginToday.toFixed(1)}%</Text>
                </View>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* ========== AÇÕES RÁPIDAS ========== */}
        <Text style={styles.sectionTitle}>Ações Rápidas</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickActionsContainer}
        >
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={styles.quickActionButton}
              activeOpacity={0.7}
              onPress={action.onPress}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: action.color + '15' }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={styles.quickActionText}>{action.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ========== RESUMO DO PERÍODO ========== */}
        <View style={styles.periodHeader}>
          <Text style={styles.sectionTitle}>{periodLabel}</Text>
          <PeriodFilter
            value={selectedPeriod}
            onChange={setSelectedPeriod}
            compact
          />
        </View>
        <View style={styles.monthGrid}>
          {/* Faturamento */}
          <TouchableOpacity
            style={styles.monthCard}
            activeOpacity={0.7}
            onPress={() => router.push('/reports/sales-period' as any)}
          >
            <View style={[styles.monthCardIcon, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="wallet-outline" size={22} color="#6366F1" />
            </View>
            <Text style={styles.monthCardLabel}>Faturamento</Text>
            <Text style={styles.monthCardValue}>{formatCurrency(periodTotal)}</Text>
            <View style={styles.monthCardFooter}>
              <Text style={styles.monthCardSubtitle}>{periodCount} vendas</Text>
              {totalChangePercent !== 0 && (
                <View style={[
                  styles.changeBadge,
                  { backgroundColor: totalChangePercent >= 0 ? '#ECFDF5' : '#FEF2F2' }
                ]}>
                  <Ionicons
                    name={totalChangePercent >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={10}
                    color={totalChangePercent >= 0 ? '#10B981' : '#EF4444'}
                  />
                  <Text style={[
                    styles.changeText,
                    { color: totalChangePercent >= 0 ? '#10B981' : '#EF4444' }
                  ]}>
                    {Math.abs(totalChangePercent).toFixed(0)}%
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Lucro */}
          <TouchableOpacity
            style={styles.monthCard}
            activeOpacity={0.7}
            onPress={() => router.push('/reports/sales-period' as any)}
          >
            <View style={[styles.monthCardIcon, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="cash-outline" size={22} color="#10B981" />
            </View>
            <Text style={styles.monthCardLabel}>Lucro Líquido</Text>
            <Text style={[styles.monthCardValue, { color: '#10B981' }]}>
              {formatCurrency(periodProfit)}
            </Text>
            <View style={styles.monthCardFooter}>
              <Text style={styles.monthCardSubtitle}>{periodMargin.toFixed(0)}% margem</Text>
              {profitChangePercent !== 0 && (
                <View style={[
                  styles.changeBadge,
                  { backgroundColor: profitChangePercent >= 0 ? '#ECFDF5' : '#FEF2F2' }
                ]}>
                  <Ionicons
                    name={profitChangePercent >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={10}
                    color={profitChangePercent >= 0 ? '#10B981' : '#EF4444'}
                  />
                  <Text style={[
                    styles.changeText,
                    { color: profitChangePercent >= 0 ? '#10B981' : '#EF4444' }
                  ]}>
                    {Math.abs(profitChangePercent).toFixed(0)}%
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* ========== CARD RESULTADO DO MÊS (P&L) ========== */}
        {monthlyResult && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/(tabs)/expenses/resultado')}
          >
            <Card style={styles.plSummaryCard}>
              <View style={styles.plSummaryHeader}>
                <View style={styles.plSummaryTitleRow}>
                  <Ionicons name="stats-chart-outline" size={18} color="#7C3AED" />
                  <Text style={styles.plSummaryTitle}>Resultado do Mês</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
              </View>
              <View style={styles.plSummaryGrid}>
                <View style={styles.plSummaryItem}>
                  <Text style={styles.plSummaryLabel}>Receita</Text>
                  <Text style={[styles.plSummaryValue, { color: Colors.light.success }]}>
                    {formatCurrency(monthlyResult.revenue)}
                  </Text>
                </View>
                <View style={styles.plSummaryItem}>
                  <Text style={styles.plSummaryLabel}>Despesas</Text>
                  <Text style={[styles.plSummaryValue, { color: Colors.light.error }]}>
                    -{formatCurrency(monthlyResult.total_expenses)}
                  </Text>
                </View>
                <View style={[styles.plSummaryItem, styles.plSummaryNet, {
                  backgroundColor: monthlyResult.net_profit >= 0 ? (Colors.light.successLight ?? '#E8F5E9') : '#FFEBEE',
                }]}>
                  <Text style={styles.plSummaryLabel}>Lucro Líquido</Text>
                  <Text style={[styles.plSummaryValue, styles.plSummaryNetValue, {
                    color: monthlyResult.net_profit >= 0 ? Colors.light.success : Colors.light.error,
                  }]}>
                    {formatCurrency(monthlyResult.net_profit)}
                  </Text>
                  <Text style={[styles.plSummaryMargin, {
                    color: monthlyResult.net_profit >= 0 ? Colors.light.success : Colors.light.error,
                  }]}>
                    {Number(monthlyResult.net_margin_pct).toFixed(1)}%
                  </Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* ========== GRÁFICO DE VENDAS 7 DIAS ========== */}
        {dailySales && dailySales.daily && dailySales.daily.length > 0 && (
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>Últimos 7 Dias</Text>
                <Text style={styles.chartSubtitle}>
                  Média: {formatCurrency(dailySales.totals?.average_per_day || 0)}/dia
                </Text>
              </View>
              {dailySales.best_day && dailySales.best_day.total > 0 && (
                <View style={styles.bestDayBadge}>
                  <Ionicons name="trophy" size={14} color="#F59E0B" />
                  <Text style={styles.bestDayText}>{dailySales.best_day.day_short}</Text>
                </View>
              )}
            </View>
            
            {/* Gráfico de barras simples */}
            <View style={styles.chartContainer}>
              {dailySales.daily.map((day, index) => {
                const maxValue = Math.max(...dailySales.daily.map(d => d.total), 1);
                const barHeight = (day.total / maxValue) * 100;
                const isToday = index === dailySales.daily.length - 1;
                
                return (
                  <View key={day.date} style={styles.barContainer}>
                    <View style={styles.barWrapper}>
                      <View 
                        style={[
                          styles.bar, 
                          { 
                            height: `${barHeight}%`,
                            backgroundColor: isToday ? '#10B981' : day.total > 0 ? '#6366F1' : '#E5E7EB'
                          }
                        ]} 
                      />
                    </View>
                    <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                      {day.day_short.split('/')[0]}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Resumo do período */}
            <View style={styles.chartSummary}>
              <View style={styles.chartSummaryItem}>
                <Text style={styles.chartSummaryLabel}>Faturamento</Text>
                <Text style={styles.chartSummaryValue}>{formatCurrency(dailySales.totals?.total || 0)}</Text>
              </View>
              <View style={styles.chartSummaryDivider} />
              <View style={styles.chartSummaryItem}>
                <Text style={styles.chartSummaryLabel}>Lucro Líquido</Text>
                <Text style={[styles.chartSummaryValue, { color: '#10B981' }]}>
                  {formatCurrency(dailySales.totals?.profit || 0)}
                </Text>
              </View>
              <View style={styles.chartSummaryDivider} />
              <View style={styles.chartSummaryItem}>
                <Text style={styles.chartSummaryLabel}>Custo dos Produtos</Text>
                <Text style={[styles.chartSummaryValue, { color: '#EF4444' }]}>
                  {formatCurrency(dailySales.totals?.cmv || 0)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ========== TOP 5 PRODUTOS ========== */}
        {topProducts && topProducts.products && topProducts.products.length > 0 && (
          <View style={styles.topProductsCard}>
            <View style={styles.topProductsHeader}>
              <View>
                <Text style={styles.chartTitle}>🏆 Top Produtos</Text>
                <Text style={styles.chartSubtitle}>{periodLabel}</Text>
              </View>
            </View>
            {topProducts.products.map((product, index) => {
              const maxRevenue = topProducts.products[0]?.revenue || 1;
              const barWidth = (product.revenue / maxRevenue) * 100;
              const colors = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#3B82F6'];
              const color = colors[index % colors.length];
              return (
                <View key={product.product_id} style={styles.topProductItem}>
                  <View style={styles.topProductRank}>
                    <Text style={[styles.topProductRankText, { color }]}>#{index + 1}</Text>
                  </View>
                  <View style={styles.topProductInfo}>
                    <View style={styles.topProductNameRow}>
                      <Text style={styles.topProductName} numberOfLines={1}>
                        {product.product_name}
                      </Text>
                      <Text style={styles.topProductRevenue}>{formatCurrency(product.revenue)}</Text>
                    </View>
                    <View style={styles.topProductBarBg}>
                      <View style={[styles.topProductBar, { width: `${barWidth}%`, backgroundColor: color }]} />
                    </View>
                    <View style={styles.topProductStats}>
                      <Text style={styles.topProductStatText}>{product.qty_sold} un vendidas</Text>
                      <Text style={[styles.topProductStatText, { color: '#10B981' }]}>
                        Lucro: {formatCurrency(product.profit)} ({product.margin_percent.toFixed(0)}%)
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ========== FIFO PERFORMANCE ========== */}
        {fifoPerf && (
          <View style={styles.fifoCard}>
            <View style={styles.fifoHeaderSection}>
              <View>
                <Text style={styles.fifoTitle}>📦 Saúde do Estoque</Text>
                <Text style={styles.fifoSubtitle}>Análise detalhada do seu inventário</Text>
              </View>
              <TouchableOpacity style={styles.fifoInfoButton} activeOpacity={0.6}>
                <Ionicons name="information-circle-outline" size={20} color="#6366F1" />
              </TouchableOpacity>
            </View>

            {/* Sell-through gauge com visual melhorado */}
            <View style={styles.fifoSellThrough}>
              <View style={styles.fifoSellThroughHeader}>
                <View style={styles.fifoSellThroughLabelContainer}>
                  <Ionicons name="sync-outline" size={16} color="#6366F1" />
                  <Text style={styles.fifoSellThroughLabel}>Giro de Estoque</Text>
                </View>
                <View style={[
                  styles.fifoSellThroughBadge,
                  { backgroundColor: fifoPerf.sell_through.rate >= 70 ? '#ECFDF5' :
                    fifoPerf.sell_through.rate >= 40 ? '#FEF3C7' : '#FEF2F2' }
                ]}>
                  <Text style={[
                    styles.fifoSellThroughBadgeText,
                    { color: fifoPerf.sell_through.rate >= 70 ? '#10B981' :
                      fifoPerf.sell_through.rate >= 40 ? '#F59E0B' : '#EF4444' }
                  ]}>
                    {fifoPerf.sell_through.rate >= 70 ? 'Excelente' :
                      fifoPerf.sell_through.rate >= 40 ? 'Moderado' : 'Crítico'}
                  </Text>
                </View>
              </View>

              <Text style={styles.fifoSellThroughValue}>
                {fifoPerf.sell_through.rate.toFixed(0)}%
              </Text>

              <Text style={styles.fifoMetricSub}>
                {fifoPerf.sell_through.total_sold} de {fifoPerf.sell_through.total_received} itens vendidos
              </Text>

              <View style={styles.fifoGaugeContainer}>
                <View style={styles.fifoGaugeBg}>
                  <View style={[
                    styles.fifoGaugeFill,
                    {
                      width: `${Math.min(fifoPerf.sell_through.rate, 100)}%`,
                      backgroundColor: fifoPerf.sell_through.rate >= 70 ? '#10B981' :
                        fifoPerf.sell_through.rate >= 40 ? '#F59E0B' : '#EF4444'
                    }
                  ]} />
                </View>
              </View>
            </View>

            {/* Cards de métricas melhorados */}
            <View style={styles.fifoMetricsGrid}>
              {/* Card 1: Lucro Médio */}
              <TouchableOpacity
                style={[
                  styles.fifoMetricCard,
                  fifoPerf.roi.avg_roi >= 0 ? styles.fifoMetricCardPositive : styles.fifoMetricCardNegative,
                ]}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.fifoMetricIconContainer,
                  { backgroundColor: fifoPerf.roi.avg_roi >= 0 ? '#ECFDF5' : '#FEF2F2' }
                ]}>
                  <Ionicons
                    name={fifoPerf.roi.avg_roi >= 0 ? 'trending-up' : 'trending-down'}
                    size={24}
                    color={fifoPerf.roi.avg_roi >= 0 ? '#10B981' : '#EF4444'}
                  />
                </View>
                <Text style={styles.fifoMetricLabel}>Lucro Médio</Text>
                <Text style={[
                  styles.fifoMetricValue,
                  { color: fifoPerf.roi.avg_roi >= 0 ? '#10B981' : '#EF4444' }
                ]}>
                  {fifoPerf.roi.avg_roi > 0 ? '+' : ''}{fifoPerf.roi.avg_roi.toFixed(0)}%
                </Text>
                <View style={[
                  styles.fifoMetricBadge,
                  { backgroundColor: fifoPerf.roi.avg_roi >= 0 ? '#10B981' : '#EF4444' }
                ]}>
                  <Text style={styles.fifoMetricBadgeText}>
                    {fifoPerf.roi.avg_roi >= 0 ? 'Lucrativo' : 'Prejuízo'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Card 2: Compras com Prejuízo */}
              <TouchableOpacity
                style={[
                  styles.fifoMetricCard,
                  fifoPerf.roi.negative_count === 0 ? styles.fifoMetricCardPositive : styles.fifoMetricCardNegative,
                ]}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.fifoMetricIconContainer,
                  { backgroundColor: fifoPerf.roi.negative_count === 0 ? '#ECFDF5' : '#FEF2F2' }
                ]}>
                  <Ionicons
                    name={fifoPerf.roi.negative_count === 0 ? 'checkmark-circle' : 'alert-circle'}
                    size={24}
                    color={fifoPerf.roi.negative_count === 0 ? '#10B981' : '#EF4444'}
                  />
                </View>
                <Text style={styles.fifoMetricLabel}>Prejuízo</Text>
                <Text style={[
                  styles.fifoMetricValue,
                  { color: fifoPerf.roi.negative_count === 0 ? '#10B981' : '#EF4444' }
                ]}>
                  {fifoPerf.roi.negative_count}
                </Text>
                <View style={[
                  styles.fifoMetricBadge,
                  { backgroundColor: fifoPerf.roi.negative_count === 0 ? '#10B981' : '#EF4444' }
                ]}>
                  <Text style={styles.fifoMetricBadgeText}>
                    {fifoPerf.roi.negative_count === 0 ? 'Nenhuma' : 'Atenção'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Card 3: Itens Parados */}
              <TouchableOpacity
                style={[
                  styles.fifoMetricCard,
                  fifoPerf.sell_through.total_remaining === 0 ? styles.fifoMetricCardPositive : styles.fifoMetricCardNeutral,
                ]}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.fifoMetricIconContainer,
                  { backgroundColor: fifoPerf.sell_through.total_remaining === 0 ? '#ECFDF5' : '#FEF3C7' }
                ]}>
                  <Ionicons
                    name={fifoPerf.sell_through.total_remaining === 0 ? 'cube' : 'archive'}
                    size={24}
                    color={fifoPerf.sell_through.total_remaining === 0 ? '#10B981' : '#F59E0B'}
                  />
                </View>
                <Text style={styles.fifoMetricLabel}>Itens Parados</Text>
                <Text style={[
                  styles.fifoMetricValue,
                  { color: fifoPerf.sell_through.total_remaining === 0 ? '#10B981' : '#F59E0B' }
                ]}>
                  {fifoPerf.sell_through.total_remaining}
                </Text>
                <View style={[
                  styles.fifoMetricBadge,
                  { backgroundColor: fifoPerf.sell_through.total_remaining === 0 ? '#10B981' : '#F59E0B' }
                ]}>
                  <Text style={styles.fifoMetricBadgeText}>
                    {fifoPerf.sell_through.total_remaining === 0 ? 'Livre' : 'Estocado'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Alerta de ROI negativo melhorado */}
            {fifoPerf.roi.negative_count > 0 && (
              <TouchableOpacity style={styles.fifoAlert} activeOpacity={0.8}>
                <View style={styles.fifoAlertIcon}>
                  <Ionicons name="warning" size={20} color="#EF4444" />
                </View>
                <View style={styles.fifoAlertContent}>
                  <Text style={styles.fifoAlertTitle}>Ação Necessária</Text>
                  <Text style={styles.fifoAlertText}>
                    {fifoPerf.roi.negative_count} {fifoPerf.roi.negative_count === 1 ? 'compra está' : 'compras estão'} gerando prejuízo
                  </Text>
                  <Text style={styles.fifoAlertHint}>Verifique os preços de venda →</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Insight contextual */}
            <View style={styles.fifoInsight}>
              <Ionicons name="bulb" size={14} color="#F59E0B" />
              <Text style={styles.fifoInsightText}>
                {fifoPerf.sell_through.rate >= 70
                  ? 'Excelente! Seu estoque está girando bem. Continue monitorando.'
                  : fifoPerf.sell_through.rate >= 40
                  ? 'Giro moderado. Considere promoções para produtos parados.'
                  : 'Giro crítico. Revise preços e considere promoções agressivas.'}
              </Text>
            </View>
          </View>
        )}

        {/* ========== YoY COMPARAÇÃO ========== */}
        {yoyData && yoyData.months && yoyData.months.length > 0 && (() => {
          const maxVal = Math.max(...yoyData.months.map(m => Math.max(m.current_total, m.prev_total)), 1);
          const isPositive = yoyData.totals.total_change_percent >= 0;
          return (
            <View style={styles.yoyCard}>
              {/* Header */}
              <View style={styles.yoyHeader}>
                <View>
                  <Text style={styles.yoyTitle}>📅 Mês a Mês</Text>
                  <Text style={styles.yoySubtitle}>{yoyData.totals.prev_year} vs {yoyData.totals.current_year}</Text>
                </View>
                <View style={[styles.yoyChangeBadge, { backgroundColor: isPositive ? '#ECFDF5' : '#FEF2F2' }]}>
                  <Ionicons
                    name={isPositive ? 'trending-up' : 'trending-down'}
                    size={16}
                    color={isPositive ? '#10B981' : '#EF4444'}
                  />
                  <Text style={[styles.yoyChangePct, { color: isPositive ? '#10B981' : '#EF4444' }]}>
                    {isPositive ? '+' : ''}{yoyData.totals.total_change_percent.toFixed(1)}% no ano
                  </Text>
                </View>
              </View>

              {/* Resumo anual */}
              <View style={styles.yoyTotalsRow}>
                <View style={styles.yoyTotalCard}>
                  <Text style={styles.yoyTotalYear}>{yoyData.totals.prev_year}</Text>
                  <Text style={styles.yoyTotalValue}>{formatCurrency(yoyData.totals.prev_total)}</Text>
                </View>
                <View style={styles.yoyTotalArrow}>
                  <Ionicons name="arrow-forward" size={18} color="#9CA3AF" />
                </View>
                <View style={[styles.yoyTotalCard, styles.yoyTotalCardCurrent]}>
                  <Text style={[styles.yoyTotalYear, { color: '#6366F1' }]}>{yoyData.totals.current_year}</Text>
                  <Text style={[styles.yoyTotalValue, { color: '#1F2937', fontWeight: '800' as const }]}>
                    {formatCurrency(yoyData.totals.current_total)}
                  </Text>
                </View>
              </View>

              {/* Legenda */}
              <View style={styles.yoyLegend}>
                <View style={styles.yoyLegendItem}>
                  <View style={[styles.yoyLegendDot, { backgroundColor: '#CBD5E1' }]} />
                  <Text style={styles.yoyLegendText}>{yoyData.totals.prev_year}</Text>
                </View>
                <View style={styles.yoyLegendItem}>
                  <View style={[styles.yoyLegendDot, { backgroundColor: '#6366F1' }]} />
                  <Text style={styles.yoyLegendText}>{yoyData.totals.current_year}</Text>
                </View>
              </View>

              {/* Lista mês a mês */}
              <View style={styles.yoyMonthList}>
                {yoyData.months.map((month, idx) => {
                  const prevW = (month.prev_total / maxVal) * 100;
                  const currW = (month.current_total / maxVal) * 100;
                  const chg = month.change_percent;
                  const chgColor = chg > 0 ? '#10B981' : chg < 0 ? '#EF4444' : '#9CA3AF';
                  const chgBg = chg > 0 ? '#ECFDF5' : chg < 0 ? '#FEF2F2' : '#F3F4F6';
                  return (
                    <View
                      key={month.month}
                      style={[styles.yoyMonthRow, idx < yoyData.months.length - 1 && styles.yoyMonthRowBorder]}
                    >
                      {/* Nome do mês */}
                      <Text style={styles.yoyMonthName}>{month.month_name}</Text>

                      {/* Barras horizontais */}
                      <View style={styles.yoyMonthBarsH}>
                        {/* Ano anterior */}
                        <View style={styles.yoyBarHRow}>
                          <View style={[styles.yoyBarHTrack]}>
                            <View style={[styles.yoyBarHFill, styles.yoyBarHPrev, { width: `${prevW}%` as any }]} />
                          </View>
                          <Text style={styles.yoyBarHValue}>{formatCurrency(month.prev_total)}</Text>
                        </View>
                        {/* Ano atual */}
                        <View style={styles.yoyBarHRow}>
                          <View style={[styles.yoyBarHTrack]}>
                            <View style={[styles.yoyBarHFill, styles.yoyBarHCurr, { width: `${currW}%` as any }]} />
                          </View>
                          <Text style={[styles.yoyBarHValue, { color: '#1F2937', fontWeight: '600' as const }]}>
                            {formatCurrency(month.current_total)}
                          </Text>
                        </View>
                      </View>

                      {/* Badge de variação */}
                      <View style={[styles.yoyMonthBadge, { backgroundColor: chgBg }]}>
                        {chg !== 0 && (
                          <Ionicons
                            name={chg > 0 ? 'arrow-up' : 'arrow-down'}
                            size={10}
                            color={chgColor}
                          />
                        )}
                        <Text style={[styles.yoyMonthBadgeText, { color: chgColor }]}>
                          {chg > 0 ? '+' : ''}{chg.toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {/* ========== COMPRAS DO PERIODO ========== */}
        <TouchableOpacity
          style={styles.purchasesCard}
          activeOpacity={0.8}
          onPress={() => router.push('/entries' as any)}
        >
          <View style={styles.purchasesHeader}>
            <View style={styles.purchasesIconContainer}>
              <Ionicons name="cart-outline" size={22} color="#F59E0B" />
            </View>
            <View style={styles.purchasesInfo}>
              <Text style={styles.purchasesLabel}>Compras do Periodo</Text>
              <Text style={styles.purchasesValue}>{formatCurrency(purchasesTotal)}</Text>
            </View>
            {purchasesChangePercent !== 0 && (
              <View style={[
                styles.changeBadge,
                { backgroundColor: purchasesChangePercent >= 0 ? '#FEF3C7' : '#ECFDF5' }
              ]}>
                <Ionicons
                  name={purchasesChangePercent >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={10}
                  color={purchasesChangePercent >= 0 ? '#F59E0B' : '#10B981'}
                />
                <Text style={[
                  styles.changeText,
                  { color: purchasesChangePercent >= 0 ? '#F59E0B' : '#10B981' }
                ]}>
                  {Math.abs(purchasesChangePercent).toFixed(0)}%
                </Text>
              </View>
            )}
          </View>
          <View style={styles.purchasesStats}>
            <View style={styles.purchasesStat}>
              <Text style={styles.purchasesStatValue}>{purchasesCount}</Text>
              <Text style={styles.purchasesStatLabel}>entradas</Text>
            </View>
            <View style={styles.purchasesStatDivider} />
            <View style={styles.purchasesStat}>
              <Text style={styles.purchasesStatValue}>{purchasesItems}</Text>
              <Text style={styles.purchasesStatLabel}>itens</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* ========== SEU ESTOQUE ========== */}
        <Text style={styles.sectionTitle}>Seu Estoque</Text>
        <Card style={styles.stockCard}>
          <View style={styles.stockContent}>
            {/* Linha 1: Investido e Valor de Venda */}
            <View style={styles.stockRow}>
              <View style={styles.stockItem}>
                <View style={styles.stockItemHeader}>
                  <Ionicons name="cube-outline" size={18} color="#6B7280" />
                  <Text style={styles.stockItemLabel}>Capital Investido</Text>
                </View>
                <Text style={styles.stockItemValue}>{formatCurrency(stockCost)}</Text>
              </View>
              <View style={styles.stockDivider} />
              <View style={styles.stockItem}>
                <View style={styles.stockItemHeader}>
                  <Ionicons name="pricetag-outline" size={18} color="#6B7280" />
                  <Text style={styles.stockItemLabel}>Valor de Venda</Text>
                </View>
                <Text style={styles.stockItemValue}>{formatCurrency(stockRetail)}</Text>
              </View>
            </View>

            {/* Linha 2: Lucro Potencial */}
            <View style={styles.stockProfitRow}>
              <View style={styles.stockProfitLeft}>
                <Ionicons name="trending-up" size={20} color="#10B981" />
                <Text style={styles.stockProfitLabel}>Lucro Potencial</Text>
              </View>
              <View style={styles.stockProfitRight}>
                <Text style={styles.stockProfitValue}>{formatCurrency(stockProfit)}</Text>
                <View style={styles.stockProfitBadge}>
                  <Text style={styles.stockProfitPercent}>{stockMarginPercent.toFixed(0)}%</Text>
                </View>
              </View>
            </View>

            {/* Info: Total de produtos */}
            <View style={styles.stockInfo}>
              <Text style={styles.stockInfoText}>
                {totalProducts} produtos em estoque
              </Text>
            </View>
          </View>
        </Card>

        {/* ========== ALERTA DE ESTOQUE BAIXO ========== */}
        {lowStockCount > 0 && (
          <TouchableOpacity
            style={styles.alertCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/products')}
          >
            <View style={styles.alertIcon}>
              <Ionicons name="warning" size={24} color="#F59E0B" />
            </View>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>Estoque Baixo</Text>
              <Text style={styles.alertText}>
                {lowStockCount} {lowStockCount === 1 ? 'produto precisa' : 'produtos precisam'} de reposição
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}


        {/* ========== RESUMO RÁPIDO ========== */}
        <View style={styles.quickStatsRow}>
          <TouchableOpacity
            style={styles.quickStatCard}
            onPress={() => router.push('/(tabs)/products')}
          >
            <Ionicons name="cube" size={20} color="#8B5CF6" />
            <Text style={styles.quickStatValue}>{totalProducts}</Text>
            <Text style={styles.quickStatLabel}>Produtos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickStatCard}
            onPress={() => router.push('/(tabs)/customers')}
          >
            <Ionicons name="people" size={20} color="#3B82F6" />
            <Text style={styles.quickStatValue}>{totalCustomers}</Text>
            <Text style={styles.quickStatLabel}>Clientes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickStatCard}
            onPress={() => router.push('/(tabs)/sales')}
          >
            <Ionicons name="receipt" size={20} color="#10B981" />
            <Text style={styles.quickStatValue}>{periodCount}</Text>
            <Text style={styles.quickStatLabel}>Vendas</Text>
          </TouchableOpacity>
        </View>

        {/* ========== ÚLTIMAS VENDAS ========== */}
        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>Últimas Vendas</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/sales')}>
            <Text style={styles.seeAllText}>Ver todas</Text>
          </TouchableOpacity>
        </View>

        {recentSales && recentSales.length > 0 ? (
          <Card style={styles.recentCard}>
            {recentSales.slice(0, 4).map((sale: Sale, index: number) => (
              <View
                key={sale.id}
                style={[
                  styles.recentItem,
                  index < Math.min(recentSales.length - 1, 3) && styles.recentItemBorder
                ]}
              >
                <View style={styles.recentItemLeft}>
                  <View style={styles.recentItemIcon}>
                    <Ionicons name="receipt-outline" size={16} color="#6366F1" />
                  </View>
                  <View>
                    <Text style={styles.recentItemTitle}>Venda #{sale.id}</Text>
                    <Text style={styles.recentItemDate}>
                      {new Date(sale.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Text>
                  </View>
                </View>
                <Text style={styles.recentItemValue}>
                  {formatCurrency(sale.total_amount || (sale as any).total || 0)}
                </Text>
              </View>
            ))}
          </Card>
        ) : (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Nenhuma venda ainda</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/(tabs)/sale')}
              >
                <Text style={styles.emptyButtonText}>Fazer primeira venda</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* Espaçamento para FAB */}
        <View style={{ height: 100 }} />
      </ScrollView>

      <FAB />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },

  // Card Principal - Vendas Hoje
  mainCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  mainCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mainCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  trendText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  mainCardLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  mainCardValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    marginVertical: 4,
  },
  mainCardSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  todayProfitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  todayProfitText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  todayMarginBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  todayMarginText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },

  // Seções
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
    marginTop: 8,
  },

  // Header do período com filtro
  periodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },

  // Grid do Mês
  monthGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  monthCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignItems: 'center',
  },
  monthCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthCardLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
  },
  monthCardValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginVertical: 4,
    textAlign: 'center',
  },
  monthCardSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  monthCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    gap: 6,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 2,
  },
  changeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // P&L Summary Card
  plSummaryCard: {
    marginTop: 12,
    borderRadius: theme.borderRadius.lg,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  plSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  plSummaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plSummaryTitle: {
    fontWeight: '700',
    fontSize: 14,
    color: Colors.light.text,
  },
  plSummaryGrid: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 8,
    flexWrap: 'wrap',
  },
  plSummaryItem: {
    flex: 1,
    minWidth: 90,
    alignItems: 'center',
    padding: 10,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  plSummaryLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  plSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  plSummaryNet: {
    flexBasis: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  plSummaryNetValue: {
    fontSize: 18,
  },
  plSummaryMargin: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Card de Compras do Periodo
  purchasesCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  purchasesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  purchasesIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchasesInfo: {
    flex: 1,
    marginLeft: 12,
  },
  purchasesLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  purchasesValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
  },
  purchasesStats: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
  },
  purchasesStat: {
    flex: 1,
    alignItems: 'center',
  },
  purchasesStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F59E0B',
  },
  purchasesStatLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  purchasesStatDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },

  // Card de Estoque
  stockCard: {
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
  },
  stockContent: {
    padding: 16,
  },
  stockRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stockItem: {
    flex: 1,
    alignItems: 'center',
  },
  stockItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    justifyContent: 'center',
  },
  stockItemLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  stockItemValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  stockDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  stockProfitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  stockProfitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stockProfitLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
  },
  stockProfitRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stockProfitValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  stockProfitBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stockProfitPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  stockInfo: {
    alignItems: 'center',
  },
  stockInfoText: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // Alerta
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  alertIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FEF9C3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContent: {
    flex: 1,
    marginLeft: 12,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  alertText: {
    fontSize: 12,
    color: '#A16207',
    marginTop: 2,
  },

  // Ações Rápidas
  quickActionsContainer: {
    paddingBottom: 8,
    gap: 12,
  },
  quickActionButton: {
    alignItems: 'center',
    width: 72,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickActionText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
    textAlign: 'center',
  },

  // Quick Stats
  quickStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 6,
  },
  quickStatLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },

  // Últimas Vendas
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  seeAllText: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '600',
  },
  recentCard: {
    borderRadius: 16,
    elevation: 2,
    overflow: 'hidden',
  },
  recentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  recentItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  recentItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recentItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  recentItemDate: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 1,
  },
  recentItemValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10B981',
  },

  // Empty State
  emptyCard: {
    borderRadius: 16,
    elevation: 2,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  // Gráfico de Vendas 7 Dias
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  chartSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  bestDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bestDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    marginBottom: 8,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
  },
  barWrapper: {
    width: 28,
    height: 80,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    minHeight: 4,
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
  },
  barLabelToday: {
    color: '#10B981',
    fontWeight: '700',
  },
  barValue: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 2,
  },
  chartSummary: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  chartSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  chartSummaryLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
  },
  chartSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  chartSummaryDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },

  // Top 5 Produtos
  topProductsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  topProductsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  topProductItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  topProductRank: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
  },
  topProductRankText: {
    fontSize: 13,
    fontWeight: '700',
  },
  topProductInfo: {
    flex: 1,
  },
  topProductNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  topProductName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    marginRight: 8,
  },
  topProductRevenue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  topProductBarBg: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    marginBottom: 4,
    overflow: 'hidden',
  },
  topProductBar: {
    height: '100%',
    borderRadius: 3,
  },
  topProductStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topProductStatText: {
    fontSize: 11,
    color: '#6B7280',
  },

  // FIFO Performance
  fifoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  fifoHeaderSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  fifoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  fifoSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  fifoInfoButton: {
    padding: 4,
  },
  fifoSellThrough: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  fifoSellThroughHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  fifoSellThroughLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fifoSellThroughLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  fifoSellThroughBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  fifoSellThroughBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  fifoMetricLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 4,
  },
  fifoMetricSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  fifoSellThroughValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1F2937',
  },
  fifoGaugeContainer: {
    marginTop: 4,
  },
  fifoGaugeBg: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fifoGaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  fifoMetricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  fifoMetricCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  fifoMetricCardPositive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  fifoMetricCardNegative: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  fifoMetricCardNeutral: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  fifoMetricIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  fifoMetricValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  fifoMetricBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  fifoMetricBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  fifoAlert: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  fifoAlertIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fifoAlertContent: {
    flex: 1,
  },
  fifoAlertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 2,
  },
  fifoAlertText: {
    fontSize: 12,
    color: '#7F1D1D',
    marginBottom: 4,
  },
  fifoAlertHint: {
    fontSize: 11,
    color: '#991B1B',
    fontWeight: '600',
  },
  fifoInsight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  fifoInsightText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },

  // YoY Comparação
  yoyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  yoyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  yoyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  yoySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  yoyChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  yoyChangePct: {
    fontSize: 13,
    fontWeight: '700',
  },
  yoyTotalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  yoyTotalCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  yoyTotalCardCurrent: {
    backgroundColor: '#F0F0FF',
    borderColor: '#C7D2FE',
  },
  yoyTotalYear: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 3,
  },
  yoyTotalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  yoyTotalArrow: {
    width: 28,
    alignItems: 'center',
  },
  yoyLegend: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  yoyLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yoyLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  yoyLegendText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  yoyMonthList: {
    gap: 0,
  },
  yoyMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  yoyMonthRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  yoyMonthName: {
    width: 36,
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  yoyMonthBarsH: {
    flex: 1,
    gap: 4,
  },
  yoyBarHRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  yoyBarHTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  yoyBarHFill: {
    height: '100%',
    borderRadius: 3,
  },
  yoyBarHPrev: {
    backgroundColor: '#CBD5E1',
  },
  yoyBarHCurr: {
    backgroundColor: '#6366F1',
  },
  yoyBarHValue: {
    width: 64,
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'right',
  },
  yoyMonthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    minWidth: 48,
    justifyContent: 'center',
  },
  yoyMonthBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
