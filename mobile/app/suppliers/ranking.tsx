/**
 * Ranking de fornecedores: giro (quanto do que comprei vendeu) e margem (quanto sobrou).
 * Nota = 60% giro + 40% margem. Fornecedor com poucas unidades vendidas aparece como "poucos dados".
 */
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import SuppliersTabs from '@/components/suppliers/SuppliersTabs';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useSupplierRanking } from '@/hooks/useSupplierInsights';
import { formatCurrency } from '@/utils/format';
import type { SupplierRankingRow, SupplierRating } from '@/services/supplierInsightsService';

const PERIODS = [
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 180, label: '6 meses' },
  { days: 0, label: 'Tudo' },
];

const RATING: Record<SupplierRating, { label: string; color: string }> = {
  otimo: { label: 'Ótimo', color: Colors.light.success },
  bom: { label: 'Bom', color: Colors.light.info },
  atencao: { label: 'Atenção', color: Colors.light.warning },
  sem_dados: { label: 'Poucos dados', color: Colors.light.textSecondary },
};

const pct = (v: number | null) => (v === null || v === undefined ? '-' : `${v.toFixed(0)}%`);

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RankCard({ row, onPress }: { row: SupplierRankingRow; onPress: () => void }) {
  const brandingColors = useBrandingColors();
  const rating = RATING[row.rating] ?? RATING.sem_dados;
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={[styles.position, { backgroundColor: row.position <= 3 && !row.low_data ? brandingColors.primary + '20' : Colors.light.backgroundSecondary }]}>
          <Text style={styles.positionText}>{row.position}º</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>{row.supplier_name}</Text>
          <Text style={styles.sub}>
            {row.entries} {row.entries === 1 ? 'compra' : 'compras'} · {row.purchased_qty} un · {formatCurrency(row.purchased_cost)}
          </Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={[styles.score, { color: rating.color }]}>{row.score ?? '-'}</Text>
          <Text style={[styles.rating, { color: rating.color }]}>{rating.label}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label="Giro" value={pct(row.sell_through_pct)} />
        <Metric label="Margem" value={pct(row.margin_pct)} />
        <Metric label="Lucro" value={formatCurrency(row.profit)} />
        <Metric label="Parado" value={formatCurrency(row.stock_cost)} />
      </View>

      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, row.sell_through_pct))}%`, backgroundColor: rating.color }]} />
      </View>
      <Text style={styles.barCaption}>
        Vendeu {row.sold_qty} de {row.purchased_qty} un · restam {row.stock_qty} no estoque
      </Text>
    </TouchableOpacity>
  );
}

export default function SupplierRankingScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [days, setDays] = useState(180);
  const { data, isLoading, isRefetching, refetch, error } = useSupplierRanking(days);
  const rows = data?.suppliers ?? [];

  return (
    <View style={styles.container}>
      <PageHeader
        title="Ranking"
        subtitle="Quem dá mais retorno"
        showBackButton
        onBack={() => router.replace('/suppliers' as any)}
      />
      <SuppliersTabs active="ranking" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[brandingColors.primary]} />}
      >
        <View style={styles.periods}>
          {PERIODS.map((p) => {
            const active = p.days === days;
            return (
              <TouchableOpacity
                key={p.days}
                onPress={() => setDays(p.days)}
                activeOpacity={0.8}
                style={[styles.period, active && { backgroundColor: brandingColors.primary + '20', borderColor: brandingColors.primary }]}
              >
                <Text style={[styles.periodText, active && { color: brandingColors.primary }]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {data?.score_formula ? <Text style={styles.formula}>{data.score_formula}</Text> : null}

        {isLoading ? (
          <Text style={styles.hint}>Calculando...</Text>
        ) : error ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.light.error} />
            <Text style={styles.emptyTitle}>Erro ao carregar o ranking</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={[styles.link, { color: brandingColors.primary }]}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="trophy-outline" size={56} color={Colors.light.textTertiary} />
            <Text style={styles.emptyTitle}>Sem compras no período</Text>
            <Text style={styles.hint}>Registre entradas com fornecedor para ver o ranking.</Text>
          </View>
        ) : (
          rows.map((r) => (
            <RankCard key={r.supplier_id} row={r} onPress={() => router.push(`/suppliers/${r.supplier_id}` as any)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xxl, gap: theme.spacing.sm },
  periods: { flexDirection: 'row', gap: 8, marginTop: 4 },
  period: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
  },
  periodText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary },
  formula: { fontSize: 11, color: Colors.light.textTertiary, textAlign: 'center' },
  hint: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, textAlign: 'center' },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 12,
    ...theme.shadows.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  position: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  positionText: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  name: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  scoreBox: { alignItems: 'center', minWidth: 64 },
  score: { fontSize: 24, fontWeight: '800' },
  rating: { fontSize: 11, fontWeight: '600' },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, backgroundColor: Colors.light.backgroundSecondary, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  metricValue: { fontSize: 13, fontWeight: '700', color: Colors.light.text },
  metricLabel: { fontSize: 10, color: Colors.light.textSecondary, marginTop: 2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.light.backgroundSecondary, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barCaption: { fontSize: 11, color: Colors.light.textSecondary },
  empty: { alignItems: 'center', paddingVertical: theme.spacing.xl, gap: theme.spacing.sm },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.light.text, textAlign: 'center' },
  link: { fontSize: theme.fontSize.sm, fontWeight: '600' },
});
