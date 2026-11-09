/**
 * Saídas sem venda: peças que saíram do estoque sem ser vendidas (baixa, exclusão, ajuste), com motivo, quem fez e custo.
 * Só gerente e admin. Dados: GET /stock-entries/removals.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { getStockRemovals, type StockRemoval } from '@/services/stockEntryService';
import { dateToIso } from '@/utils/dateBr';
import { formatCurrency, formatDate, formatInt } from '@/utils/format';
import { isManagerRole } from '@/utils/roles';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';

const PAGE = 50;

const REASONS: { key: string; label: string }[] = [
  { key: '', label: 'Todas' },
  { key: 'baixa_conferencia', label: 'Baixa na Conferência' },
  { key: 'variacao_excluida', label: 'Variação excluída' },
  { key: 'ajuste_estoque', label: 'Ajuste' },
  { key: 'baixa_sem_registro', label: 'Sem registro na hora' },
];

type Period = 'all' | '30d' | 'month';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Tudo' },
  { key: '30d', label: '30 dias' },
  { key: 'month', label: 'Este mês' },
];

function periodRange(p: Period): { start_date?: string; end_date?: string } {
  const now = new Date();
  if (p === '30d') return { start_date: dateToIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)), end_date: dateToIso(now) };
  if (p === 'month') return { start_date: dateToIso(new Date(now.getFullYear(), now.getMonth(), 1)), end_date: dateToIso(now) };
  return {};
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

export default function RemovalsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const allowed = isManagerRole(user?.role);
  const desktop = useDesktopContentStyle();
  const [reason, setReason] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const range = useMemo(() => periodRange(period), [period]);

  // contagem de cada motivo (sem filtrar por motivo, para os chips não mudarem ao escolher um)
  const summary = useQuery({
    queryKey: ['stock-removals', 'summary', range],
    queryFn: () => getStockRemovals({ ...range, limit: 1, skip: 0 }),
    enabled: allowed,
  });

  const list = useInfiniteQuery({
    queryKey: ['stock-removals', { reason, ...range }],
    queryFn: ({ pageParam }) => getStockRemovals({ ...range, reason: reason || undefined, limit: PAGE, skip: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total_count && last.items.length > 0 ? loaded : undefined;
    },
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <View style={styles.container}>
        <PageHeader title="Saídas sem venda" showBackButton backFallback="/(tabs)" />
        <EmptyState type="error" title="Você não tem permissão para ver esta tela" />
      </View>
    );
  }

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const totals = list.data?.pages[0]?.totals;
  const byReason = summary.data?.totals.by_reason ?? {};
  const countFor = (key: string) => (key === '' ? num(summary.data?.totals.pieces) : num(byReason[key]?.pieces));

  const header = (
    <View style={styles.headerBox}>
      <View style={styles.cards}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Peças que saíram</Text>
          <Text style={styles.cardValue}>{formatInt(num(totals?.pieces))}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Prejuízo em custo</Text>
          <Text style={[styles.cardValue, { color: Colors.light.error }]}>{formatCurrency(num(totals?.cost))}</Text>
        </View>
      </View>

      <View style={styles.chips}>
        {REASONS.map((r) => {
          const on = reason === r.key;
          return (
            <TouchableOpacity key={r.key || 'todas'} style={[styles.chip, on && styles.chipOn]} onPress={() => setReason(r.key)}
              accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label} ({formatInt(countFor(r.key))})</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.chips}>
        {PERIODS.map((p) => {
          const on = period === p.key;
          return (
            <TouchableOpacity key={p.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setPeriod(p.key)}
              accessibilityRole="button" accessibilityState={{ selected: on }}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: StockRemoval }) => {
    const detail = [item.variant_label, item.variant_code ? `#${String(item.variant_code).replace(/^#/, '')}` : null].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity
        style={styles.row}
        disabled={!item.entry_id}
        onPress={() => item.entry_id && router.push(`/entries/${item.entry_id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={`${item.product_name}, ${item.quantity} peças, ${item.label}`}
      >
        <View style={styles.rowMain}>
          <Text style={styles.product} numberOfLines={2}>{item.product_name}</Text>
          {!!detail && <Text style={styles.sub}>{detail}</Text>}
          <Text style={styles.sub}>
            {item.quantity} {item.quantity === 1 ? 'peça' : 'peças'} · {item.label}{item.user_name ? ` · por ${item.user_name}` : ''}
          </Text>
          {item.when ? (
            <Text style={styles.sub}>{formatDate(item.when)}</Text>
          ) : (
            <Text style={[styles.sub, { color: Colors.light.warning, fontWeight: '700' }]}>
              Sem data registrada (antes do registro existir)
            </Text>
          )}
          {!!item.note && <Text style={styles.sub} numberOfLines={2}>{item.note}</Text>}
        </View>
        <View style={styles.rowSide}>
          <Text style={styles.cost}>{formatCurrency(num(item.cost_total))}</Text>
          <Text style={styles.sub}>de custo</Text>
          {!!item.entry_id && <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Saídas sem venda" subtitle="Peças que saíram do estoque sem ser vendidas" showBackButton backFallback="/(tabs)" />
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.content, desktop]}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage(); }}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => { list.refetch(); summary.refetch(); }}
        ListEmptyComponent={
          list.isLoading ? <ActivityIndicator style={styles.loading} color={Colors.light.primary} />
          : list.isError ? <EmptyState type="error" title="Não foi possível carregar" actionLabel="Tentar de novo" onAction={() => list.refetch()} />
          : <EmptyState title="Nenhuma saída sem venda" />
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={styles.loading} color={Colors.light.primary} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  headerBox: { gap: 12, marginBottom: 4 },
  cards: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, backgroundColor: Colors.light.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.light.border, gap: 4 },
  cardLabel: { fontSize: 13, fontWeight: '700', color: Colors.light.textSecondary },
  cardValue: { fontSize: 22, fontWeight: '800', color: Colors.light.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card },
  chipOn: { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  chipTextOn: { color: Colors.light.card },
  row: { flexDirection: 'row', gap: 12, backgroundColor: Colors.light.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  rowMain: { flex: 1, gap: 2 },
  rowSide: { alignItems: 'flex-end', gap: 2 },
  product: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 12, lineHeight: 17, color: Colors.light.textSecondary },
  cost: { fontSize: 15, fontWeight: '800', color: Colors.light.text },
  loading: { marginVertical: 24 },
});
