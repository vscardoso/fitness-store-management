/**
 * Stock Entries List Screen - Lista de Entradas de Estoque
 * 
 * Funcionalidades:
 * - Lista de entradas com cards informativos
 * - Badges de tipo (viagem, online, local)
 * - Métricas: sell-through, ROI
 * - Filtros por tipo, período, fornecedor
 * - Busca por código/fornecedor
 * - Pull to refresh
 * - FAB para nova entrada
 */

import { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FAB, Text, Card, Searchbar, Menu, Button, Chip } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ListHeader from '@/components/layout/ListHeader';
import EmptyState from '@/components/ui/EmptyState';
import { useStockEntries } from '@/hooks/useStockEntries';
import { formatCurrency, formatDate } from '@/utils/format';
import { Colors } from '@/constants/Colors';
import { StockEntry, EntryType } from '@/types';

export default function StockEntriesScreen() {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<EntryType | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);

  /**
   * Query para buscar entradas
   */
  const {
    data: entries,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useStockEntries({ entry_type: typeFilter, limit: 100 });

  /**
   * Filtrar entradas por busca
   */
  const filteredEntries = entries?.filter(entry => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      entry.entry_code.toLowerCase().includes(query) ||
      entry.supplier_name.toLowerCase().includes(query) ||
      entry.trip_code?.toLowerCase().includes(query)
    );
  }) || [];

  /**
   * Renderizar badge de tipo
   */
  const renderTypeBadge = (type: EntryType) => {
    const typeConfig = {
      trip: { 
        label: 'Viagem', 
        color: Colors.light.info, 
        icon: 'car-outline',
        bgColor: Colors.light.info + '20',
      },
      online: { 
        label: 'Online', 
        color: Colors.light.warning, 
        icon: 'cart-outline',
        bgColor: Colors.light.warning + '20',
      },
      local: { 
        label: 'Local', 
        color: Colors.light.success, 
        icon: 'business-outline',
        bgColor: Colors.light.success + '20',
      },
    };

    const config = typeConfig[type] || typeConfig.local;

    return (
      <View style={[styles.badge, { backgroundColor: config.bgColor }]}>
        <Ionicons name={config.icon as any} size={14} color={config.color} />
        <Text style={[styles.badgeText, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    );
  };

  /**
   * Renderizar card de entrada
   */
  const renderEntryCard = ({ item }: { item: StockEntry }) => {
    if (!item || !item.id) {
      return <View style={styles.emptyCard} />;
    }

    return (
      <TouchableOpacity
        onPress={() => router.push(`/entries/${item.id}`)}
        activeOpacity={0.7}
      >
        <Card style={styles.card}>
          <Card.Content>
            {/* Header: Código e Tipo */}
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Ionicons name="receipt-outline" size={20} color={Colors.light.primary} />
                <Text style={styles.cardCode}>{item.entry_code}</Text>
              </View>
              {renderTypeBadge(item.entry_type)}
            </View>

            {/* Fornecedor */}
            <View style={styles.cardRow}>
              <Ionicons name="briefcase-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.cardSupplier}>{item.supplier_name}</Text>
            </View>

            {/* Data */}
            <View style={styles.cardRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.cardDate}>{formatDate(item.entry_date)}</Text>
            </View>

            {/* Viagem (se houver) */}
            {item.trip_code && (
              <View style={styles.cardRow}>
                <Ionicons name="airplane-outline" size={16} color={Colors.light.primary} />
                <Text style={styles.cardTrip}>
                  {item.trip_code}
                  {item.trip_destination && ` - ${item.trip_destination}`}
                </Text>
              </View>
            )}

            {/* Divider */}
            <View style={styles.divider} />

            {/* Métricas */}
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Custo Total</Text>
                <Text style={styles.metricValue}>
                  {formatCurrency(item.total_cost)}
                </Text>
              </View>

              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Items</Text>
                <Text style={styles.metricValue}>
                  {item.total_items} ({item.total_quantity} un)
                </Text>
              </View>
            </View>

            {/* KPIs de Performance */}
            {item.sell_through_rate > 0 && (
              <View style={styles.kpiRow}>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiLabel}>Sell-Through</Text>
                  <View style={styles.kpiValueContainer}>
                    <Text style={[
                      styles.kpiValue,
                      { color: item.sell_through_rate >= 70 ? Colors.light.success : Colors.light.warning }
                    ]}>
                      {item.sell_through_rate.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {item.roi !== null && item.roi !== undefined && (
                  <View style={styles.kpiItem}>
                    <Text style={styles.kpiLabel}>ROI</Text>
                    <View style={styles.kpiValueContainer}>
                      <Text style={[
                        styles.kpiValue,
                        { color: item.roi >= 0 ? Colors.light.success : Colors.light.error }
                      ]}>
                        {item.roi >= 0 ? '+' : ''}{item.roi.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  /**
   * Calcular estatísticas gerais
   */
  const calculateStats = () => {
    if (!entries || entries.length === 0) {
      return {
        totalEntries: 0,
        totalInvested: 0,
        totalItems: 0,
        avgSellThrough: 0,
      };
    }

    const totalInvested = entries.reduce((sum, entry) => sum + entry.total_cost, 0);
    const totalItems = entries.reduce((sum, entry) => sum + entry.total_quantity, 0);
    const avgSellThrough = entries.reduce((sum, entry) => sum + entry.sell_through_rate, 0) / entries.length;

    return {
      totalEntries: entries.length,
      totalInvested,
      totalItems,
      avgSellThrough,
    };
  };

  const stats = calculateStats();

  /**
   * Renderizar loading
   */
  if (isLoading && !isRefetching) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <ListHeader
            title="Entradas de Estoque"
            count={0}
            singularLabel="entrada"
            pluralLabel="entradas"
            showCount={false}
          />
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={styles.loadingText}>Carregando entradas...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /**
   * Renderizar erro
   */
  if (isError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <ListHeader
            title="Entradas de Estoque"
            count={0}
            singularLabel="entrada"
            pluralLabel="entradas"
            showCount={false}
          />
          <EmptyState
            icon="alert-circle-outline"
            title="Erro ao carregar entradas"
            description="Verifique sua conexão e tente novamente"
          />
        </View>
      </SafeAreaView>
    );
  }

  const entryCount = filteredEntries.length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header com contador */}
        <ListHeader
          title="Entradas de Estoque"
          count={entryCount}
          singularLabel="entrada"
          pluralLabel="entradas"
        />

        {/* Estatísticas gerais */}
        {stats.totalEntries > 0 && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Investido</Text>
              <Text style={styles.statValue}>
                {formatCurrency(stats.totalInvested)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Items</Text>
              <Text style={styles.statValue}>{stats.totalItems}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Média S-T</Text>
              <Text style={[
                styles.statValue,
                { color: stats.avgSellThrough >= 70 ? Colors.light.success : Colors.light.warning }
              ]}>
                {stats.avgSellThrough.toFixed(0)}%
              </Text>
            </View>
          </View>
        )}

        {/* Barra de busca */}
        <Searchbar
          placeholder="Buscar por código, fornecedor ou viagem..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />

        {/* Filtros */}
        <View style={styles.filtersContainer}>
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setMenuVisible(true)}
                icon="filter-outline"
                style={styles.filterButton}
              >
                {typeFilter ? getTypeLabel(typeFilter) : 'Todos os Tipos'}
              </Button>
            }
          >
            <Menu.Item 
              onPress={() => { setTypeFilter(undefined); setMenuVisible(false); }} 
              title="Todos" 
            />
            <Menu.Item 
              onPress={() => { setTypeFilter(EntryType.TRIP); setMenuVisible(false); }} 
              title="Viagens" 
            />
            <Menu.Item 
              onPress={() => { setTypeFilter(EntryType.ONLINE); setMenuVisible(false); }} 
              title="Compras Online" 
            />
            <Menu.Item 
              onPress={() => { setTypeFilter(EntryType.LOCAL); setMenuVisible(false); }} 
              title="Compras Locais" 
            />
          </Menu>

          {/* Chips ativos */}
          <View style={styles.activeFilters}>
            {typeFilter && (
              <Chip
                icon="filter"
                onClose={() => setTypeFilter(undefined)}
                style={styles.filterChip}
              >
                {getTypeLabel(typeFilter)}
              </Chip>
            )}
          </View>
        </View>

        {/* Lista de entradas */}
        <FlatList
          data={filteredEntries}
          renderItem={renderEntryCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[Colors.light.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="Nenhuma entrada encontrada"
              description={searchQuery ? 'Tente ajustar os filtros de busca' : 'Comece adicionando uma nova entrada'}
              actionLabel="Nova Entrada"
              onAction={() => router.push('/entries/add')}
            />
          }
        />

        {/* FAB: Nova Entrada */}
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => router.push('/entries/add')}
          label="Nova Entrada"
        />
      </View>
    </SafeAreaView>
  );
}

/**
 * Helper para label de tipo
 */
function getTypeLabel(type: EntryType): string {
  const labels = {
    trip: 'Viagens',
    online: 'Compras Online',
    local: 'Compras Locais',
  };
  return labels[type] || 'Todos';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primary,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.light.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  searchbar: {
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterButton: {
    borderColor: Colors.light.border,
  },
  activeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  filterChip: {
    backgroundColor: Colors.light.primaryLight,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    marginBottom: 12,
    backgroundColor: Colors.light.card,
    elevation: 2,
  },
  emptyCard: {
    height: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardCode: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.text,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardSupplier: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  cardDate: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  cardTrip: {
    fontSize: 13,
    color: Colors.light.primary,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  kpiItem: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  kpiValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: Colors.light.primary,
  },
});
