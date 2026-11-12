/**
 * Resultado do Mês por produto: cada produto vendido no mês com peças, preço médio, quanto entrou, custo e lucro.
 * Mesma conta do resumo (desconto da venda rateado entre os itens, devolução abate o produto devolvido).
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { getMonthlyResultByProduct, type ProductMonthResult } from '@/services/expenseService';
import { formatCurrency } from '@/utils/format';
import ScreenLoader from '@/components/ui/ScreenLoader';

type Sort = 'profit' | 'pieces' | 'revenue' | 'name';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'profit', label: 'Mais lucro' },
  { id: 'pieces', label: 'Mais vendidos' },
  { id: 'revenue', label: 'Mais faturou' },
  { id: 'name', label: 'A a Z' },
];
const PAGE = 15;

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ProductMonthList({ year, month }: { year: number; month: number }) {
  const brand = useBrandingColors();
  const [sort, setSort] = useState<Sort>('profit');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['monthly-result-products', year, month],
    queryFn: () => getMonthlyResultByProduct(year, month),
  });

  const list = useMemo(() => {
    const q = strip(query.trim());
    const rows = (data ?? []).filter((p) => !q || strip(p.name).includes(q));
    const by: Record<Sort, (a: ProductMonthResult, b: ProductMonthResult) => number> = {
      profit: (a, b) => b.profit - a.profit,
      pieces: (a, b) => b.pieces_net - a.pieces_net,
      revenue: (a, b) => b.revenue - a.revenue,
      name: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
    };
    return [...rows].sort(by[sort]);
  }, [data, sort, query]);

  const shown = showAll || query ? list : list.slice(0, PAGE);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Produtos vendidos no mês</Text>
      <Text style={styles.sub}>Quanto entrou, quanto custou e quanto sobrou de cada produto. Devoluções já descontadas.</Text>

      {isLoading ? (
        <ScreenLoader compact />
      ) : !data?.length ? (
        <Text style={styles.empty}>Nenhuma venda neste mês.</Text>
      ) : (
        <>
          {data.length > 8 && (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar produto"
              placeholderTextColor={Colors.light.textTertiary}
              style={styles.search}
              accessibilityLabel="Buscar produto"
            />
          )}
          <View style={styles.chips}>
            {SORTS.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => setSort(s.id)}
                style={[styles.chip, sort === s.id && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: sort === s.id }}
              >
                <Text style={[styles.chipText, sort === s.id && { color: brand.primary }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {shown.map((p) => {
            const neg = p.profit < 0;
            return (
              <View key={String(p.product_id)} style={styles.row}>
                <View style={styles.rowHead}>
                  <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.profit, { color: neg ? Colors.light.error : Colors.light.success }]}>
                      {formatCurrency(p.profit)}
                    </Text>
                    <Text style={styles.small}>lucro{p.revenue > 0 ? ` · ${p.margin_percent.toFixed(0)}%` : ''}</Text>
                  </View>
                </View>
                <Text style={styles.detail}>
                  {p.pieces_net} {p.pieces_net === 1 ? 'peça' : 'peças'}
                  {p.pieces_returned > 0
                    ? ` (${p.pieces_sold} vendidas, ${p.pieces_returned} devolvida${p.pieces_returned > 1 ? 's' : ''})`
                    : ''}
                  {' · '}preço médio {formatCurrency(p.average_price)}
                  {p.pieces_net > 0 ? ` · custo ${formatCurrency(p.average_cost)} a peça` : ''}
                </Text>
                <View style={styles.numbers}>
                  <View style={styles.num}>
                    <Text style={styles.numLabel}>Entrou</Text>
                    <Text style={styles.numValue}>{formatCurrency(p.revenue)}</Text>
                  </View>
                  <View style={styles.num}>
                    <Text style={styles.numLabel}>Custo das peças</Text>
                    <Text style={[styles.numValue, { color: Colors.light.warning }]}>{formatCurrency(p.cost)}</Text>
                  </View>
                </View>
              </View>
            );
          })}

          {!query && list.length > PAGE && (
            <TouchableOpacity onPress={() => setShowAll((v) => !v)} style={styles.more} accessibilityRole="button">
              <Text style={[styles.moreText, { color: brand.primary }]}>
                {showAll ? 'Mostrar menos' : `Ver todos os ${list.length} produtos`}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    backgroundColor: Colors.light.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    gap: 10,
  },
  title: { fontWeight: '700', color: Colors.light.text, fontSize: theme.fontSize.md },
  sub: { fontSize: 12, color: Colors.light.textSecondary, lineHeight: 17 },
  empty: { fontSize: 13, color: Colors.light.textSecondary },
  search: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: Colors.light.text,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.light.text },
  row: { borderTopWidth: 1, borderTopColor: Colors.light.border, paddingTop: 10, gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.light.text },
  profit: { fontSize: 16, fontWeight: theme.fontWeight.extrabold },
  small: { fontSize: 11, color: Colors.light.textSecondary },
  detail: { fontSize: 12, color: Colors.light.textSecondary, lineHeight: 17 },
  numbers: { flexDirection: 'row', gap: 8 },
  num: { flex: 1, backgroundColor: Colors.light.backgroundSecondary, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  numLabel: { fontSize: 11, color: Colors.light.textSecondary },
  numValue: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  more: { alignItems: 'center', paddingVertical: 6 },
  moreText: { fontWeight: '700', fontSize: 13 },
});
