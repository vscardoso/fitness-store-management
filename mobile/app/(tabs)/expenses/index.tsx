import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { Text, Card } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { getExpenses, deleteExpense } from '@/services/expenseService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import type { Expense } from '@/types/expense';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function useDateRange(period: PeriodFilterValue) {
  return useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (period) {
      case 'this_month':    start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'last_30_days':  start = new Date(now.getTime() - 30 * 86400000); break;
      case 'last_2_months': start = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()); break;
      case 'last_3_months': start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
      case 'last_6_months': start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
      case 'this_year':     start = new Date(now.getFullYear(), 0, 1); break;
      default:              start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { start_date: fmt(start), end_date: fmt(now) };
  }, [period]);
}

export default function ExpenseListScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<PeriodFilterValue>('this_month');
  const [refreshing, setRefreshing] = useState(false);
  const dateRange = useDateRange(period);

  const { data: expenses, isLoading, refetch } = useQuery({
    queryKey: ['expenses', dateRange],
    queryFn: () => getExpenses({ start_date: dateRange.start_date, end_date: dateRange.end_date }),
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const deleteMutation = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const total = useMemo(
    () => (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0),
    [expenses]
  );

  const renderItem = ({ item }: { item: Expense }) => {
    const cat = item.category;
    const dateStr = item.expense_date.replace(/-/g, '/');
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => router.push({ pathname: '/(tabs)/expenses/edit', params: { id: item.id } })}
      >
        <View
          style={[styles.categoryDot, { backgroundColor: cat?.color ?? '#95a5a6' }]}
        >
          <Ionicons
            name={(cat?.icon ?? 'ellipsis-horizontal-outline') as any}
            size={20}
            color="#fff"
          />
        </View>
        <View style={styles.cardContent}>
          <Text variant="bodyLarge" style={styles.description} numberOfLines={1}>
            {item.description}
          </Text>
          <View style={styles.cardMeta}>
            <Text variant="bodySmall" style={styles.categoryLabel}>
              {cat?.name ?? 'Sem categoria'}
            </Text>
            <Text variant="bodySmall" style={styles.dateLabel}>
              {dateStr}
            </Text>
            {item.is_recurring && (
              <View style={styles.recurringBadge}>
                <Ionicons name="repeat" size={11} color={Colors.light.primary} />
                <Text style={styles.recurringText}>Recorrente</Text>
              </View>
            )}
          </View>
        </View>
        <Text variant="titleMedium" style={styles.amount}>
          {formatCurrency(item.amount)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PageHeader
        title="Despesas"
        subtitle={`${expenses?.length ?? 0} registros`}
        showBackButton
        rightActions={[
          { icon: 'add', onPress: () => router.push('/(tabs)/expenses/create') },
        ]}
      />

      {/* Totalizador do período */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryContent}>
          <View>
            <Text variant="labelMedium" style={styles.summaryLabel}>Total no período</Text>
            <Text variant="headlineSmall" style={styles.summaryValue}>
              {formatCurrency(total)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.plButton}
            onPress={() => router.push('/(tabs)/expenses/resultado')}
          >
            <Ionicons name="stats-chart-outline" size={18} color={Colors.light.primary} />
            <Text style={styles.plButtonText}>P&L</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Filtro de período */}
      <PeriodFilter value={period} onChange={setPeriod} />

      <FlatList
        data={expenses ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={expenses?.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.light.primary]} />}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon="receipt-outline"
              title="Nenhuma despesa"
              description="Registre suas despesas operacionais para calcular o lucro líquido real."
              actionLabel="Registrar Despesa"
              onAction={() => router.push('/(tabs)/expenses/create')}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: theme.borderRadius.lg,
    elevation: 2,
  },
  summaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  summaryLabel: {
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontWeight: 'bold',
    color: Colors.light.error,
  },
  plButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.lg,
  },
  plButtonText: {
    color: Colors.light.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    marginTop: 10,
    elevation: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 12,
  },
  categoryDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: { flex: 1 },
  description: { fontWeight: '600', color: Colors.light.text },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  categoryLabel: { color: Colors.light.textSecondary, fontSize: 12 },
  dateLabel: { color: Colors.light.textTertiary, fontSize: 12 },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.light.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
  },
  recurringText: {
    fontSize: 10,
    color: Colors.light.primary,
    fontWeight: '600',
  },
  amount: {
    fontWeight: '700',
    color: Colors.light.error,
  },
});
