/**
 * Vendas no modo notebook (app web com 1024 px ou mais): tabela com período, situação, busca, ordenação e páginas.
 * O celular continua com a lista de cartões (app/(tabs)/sales/index.tsx).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import DataTable, { DataColumn } from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { useBrandingColors } from '@/store/brandingStore';
import { getSales } from '@/services/saleService';
import { formatCurrency, formatDateTime, parseApiDate } from '@/utils/format';
import { VALUE_COLORS } from '@/constants/Colors';
import type { Sale } from '@/types';

const INK = '#160F28';
const MUTED = '#5B5670';
const LINE = '#E6E3EE';
const BATCH = 100;
const MAX_SALES = 3000;

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: '#B45309' },
  completed: { label: 'Concluída', color: '#047857' },
  cancelled: { label: 'Cancelada', color: VALUE_COLORS.negative },
  partially_refunded: { label: 'Dev. parcial', color: '#B45309' },
  refunded: { label: 'Devolvida', color: '#7B1FA2' },
};

const PAYMENT: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', debit_card: 'Débito', credit_card: 'Crédito', transfer: 'Transferência',
};

type StatusFilter = 'all' | 'completed' | 'pending' | 'cancelled' | 'refunded';

const norm = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function periodRange(period: PeriodFilterValue) {
  const now = new Date();
  let start: Date;
  switch (period) {
    case 'last_30_days': start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    case 'last_2_months': start = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()); break;
    case 'last_3_months': start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
    case 'last_6_months': start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
    case 'this_year': start = new Date(now.getFullYear(), 0, 1); break;
    default: start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start_date: fmt(start), end_date: fmt(now) };
}

export default function DesktopSalesTable() {
  const router = useRouter();
  const colors = useBrandingColors();
  const [period, setPeriod] = useState<PeriodFilterValue>('this_month');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const range = useMemo(() => periodRange(period), [period]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales', 'desktop', range],
    queryFn: async () => {
      const all: Sale[] = [];
      for (let skip = 0; skip < MAX_SALES; skip += BATCH) {
        const page = await getSales({ skip, limit: BATCH, ...range });
        all.push(...page);
        if (page.length < BATCH) break;
      }
      return all;
    },
  });
  const sales = data ?? [];

  const counts = useMemo(() => {
    const c = { completed: 0, pending: 0, cancelled: 0, refunded: 0, revenue: 0 };
    for (const s of sales) {
      const st = s.status as string; // o servidor também devolve 'refunded' (venda devolvida por inteiro)
      if (st === 'completed') { c.completed++; c.revenue += Number(s.total_amount); }
      else if (st === 'pending') c.pending++;
      else if (st === 'cancelled') c.cancelled++;
      else c.refunded++;
    }
    return c;
  }, [sales]);

  const rows = useMemo(() => {
    const words = norm(search).split(/\s+/).filter(Boolean);
    return sales.filter((s) => {
      const st = s.status as string;
      if (status === 'completed' && st !== 'completed') return false;
      if (status === 'pending' && st !== 'pending') return false;
      if (status === 'cancelled' && st !== 'cancelled') return false;
      if (status === 'refunded' && st !== 'refunded' && st !== 'partially_refunded') return false;
      if (!words.length) return true;
      const hay = norm([s.sale_number, s.customer_name, s.seller_name, PAYMENT[s.payment_method as string]].filter(Boolean).join(' '));
      return words.every((w) => hay.includes(w));
    });
  }, [sales, status, search]);

  const columns: DataColumn<Sale>[] = useMemo(() => [
    {
      key: 'number', title: 'Venda', flex: 1.6, minWidth: 150,
      sortValue: (s) => s.sale_number,
      render: (s) => (
        <View style={{ gap: 1 }}>
          <Text style={styles.number}>#{s.sale_number.split('-').pop()}</Text>
          <Text style={styles.sub} numberOfLines={1}>{s.sale_number}</Text>
        </View>
      ),
    },
    {
      key: 'date', title: 'Data', flex: 1.3, minWidth: 140,
      sortValue: (s) => parseApiDate(s.created_at).getTime(),
      render: (s) => <Text style={styles.cellText}>{formatDateTime(s.created_at)}</Text>,
    },
    {
      key: 'customer', title: 'Cliente', flex: 2, minWidth: 150,
      sortValue: (s) => s.customer_name ?? '',
      render: (s) => <Text style={[styles.cellText, !s.customer_name && styles.muted]} numberOfLines={1}>{s.customer_name || 'Sem cliente'}</Text>,
    },
    {
      key: 'seller', title: 'Vendedor', flex: 1.4, minWidth: 110,
      sortValue: (s) => s.seller_name ?? '',
      render: (s) => <Text style={styles.cellText} numberOfLines={1}>{s.seller_name || '-'}</Text>,
    },
    {
      key: 'payment', title: 'Pagamento', flex: 1.1, minWidth: 100,
      sortValue: (s) => PAYMENT[s.payment_method as string] ?? '',
      render: (s) => <Text style={styles.cellText} numberOfLines={1}>{PAYMENT[s.payment_method as string] ?? '-'}</Text>,
    },
    {
      key: 'total', title: 'Total', flex: 1.2, minWidth: 110, align: 'right',
      sortValue: (s) => Number(s.total_amount),
      render: (s) => <Text style={[styles.total, { color: colors.primary }]}>{formatCurrency(Number(s.total_amount))}</Text>,
    },
    {
      key: 'status', title: 'Situação', flex: 1.2, minWidth: 120, align: 'center',
      sortValue: (s) => STATUS[s.status]?.label ?? '',
      render: (s) => {
        const st = STATUS[s.status] ?? STATUS.pending;
        return (
          <View style={[styles.badge, { backgroundColor: st.color + '18' }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        );
      },
    },
  ], [colors.primary]);

  const header = (
    <PageHeader
      title="Vendas"
      subtitle={isLoading ? 'Carregando...' : `${sales.length} ${sales.length === 1 ? 'venda' : 'vendas'} no período`}
      rightActions={[{ icon: 'cart-outline', onPress: () => router.push('/(tabs)/sale') }]}
    />
  );

  if (isLoading) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.sub}>Carregando vendas...</Text></View>
      </View>
    );
  }
  if (isError) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState icon="alert-circle-outline" title="Erro ao carregar vendas" description="Verifique sua conexão e tente novamente" />
        <TouchableOpacity onPress={() => refetch()} style={[styles.primaryBtn, { backgroundColor: colors.primary, alignSelf: 'center' }]}>
          <Text style={styles.primaryBtnText}>Tentar de novo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chips: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: `Todas (${sales.length})` },
    { key: 'completed', label: `Concluídas (${counts.completed})` },
    { key: 'pending', label: `Pendentes (${counts.pending})` },
    { key: 'refunded', label: `Devolvidas (${counts.refunded})` },
    { key: 'cancelled', label: `Canceladas (${counts.cancelled})` },
  ];

  return (
    <View style={styles.screen}>
      {header}
      <View style={styles.body}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Vendas concluídas</Text>
            <Text style={styles.summaryValue}>{counts.completed}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Soma das concluídas</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(counts.revenue)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Venda média</Text>
            <Text style={styles.summaryValue}>{formatCurrency(counts.completed ? counts.revenue / counts.completed : 0)}</Text>
          </View>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color="#8A839E" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por número, cliente, vendedor ou pagamento"
              placeholderTextColor="#8A839E"
              style={styles.searchInput}
              autoCorrect={false}
              accessibilityLabel="Buscar venda"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Limpar busca">
                <Ionicons name="close-circle" size={18} color="#8A839E" />
              </TouchableOpacity>
            ) : null}
          </View>
          <PeriodFilter value={period} onChange={setPeriod} />
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/(tabs)/sale')}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Nova venda</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chips}>
          {chips.map((c) => (
            <TouchableOpacity key={c.key} onPress={() => setStatus(c.key)} style={[styles.chip, status === c.key && styles.chipOn]}>
              <Text style={[styles.chipText, status === c.key && styles.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          onRowPress={(s) => router.push(`/sales/${s.id}`)}
          defaultSort={{ key: 'date', dir: 'desc' }}
          resetKey={`${search}|${status}|${period}`}
          emptyTitle="Nenhuma venda encontrada"
          emptyHint="Mude o período ou limpe os filtros."
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5FA' },
  body: { flex: 1, padding: 20, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: LINE, padding: 14, gap: 4 },
  summaryLabel: { fontSize: 12, color: MUTED, fontWeight: '600' },
  summaryValue: { fontSize: 22, fontWeight: '800', color: INK },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: INK, outlineStyle: 'none' } as any,
  primaryBtn: { height: 44, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#E0DBEA', backgroundColor: '#FFFFFF', justifyContent: 'center' },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontSize: 13, fontWeight: '600', color: INK },
  chipTextOn: { color: '#FFFFFF' },
  number: { fontSize: 13, fontWeight: '700', color: INK },
  cellText: { fontSize: 14, color: INK },
  muted: { color: MUTED },
  sub: { fontSize: 12, color: MUTED },
  total: { fontSize: 14, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
