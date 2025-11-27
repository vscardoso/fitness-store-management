/**
 * Reports Screen - Tela de Relatórios
 * 
 * Funcionalidades:
 * - Viagens mais lucrativas
 * - Fornecedores com melhor ROI
 * - Produtos best sellers
 * - Produtos encalhados
 * - Comparação período a período
 * - Botão "Exportar" (futuro)
 */

import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  Chip,
  Button,
  Surface,
  SegmentedButtons,
  Menu,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import useBackToList from '@/hooks/useBackToList';
import { useQuery } from '@tanstack/react-query';
import { getTrips } from '@/services/tripService';
import { getStockEntries, getSlowMovingProducts, getBestPerformingEntries } from '@/services/stockEntryService';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { EntryType, TripStatus } from '@/types';
import { SafeAreaView } from 'react-native-safe-area-context';

type ReportTab = 'trips' | 'suppliers' | 'products' | 'slow';

/**
 * Componente: Trip Performance Card
 */
interface TripCardProps {
  trip: any;
  onPress: () => void;
}

function TripPerformanceCard({ trip, onPress }: TripCardProps) {
  return (
    <TouchableOpacity onPress={onPress}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardCode}>{trip.trip_code}</Text>
              <Text style={styles.cardSubtitle}>{trip.destination}</Text>
            </View>
            <Chip
              mode="flat"
              style={[
                styles.statusChip,
                trip.status === TripStatus.COMPLETED && { backgroundColor: Colors.light.successLight },
              ]}
              textStyle={styles.chipText}
            >
              {trip.status === TripStatus.COMPLETED ? 'Concluída' : trip.status}
            </Chip>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Custo Viagem</Text>
              <Text style={styles.metricValue}>{formatCurrency(trip.travel_cost_total || 0)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Data</Text>
              <Text style={styles.metricValue}>{formatDate(trip.trip_date)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Status</Text>
              <Text style={[
                styles.metricValue,
                { color: trip.status === TripStatus.COMPLETED ? Colors.light.success : Colors.light.warning }
              ]}>
                {trip.status === TripStatus.COMPLETED ? 'OK' : 'Pendente'}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

/**
 * Componente: Supplier Performance Card
 */
interface SupplierCardProps {
  supplier: string;
  entries: any[];
  onPress: () => void;
}

function SupplierPerformanceCard({ supplier, entries, onPress }: SupplierCardProps) {
  const totalCost = entries.reduce((sum, e) => sum + (e.total_cost || 0), 0);
  const avgROI = entries.length > 0
    ? entries.reduce((sum, e) => sum + (e.roi || 0), 0) / entries.length
    : 0;
  const avgSellThrough = entries.length > 0
    ? entries.reduce((sum, e) => sum + (e.sell_through_rate || 0), 0) / entries.length
    : 0;

  return (
    <TouchableOpacity onPress={onPress}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{supplier}</Text>
              <Text style={styles.cardSubtitle}>{entries.length} entrada(s)</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Total Investido</Text>
              <Text style={styles.metricValue}>{formatCurrency(totalCost)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>ROI Médio</Text>
              <Text style={[
                styles.metricValue,
                { color: avgROI >= 0 ? Colors.light.success : Colors.light.error }
              ]}>
                {avgROI >= 0 ? '+' : ''}{avgROI.toFixed(1)}%
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Sell-Through</Text>
              <Text style={styles.metricValue}>{avgSellThrough.toFixed(1)}%</Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

/**
 * Componente: Slow Moving Product Card
 */
interface SlowProductCardProps {
  product: any;
  onPress: () => void;
}

function SlowMovingProductCard({ product, onPress }: SlowProductCardProps) {
  return (
    <TouchableOpacity onPress={onPress}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>{product.product_name}</Text>
              <Text style={styles.cardSubtitle}>Entrada: {product.entry_code}</Text>
            </View>
            <Chip
              mode="flat"
              style={{ backgroundColor: Colors.light.errorLight }}
              textStyle={styles.chipText}
            >
              {product.days_in_stock} dias
            </Chip>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Recebido</Text>
              <Text style={styles.metricValue}>{product.quantity_received} un</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Restante</Text>
              <Text style={[styles.metricValue, { color: Colors.light.error }]}>
                {product.quantity_remaining} un
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Depleção</Text>
              <Text style={styles.metricValue}>{product.depletion_percentage.toFixed(0)}%</Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
}

export default function ReportsScreen() {
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportTab>('trips');
  const [periodMenuVisible, setPeriodMenuVisible] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  // Queries
  const { data: trips = [], refetch: refetchTrips } = useQuery({
    queryKey: ['trips'],
    queryFn: () => getTrips({ limit: 100 }),
  });

  const { data: entries = [], refetch: refetchEntries } = useQuery({
    queryKey: ['stock-entries'],
    queryFn: () => getStockEntries({ limit: 100 }),
  });

  const { data: slowMovingProducts = [], refetch: refetchSlow } = useQuery({
    queryKey: ['slow-moving-products'],
    queryFn: () => getSlowMovingProducts({ days_threshold: 60, depletion_threshold: 30 }),
  });

  const { data: bestPerforming = [], refetch: refetchBest } = useQuery({
    queryKey: ['best-performing-entries'],
    queryFn: () => getBestPerformingEntries(10),
  });

  /**
   * Refresh handler
   */
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchTrips(),
      refetchEntries(),
      refetchSlow(),
      refetchBest(),
    ]);
    setRefreshing(false);
  };

  /**
   * Filtrar viagens completadas e ordenar por custo
   * Nota: Para calcular ROI preciso das analytics, então vamos apenas mostrar por custo de viagem
   */
  const topTrips = trips
    .filter(t => t.status === TripStatus.COMPLETED)
    .sort((a, b) => b.travel_cost_total - a.travel_cost_total)
    .slice(0, 10);

  /**
   * Agrupar entradas por fornecedor e calcular métricas
   */
  const supplierPerformance = entries.reduce((acc, entry) => {
    const supplier = entry.supplier_name;
    if (!acc[supplier]) {
      acc[supplier] = [];
    }
    acc[supplier].push(entry);
    return acc;
  }, {} as Record<string, any[]>);

  const topSuppliers = Object.entries(supplierPerformance)
    .map(([supplier, entries]) => {
      const avgROI = entries.reduce((sum, e) => sum + (e.roi || 0), 0) / entries.length;
      return { supplier, entries, avgROI };
    })
    .sort((a, b) => b.avgROI - a.avgROI)
    .slice(0, 10);

  /**
   * Produtos best sellers (maior sell-through das melhores entradas)
   */
  const bestSellers = bestPerforming.slice(0, 10);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Gradiente */}
      <LinearGradient
        colors={[Colors.light.primary, Colors.light.secondary]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Relatórios</Text>
          <TouchableOpacity
            onPress={() => {}}
            style={styles.exportButton}
            disabled
          >
            <Ionicons name="download-outline" size={24} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSubtitle}>Análise de Performance</Text>
      </LinearGradient>

      {/* Período Selector */}
      <View style={styles.periodContainer}>
        <Menu
          visible={periodMenuVisible}
          onDismiss={() => setPeriodMenuVisible(false)}
          anchor={
            <TouchableOpacity
              style={styles.periodButton}
              onPress={() => setPeriodMenuVisible(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={Colors.light.primary} />
              <Text style={styles.periodText}>
                {period === '7d' ? 'Últimos 7 dias' :
                 period === '30d' ? 'Últimos 30 dias' :
                 period === '90d' ? 'Últimos 90 dias' :
                 'Todo o período'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.light.textSecondary} />
            </TouchableOpacity>
          }
        >
          <Menu.Item onPress={() => { setPeriod('7d'); setPeriodMenuVisible(false); }} title="Últimos 7 dias" />
          <Menu.Item onPress={() => { setPeriod('30d'); setPeriodMenuVisible(false); }} title="Últimos 30 dias" />
          <Menu.Item onPress={() => { setPeriod('90d'); setPeriodMenuVisible(false); }} title="Últimos 90 dias" />
          <Menu.Item onPress={() => { setPeriod('all'); setPeriodMenuVisible(false); }} title="Todo o período" />
        </Menu>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <SegmentedButtons
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ReportTab)}
          buttons={[
            { value: 'trips', label: 'Viagens', icon: 'car-outline' },
            { value: 'suppliers', label: 'Fornecedores', icon: 'business-outline' },
            { value: 'products', label: 'Best Sellers', icon: 'trending-up-outline' },
            { value: 'slow', label: 'Encalhados', icon: 'time-outline' },
          ]}
          style={styles.segmentedButtons}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Tab: Viagens mais lucrativas */}
        {activeTab === 'trips' && (
          <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>Viagens Mais Lucrativas</Text>
            <Text style={styles.tabSubtitle}>Top 10 viagens por ROI</Text>

            {topTrips.length > 0 ? (
              topTrips.map((trip, index) => (
                <View key={trip.id} style={styles.rankContainer}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.rankContent}>
                    <TripPerformanceCard
                      trip={trip}
                      onPress={() => router.push(`/trips/${trip.id}`)}
                    />
                  </View>
                </View>
              ))
            ) : (
              <Surface style={styles.emptyState}>
                <Ionicons name="car-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyText}>Nenhuma viagem concluída</Text>
                <Button
                  mode="contained"
                  onPress={() => router.push('/trips/add')}
                  style={{ marginTop: 16 }}
                >
                  Adicionar Viagem
                </Button>
              </Surface>
            )}
          </View>
        )}

        {/* Tab: Fornecedores com melhor ROI */}
        {activeTab === 'suppliers' && (
          <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>Fornecedores com Melhor ROI</Text>
            <Text style={styles.tabSubtitle}>Top 10 fornecedores</Text>

            {topSuppliers.length > 0 ? (
              topSuppliers.map(({ supplier, entries }, index) => (
                <View key={supplier} style={styles.rankContainer}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.rankContent}>
                    <SupplierPerformanceCard
                      supplier={supplier}
                      entries={entries}
                      onPress={() => router.push('/entries')}
                    />
                  </View>
                </View>
              ))
            ) : (
              <Surface style={styles.emptyState}>
                <Ionicons name="business-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyText}>Nenhuma entrada cadastrada</Text>
                <Button
                  mode="contained"
                  onPress={() => router.push('/entries/add')}
                  style={{ marginTop: 16 }}
                >
                  Adicionar Entrada
                </Button>
              </Surface>
            )}
          </View>
        )}

        {/* Tab: Produtos Best Sellers */}
        {activeTab === 'products' && (
          <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>Entradas com Melhor Performance</Text>
            <Text style={styles.tabSubtitle}>Top 10 por sell-through e ROI</Text>

            {bestSellers.length > 0 ? (
              bestSellers.map((entry, index) => (
                <View key={entry.entry_id} style={styles.rankContainer}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.rankContent}>
                    <TouchableOpacity onPress={() => router.push(`/entries/${entry.entry_id}`)}>
                      <Card style={styles.card}>
                        <Card.Content>
                          <View style={styles.cardHeader}>
                            <View style={styles.cardInfo}>
                              <Text style={styles.cardCode}>{entry.entry_code}</Text>
                              <Text style={styles.cardSubtitle}>{entry.supplier_name}</Text>
                            </View>
                            <Chip
                              mode="flat"
                              style={[
                                styles.statusChip,
                                entry.entry_type === EntryType.TRIP && { backgroundColor: Colors.light.infoLight },
                                entry.entry_type === EntryType.ONLINE && { backgroundColor: Colors.light.warningLight },
                                entry.entry_type === EntryType.LOCAL && { backgroundColor: Colors.light.successLight },
                              ]}
                              textStyle={styles.chipText}
                            >
                              {entry.entry_type === EntryType.TRIP ? 'Viagem' : entry.entry_type === EntryType.ONLINE ? 'Online' : 'Local'}
                            </Chip>
                          </View>

                          <View style={styles.metricsRow}>
                            <View style={styles.metric}>
                              <Text style={styles.metricLabel}>Custo</Text>
                              <Text style={styles.metricValue}>{formatCurrency(entry.total_cost)}</Text>
                            </View>
                            <View style={styles.metric}>
                              <Text style={styles.metricLabel}>Sell-Through</Text>
                              <Text style={[
                                styles.metricValue,
                                { color: entry.sell_through_rate >= 70 ? Colors.light.success : Colors.light.warning }
                              ]}>
                                {entry.sell_through_rate.toFixed(1)}%
                              </Text>
                            </View>
                            <View style={styles.metric}>
                              <Text style={styles.metricLabel}>ROI</Text>
                              <Text style={[
                                styles.metricValue,
                                { color: entry.roi >= 0 ? Colors.light.success : Colors.light.error }
                              ]}>
                                {entry.roi >= 0 ? '+' : ''}{entry.roi.toFixed(1)}%
                              </Text>
                            </View>
                          </View>
                        </Card.Content>
                      </Card>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <Surface style={styles.emptyState}>
                <Ionicons name="trending-up-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyText}>Nenhuma entrada com vendas</Text>
              </Surface>
            )}
          </View>
        )}

        {/* Tab: Produtos Encalhados */}
        {activeTab === 'slow' && (
          <View style={styles.tabContent}>
            <Text style={styles.tabTitle}>Produtos Encalhados</Text>
            <Text style={styles.tabSubtitle}>Produtos com mais de 60 dias parados</Text>

            {slowMovingProducts.length > 0 ? (
              slowMovingProducts.map((product) => (
                <SlowMovingProductCard
                  key={`${product.entry_id}-${product.product_id}`}
                  product={product}
                  onPress={() => router.push(`/entries/${product.entry_id}`)}
                />
              ))
            ) : (
              <Surface style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={48} color={Colors.light.success} />
                <Text style={styles.emptyText}>Nenhum produto encalhado!</Text>
                <Text style={styles.emptySubtext}>Todos os produtos estão vendendo bem</Text>
              </Surface>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  exportButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  periodContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.light.background,
  },
  periodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    gap: 8,
  },
  periodText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light.background,
  },
  segmentedButtons: {
    backgroundColor: Colors.light.card,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  tabContent: {
    marginBottom: 16,
  },
  tabTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 4,
  },
  tabSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 16,
  },
  rankContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  rankContent: {
    flex: 1,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardCode: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  statusChip: {
    height: 28,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
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
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.light.textTertiary,
    marginTop: 4,
  },
});
