/**
 * Despesas: o que a loja gastou no período.
 *  - Resumo no topo: gastos da loja no período (o que entra no resultado do mês) e o atalho para o resultado do mês.
 *  - "A pagar": aparece só se houver despesa a pagar (vencida em destaque) e leva à tela de despesas a pagar.
 *  - Lista com filtro: da loja (o total do resumo), de lotes (já no custo das peças) ou todas.
 *  - "Lançar despesa" fica fixo no rodapé, sempre à mão.
 * No notebook: resumo e pendência à esquerda, lista à direita.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import AppButton from '@/components/ui/AppButton';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { ChoiceChip, FormFooter } from '@/components/expenses/FormParts';
import { getExpenses } from '@/services/expenseService';
import { getFinanceOverview, listPayables } from '@/services/financeService';
import { formatDateOnly } from '@/utils/dateOnly';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { Expense } from '@/types/expense';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';
import { Money } from '@/components/ui/PriceDisplay';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';

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

type Scope = 'store' | 'lot' | 'all';

export default function ExpenseListScreen() {
  const desktopColumn = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [period, setPeriod] = useState<PeriodFilterValue>('this_month');
  const [scope, setScope] = useState<Scope>('store');
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
  const lotExpenses = useMemo(() => (expenses ?? []).filter((e) => !!e.stock_entry_id), [expenses]);
  const total = useMemo(() => storeExpenses.reduce((s, e) => s + Number(e.amount), 0), [storeExpenses]);
  const shown = scope === 'store' ? storeExpenses : scope === 'lot' ? lotExpenses : (expenses ?? []);

  const payOverdue = (payables?.overdue_count ?? 0) > 0;
  const hasPayables = !!finance?.started && ((payables?.open_total ?? 0) > 0 || payOverdue);
  const goCreate = () => router.push('/(tabs)/expenses/create');

  const renderItem = ({ item }: { item: Expense }) => {
    const cat = item.category;
    const dateStr = formatDateOnly(item.expense_date) ?? item.expense_date;
    const isLot = !!item.stock_entry_id;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => router.push({ pathname: '/(tabs)/expenses/edit', params: { id: item.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${item.description}, ${formatCurrency(item.amount)}, ${dateStr}`}
      >
        <View style={[styles.categoryDot, { backgroundColor: cat?.color ?? Colors.light.textTertiary }]}>
          <Ionicons name={(cat?.icon ?? 'ellipsis-horizontal-outline') as any} size={20} color={Colors.light.white} />
        </View>
        <View style={styles.rowContent}>
          <Text variant="bodyLarge" style={styles.description} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>{`${cat?.name ?? 'Sem categoria'} · ${dateStr}`}</Text>
          {(isLot || item.is_recurring) && (
            <View style={styles.badges}>
              {isLot && <Badge label="Custo de um lote" variant="neutral" size="sm" icon="layers-outline" />}
              {item.is_recurring && <Badge label="Recorrente" variant="primary" size="sm" icon="repeat" />}
            </View>
          )}
        </View>
        <View style={styles.amountCol}>
          <Text style={[styles.amount, isLot && { color: Colors.light.textSecondary }]}>{formatCurrency(item.amount)}</Text>
          <Text style={styles.amountNote}>{isLot ? 'no custo do lote' : 'pago'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const summary = (
    <View style={styles.side}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.eyebrow}>GASTOS DA LOJA NO PERÍODO</Text>
          <PeriodFilter value={period} onChange={setPeriod} compact />
        </View>
        <Money style={styles.summaryValue} value={Number(total)} />
        <Text style={styles.summaryMeta}>
          {`${storeExpenses.length} ${storeExpenses.length === 1 ? 'despesa' : 'despesas'}`}
          {lotExpenses.length > 0 ? ` · ${lotExpenses.length} de lote, já no custo das peças` : ''}
        </Text>
        <AppButton variant="text" size="sm" icon="stats-chart-outline" label="Ver resultado do mês" onPress={() => router.push('/(tabs)/expenses/resultado')} />
      </View>

      {hasPayables && (
        <View style={[styles.todo, payOverdue && styles.todoOverdue]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.todoTitle}>{payOverdue ? 'Despesas vencidas' : 'Despesas a pagar'}</Text>
            <Text style={[styles.todoNote, payOverdue && { color: Colors.light.error, fontWeight: theme.fontWeight.bold }]}>
              {payOverdue
                ? `${payables!.overdue_count} vencida(s), ${formatCurrency(payables!.overdue_total)} · total a pagar ${formatCurrency(payables?.open_total ?? 0)}`
                : `${formatCurrency(payables?.open_total ?? 0)} ainda vão ser pagas`}
            </Text>
          </View>
          <AppButton variant="outlined" size="sm" label={payOverdue ? 'Pagar' : 'Ver'} onPress={() => router.push('/finance/payables' as any)} />
        </View>
      )}
    </View>
  );

  const filters = (
    <View style={styles.filters}>
      <ChoiceChip label={`Da loja (${storeExpenses.length})`} selected={scope === 'store'} onPress={() => setScope('store')} />
      {lotExpenses.length > 0 && <ChoiceChip label={`De lotes (${lotExpenses.length})`} selected={scope === 'lot'} onPress={() => setScope('lot')} />}
      {lotExpenses.length > 0 && <ChoiceChip label="Todas" selected={scope === 'all'} onPress={() => setScope('all')} />}
    </View>
  );

  const list = (
    <FlatList
      data={shown}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      ListHeaderComponent={isDesktop ? filters : (
        <View style={{ gap: theme.spacing.sm }}>
          {summary}
          {filters}
        </View>
      )}
      contentContainerStyle={shown.length === 0 ? styles.emptyContainer : styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[brandingColors.primary]} />}
      ListEmptyComponent={
        isLoading ? (
          <ScreenLoader inline message="Carregando despesas..." />
        ) : (
          <EmptyState
            icon="receipt-outline"
            title={scope === 'lot' ? 'Nenhuma despesa de lote' : 'Nenhuma despesa no período'}
            description="Anote aluguel, luz e outros gastos para ver quanto sobrou no mês."
            actionLabel="Lançar despesa"
            onAction={goCreate}
          />
        )
      }
    />
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Despesas" subtitle="O que a loja gastou" showBackButton />
      <View style={[{ flex: 1 }, desktopColumn]}>
        {isDesktop ? (
          <View style={styles.columns}>
            <View style={styles.leftCol}>{summary}</View>
            <View style={{ flex: 1, minWidth: 0 }}>{list}</View>
          </View>
        ) : (
          list
        )}
      </View>
      <FormFooter primaryLabel="Lançar despesa" primaryIcon="add" onPrimary={goCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  columns: { flex: 1, flexDirection: 'row', gap: theme.spacing.lg, padding: theme.spacing.md },
  leftCol: { width: 360 },
  side: { gap: theme.spacing.sm },
  eyebrow: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.extrabold, letterSpacing: 1, color: Colors.light.textSecondary, flex: 1 },
  summaryCard: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, gap: 4,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  summaryValue: { fontSize: theme.fontSize.xxxl, fontWeight: theme.fontWeight.extrabold, color: Colors.light.error, letterSpacing: -0.5 },
  summaryMeta: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  todo: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.lg,
    padding: 12, borderWidth: 1, borderColor: Colors.light.border,
  },
  todoOverdue: { backgroundColor: Colors.light.warningLight, borderColor: Colors.light.warning },
  todoTitle: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text },
  todoNote: { fontSize: theme.fontSize.sm, lineHeight: 17, color: Colors.light.textSecondary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: theme.spacing.sm },
  listContent: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.sm },
  emptyContainer: { flexGrow: 1, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.lg, padding: 14,
    marginBottom: theme.spacing.sm, borderWidth: 1, borderColor: Colors.light.border, gap: theme.spacing.md,
  },
  categoryDot: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  rowContent: { flex: 1, minWidth: 0, gap: 2 },
  description: { fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  rowMeta: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  amountCol: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: Colors.light.error },
  amountNote: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
});
