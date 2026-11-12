/**
 * Peças visuais dos relatórios (mensal): seta de variação contra o mês anterior, barra de proporção e barra empilhada com legenda.
 * Número sempre vem com a palavra que o explica; a cor só reforça (verde melhorou, vermelho piorou), nunca é a única pista.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';

/** "▲ 12,3%" / "▼ 4,0%" contra o mês anterior. `goodWhenUp=false` (despesas) inverte as cores: subir é ruim. */
export function DeltaBadge({ value, goodWhenUp = true }: { value: number | null | undefined; goodWhenUp?: boolean }) {
  if (value === null || value === undefined) return <Text style={styles.deltaNone}>sem mês anterior para comparar</Text>;
  const up = value > 0.05;
  const down = value < -0.05;
  const good = up ? goodWhenUp : down ? !goodWhenUp : true;
  const color = !up && !down ? Colors.light.textSecondary : good ? Colors.light.success : Colors.light.error;
  const arrow = up ? '▲' : down ? '▼' : '=';
  const text = `${arrow} ${Math.abs(value).toFixed(1).replace('.', ',')}%`;
  return <Text style={[styles.delta, { color }]} accessibilityLabel={`${up ? 'subiu' : down ? 'caiu' : 'igual'} ${Math.abs(value).toFixed(1)} por cento sobre o mês anterior`}>{`${text} sobre o mês anterior`}</Text>;
}

/** Linha com barra: o comprimento mostra a proporção (0 a 1) e o texto diz o valor e o que ele representa. */
export function BarRow({ label, value, share, sub, color }: { label: string; value: string; share: number; sub?: string; color: string }) {
  const width = `${Math.max(2, Math.min(100, Math.round(share * 100)))}%` as `${number}%`;
  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={2}>{label}</Text>
        <Text style={styles.barValue}>{value}</Text>
      </View>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.fill, { width, backgroundColor: color }]} />
      </View>
      {!!sub && <Text style={styles.barSub}>{sub}</Text>}
    </View>
  );
}

export interface Segment { label: string; amount: number; color: string; note?: string }

/** Barra única dividida em fatias (parte de um total) com a legenda por extenso embaixo. */
export function StackedBar({ segments, totalLabel }: { segments: Segment[]; totalLabel: string }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.amount), 0);
  if (total <= 0) return <Text style={styles.deltaNone}>Sem valores neste período.</Text>;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {segments.filter((s) => s.amount > 0).map((s) => (
          <View key={s.label} style={{ flex: s.amount / total, backgroundColor: s.color }} />
        ))}
      </View>
      <View style={{ gap: 6 }}>
        {segments.map((s) => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
            <Text style={styles.legendValue}>{`${formatCurrency(s.amount)} · ${Math.round((Math.max(0, s.amount) / total) * 100)}% ${totalLabel}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  delta: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold },
  deltaNone: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  barRow: { gap: 4 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  barLabel: { flex: 1, fontSize: theme.fontSize.md, color: Colors.light.text },
  barValue: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.light.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  barSub: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  stack: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: Colors.light.border },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: theme.fontSize.md, color: Colors.light.text },
  legendValue: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, textAlign: 'right', flexShrink: 1 },
});
