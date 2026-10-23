/**
 * Lucro por lote, compra por compra, em linguagem simples:
 * quanto você gastou, quanto já vendeu e quanto sobrou.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { Colors, VALUE_COLORS } from '@/constants/Colors';
import { formatCurrency, formatDate } from '@/utils/format';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import useBackToList from '@/hooks/useBackToList';
import { getLotProfitRanking, type LotProfitRow } from '@/services/stockEntryService';

export default function LotProfitScreen() {
  const brand = useBrandingColors();
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/more');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['lot-profit-ranking'],
    queryFn: getLotProfitRanking,
  });

  return (
    <View style={styles.container}>
      <PageHeader title="Lucro por lote" subtitle="Compra por compra" showBackButton onBack={goBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <View style={styles.intro}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.light.textSecondary} />
          <Text style={styles.introText}>
            Cada lote é uma compra que você deu entrada. Aqui você vê, para cada uma, quanto gastou (mercadoria, viagem e frete), quanto
            já vendeu e quanto sobrou de lucro. Toque num lote para ver os detalhes.
          </Text>
        </View>

        {isLoading && <ActivityIndicator color={brand.primary} style={{ marginTop: 32 }} />}

        {!isLoading && (data ?? []).length === 0 && (
          <Text style={styles.empty}>Você ainda não tem lotes. Quando der entrada numa compra, ela aparece aqui.</Text>
        )}

        {(data ?? []).map((lot) => (
          <LotCard
            key={lot.entry_id}
            lot={lot}
            color={brand.primary}
            onPress={() =>
              router.push({ pathname: `/entries/${lot.entry_id}`, params: { from: '/reports/lots' } } as any)
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

function LotCard({ lot, color, onPress }: { lot: LotProfitRow; color: string; onPress: () => void }) {
  const sold = lot.real_revenue > 0;
  const recovered = Math.max(0, Math.min(100, lot.recovered_pct));
  const missing = Math.max(0, lot.total_investment - lot.real_revenue);
  const paidOff = lot.recovered_pct >= 100;
  const profitColor = lot.gross_profit >= 0 ? VALUE_COLORS.positive : VALUE_COLORS.negative;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.code}>{lot.entry_code}</Text>
          <Text style={styles.sub}>
            {lot.supplier_name} · {formatDate(lot.entry_date)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
      </View>

      <View style={styles.cols}>
        <Col label="Você gastou" value={formatCurrency(lot.total_investment)} />
        <Col label="Já vendeu" value={formatCurrency(lot.real_revenue)} color={sold ? VALUE_COLORS.positive : undefined} />
        <Col label="Sobrou" value={sold ? formatCurrency(lot.gross_profit) : '—'} color={sold ? profitColor : undefined} />
      </View>

      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${recovered}%`, backgroundColor: paidOff ? VALUE_COLORS.positive : color }]} />
      </View>
      <Text style={styles.note}>
        {!sold
          ? 'Ainda não vendeu nada deste lote.'
          : paidOff
            ? 'Este lote já se pagou. O que vender daqui para frente é lucro.'
            : `Já voltou ${lot.recovered_pct.toFixed(0)}% do que você gastou. Faltam ${formatCurrency(missing)} para o lote se pagar.`}
      </Text>
      {lot.projected_profit_if_all_sold !== 0 && (
        <Text style={styles.forecast}>
          Se vender tudo pelos preços de hoje: lucro de uns {formatCurrency(lot.projected_profit_if_all_sold)} (estimativa).
        </Text>
      )}
    </TouchableOpacity>
  );
}

function Col({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.col}>
      <Text style={styles.colLabel}>{label}</Text>
      <Text style={[styles.colValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: 16, paddingBottom: 48 },
  intro: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: Colors.light.card, marginBottom: 16 },
  introText: { flex: 1, fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary },
  empty: { textAlign: 'center', color: Colors.light.textSecondary, marginTop: 40, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  code: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  cols: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  colLabel: { fontSize: 12, color: Colors.light.textSecondary },
  colValue: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginTop: 2 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: Colors.light.border, marginTop: 14, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 8 },
  forecast: { fontSize: 12, lineHeight: 18, color: Colors.light.textSecondary, marginTop: 4 },
});
