/** Uma conferência de estoque salva, peça por peça: o que o sistema tinha, o que foi contado e a diferença. */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
import { Colors, VALUE_COLORS } from '@/constants/Colors';
import useBackToList from '@/hooks/useBackToList';
import { useBrandingColors } from '@/store/brandingStore';
import { getStockCount, type StockCountItem } from '@/services/stockCountService';
import { formatDateTime, formatInt } from '@/utils/format';

const PAGE = 30;
const variantLabel = (i: StockCountItem) => [i.color, i.size].filter(Boolean).join(' / ') || 'Única';

export default function StockCountDetailScreen() {
  const brand = useBrandingColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { goBack } = useBackToList('/reports/stock-counts');
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['stock-count', id],
    queryFn: () => getStockCount(Number(id)),
    enabled: !!id,
  });

  const count = data?.count;
  const items = useMemo(() => (data?.items ?? []).filter((i) => !onlyDiffs || i.difference !== 0), [data, onlyDiffs]);
  const groups = useMemo(() => {
    const out: { key: string; name: string; rows: StockCountItem[] }[] = [];
    items.forEach((i) => {
      const key = `${i.product_id ?? i.product_name}`;
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(i);
      else out.push({ key, name: i.product_name, rows: [i] });
    });
    return out;
  }, [items]);
  const visibleGroups = groups.slice(0, shown);

  return (
    <View style={styles.container}>
      <PageHeader
        title={count?.name || 'Conferência de estoque'}
        subtitle={count ? (count.status === 'open' ? 'Em andamento · salva em ' + formatDateTime(count.updated_at || count.created_at) : 'Finalizada em ' + formatDateTime(count.finished_at || count.created_at)) : undefined}
        showBackButton
        onBack={goBack}
      />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        {isLoading ? (
          <ActivityIndicator size="large" color={brand.primary} style={{ marginTop: 40 }} />
        ) : error || !count ? (
          <View style={styles.empty}>
            <Ionicons name="wifi-outline" size={40} color={Colors.light.textTertiary} />
            <Text style={styles.emptyText}>Não foi possível abrir esta conferência.</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={[styles.link, { color: brand.primary }]}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.meta}>
              {[count.created_by_name, count.category_name || 'Todas as categorias'].filter(Boolean).join(' · ')}
            </Text>
            {!!count.note && <Text style={styles.note}>{count.note}</Text>}
            {count.status === 'open' && (
              <View style={styles.openBox}>
                <Text style={styles.openText}>
                  Esta conferência ainda está em andamento: os números abaixo são os do último salvamento. Continue de onde parou para contar mais peças e finalizar.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/reports/stock-check', params: { resume: String(count.id) } } as any)}
                  style={[styles.openBtn, { backgroundColor: brand.primary }]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="play" size={14} color="#fff" />
                  <Text style={styles.openBtnText}>Continuar de onde parou</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.cards}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Variações contadas</Text>
                <Text style={styles.cardValue}>{formatInt(count.counted_variants)} de {formatInt(count.total_variants)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Confere</Text>
                <Text style={[styles.cardValue, { color: VALUE_COLORS.positive }]}>{formatInt(count.ok_variants)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Faltam</Text>
                <Text style={[styles.cardValue, { color: count.short_pieces > 0 ? VALUE_COLORS.negative : Colors.light.text }]}>
                  {formatInt(count.short_pieces)}
                </Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Sobram</Text>
                <Text style={[styles.cardValue, { color: count.over_pieces > 0 ? '#B45309' : Colors.light.text }]}>
                  {formatInt(count.over_pieces)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.filter, onlyDiffs && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
              onPress={() => {
                setOnlyDiffs((v) => !v);
                setShown(PAGE);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name={onlyDiffs ? 'checkbox' : 'square-outline'} size={18} color={onlyDiffs ? brand.primary : Colors.light.textSecondary} />
              <Text style={[styles.filterText, onlyDiffs && { color: brand.primary }]}>Só divergências ({formatInt(count.diff_variants)})</Text>
            </TouchableOpacity>

            {groups.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="checkmark-circle-outline" size={40} color={VALUE_COLORS.positive} />
                <Text style={styles.emptyText}>Nenhuma divergência nesta conferência.</Text>
              </View>
            ) : (
              visibleGroups.map((g) => (
                <View key={g.key} style={styles.group}>
                  <Text style={styles.groupName} numberOfLines={2}>{g.name}</Text>
                  {g.rows.map((r, idx) => (
                    <View key={`${r.variant_id ?? idx}`} style={styles.row}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.variant} numberOfLines={1}>{variantLabel(r)}</Text>
                        <Text style={styles.sub} numberOfLines={1}>{[r.display_code, r.sku].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <View style={styles.num}>
                        <Text style={styles.numLabel}>Sistema</Text>
                        <Text style={styles.numValue}>{formatInt(r.system_quantity)}</Text>
                      </View>
                      <View style={styles.num}>
                        <Text style={styles.numLabel}>Contado</Text>
                        <Text style={styles.numValue}>{formatInt(r.counted_quantity)}</Text>
                      </View>
                      <View style={styles.diff}>
                        {r.difference === 0 ? (
                          <Ionicons name="checkmark-circle" size={22} color={VALUE_COLORS.positive} accessibilityLabel="Confere" />
                        ) : (
                          <Text style={[styles.diffText, { color: r.difference < 0 ? VALUE_COLORS.negative : '#B45309' }]}>
                            {r.difference < 0 ? `falta ${formatInt(-r.difference)}` : `sobra ${formatInt(r.difference)}`}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}

            {groups.length > visibleGroups.length && (
              <TouchableOpacity onPress={() => setShown((n) => n + PAGE)} style={{ alignItems: 'center', padding: 16 }}>
                <Text style={[styles.link, { color: brand.primary }]}>
                  Mostrar mais ({formatInt(groups.length - visibleGroups.length)} produtos restantes)
                </Text>
              </TouchableOpacity>
            )}
            <Text style={styles.footer}>{count.status === 'open' ? 'Esta conferência não altera o estoque.' : 'Esta conferência é uma fotografia do dia e não muda mais. Ela não altera o estoque.'}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  meta: { fontSize: 13, color: Colors.light.textSecondary },
  openBox: { gap: 10, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12 },
  openText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#92400E' },
  openBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  openBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  note: { fontSize: 14, color: Colors.light.text, backgroundColor: Colors.light.card, borderRadius: 12, padding: 12 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: Colors.light.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardLabel: { fontSize: 12, color: Colors.light.textSecondary },
  cardValue: { fontSize: 20, fontWeight: '800', color: Colors.light.text, marginTop: 4 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.light.card,
  },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  group: { backgroundColor: Colors.light.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, overflow: 'hidden' },
  groupName: { fontSize: 14, fontWeight: '700', color: Colors.light.text, padding: 12, backgroundColor: Colors.light.backgroundSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.light.border },
  variant: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  sub: { fontSize: 11, color: Colors.light.textTertiary, marginTop: 2 },
  num: { alignItems: 'center', minWidth: 52 },
  numLabel: { fontSize: 10, color: Colors.light.textSecondary },
  numValue: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  diff: { width: 60, alignItems: 'center' },
  diffText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, color: Colors.light.textSecondary, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700' },
  footer: { fontSize: 12, color: Colors.light.textTertiary, textAlign: 'center', marginTop: 8 },
});
