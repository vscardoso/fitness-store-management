import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { getExpenses } from '@/services/expenseService';
import { getFinanceOverview, listPayables } from '@/services/financeService';
import { formatDateOnly } from '@/utils/dateOnly';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import AppButton from '@/components/ui/AppButton';
import type { Expense } from '@/types/expense';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';

import { Money } from '@/components/ui/PriceDisplay';
import { useDesktopContentStyle, useListGrid } from '@/hooks/useLayout';
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
  // no PC a lista vira grade de cartões (no celular continua uma coluna)
  const listGrid = useListGrid(340, 12, 16);
  const desktopColumn = useDesktopContentStyle();
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [period, setPeriod] = useState<PeriodFilterValue>('this_month');
  const [refreshing, setRefreshing] = useState(false);
  const dateRange = useDateRange(period);

  // despesas a pagar (só com o Financeiro implantado): a mesma lista de despesas, ainda não paga
  const { data: finance } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const { data: payables } = useQuery({
    queryKey: ['finance-payables', 'open'], queryFn: () => listPayables('open'), enabled: !!finance?.started,
  });
  const { data: expenses, isLoading, refetch } = useQuery({
    queryKey: ['expenses', dateRange],
    queryFn: () => getExpenses({ start_date: dateRange.start_date, end_date: dateRange.end_date }),
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Só despesa da loja: a de lote já está no custo das peças e não conta de novo no mês
  const storeExpenses = useMemo(() => (expenses ?? []).filter((e) => !e.stock_entry_id), [expenses]);
  const total = useMemo(() => storeExpenses.reduce((s, e) => s + Number(e.amount), 0), [storeExpenses]);

  const renderItem = ({ item }: { item: Expense }) => {
    const cat = item.category;
    const dateStr = formatDateOnly(item.expense_date) ?? item.expense_date;
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
            color={Colors.light.white}
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
            {!!item.stock_entry_id && (
              <View style={[styles.recurringBadge, { backgroundColor: Colors.light.backgroundSecondary }]}>
                <Ionicons name="layers-outline" size={11} color={Colors.light.textSecondary} />
                <Text style={[styles.recurringText, { color: Colors.light.textSecondary }]}>
                  Custo de um lote
                </Text>
              </View>
            )}
            {item.is_recurring && (
              <View style={[styles.recurringBadge, { backgroundColor: brandingColors.primary + '20' }]}>
                <Ionicons name="repeat" size={11} color={brandingColors.primary} />
                <Text style={[styles.recurringText, { color: brandingColors.primary }]}>Recorrente</Text>
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
      <PageHeader
        title="Despesas"
        subtitle={`${expenses?.length ?? 0} registros`}
        showBackButton
        rightActions={[
          { icon: 'add', onPress: () => router.push('/(tabs)/expenses/create') },
        ]}
      />
      {/* notebook: corpo da tela numa coluna central (no celular é só uma View com flex 1) */}
      <View style={[{ flex: 1 }, desktopColumn]}>

      {/* Card totalizador + filtro integrado */}
      <View style={styles.summaryCard}>
        {/* Header: label + PeriodFilter */}
        <View style={styles.summaryHeader}>
          <View style={styles.summaryHeaderLeft}>
            <View style={styles.summaryIcon}>
              <Ionicons name="trending-down-outline" size={16} color={Colors.light.error} />
            </View>
            <Text style={styles.summaryLabel}>Total no período</Text>
          </View>
          <PeriodFilter value={period} onChange={setPeriod} compact />
        </View>

        {/* Valor em destaque */}
        <View style={styles.summaryBody}>
          <Money style={styles.summaryValue} value={Number(total)} />
          <Text style={styles.summaryMeta}>
            {storeExpenses.length} {storeExpenses.length === 1 ? 'despesa da loja' : 'despesas da loja'}
          </Text>
        </View>

        {/* Resultado do mês */}
        <View style={styles.plButton}>
          <AppButton
            variant="primary"
            size="md"
            fullWidth
            icon="stats-chart-outline"
            label="Ver resultado do mês"
            onPress={() => router.push('/(tabs)/expenses/resultado')}
          />
        </View>
      </View>

      {!!finance?.started && (
        <TouchableOpacity
          style={styles.payablesCard}
          onPress={() => router.push('/finance/payables' as any)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Abrir despesas a pagar"
        >
          <Ionicons name="time-outline" size={20} color={payables?.overdue_count ? Colors.light.error : brandingColors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.payablesTitle}>A pagar: {formatCurrency(payables?.open_total ?? 0)}</Text>
            <Text style={[styles.summaryMeta, !!payables?.overdue_count && { color: Colors.light.error, fontWeight: '700' }]}>
              {payables?.overdue_count
                ? `${payables.overdue_count} vencida(s): ${formatCurrency(payables.overdue_total)}`
                : 'Despesas que ainda vão ser pagas'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
        </TouchableOpacity>
      )}

      {/* Spacer antes da lista */}
      <View style={{ height: theme.spacing.sm }} />

      <FlatList
          key={listGrid.listKey}
          style={listGrid.bleedStyle}
          {...listGrid.listProps}
        data={expenses ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={listGrid.wrap(renderItem)}
        contentContainerStyle={[expenses?.length === 0 ? styles.emptyContainer : styles.listContent, listGrid.bleedContent]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[brandingColors.primary]} />}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon="receipt-outline"
              title="Nenhuma despesa"
              description="Anote aluguel, luz e outros gastos para ver quanto sobrou no mês."
              actionLabel="Registrar Despesa"
              onAction={() => router.push('/(tabs)/expenses/create')}
            />
          )
        }
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },

  // ── Card totalizador ──────────────────────────────────────────────────────
  payablesCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  payablesTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  summaryCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    elevation: 3,
    shadowColor: Colors.light.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  summaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.light.error + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  summaryBody: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.light.error,
    letterSpacing: -0.5,
  },
  summaryMeta: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  plButton: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    marginTop: theme.spacing.md,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: theme.spacing.md,
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
    gap: theme.spacing.sm,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  categoryLabel: { color: Colors.light.textSecondary, fontSize: 12 },
  dateLabel: { color: Colors.light.textTertiary, fontSize: 12 },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
  },
  recurringText: {
    fontSize: 10,
    fontWeight: '600',
  },
  amount: {
    fontWeight: '700',
    color: Colors.light.error,
  },
});
