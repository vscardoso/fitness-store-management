/**
 * Prejuízos: peças perdidas ou estragadas, lançadas como gasto da loja.
 *  - Resumo no topo: quanto se perdeu no período e quantos lançamentos.
 *  - Cada linha diz o que foi perdido (produto, peças x custo de cada), a data e o valor.
 *  - "Registrar prejuízo" fica fixo no rodapé. No notebook: resumo à esquerda, lista à direita.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { FormFooter } from '@/components/expenses/FormParts';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';
import { getStockLosses } from '@/services/expenseService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import type { Expense } from '@/types/expense';
import { Money } from '@/components/ui/PriceDisplay';
import { useDesktopContentStyle, useIsDesktop } from '@/hooks/useLayout';
import { lossProductName, parseStockLoss } from '@/utils/stockLossNotes';

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function useDateRange(period: PeriodFilterValue) {
  return useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (period) {
      case 'this_month': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'last_30_days': start = new Date(now.getTime() - 30 * 86400000); break;
      case 'last_2_months': start = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()); break;
      case 'last_3_months': start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
      case 'last_6_months': start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
      case 'this_year': start = new Date(now.getFullYear(), 0, 1); break;
      default: start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { start_date: fmt(start), end_date: fmt(now) };
  }, [period]);
}

/** "2 peças x R$ 45,00" quando as anotações trazem a quantidade e o custo de cada peça. */
function lossDetail(item: Expense): string | null {
  const info = parseStockLoss(item.notes);
  if (!info.quantity) return null;
  const qty = Number(info.quantity);
  const unit = typeof info.unitCost === 'number' ? formatCurrency(info.unitCost) : info.unitCost;
  const pieces = Number.isFinite(qty) ? `${qty} ${qty === 1 ? 'peça' : 'peças'}` : info.quantity;
  return unit ? `${pieces} x ${unit}` : pieces;
}

export default function StockLossListScreen() {
  const desktopColumn = useDesktopContentStyle();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodFilterValue>('this_month');
  const [refreshing, setRefreshing] = useState(false);
  const dateRange = useDateRange(period);

  const { data: losses, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stock-losses', dateRange],
    queryFn: () => getStockLosses(dateRange),
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const total = useMemo(() => (losses ?? []).reduce((sum, item) => sum + Number(item.amount), 0), [losses]);
  const goRegister = () => router.push('/(tabs)/stock-losses/register');

  const renderItem = ({ item }: { item: Expense }) => {
    const dateStr = item.expense_date.split('-').reverse().join('/');
    const detail = lossDetail(item);
    const observation = parseStockLoss(item.notes).observation;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => router.push({ pathname: '/(tabs)/stock-losses/[id]' as any, params: { id: String(item.id) } })}
        accessibilityRole="button"
        accessibilityLabel={`${lossProductName(item.description)}, perda de ${formatCurrency(item.amount)}, ${dateStr}`}
      >
        <View style={styles.rowContent}>
          <Text style={styles.description} numberOfLines={1}>{lossProductName(item.description)}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>{[dateStr, detail].filter(Boolean).join(' · ')}</Text>
          {!!observation && <Text style={styles.notes} numberOfLines={2}>{observation}</Text>}
        </View>
        <View style={styles.amountCol}>
          <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
          <Text style={styles.amountNote}>perda</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
      </TouchableOpacity>
    );
  };

  const summary = (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <Text style={styles.eyebrow}>PERDAS NO PERÍODO</Text>
        <PeriodFilter value={period} onChange={setPeriod} compact />
      </View>
      <Money style={styles.summaryValue} value={Number(total)} />
      <Text style={styles.summaryMeta}>
        {`${losses?.length ?? 0} ${(losses?.length ?? 0) === 1 ? 'lançamento' : 'lançamentos'} · entram no resultado do mês como gasto da loja`}
      </Text>
    </View>
  );

  if (isLoading && !losses) {
    return (
      <View style={styles.container}>
        <PageHeader title="Prejuízos" showBackButton />
        <ScreenLoader message="Carregando prejuízos..." />
      </View>
    );
  }

  if (!isLoading && (isError || !losses)) {
    const detail = error instanceof Error ? error.message : 'Falha ao consultar os lançamentos de prejuízo.';
    return (
      <View style={styles.container}>
        <PageHeader title="Prejuízos" subtitle="Falha ao carregar" showBackButton />
        <EmptyState type="error" title="Não foi possível carregar" description={detail} actionLabel="Tentar Novamente" onAction={() => refetch()} />
      </View>
    );
  }

  const list = (
    <FlatList
      data={losses ?? []}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      ListHeaderComponent={isDesktop ? null : summary}
      contentContainerStyle={losses?.length ? styles.listContent : styles.emptyContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[VALUE_COLORS.negative]} />}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <EmptyState
          icon="warning-outline"
          title="Nenhum prejuízo no período"
          description="Quando uma peça se perder ou estragar, registre aqui para o resultado do mês mostrar o gasto."
          actionLabel="Registrar prejuízo"
          onAction={goRegister}
        />
      }
    />
  );

  return (
    <View style={styles.container}>
      <PageHeader title="Prejuízos" subtitle="Peças perdidas ou estragadas" showBackButton />
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
      <FormFooter primaryLabel="Registrar prejuízo" primaryIcon="add" onPrimary={goRegister} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  columns: { flex: 1, flexDirection: 'row', gap: theme.spacing.lg, padding: theme.spacing.md },
  leftCol: { width: 360 },
  eyebrow: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.extrabold, letterSpacing: 1, color: Colors.light.textSecondary, flex: 1 },
  summaryCard: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, gap: 4, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  summaryValue: { fontSize: theme.fontSize.xxxl, fontWeight: theme.fontWeight.extrabold, letterSpacing: -0.5, color: VALUE_COLORS.negative },
  summaryMeta: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  listContent: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl },
  emptyContent: { flexGrow: 1, paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border, padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  rowContent: { flex: 1, minWidth: 0, gap: 2 },
  description: { color: Colors.light.text, fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold },
  rowMeta: { color: Colors.light.textSecondary, fontSize: theme.fontSize.sm },
  notes: { marginTop: 4, color: Colors.light.textSecondary, fontSize: theme.fontSize.sm, lineHeight: 18 },
  amountCol: { alignItems: 'flex-end', gap: 2 },
  amount: { color: VALUE_COLORS.negative, fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.extrabold },
  amountNote: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
});
