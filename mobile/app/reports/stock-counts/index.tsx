/**
 * Conferências de estoque salvas: cada linha é uma contagem feita na loja, com data, quem contou e o resultado.
 * Toque numa conferência para ver peça por peça.
 */
import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, VALUE_COLORS } from '@/constants/Colors';
import useBackToList from '@/hooks/useBackToList';
import { useBrandingColors } from '@/store/brandingStore';
import { listStockCounts, type StockCountSummary } from '@/services/stockCountService';
import { formatDateTime, formatInt } from '@/utils/format';

export default function StockCountsScreen() {
  const brand = useBrandingColors();
  const router = useRouter();
  const { goBack } = useBackToList('/reports/stock-check');
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['stock-counts'],
    queryFn: () => listStockCounts({ limit: 50 }),
  });

  const renderItem = ({ item }: { item: StockCountSummary }) => {
    const clean = item.diff_variants === 0;
    const open = item.status === 'open';
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => router.push({ pathname: '/reports/stock-counts/[id]', params: { id: String(item.id) } } as any)}
      >
        {open && (
          <View style={styles.openRow}>
            <Text style={styles.openBadge}>Em andamento</Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/reports/stock-check', params: { resume: String(item.id) } } as any)}
              style={[styles.continueBtn, { backgroundColor: brand.primary }]}
              activeOpacity={0.85}
            >
              <Ionicons name="play" size={14} color="#fff" />
              <Text style={styles.continueText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.cardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.date}>{open ? 'Salva em ' + formatDateTime(item.updated_at || item.created_at) + ' · começou ' + formatDateTime(item.created_at) : 'Finalizada em ' + formatDateTime(item.finished_at || item.created_at)}</Text>
            <Text style={styles.title} numberOfLines={1}>{item.name || 'Conferência de estoque'}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[item.created_by_name, item.category_name || 'Todas as categorias'].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {!open && <Ionicons name={clean ? 'checkmark-circle' : 'alert-circle'} size={26} color={clean ? VALUE_COLORS.positive : VALUE_COLORS.negative} />}
        </View>
        <View style={styles.pills}>
          <Text style={styles.pill}>{formatInt(item.counted_variants)} de {formatInt(item.total_variants)} contadas</Text>
          {item.diff_variants > 0 ? (
            <Text style={[styles.pill, styles.pillBad]}>{formatInt(item.diff_variants)} divergentes</Text>
          ) : (
            <Text style={[styles.pill, styles.pillGood]}>tudo confere</Text>
          )}
          {item.short_pieces > 0 && <Text style={[styles.pill, styles.pillBad]}>faltam {formatInt(item.short_pieces)} peças</Text>}
          {item.over_pieces > 0 && <Text style={[styles.pill, styles.pillWarn]}>sobram {formatInt(item.over_pieces)} peças</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Conferências salvas" subtitle="Histórico das contagens do estoque" showBackButton onBack={goBack} />
      {isLoading ? (
        <ActivityIndicator size="large" color={brand.primary} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Ionicons name="wifi-outline" size={40} color={Colors.light.textTertiary} />
          <Text style={styles.emptyText}>Não foi possível carregar as conferências.</Text>
          <TouchableOpacity onPress={() => refetch()}>
            <Text style={[styles.link, { color: brand.primary }]}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data?.results ?? []}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkbox-outline" size={40} color={Colors.light.textTertiary} />
              <Text style={styles.emptyText}>Nenhuma conferência salva ainda.</Text>
              <Text style={styles.emptyHint}>Na tela de Conferência de estoque, conte as peças e toque em "Salvar conferência". Ela fica em andamento até você finalizar.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  date: { fontSize: 12, color: Colors.light.textSecondary },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginTop: 2 },
  meta: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    backgroundColor: Colors.light.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  openBadge: { fontSize: 12, fontWeight: '800', color: '#92400E', backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  continueBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  continueText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  pillBad: { color: VALUE_COLORS.negative, backgroundColor: '#FEE2E2' },
  pillWarn: { color: '#B45309', backgroundColor: '#FEF3C7' },
  pillGood: { color: VALUE_COLORS.positive, backgroundColor: '#DCFCE7' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.light.textSecondary, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: Colors.light.textTertiary, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700' },
});
