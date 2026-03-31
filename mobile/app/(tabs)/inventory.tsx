/**
 * Inventory Dashboard - Dashboard de Inventário
 * 
 * Funcionalidades:
 * - Total em estoque (valor)
 * - Produtos encalhados (>60 dias)
 * - Últimas entradas
 * - Taxa média de venda
 * - Alertas: produtos com estoque baixo
 * - Gráficos: entradas por mês
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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useAuth } from '@/hooks/useAuth';
import { getStockEntries, getSlowMovingProducts } from '@/services/stockEntryService';
import { getLowStockProducts, getProducts } from '@/services/productService';
import { getInventoryValuation } from '@/services/dashboardService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { EntryType } from '@/types';
import PageHeader from '@/components/layout/PageHeader';
import { useTutorialContext } from '@/components/tutorial';

/**
 * Componente: Card de Estatística
 */
interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  trend?: number; // % de mudança
  iconColor?: string;
  iconBg?: string;
  onPress?: () => void;
}

function StatCard({ icon, label, value, trend, iconColor, iconBg, onPress }: StatCardProps) {
  const resolvedIconColor = iconColor || Colors.light.primary;
  const resolvedIconBg = iconBg || `${resolvedIconColor}14`;

  return (
    <TouchableOpacity
      style={styles.statCard}
      onPress={onPress}
      activeOpacity={0.76}
      disabled={!onPress}
    >
      <View style={styles.statContent}>
        <View style={styles.statTopRow}>
          <View style={[styles.statIconCircle, { backgroundColor: resolvedIconBg }]}>
            <Ionicons name={icon} size={22} color={resolvedIconColor} />
          </View>
          {trend !== undefined && (
            <View style={[
              styles.trendBadge,
              { backgroundColor: trend >= 0 ? '#ECFDF5' : '#FEF2F2' }
            ]}>
              <Ionicons
                name={trend >= 0 ? 'arrow-up' : 'arrow-down'}
                size={10}
                color={trend >= 0 ? '#10B981' : '#EF4444'}
              />
              <Text style={[
                styles.trendBadgeText,
                { color: trend >= 0 ? '#10B981' : '#EF4444' }
              ]}>
                {Math.abs(trend).toFixed(0)}%
              </Text>
            </View>
          )}
        </View>

        <View style={styles.statBody}>
          <Text style={styles.statLabel} numberOfLines={2}>
            {label}
          </Text>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Componente: Alert Card
 */
interface AlertCardProps {
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  onPress?: () => void;
}

function AlertCard({ type, title, message, onPress }: AlertCardProps) {
  const config = {
    warning: {
      icon: 'warning' as keyof typeof Ionicons.glyphMap,
      color: Colors.light.warning,
      bg: Colors.light.warningLight,
    },
    error: {
      icon: 'alert-circle' as keyof typeof Ionicons.glyphMap,
      color: Colors.light.error,
      bg: Colors.light.errorLight,
    },
    info: {
      icon: 'information-circle' as keyof typeof Ionicons.glyphMap,
      color: Colors.light.info,
      bg: Colors.light.infoLight,
    },
  };

  const { icon, color, bg } = config[type];

  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.76}>
      <View style={styles.alertCard}>
        <View style={[styles.alertAccent, { backgroundColor: color }]} />
        <View style={styles.alertMainRow}>
          <View style={[styles.alertIconWrap, { backgroundColor: bg }]}>
            <Ionicons name={icon} size={20} color={color} />
          </View>
          <View style={styles.alertContent}>
            <Text style={[styles.alertTitle, { color }]}>{title}</Text>
            <Text style={styles.alertMessage}>{message}</Text>
          </View>
          {onPress && <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function InventoryDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { startTutorial } = useTutorialContext();
  const [refreshing, setRefreshing] = useState(false);

  const headerOpacity = useSharedValue(0);
  const headerScale = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY = useSharedValue(24);

  // Queries
  const { data: entries = [], refetch: refetchEntries } = useQuery({
    queryKey: ['stock-entries'],
    queryFn: () => getStockEntries({ limit: 10 }),
  });

  const { data: products = [], refetch: refetchProducts } = useQuery({
    queryKey: ['products-inventory'],
    queryFn: () => getProducts({ limit: 1000 }),
  });

  const { data: slowMovingProducts = [], refetch: refetchSlow } = useQuery({
    queryKey: ['slow-moving-products'],
    queryFn: () => getSlowMovingProducts({ days_threshold: 60, depletion_threshold: 30 }),
  });

  const { data: lowStockProducts = [], refetch: refetchLow } = useQuery({
    queryKey: ['low-stock'],
    queryFn: getLowStockProducts,
  });

  // Valoração do estoque (fonte única da verdade)
  const { data: valuation, refetch: refetchValuation } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: getInventoryValuation,
  });

  /**
   * Refresh handler
   */
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchEntries(),
      refetchProducts(),
      refetchSlow(),
      refetchLow(),
      refetchValuation(),
    ]);
    setRefreshing(false);
  };

  /**
   * Calcular métricas do dashboard baseado no inventário
   */
  const calculateMetrics = () => {
    // Filtrar apenas produtos ativos e não catálogo
    const activeProducts = products.filter(p => p.is_active && !p.is_catalog);

    // Calcular total em estoque (quantidade válida >= 0)
    const totalQuantity = activeProducts.reduce((sum, product) => {
      const stock = product.current_stock ?? 0;
      return sum + (stock >= 0 ? stock : 0);
    }, 0);

    // Usar valoração do endpoint (fonte única da verdade)
    const totalValue = valuation?.cost_value || 0;

    // Total de produtos ativos não catálogo
    const totalItems = activeProducts.length;

    // Produtos com estoque (quantidade > 0)
    const productsWithStock = activeProducts.filter(p => (p.current_stock ?? 0) > 0).length;

    // Produtos sem estoque
    const productsOutOfStock = activeProducts.filter(p => (p.current_stock ?? 0) === 0).length;

    // Estoque baixo: quantidade > 0 e < 3
    const productsLowStock = activeProducts.filter(p => {
      const stock = p.current_stock ?? 0;
      return stock > 0 && stock < 3;
    }).length;

    return {
      totalQuantity,
      totalValue,
      totalItems,
      productsWithStock,
      productsOutOfStock,
      slowMovingCount: slowMovingProducts.length,
      lowStockCount: productsLowStock,
    };
  };

  const metrics = calculateMetrics();

  /**
   * Calcular entradas por mês (últimos 6 meses)
   */
  const calculateMonthlyEntries = () => {
    const monthlyData: Record<string, { count: number; value: number; totalProducts: number }> = {};

    entries.forEach(entry => {
      const month = entry.entry_date.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { count: 0, value: 0, totalProducts: 0 };
      }
      monthlyData[month].count++;
      
      // Garantir que total_cost é um número válido
      const cost = typeof entry.total_cost === 'number' && !isNaN(entry.total_cost) 
        ? entry.total_cost 
        : 0;
      monthlyData[month].value += cost;
      
      // Somar total de produtos/itens da entrada
      const items = typeof entry.total_items === 'number' && !isNaN(entry.total_items)
        ? entry.total_items
        : 0;
      monthlyData[month].totalProducts += items;
    });

    // Ordenar por mês
    const sorted = Object.entries(monthlyData)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);

    return sorted;
  };

  const monthlyEntries = calculateMonthlyEntries();

  useFocusEffect(
    useCallback(() => {
      headerOpacity.value = 0;
      headerScale.value = 0.94;
      contentOpacity.value = 0;
      contentTransY.value = 24;

      headerOpacity.value = withTiming(1, {
        duration: 380,
        easing: Easing.out(Easing.quad),
      });
      headerScale.value = withSpring(1, { damping: 16, stiffness: 200 });

      const timer = setTimeout(() => {
        contentOpacity.value = withTiming(1, { duration: 340 });
        contentTransY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }, 140);

      return () => clearTimeout(timer);
    }, [contentOpacity, contentTransY, headerOpacity, headerScale])
  );

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={styles.headerAnimation}>
        <Animated.View style={headerAnimStyle}>
          <PageHeader
            title="Inventário"
            subtitle={`${metrics.totalItems} produtos ativos`}
            rightActions={[
              { icon: 'help-circle-outline', onPress: () => startTutorial('inventory') },
            ]}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.contentAnimation, contentAnimStyle]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
        {/* KPIs Principais */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indicadores Principais</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCardWrapper}>
              <StatCard
                icon="cube-outline"
                label="Produtos Ativos"
                value={metrics.totalItems}
                iconColor={Colors.light.info}
                iconBg={Colors.light.infoLight}
                onPress={() => router.push('/(tabs)/products')}
              />
            </View>
            <View style={styles.statCardWrapper}>
              <StatCard
                icon="layers-outline"
                label="Unidades em Estoque"
                value={metrics.totalQuantity.toLocaleString('pt-BR')}
                iconColor={Colors.light.primary}
                iconBg={Colors.light.primaryLight}
                onPress={() => router.push('/(tabs)/products')}
              />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCardWrapper}>
              <StatCard
                icon="wallet-outline"
                label="Valor Investido"
                value={formatCurrency(metrics.totalValue)}
                iconColor={Colors.light.success}
                iconBg={Colors.light.successLight}
                onPress={() => router.push('/(tabs)/products')}
              />
            </View>
            <View style={styles.statCardWrapper}>
              <StatCard
                icon="checkmark-circle-outline"
                label="Com Estoque"
                value={metrics.productsWithStock}
                iconColor={Colors.light.success}
                iconBg={Colors.light.successLight}
                onPress={() => router.push('/(tabs)/products')}
              />
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCardWrapper}>
              <StatCard
                icon="alert-circle-outline"
                label="Sem Estoque"
                value={metrics.productsOutOfStock}
                iconColor={Colors.light.error}
                iconBg={Colors.light.errorLight}
                onPress={() => router.push('/(tabs)/products')}
              />
            </View>
            <View style={styles.statCardWrapper}>
              <StatCard
                icon="warning-outline"
                label="Estoque Baixo (<3)"
                value={metrics.lowStockCount}
                iconColor={Colors.light.warning}
                iconBg={Colors.light.warningLight}
                onPress={() => router.push('/(tabs)/products?filter=low_stock' as any)}
              />
            </View>
          </View>
        </View>

        {/* Alertas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alertas de Estoque</Text>

          {metrics.productsOutOfStock > 0 && (
            <AlertCard
              type="error"
              title="Produtos Sem Estoque"
              message={`${metrics.productsOutOfStock} produto(s) sem unidades disponíveis. Reponha o estoque o quanto antes.`}
              onPress={() => router.push('/products')}
            />
          )}

          {metrics.lowStockCount > 0 && (
            <AlertCard
              type="warning"
              title="Estoque Baixo"
              message={`${metrics.lowStockCount} produto(s) com menos de 3 unidades em estoque. Toque para ver quais.`}
              onPress={() => router.push('/(tabs)/products?filter=low_stock' as any)}
            />
          )}

          {metrics.slowMovingCount > 0 && (
            <AlertCard
              type="warning"
              title="Produtos Encalhados"
              message={`${metrics.slowMovingCount} produto(s) com mais de 60 dias parados`}
              onPress={() => router.push('/(tabs)/products')}
            />
          )}

          {metrics.productsOutOfStock === 0 && metrics.lowStockCount === 0 && metrics.slowMovingCount === 0 && (
            <AlertCard
              type="info"
              title="Tudo em Ordem"
              message="Nenhum alerta no momento"
            />
          )}
        </View>

        {/* Gráfico de Entradas por Mês */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Entradas por Mês</Text>
            <TouchableOpacity onPress={() => router.push('/entries')} activeOpacity={0.7}>
              <Text style={styles.seeAllText}>Ver Todas</Text>
            </TouchableOpacity>
          </View>

          {monthlyEntries.length > 0 ? (
            <View style={styles.chartCard}>
              <View style={styles.chartCardContent}>
                {monthlyEntries.map(([month, data], index) => {
                  // Validar valores para evitar NaN
                  const safeValue = typeof data.value === 'number' && !isNaN(data.value) ? data.value : 0;
                  const safeCount = typeof data.count === 'number' && !isNaN(data.count) ? data.count : 0;
                  const safeProducts = typeof data.totalProducts === 'number' && !isNaN(data.totalProducts) ? data.totalProducts : 0;
                  
                  const maxValue = Math.max(...monthlyEntries.map(([, d]) => 
                    typeof d.value === 'number' && !isNaN(d.value) ? d.value : 0
                  ));
                  const totalValue = monthlyEntries.reduce((sum, [, d]) => {
                    const val = typeof d.value === 'number' && !isNaN(d.value) ? d.value : 0;
                    return sum + val;
                  }, 0);
                  
                  const progressPercentage = maxValue > 0 ? safeValue / maxValue : 0;
                  const sharePercentage = totalValue > 0 ? (safeValue / totalValue) * 100 : 0;

                  // Formatar mês (YYYY-MM -> MMM/YYYY)
                  const [year, monthNum] = month.split('-');
                  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                  const monthLabel = `${monthNames[parseInt(monthNum) - 1]}/${year}`;

                  // Cores graduais (mais intenso = maior valor)
                  const barColor = progressPercentage > 0.7 
                    ? Colors.light.success
                    : progressPercentage > 0.4
                    ? Colors.light.primary
                    : Colors.light.warning;

                  return (
                    <View 
                      key={month} 
                      style={[
                        styles.chartRowImproved,
                        index !== monthlyEntries.length - 1 && styles.chartRowBorder
                      ]}
                    >
                      {/* Cabeçalho com Mês e % Participação */}
                      <View style={styles.chartRowHeader}>
                        <Text style={styles.chartMonthImproved}>{monthLabel}</Text>
                        <View style={styles.shareChip}>
                          <Text style={styles.shareText}>{sharePercentage.toFixed(0)}%</Text>
                        </View>
                      </View>

                      {/* Barra de Progresso */}
                      <View style={styles.chartBarContainerImproved}>
                        <LinearGradient
                          colors={[barColor, `${barColor}80`]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[
                            styles.chartBarImproved,
                            { width: `${progressPercentage * 100}%` }
                          ]}
                        />
                      </View>

                      {/* Dados: Valor e Quantidade */}
                      <View style={styles.chartDataImproved}>
                        <View style={styles.chartMetricBox}>
                          <Ionicons name="cash-outline" size={14} color={Colors.light.textSecondary} />
                          <Text style={styles.chartValueImproved}>{formatCurrency(safeValue)}</Text>
                        </View>
                        <View style={styles.chartMetricBox}>
                          <Ionicons name="documents-outline" size={14} color={Colors.light.textSecondary} />
                          <Text style={styles.chartCountImproved}>
                            {safeCount} {safeCount === 1 ? 'entrada' : 'entradas'}
                            {safeProducts > 0 && (
                              <Text style={styles.chartProductCount}> ({safeProducts} {safeProducts === 1 ? 'produto' : 'produtos'})</Text>
                            )}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={{ overflow: 'hidden', flex: 1, alignItems: 'center' }}>
                <Ionicons name="bar-chart-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyText}>Nenhuma entrada registrada</Text>
              </View>
            </View>
          )}
        </View>

        {/* Últimas Entradas */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Últimas Entradas</Text>
            <TouchableOpacity onPress={() => router.push('/entries')} activeOpacity={0.7}>
              <Text style={styles.seeAllText}>Ver Todas</Text>
            </TouchableOpacity>
          </View>

          {entries.slice(0, 5).map((entry) => (
            <TouchableOpacity
              key={entry.id}
              onPress={() => router.push({
                pathname: `/entries/${entry.id}`,
                params: { from: 'inventory' }
              })}
              activeOpacity={0.76}
            >
              <View style={styles.entryCard}>
                  <View style={styles.entryHeader}>
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryCode}>{entry.entry_code}</Text>
                      <Text style={styles.entrySupplier}>{entry.supplier_name}</Text>
                    </View>
                    <View
                      style={[
                        styles.typeChip,
                        entry.entry_type === EntryType.TRIP && { backgroundColor: Colors.light.infoLight, borderColor: Colors.light.info + '24' },
                        entry.entry_type === EntryType.ONLINE && { backgroundColor: Colors.light.warningLight, borderColor: Colors.light.warning + '24' },
                        entry.entry_type === EntryType.LOCAL && { backgroundColor: Colors.light.successLight, borderColor: Colors.light.success + '24' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          entry.entry_type === EntryType.TRIP && { color: Colors.light.info },
                          entry.entry_type === EntryType.ONLINE && { color: Colors.light.warning },
                          entry.entry_type === EntryType.LOCAL && { color: Colors.light.success },
                        ]}
                      >
                        {entry.entry_type === EntryType.TRIP ? 'Compra em Viagem' : entry.entry_type === EntryType.ONLINE ? 'Compra Online' : 'Compra Local'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.entryMetrics}>
                    <View style={styles.entryMetric}>
                      <Text style={styles.metricLabel}>Data</Text>
                      <Text style={styles.metricValue}>{formatDate(entry.entry_date)}</Text>
                    </View>
                    <View style={styles.entryMetric}>
                      <Text style={styles.metricLabel}>Total</Text>
                      <Text style={styles.metricValue}>{formatCurrency(entry.total_cost || 0)}</Text>
                    </View>
                    <View style={styles.entryMetric}>
                      <Text style={styles.metricLabel}>Vendido</Text>
                      <Text style={[
                        styles.metricValue,
                        {
                          color:
                            (entry.sell_through_rate || 0) >= 70 ? Colors.light.success :
                            (entry.sell_through_rate || 0) >= 40 ? Colors.light.warning :
                            Colors.light.error
                        }
                      ]}>
                        {(entry.sell_through_rate || 0).toFixed(0)}%
                      </Text>
                    </View>
                  </View>
              </View>
            </TouchableOpacity>
          ))}

          {entries.length === 0 && (
            <View style={styles.emptyState}>
              <View style={{ overflow: 'hidden', flex: 1, alignItems: 'center' }}>
                <Ionicons name="cube-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyText}>Nenhuma entrada cadastrada</Text>
                <TouchableOpacity
                  style={styles.addEntryButton}
                  onPress={() => router.push('/entries/add')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addEntryButtonText}>Adicionar Entrada</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
        </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCardWrapper: {
    flex: 1,
    minHeight: 132,
  },
  statsGrid: {
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  statContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  statTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  statIconCircle: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statBody: {
    gap: 6,
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  statValue: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '800',
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 2,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: theme.borderRadius.xl,
    marginBottom: 8,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  alertAccent: {
    width: 4,
  },
  alertMainRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  alertIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  alertContent: {
    flex: 1,
    minWidth: 0,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  alertMessage: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  chartCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  chartCardContent: {
    padding: theme.spacing.md,
  },
  seeAllText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  addEntryButton: {
    marginTop: 16,
    backgroundColor: Colors.light.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  addEntryButtonText: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  chartMonth: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.text,
    width: 60,
  },
  chartBarContainer: {
    flex: 1,
    height: 8,
  },
  chartBar: {
    height: 8,
    borderRadius: 4,
  },
  chartData: {
    alignItems: 'flex-end',
    width: 100,
  },
  chartValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.text,
  },
  chartCount: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  // Novos estilos para card melhorado
  chartRowImproved: {
    marginBottom: 20,
  },
  chartRowBorder: {
    marginTop: 20,
  },
  chartRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  chartMonthImproved: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
  },
  shareChip: {
    backgroundColor: Colors.light.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  shareText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  chartBarContainerImproved: {
    height: 12,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: 6,
    marginBottom: 12,
    overflow: 'hidden',
  },
  chartBarImproved: {
    height: 12,
    borderRadius: 6,
  },
  chartDataImproved: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  chartMetricBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  chartValueImproved: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  chartCountImproved: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  chartProductCount: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.light.textTertiary,
  },
  entryCard: {
    backgroundColor: Colors.light.card,
    marginBottom: 12,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  entryInfo: {
    flex: 1,
    minWidth: 0,
  },
  entryCode: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 2,
  },
  entrySupplier: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  typeChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.light.text,
  },
  entryMetrics: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  entryMetric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: theme.fontSize.xxs + 1,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  metricValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 12,
  },
});
