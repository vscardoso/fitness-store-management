/**
 * Despesas. Pergunta da tela: "quanto a loja gastou?".
 *  - Topo: UM número, o gasto da loja no período (o que entra no resultado do mês), vindo do servidor (GET /expenses/summary):
 *    a tela não soma a lista. Escolher uma categoria troca o número para o gasto daquela categoria.
 *  - Despesas a pagar: uma linha só, e só se houver.
 *  - Lista: busca, categorias e "de lotes"; um cabeçalho por dia; cada linha diz de onde saiu o dinheiro e avisa o que importa
 *    (pedido de aprovação em andamento, "parece retirada", sem conta, gasto fixo).
 *  - "Lançar despesa" fica fixo no rodapé. No notebook: resumo à esquerda, lista à direita.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import AppButton from '@/components/ui/AppButton';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { ChoiceChip, FormFooter } from '@/components/expenses/FormParts';
import { ExpenseRow } from '@/components/expenses/ExpenseParts';
import { getExpenses, getExpensesSummary } from '@/services/expenseService';
import { getFinanceOverview, listPayables } from '@/services/financeService';
import { formatCurrency } from '@/utils/format';
import { plural } from '@/utils/plural';
import { matchesQuery, withDayHeaders } from '@/utils/expenseLogic';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { Expense } from '@/types/expense';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';
import { Money } from '@/components/ui/PriceDisplay';
import { parseApiError } from '@/utils/apiError';
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

type Scope = 'store' | 'lot';

export default function ExpenseListScreen() {
  const desktopColumn = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [period, setPeriod] = useState<PeriodFilterValue>('this_month');
  const [scope, setScope] = useState<Scope>('store');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const dateRange = useDateRange(period);
  const today = fmt(new Date());

  // Financeiro: nome da conta de cada despesa e despesas a pagar (só com o Financeiro implantado)
  const { data: finance } = useQuery({ queryKey: ['finance'], queryFn: getFinanceOverview });
  const financeStarted = !!finance?.started;
  const accountNames = useMemo(() => new Map((finance?.accounts ?? []).map((a) => [a.id, a.name] as const)), [finance]);
  const { data: payables } = useQuery({
    queryKey: ['finance-payables', 'open'], queryFn: () => listPayables('open'), enabled: financeStarted,
  });
  // Total, contagens e quebra por categoria: do servidor (a tela não soma a lista)
  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ['expenses', 'summary', dateRange], queryFn: () => getExpensesSummary(dateRange),
  });
  const { data: expenses, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['expenses', 'list', dateRange],
    queryFn: () => getExpenses({ ...dateRange, limit: 500 }),
  });

  useFocusEffect(useCallback(() => { refetch(); refetchSummary(); }, [refetch, refetchSummary]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchSummary()]);
    setRefreshing(false);
  };

  const all = expenses ?? [];
  const shown = useMemo(() => {
    const byScope = all.filter((e) => (scope === 'lot' ? !!e.stock_entry_id : !e.stock_entry_id));
    const byCat = scope === 'store' && categoryId !== null ? byScope.filter((e) => e.category_id === categoryId) : byScope;
    return byCat.filter((e) => matchesQuery(e, query));
  }, [all, scope, categoryId, query]);
  const entries = useMemo(() => withDayHeaders(shown, today), [shown, today]);

  // O número do topo: do servidor, inteiro ou da categoria escolhida
  const cat = summary?.by_category.find((c) => c.category_id === categoryId) ?? null;
  const topLabel = scope === 'lot' ? 'Gasto de lotes' : cat ? `Gasto da loja em ${cat.name}` : 'Gasto da loja';
  const topValue = scope === 'lot' ? (summary?.lot_total ?? 0) : cat ? cat.total : (summary?.store_total ?? 0);
  const topCount = scope === 'lot' ? (summary?.lot_count ?? 0) : cat ? cat.count : (summary?.store_count ?? 0);

  const payOverdue = (payables?.overdue_count ?? 0) > 0;
  const hasPayables = financeStarted && ((payables?.open_total ?? 0) > 0 || payOverdue);
  const goCreate = () => router.push('/(tabs)/expenses/create');
  const hasFilter = !!query.trim() || categoryId !== null;

  const summaryBlock = (
    <View style={styles.side}>
      <View style={styles.summaryCard} testID="expense-summary">
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryLabel} numberOfLines={2}>{topLabel}</Text>
          <PeriodFilter value={period} onChange={setPeriod} compact />
        </View>
        {summary ? <Money style={styles.summaryValue} value={Number(topValue)} testID="expense-total" /> : <ScreenLoader inline message="Calculando..." />}
        {!!summary && (
          <Text style={styles.summaryMeta}>
            {plural(topCount, 'despesa', 'despesas')}
            {scope === 'store' && !cat && summary.lot_count > 0 ? ` · sem ${plural(summary.lot_count, 'gasto de lote', 'gastos de lote')} (já no custo das peças)` : ''}
            {scope === 'lot' ? ' · já estão no custo das peças' : ''}
          </Text>
        )}
        <AppButton variant="text" size="sm" icon="stats-chart-outline" label="Ver resultado do mês" onPress={() => router.push('/(tabs)/expenses/resultado')} />
      </View>

      {hasPayables && (
        <TouchableOpacity style={[styles.todo, payOverdue && styles.todoOverdue]} activeOpacity={0.8} onPress={() => router.push('/finance/payables' as any)}
          accessibilityRole="button" testID="expense-payables-row"
          accessibilityLabel={payOverdue ? `${plural(payables!.overdue_count, 'despesa vencida', 'despesas vencidas')}, ver despesas a pagar` : 'Ver despesas a pagar'}>
          <Ionicons name={payOverdue ? 'alert-circle-outline' : 'time-outline'} size={20} color={payOverdue ? Colors.light.error : Colors.light.textSecondary} />
          <Text style={styles.todoText} numberOfLines={2}>
            {payOverdue
              ? `${plural(payables!.overdue_count, 'vencida', 'vencidas')}: ${formatCurrency(payables!.overdue_total)} · a pagar ${formatCurrency(payables?.open_total ?? 0)}`
              : `A pagar: ${formatCurrency(payables?.open_total ?? 0)}`}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );

  const filters = (
    <View style={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }}>
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={Colors.light.textTertiary} />
        <TextInput
          style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Buscar despesa ou categoria"
          placeholderTextColor={Colors.light.textTertiary} autoCorrect={false} returnKeyType="search" testID="expense-search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Limpar a busca">
            <Ionicons name="close-circle" size={18} color={Colors.light.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      {/* um filtro só: toda a loja, cada categoria e (se houver) os gastos de lote */}
      {((summary?.lot_count ?? 0) > 0 || (summary?.by_category.length ?? 0) > 1) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} keyboardShouldPersistTaps="handled">
          <ChoiceChip label="Da loja" selected={scope === 'store' && categoryId === null} onPress={() => { setScope('store'); setCategoryId(null); }} />
          {(summary?.by_category ?? []).filter((c) => c.category_id !== null).map((c) => (
            <ChoiceChip key={c.category_id} label={`${c.name} (${c.count})`} color={c.color ?? undefined}
              selected={scope === 'store' && categoryId === c.category_id}
              onPress={() => { setScope('store'); setCategoryId(categoryId === c.category_id ? null : c.category_id); }} />
          ))}
          {(summary?.lot_count ?? 0) > 0 && (
            <ChoiceChip label={`De lotes (${summary!.lot_count})`} selected={scope === 'lot'} onPress={() => { setScope('lot'); setCategoryId(null); }} />
          )}
        </ScrollView>
      )}
    </View>
  );

  const renderEntry = ({ item: entry }: { item: (typeof entries)[number] }) => {
    if (entry.type === 'day') return <Text style={styles.dayHeader}>{entry.label}</Text>;
    const item: Expense = entry.item;
    return (
      <ExpenseRow
        item={item} financeStarted={financeStarted} accountName={item.account_id ? accountNames.get(item.account_id) : undefined}
        onPress={() => router.push({ pathname: '/(tabs)/expenses/edit', params: { id: item.id } })}
      />
    );
  };

  const list = (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.key}
      renderItem={renderEntry}
      ListHeaderComponent={isDesktop ? filters : (<View style={{ gap: theme.spacing.sm }}>{summaryBlock}{filters}</View>)}
      contentContainerStyle={entries.length === 0 ? styles.emptyContainer : styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[brandingColors.primary]} />}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        isLoading ? (
          <ScreenLoader inline message="Carregando despesas..." />
        ) : isError ? (
          <EmptyState type="error" title="Não foi possível abrir as despesas" description={parseApiError(error)} actionLabel="Tentar de novo" onAction={() => refetch()} />
        ) : hasFilter ? (
          <EmptyState icon="search-outline" title="Nenhuma despesa assim" description="Nada combina com a busca ou a categoria neste período."
            actionLabel="Limpar filtros" onAction={() => { setQuery(''); setCategoryId(null); }} />
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
            <View style={styles.leftCol}>{summaryBlock}</View>
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
  summaryCard: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, gap: 2,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  summaryLabel: { flex: 1, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary },
  summaryValue: { fontSize: theme.fontSize.xxxl, fontWeight: theme.fontWeight.extrabold, color: Colors.light.text, letterSpacing: -0.5 },
  summaryMeta: { fontSize: theme.fontSize.sm, lineHeight: 18, color: Colors.light.textSecondary },
  todo: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.light.border,
  },
  todoOverdue: { backgroundColor: Colors.light.warningLight, borderColor: Colors.light.warning },
  todoText: { flex: 1, fontSize: theme.fontSize.sm, lineHeight: 18, color: Colors.light.text },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: Colors.light.border,
  },
  searchInput: { flex: 1, fontSize: theme.fontSize.base, color: Colors.light.text, paddingVertical: 0 },
  chipsRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, alignItems: 'center' },
  dayHeader: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold, color: Colors.light.textSecondary, marginTop: theme.spacing.sm, marginBottom: 6 },
  listContent: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.sm },
  emptyContainer: { flexGrow: 1, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm },
});
