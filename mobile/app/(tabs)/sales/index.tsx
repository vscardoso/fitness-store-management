import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Searchbar } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { getSales } from '@/services/saleService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';
import type { Sale } from '@/types';

const statusMap: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:            { label: 'Pendente',     color: '#F57C00', bg: '#FFF3E0', icon: 'time-outline' },
  completed:          { label: 'Concluída',    color: '#2E7D32', bg: '#E8F5E9', icon: 'checkmark-circle-outline' },
  cancelled:          { label: 'Cancelada',    color: '#C62828', bg: '#FFEBEE', icon: 'close-circle-outline' },
  partially_refunded: { label: 'Dev. Parcial', color: '#F57C00', bg: '#FFF3E0', icon: 'return-down-back-outline' },
  refunded:           { label: 'Devolvida',    color: '#7B1FA2', bg: '#F3E5F5', icon: 'refresh-outline' },
};

const paymentIcon: Record<string, string> = {
  cash: 'cash-outline',
  credit_card: 'card-outline',
  debit_card: 'card-outline',
  pix: 'qr-code-outline',
  transfer: 'swap-horizontal-outline',
};

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
      case 'this_month':     start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'last_30_days':   start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case 'last_2_months':  start = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()); break;
      case 'last_3_months':  start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
      case 'last_6_months':  start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
      case 'this_year':      start = new Date(now.getFullYear(), 0, 1); break;
      default:               start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start_date: fmt(start), end_date: fmt(now) };
  }, [selectedPeriod]);

  const { data: sales, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['sales', skip, search, dateRange],
    queryFn: async () => {
      const params: any = { skip, limit: 50, ...dateRange };
      if (search.trim().length > 0) params.sale_number = search.trim();
      return getSales(params);
    },
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const loadMore = () => {
    if (sales && sales.length === 50) setSkip(prev => prev + 50);
  };

  const salesCount = sales?.length || 0;

  const renderItem = ({ item }: { item: Sale }) => {
    const status = statusMap[item.status] || statusMap.pending;
    const date = new Date(item.created_at);
    const formattedDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/sales/${item.id}`)}
        style={styles.cardWrapper}
      >
        <View style={styles.saleCard}>
          {/* Faixa lateral colorida por status */}
          <View style={[styles.statusStripe, { backgroundColor: status.color }]} />

          <View style={styles.cardInner}>
            {/* Linha superior: número + badge */}
            <View style={styles.cardTop}>
              <View style={styles.saleNumberRow}>
                <Ionicons name="receipt-outline" size={16} color={Colors.light.primary} />
                <Text style={styles.saleNumber}>{item.sale_number}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Ionicons name={status.icon as any} size={12} color={status.color} />
                <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
              </View>
            </View>

            {/* Valor em destaque */}
            <Text style={styles.amount}>{formatCurrency(item.total_amount)}</Text>

            {/* Linha inferior: cliente + data/hora */}
            <View style={styles.cardBottom}>
              <View style={styles.customerRow}>
                <Ionicons name="person-outline" size={13} color="#888" />
                <Text style={styles.customerName} numberOfLines={1}>
                  {item.customer_name || 'Sem cliente'}
                </Text>
              </View>
              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={13} color="#888" />
                <Text style={styles.saleTime}>{formattedDate} · {formattedTime}</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.container}>
        <PageHeader title="Vendas" subtitle="0 vendas" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando vendas...</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <PageHeader title="Vendas" subtitle="0 vendas" />
        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar vendas"
          description="Verifique sua conexão e tente novamente"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title="Vendas"
        subtitle={`${salesCount} ${salesCount === 1 ? 'venda' : 'vendas'}`}
      />

      {/* Busca */}
      <Searchbar
        placeholder="Buscar por número da venda..."
        onChangeText={(text) => { setSearch(text); setSkip(0); }}
        value={search}
        style={styles.searchbar}
      />

      {/* Filtro de período */}
      <View style={styles.periodRow}>
        <PeriodFilter
          value={selectedPeriod}
          onChange={(value) => { setSelectedPeriod(value); setSkip(0); }}
          compact
        />
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
  loadingText: {
    marginTop: 16,
    color: Colors.light.icon,
  },
  searchbar: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  periodRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  listContent: {
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  cardWrapper: {
    marginBottom: 10,
  },
  saleCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  statusStripe: {
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  cardInner: {
    flex: 1,
    padding: 14,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saleNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#222',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  amount: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  customerName: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  saleTime: {
    fontSize: 12,
    color: '#888',
  },
});
