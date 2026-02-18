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
import { getDashboardStats, getInventoryValuation, getPeriodSalesStats, getPeriodPurchases } from '@/services/dashboardService';
import { getSales } from '@/services/saleService';
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

  // Refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchStats(),
      refetchValuation(),
      refetchPeriod(),
      refetchPurchases(),
      refetchRecentSales(),
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
    }, [refetchStats, refetchValuation, refetchPeriod, refetchPurchases, refetchRecentSales])
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
            {recentSales.slice(0, 4).map((sale, index) => (
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
  },
  monthCardValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginVertical: 4,
  },
  monthCardSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  monthCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
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
  },
  stockItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  stockItemLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  stockItemValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
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
});
