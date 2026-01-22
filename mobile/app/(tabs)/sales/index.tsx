import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Card, Searchbar } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getSales } from '@/services/saleService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';
import type { Sale } from '@/types';

export default function SalesListScreen() {
  const router = useRouter();
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilterValue>('this_month');

  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;

    switch (selectedPeriod) {
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_30_days':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'last_2_months':
        start = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
        break;
      case 'last_3_months':
        start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'last_6_months':
        start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start_date: fmt(start), end_date: fmt(now) };
  }, [selectedPeriod]);

  const { data: sales, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sales', skip, search, dateRange],
    queryFn: async () => {
      const params: any = { skip, limit: 50, ...dateRange };
      if (search.trim().length > 0) {
        params.sale_number = search.trim();
      }
      return getSales(params);
    },
  });

  // Auto-refresh quando a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const loadMore = () => {
    if (sales && sales.length === 50) {
      setSkip(prev => prev + 50);
    }
  };

  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'Pendente', color: '#F57C00', bg: '#FFF3E0' },
    completed: { label: 'Concluída', color: '#2E7D32', bg: '#E8F5E9' },
    cancelled: { label: 'Cancelada', color: '#C62828', bg: '#FFEBEE' },
  };

  const renderItem = ({ item }: { item: Sale }) => {
    const status = statusMap[item.status] || statusMap.pending;
    const date = new Date(item.created_at);
    const formattedDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/sales/${item.id}`)}
      >
        <Card style={styles.saleCard} mode="elevated" elevation={2}>
          <Card.Content style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.saleInfo}>
                <Text style={styles.saleNumber}>{item.sale_number}</Text>
                <Text style={styles.saleTime}>{formattedDate} às {formattedTime}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.amountRow}>
                <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
                <Text style={styles.amount}>{formatCurrency(item.total_amount)}</Text>
              </View>
              {item.customer_name && (
                <View style={styles.customerRow}>
                  <Ionicons name="person-outline" size={16} color="#666" />
                  <Text style={styles.customerName}>{item.customer_name}</Text>
                </View>
              )}
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  const salesCount = sales?.length || 0;

  if (isLoading && !sales) {
    return (
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>Vendas</Text>
                <Text style={styles.headerSubtitle}>0 vendas</Text>
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
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando vendas...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>Vendas</Text>
              <Text style={styles.headerSubtitle}>
                {salesCount} {salesCount === 1 ? 'venda' : 'vendas'}
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

      <View style={styles.filtersRow}>
        <View style={styles.periodFilterWrapper}>
          <PeriodFilter
            value={selectedPeriod}
            onChange={(value) => {
              setSelectedPeriod(value);
              setSkip(0);
            }}
            compact
          />
        </View>
        <View style={styles.searchWrapper}>
          <Searchbar
            placeholder="Buscar..."
            onChangeText={(text) => {
              setSearch(text);
              setSkip(0);
            }}
            value={search}
            style={styles.searchbar}
            inputStyle={styles.searchInput}
          />
        </View>
      </View>

      <FlatList
        data={sales || []}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.light.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="Nenhuma venda encontrada"
            description={search ? 'Tente buscar por outro número' : 'As vendas realizadas aparecerão aqui'}
          />
        }
      />

      <FAB directRoute="/checkout" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  periodFilterWrapper: {
    flex: 0,
    minWidth: 140,
  },
  searchWrapper: {
    flex: 1,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchbar: {
    elevation: 2,
    height: 48,
  },
  searchInput: {
    fontSize: 14,
    minHeight: 48,
    lineHeight: 20,
  },
  searchbarInline: {
    flex: 1,
    elevation: 2,
    height: 40,
  },
  listContent: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  saleCard: {
    marginBottom: 12,
    borderRadius: 16,
  },
  cardContent: {
    paddingVertical: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  saleInfo: {
    flex: 1,
  },
  saleNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    marginBottom: 2,
  },
  saleTime: {
    fontSize: 12,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cardBody: {
    gap: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amount: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerName: {
    fontSize: 13,
    color: '#666',
  },
  loadingText: {
    marginTop: 16,
    color: Colors.light.icon,
  },
});
