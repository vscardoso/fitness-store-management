import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Alert
} from 'react-native';
import { Text, Card, Badge, IconButton, Portal, Modal } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { getDashboardStats, getInventoryValuation, getInventoryHealth } from '@/services/dashboardService';
import { getActiveProducts, getLowStockProducts } from '@/services/productService';
import { getDailySalesTotal, getSales } from '@/services/saleService';
import { getCustomers } from '@/services/customerService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import FAB from '@/components/FAB';

const { width } = Dimensions.get('window');

// Interface para as métricas do dashboard
interface DashboardMetric {
  id: string;
  title: string;
  value: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
  onPress: () => void;
  trend?: {
    value: string;
    isPositive: boolean;
  };
}

// Interface para ações rápidas
interface QuickAction {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string];
  onPress: () => void;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);

  // Query principal: Dashboard stats com rastreabilidade
  const { data: dashboardStats, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    enabled: !!user,
  });

  // Valoração do estoque (custo, venda, margem)
  const { data: valuation, refetch: refetchValuation } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: getInventoryValuation,
    enabled: !!user,
  });

  // Saúde do estoque (cobertura, aging, giro, score)
  const { data: health, refetch: refetchHealth } = useQuery({
    queryKey: ['inventory-health'],
    queryFn: getInventoryHealth,
    enabled: !!user,
  });

  // Query para últimas vendas
  const { data: recentSales, refetch: refetchRecentSales } = useQuery({
    queryKey: ['recent-sales'],
    queryFn: () => getSales({ limit: 5, skip: 0 }),
    enabled: !!user,
  });

  // Função de refresh completa
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchStats(),
      refetchValuation(),
      refetchHealth(),
      refetchRecentSales(),
    ]);
    setRefreshing(false);
  };

  // Extrair métricas do dashboard stats (com rastreabilidade)
  // PRIORIDADE: usar valuation (dados separados) ao invés de dashboardStats (agregado)
  const stockValue = valuation?.cost_value || dashboardStats?.stock.invested_value || 0;
  const potentialRevenue = valuation?.retail_value || dashboardStats?.stock.potential_revenue || 0;
  const potentialProfit = valuation?.potential_margin || dashboardStats?.stock.potential_profit || 0;
  const averageMargin = valuation && valuation.cost_value > 0
    ? ((valuation.retail_value - valuation.cost_value) / valuation.cost_value) * 100
    : dashboardStats?.stock.average_margin_percent || 0;
  const totalStockQuantity = dashboardStats?.stock.total_quantity || 0;
  const totalProducts = dashboardStats?.stock.total_products || 0;
  const lowStockCount = dashboardStats?.stock.low_stock_count || 0;

  const totalSalesToday = dashboardStats?.sales.total_today || 0;
  const salesCountToday = dashboardStats?.sales.count_today || 0;
  const totalSalesAll = dashboardStats?.sales.total_all || 0;
  const salesCountAll = dashboardStats?.sales.count_all || 0;
  const realizedProfit = dashboardStats?.sales.realized_profit || 0;
  const realizedMarginPercent = dashboardStats?.sales.realized_margin_percent || 0;
  const averageTicket = dashboardStats?.sales.average_ticket || 0;
  const salesTrendPercent = dashboardStats?.sales.trend_percent || 0;

  const totalCustomers = dashboardStats?.customers.total || 0;

  // Explicações dos cards
  const cardExplanations: Record<string, string> = {
    'sales-today': 'Total de vendas realizadas no dia atual. O percentual mostra a variação em relação ao dia anterior.',
    'sales-total': 'Soma de todas as vendas realizadas desde o início. Inclui o número total de transações concluídas.',
    'products': 'Quantidade total de produtos cadastrados que possuem estoque disponível para venda.',
    'customers': 'Número de clientes ativos cadastrados no sistema. Clientes inativos não são contabilizados.',
    'stock-cost': 'Valor total investido no estoque atual, calculado com base no custo de aquisição (preço de compra) de cada produto.',
    'stock-retail': 'Valor potencial de venda do estoque atual. Representa quanto você pode faturar vendendo todo o estoque ao preço de venda cadastrado.',
    'stock-margin': 'Diferença entre o valor de venda e o custo do estoque. Indica o lucro potencial caso todo o estoque seja vendido. O percentual mostra a margem média.',
    'conditional-shipments': 'Envios condicionais ativos (produtos enviados para clientes experimentarem antes de comprar). O valor total representa o estoque temporariamente nas mãos dos clientes.',
    'realized-profit': 'Lucro efetivo obtido com as vendas já realizadas. Calculado subtraindo o CMV (Custo das Mercadorias Vendidas) do total de vendas. O percentual mostra a margem de lucro real.',
  };

  // Ações rápidas
  const quickActions: QuickAction[] = [
    {
      id: 'new-sale',
      title: 'Nova Venda',
      icon: 'cart',
      colors: ['#11998e', '#38ef7d'],
      onPress: () => {
        setQuickActionsVisible(false);
        router.push('/(tabs)/sale');
      },
    },
    {
      id: 'conditional-shipments',
      title: 'Envios Condici...',
      icon: 'cube-outline',
      colors: ['#f093fb', '#f5576c'],
      onPress: () => {
        setQuickActionsVisible(false);
        router.push('/(tabs)/conditional');
      },
    },
    {
      id: 'new-customer',
      title: 'Novo Cliente',
      icon: 'person-add',
      colors: ['#667eea', '#764ba2'],
      onPress: () => {
        setQuickActionsVisible(false);
        router.push('/customers/add');
      },
    },
    {
      id: 'new-product',
      title: 'Novo Produto',
      icon: 'cube',
      colors: ['#4776e6', '#8e54e9'],
      onPress: () => {
        setQuickActionsVisible(false);
        router.push('/products/add');
      },
    },
    {
      id: 'new-entry',
      title: 'Nova Entrada',
      icon: 'layers',
      colors: ['#fa709a', '#fee140'],
      onPress: () => {
        setQuickActionsVisible(false);
        router.push('/entries/add');
      },
    },
  ];

  // Métricas do dashboard
  const metrics: DashboardMetric[] = [
    {
      id: 'sales-today',
      title: 'Vendas Hoje',
      value: formatCurrency(totalSalesToday),
      subtitle: `${salesCountToday} ${salesCountToday === 1 ? 'venda' : 'vendas'}`,
      icon: 'trending-up',
      colors: ['#11998e', '#38ef7d'],
      onPress: () => router.push('/(tabs)/sales'),
      trend: {
        value: `${salesTrendPercent > 0 ? '+' : ''}${salesTrendPercent.toFixed(1)}%`,
        isPositive: salesTrendPercent >= 0,
      },
    },
    {
      id: 'sales-total',
      title: 'Vendas Totais',
      value: formatCurrency(totalSalesAll),
      subtitle: `${salesCountAll} ${salesCountAll === 1 ? 'venda' : 'vendas'}`,
      icon: 'cash-outline',
      colors: ['#f093fb', '#f5576c'],
      onPress: () => router.push('/(tabs)/sales'),
    },
    {
      id: 'products',
      title: 'Produtos',
      value: totalProducts.toString(),
      subtitle: 'com estoque',
      icon: 'cube',
      colors: ['#667eea', '#764ba2'],
      onPress: () => router.push('/(tabs)/products'),
    },
    {
      id: 'customers',
      title: 'Clientes',
      value: totalCustomers.toString(),
      subtitle: 'ativos',
      icon: 'people',
      colors: ['#30cfd0', '#330867'],
      onPress: () => router.push('/(tabs)/customers'),
    },
    {
      id: 'stock-cost',
      title: 'Estoque (Custo)',
      value: formatCurrency(stockValue),
      subtitle: 'valor investido',
      icon: 'wallet',
      colors: ['#4776e6', '#8e54e9'],
      onPress: () => router.push('/(tabs)/products'),
    },
    {
      id: 'stock-retail',
      title: 'Estoque (Venda)',
      value: formatCurrency(potentialRevenue),
      subtitle: 'valor potencial',
      icon: 'cash',
      colors: ['#11998e', '#38ef7d'],
      onPress: () => router.push('/(tabs)/products'),
    },
    {
      id: 'stock-margin',
      title: 'Margem Potencial',
      value: formatCurrency(potentialProfit),
      subtitle: `${averageMargin.toFixed(1)}% média`,
      icon: 'trending-up',
      colors: ['#30cfd0', '#330867'],
      onPress: () => router.push('/reports'),
    },
    {
      id: 'realized-profit',
      title: 'Lucro Realizado',
      value: formatCurrency(realizedProfit),
      subtitle: `${realizedMarginPercent.toFixed(1)}% margem`,
      icon: 'stats-chart',
      colors: ['#fa709a', '#fee140'],
      onPress: () => router.push('/(tabs)/sales'),
    },
  ];

  // Função para obter saudação baseada no horário
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // Componente de Header Premium
  const PremiumHeader = () => (
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
              {getGreeting()}, {user?.full_name?.split(' ')[0] || 'Usuário'}! 👋
            </Text>
            <Text style={styles.headerSubtitle}>
              {user?.store_name ? `${user.store_name} - Fitness Store` : 'Fitness Store Management'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push('/(tabs)/more')}
          >
            <View style={styles.profileIcon}>
              <Ionicons name="person" size={24} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );

  // Componente de Quick Actions
  const QuickActionsSection = () => (
    <View style={styles.quickActionsContainer}>
      <Text style={styles.sectionTitle}>Ações Rápidas</Text>
      <View style={styles.quickActionsGrid}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.quickActionButton}
            onPress={action.onPress}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={action.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quickActionGradient}
            >
              <Ionicons name={action.icon} size={24} color="#fff" />
              <Text style={styles.quickActionText}>{action.title}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Componente de Métrica
  const MetricCard = ({ metric }: { metric: DashboardMetric }) => (
    <TouchableOpacity
      style={styles.metricCard}
      onPress={metric.onPress}
      activeOpacity={0.7}
    >
      <Card style={styles.metricCardInner}>
        <LinearGradient
          colors={metric.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.metricGradient}
        >
          <View style={styles.metricHeader}>
            <Ionicons name={metric.icon} size={28} color="#fff" />
            <View style={styles.metricHeaderRight}>
              {metric.trend && (
                <View style={styles.trendContainer}>
                  <Text style={styles.trendText}>{metric.trend.value}</Text>
                  <Ionicons
                    name={metric.trend.isPositive ? 'arrow-up' : 'arrow-down'}
                    size={12}
                    color="#fff"
                  />
                </View>
              )}
              <TouchableOpacity
                onPress={() => setTooltipVisible(tooltipVisible === metric.id ? null : metric.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.metricTitle}>{metric.title}</Text>
          <Text style={styles.metricValue}>{metric.value}</Text>
          <Text style={styles.metricSubtitle}>{metric.subtitle}</Text>
          
          {/* Tooltip */}
          {tooltipVisible === metric.id && (
            <View style={styles.tooltip}>
              <Text style={styles.tooltipText}>{cardExplanations[metric.id]}</Text>
            </View>
          )}
        </LinearGradient>
      </Card>
    </TouchableOpacity>
  );

  // Componente de Insights
  const InsightsSection = () => (
    <View style={styles.insightsContainer}>
      <Text style={styles.sectionTitle}>Insights do Negócio</Text>

      {/* Card de Rentabilidade */}
      {totalProducts > 0 && (
        <Card style={styles.insightCard}>
          <Card.Content style={styles.insightContent}>
            <View style={styles.insightHeader}>
              <Ionicons name="trending-up" size={20} color={Colors.light.success} />
              <Text style={styles.insightTitle}>Rentabilidade</Text>
            </View>
            <Text style={styles.insightText}>
              Margem de lucro média de <Text style={styles.insightHighlight}>{averageMargin.toFixed(1)}%</Text>
              {' '}com potencial de lucro de <Text style={styles.insightHighlight}>{formatCurrency(potentialProfit)}</Text>
              {' '}sobre o estoque atual.
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* Card de Ticket Médio */}
      {salesCountToday > 0 && (
        <Card style={styles.insightCard}>
          <Card.Content style={styles.insightContent}>
            <View style={styles.insightHeader}>
              <Ionicons name="calculator" size={20} color={Colors.light.primary} />
              <Text style={styles.insightTitle}>Ticket Médio</Text>
            </View>
            <Text style={styles.insightText}>
              Valor médio por venda de <Text style={styles.insightHighlight}>{formatCurrency(averageTicket)}</Text>
              {' '}com <Text style={styles.insightHighlight}>{salesCountToday}</Text> venda{salesCountToday > 1 ? 's' : ''} hoje.
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* Card de Estoque - Valuation */}
      {totalProducts > 0 && (
        <Card style={styles.insightCard}>
          <Card.Content style={styles.insightContent}>
            <View style={styles.insightHeader}>
              <Ionicons name="cube" size={20} color={Colors.light.info} />
              <Text style={styles.insightTitle}>Gestão de Estoque</Text>
            </View>
            <Text style={styles.insightText}>
              <Text style={styles.insightHighlight}>{formatCurrency(valuation?.cost_value || stockValue)}</Text> em custo
              {' '}e <Text style={styles.insightHighlight}>{formatCurrency(valuation?.retail_value || potentialRevenue)}</Text> em venda.
              {' '}Margem potencial de <Text style={styles.insightHighlight}>{formatCurrency(valuation?.potential_margin || potentialProfit)}</Text>.
              {lowStockCount > 0 && ` ${lowStockCount} produto${lowStockCount > 1 ? 's' : ''} com estoque baixo.`}
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* Card de Alertas */}
      {lowStockCount > 0 && (
        <Card style={styles.alertCard}>
          <Card.Content style={styles.insightContent}>
            <View style={styles.insightHeader}>
              <Ionicons name="warning" size={20} color={Colors.light.error} />
              <Text style={styles.alertTitle}>Ação Necessária</Text>
            </View>
            <Text style={styles.alertText}>
              {lowStockCount} produto{lowStockCount > 1 ? 's' : ''} com estoque crítico.
              Reponha agora para evitar perda de vendas!
            </Text>
            <TouchableOpacity
              style={styles.alertButton}
              onPress={() => router.push('/(tabs)/products')}
            >
              <Text style={styles.alertButtonText}>Reabastecer Agora</Text>
            </TouchableOpacity>
          </Card.Content>
        </Card>
      )}

      {/* Card de Primeiros Passos (quando não há dados) */}
      {totalProducts === 0 && (
        <Card style={styles.insightCard}>
          <Card.Content style={styles.insightContent}>
            <View style={styles.insightHeader}>
              <Ionicons name="rocket" size={20} color={Colors.light.primary} />
              <Text style={styles.insightTitle}>Comece Agora</Text>
            </View>
            <Text style={styles.insightText}>
              Cadastre seus primeiros produtos e clientes para começar a vender e acompanhar o desempenho do seu negócio.
            </Text>
          </Card.Content>
        </Card>
      )}
      {/* Card de Saúde do Estoque */}
      {health && (
        <Card style={styles.insightCard}>
          <Card.Content style={styles.insightContent}>
            <View style={styles.insightHeader}>
              <Ionicons name="stats-chart" size={20} color={Colors.light.primary} />
              <Text style={styles.insightTitle}>Saúde do Estoque</Text>
            </View>
            <Text style={styles.insightText}>
              Cobertura: <Text style={styles.insightHighlight}>
                {health.coverage_days ? `${health.coverage_days.toFixed(1)} dias` : 'N/A'}
              </Text>. Rupturas: <Text style={styles.insightHighlight}>{lowStockCount}</Text>.
              Giro 30d: <Text style={styles.insightHighlight}>
                {health.turnover_30d ? `${health.turnover_30d.toFixed(2)}x` : 'N/A'}
              </Text>. Score: <Text style={styles.insightHighlight}>{health.health_score}</Text>.
            </Text>
          </Card.Content>
        </Card>
      )}
    </View>
  );

  // Componente de Atividades Recentes
  const RecentActivitySection = () => (
    <View style={styles.activityContainer}>
      <View style={styles.activityHeader}>
        <Text style={styles.sectionTitle}>Atividade Recente</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/sales')}>
          <Text style={styles.seeAllText}>Ver todas</Text>
        </TouchableOpacity>
      </View>

      {recentSales && recentSales.length > 0 ? (
        <View style={styles.activityList}>
          {recentSales.slice(0, 3).map((sale, index) => (
            <View key={sale.id} style={styles.activityItem}>
              <View style={styles.activityIcon}>
                <Ionicons name="receipt" size={16} color={Colors.light.primary} />
              </View>
              <View style={styles.activityInfo}>
                <Text style={styles.activityTitle}>
                  Venda #{sale.id}
                </Text>
                <Text style={styles.activitySubtitle}>
                  {formatCurrency(sale.total_amount || (sale as any).total || 0)}
                </Text>
              </View>
              <Text style={styles.activityTime}>
                {new Date(sale.created_at).toLocaleDateString('pt-BR')}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Card style={styles.emptyActivityCard}>
          <Card.Content style={styles.emptyActivityContent}>
            <Ionicons name="receipt-outline" size={48} color={Colors.light.textTertiary} />
            <Text style={styles.emptyActivityText}>Nenhuma venda registrada hoje</Text>
            <TouchableOpacity
              style={styles.emptyActivityButton}
              onPress={() => router.push('/(tabs)/sales')}
            >
              <Text style={styles.emptyActivityButtonText}>Fazer primeira venda</Text>
            </TouchableOpacity>
          </Card.Content>
        </Card>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Overlay transparente para fechar tooltip */}
      {tooltipVisible && (
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setTooltipVisible(null)}
        />
      )}

      {/* Header Premium */}
      <PremiumHeader />

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
        onScroll={() => tooltipVisible && setTooltipVisible(null)}
        scrollEventThrottle={16}
      >
        {/* Seção de Ações Rápidas */}
        <QuickActionsSection />

        {/* Seção de Métricas */}
        <View style={styles.metricsContainer}>
          <Text style={styles.sectionTitle}>Métricas do Negócio</Text>
          <View style={styles.metricsGrid}>
            {metrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </View>
        </View>

        {/* Seção de Insights */}
        <InsightsSection />

        {/* Seção de Atividade Recente */}
        <RecentActivitySection />

        {/* Espaçamento final */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* FAB - Botão de Ações Rápidas */}
      <FAB />

      {/* Modal de Ações Rápidas */}
      <Portal>
        <Modal
          visible={quickActionsVisible}
          onDismiss={() => setQuickActionsVisible(false)}
          contentContainerStyle={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Escolha uma ação</Text>
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.modalActionButton}
                onPress={action.onPress}
              >
                <View style={styles.modalActionIcon}>
                  <Ionicons name={action.icon} size={24} color={Colors.light.primary} />
                </View>
                <Text style={styles.modalActionText}>{action.title}</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.light.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },

  // Header Premium
  headerContainer: {
    marginBottom: theme.spacing.md,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    color: '#fff',
    opacity: 0.9,
  },
  profileButton: {
    marginLeft: theme.spacing.md,
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Quick Actions
  quickActionsContainer: {
    marginBottom: theme.spacing.lg,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  quickActionButton: {
    flex: 1,
  },
  quickActionGradient: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    gap: theme.spacing.xs,
    elevation: theme.elevation.sm,
  },
  quickActionText: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Métricas
  metricsContainer: {
    marginBottom: theme.spacing.lg,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  metricCard: {
    width: (width - theme.spacing.md * 2 - theme.spacing.sm) / 2,
  },
  metricCardInner: {
    borderRadius: theme.borderRadius.xl,
    elevation: theme.elevation.md,
  },
  metricGradient: {
    padding: theme.spacing.md,
    minHeight: 140,
    justifyContent: 'space-between',
    borderRadius: theme.borderRadius.xl,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  metricHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  metricIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.md,
    gap: 2,
  },
  trendText: {
    color: '#fff',
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  metricTitle: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    opacity: 0.9,
    marginBottom: theme.spacing.xs,
  },
  metricValue: {
    color: '#fff',
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    marginBottom: 2,
  },
  metricSubtitle: {
    color: '#fff',
    fontSize: theme.fontSize.xs,
    opacity: 0.8,
  },

  // Insights
  insightsContainer: {
    marginBottom: theme.spacing.lg,
  },
  insightCard: {
    marginBottom: theme.spacing.sm,
    elevation: theme.elevation.sm,
    borderRadius: theme.borderRadius.lg,
  },
  insightContent: {
    paddingVertical: theme.spacing.md,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  insightTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: Colors.light.text,
  },
  insightText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  insightHighlight: {
    fontWeight: '700',
    color: Colors.light.primary,
  },

  // Alertas
  alertCard: {
    backgroundColor: Colors.light.errorLight,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.error,
    marginBottom: theme.spacing.sm,
    elevation: theme.elevation.sm,
    borderRadius: theme.borderRadius.lg,
  },
  alertTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: Colors.light.error,
  },
  alertText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.error,
    marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
  alertButton: {
    backgroundColor: Colors.light.error,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    alignSelf: 'flex-start',
  },
  alertButtonText: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
  },

  // Atividade Recente
  activityContainer: {
    marginBottom: theme.spacing.lg,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  activityList: {
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.lg,
    elevation: theme.elevation.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '500',
    color: Colors.light.text,
  },
  activitySubtitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  activityTime: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
  },
  emptyActivityCard: {
    elevation: theme.elevation.sm,
    borderRadius: theme.borderRadius.lg,
  },
  emptyActivityContent: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyActivityText: {
    fontSize: theme.fontSize.md,
    color: Colors.light.textSecondary,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  emptyActivityButton: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  emptyActivityButtonText: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
  },

  // Títulos de Seção
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.md,
  },
  seeAllText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.primary,
    fontWeight: '500',
  },

  // Modal
  modalContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    elevation: theme.elevation.xl,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    gap: theme.spacing.md,
  },
  modalActionIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: Colors.light.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
    color: Colors.light.text,
  },

  // Tooltip
  tooltipOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  tooltip: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    zIndex: 1000,
    elevation: theme.elevation.xl,
  },
  tooltipText: {
    color: '#fff',
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
  },

  // Espaçamento
  bottomSpacing: {
    height: 100,
  },
});
