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

import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Text, Card, Chip, Button, Surface, ProgressBar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getStockEntries, getSlowMovingProducts } from '@/services/stockEntryService';
import { getLowStockProducts, getProducts } from '@/services/productService';
import { getInventoryValuation } from '@/services/dashboardService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { EntryType } from '@/types';
import FAB from '@/components/FAB';
import { HelpButton } from '@/components/tutorial';

const { width } = Dimensions.get('window');

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
  return (
    <TouchableOpacity
      style={[styles.statCard, { backgroundColor: iconBg || '#F3F4F6' }]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View style={styles.statContent}>
        <View style={styles.statTopRow}>
          <View style={[styles.statIconCircle, { backgroundColor: (iconColor || Colors.light.primary) + '15' }]}>
            <Ionicons name={icon} size={24} color={iconColor || Colors.light.primary} />
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
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
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
    <TouchableOpacity onPress={onPress} disabled={!onPress}>
      <Surface style={[styles.alertCard, { backgroundColor: bg }]}>
        <View style={{ overflow: 'hidden', flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name={icon} size={24} color={color} />
          <View style={styles.alertContent}>
            <Text style={[styles.alertTitle, { color }]}>{title}</Text>
            <Text style={styles.alertMessage}>{message}</Text>
          </View>
          {onPress && (
            <Ionicons name="chevron-forward" size={20} color={Colors.light.textSecondary} />
          )}
        </View>
      </Surface>
    </TouchableOpacity>
  );
}

export default function InventoryDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <View style={styles.container}>
      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>
                Inventário
              </Text>
              <Text style={styles.headerSubtitle}>
                {metrics.totalItems} produtos ativos
              </Text>
            </View>
            <View style={styles.headerActions}>
              <HelpButton tutorialId="inventory" color="#fff" showBadge />
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => router.push('/(tabs)/more')}
              >
                <View style={styles.profileIcon}>
                  <Ionicons name="person" size={24} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </View>

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
                onPress={() => router.push('/(tabs)/products')}
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
              message={`${metrics.lowStockCount} produto(s) com menos de 3 unidades em estoque. Considere repor em breve.`}
              onPress={() => router.push('/products')}
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
            <Button
              mode="text"
              compact
              onPress={() => router.push('/entries')}
            >
              Ver Todas
            </Button>
          </View>

          {monthlyEntries.length > 0 ? (
            <Card style={styles.chartCard}>
              <Card.Content>
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
              </Card.Content>
            </Card>
          ) : (
            <Surface style={styles.emptyState}>
              <View style={{ overflow: 'hidden', flex: 1, alignItems: 'center' }}>
                <Ionicons name="bar-chart-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyText}>Nenhuma entrada registrada</Text>
              </View>
            </Surface>
          )}
        </View>

        {/* Últimas Entradas */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Últimas Entradas</Text>
            <Button
              mode="text"
              compact
              onPress={() => router.push('/entries')}
            >
              Ver Todas
            </Button>
          </View>

          {entries.slice(0, 5).map((entry) => (
            <TouchableOpacity
              key={entry.id}
              onPress={() => router.push({
                pathname: `/entries/${entry.id}`,
                params: { from: 'inventory' }
              })}
            >
              <Card style={styles.entryCard}>
                <Card.Content>
                  <View style={styles.entryHeader}>
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryCode}>{entry.entry_code}</Text>
                      <Text style={styles.entrySupplier}>{entry.supplier_name}</Text>
                    </View>
                    <Chip
                      mode="flat"
                      style={[
                        styles.typeChip,
                        entry.entry_type === EntryType.TRIP && { backgroundColor: Colors.light.infoLight },
                        entry.entry_type === EntryType.ONLINE && { backgroundColor: Colors.light.warningLight },
                        entry.entry_type === EntryType.LOCAL && { backgroundColor: Colors.light.successLight },
                      ]}
                      textStyle={styles.typeChipText}
                    >
                      {entry.entry_type === EntryType.TRIP ? 'Viagem' : entry.entry_type === EntryType.ONLINE ? 'Online' : 'Local'}
                    </Chip>
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
                      <Text style={styles.metricLabel}>Sell-Through</Text>
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
                </Card.Content>
              </Card>
            </TouchableOpacity>
          ))}

          {entries.length === 0 && (
            <Surface style={styles.emptyState}>
              <View style={{ overflow: 'hidden', flex: 1, alignItems: 'center' }}>
                <Ionicons name="cube-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyText}>Nenhuma entrada cadastrada</Text>
                <Button
                  mode="contained"
                  onPress={() => router.push('/entries/add')}
                  style={{ marginTop: 16 }}
                >
                  Adicionar Entrada
                </Button>
              </View>
            </Surface>
          )}
        </View>
      </ScrollView>

      {/* FAB - Adicionar entrada */}
      <FAB directRoute="/entries/add" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  // Header Premium
  headerContainer: {
    marginBottom: 0,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileButton: {
    marginLeft: 0,
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
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
    minHeight: 140,
  },
  statsGrid: {
    gap: 12,
  },
  statCard: {
    borderRadius: 16,
    padding: 16,
    flex: 1,
    minHeight: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  statTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  statIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
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
    alignItems: 'center',
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 8,
    gap: 12,
  },
  alertContent: {
    flex: 1,
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
    borderRadius: theme.borderRadius.lg,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  entryInfo: {
    flex: 1,
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
    height: 28,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  entryMetrics: {
    flexDirection: 'row',
    gap: 16,
  },
  entryMetric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.text,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 12,
  },
});
