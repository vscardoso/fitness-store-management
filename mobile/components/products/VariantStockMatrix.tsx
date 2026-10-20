/**
 * Matriz de estoque tamanho x cor, com totais por linha/coluna e destaque de rupturas.
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import type { VariantGrid } from '@/types/productVariant';
import { buildVariantMatrix, type CellStatus } from '@/utils/variantMatrix';

interface Props {
  grid: VariantGrid;
}

const CELL_W = 52;
const LABEL_W = 84;

const STATUS_COLORS: Record<CellStatus, { fg: string; bg: string }> = {
  out: { fg: Colors.light.error, bg: Colors.light.errorLight },
  low: { fg: Colors.light.warning, bg: Colors.light.warningLight },
  ok: { fg: Colors.light.success, bg: Colors.light.successLight },
};

export function VariantStockMatrix({ grid }: Props) {
  const m = useMemo(() => buildVariantMatrix(grid), [grid]);

  if (m.existingCount === 0) return null;

  return (
    <View>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>{m.total} un em estoque</Text>
        {m.outCount > 0 && (
          <View style={[styles.pill, { backgroundColor: STATUS_COLORS.out.bg }]}>
            <Ionicons name="alert-circle" size={12} color={STATUS_COLORS.out.fg} />
            <Text style={[styles.pillText, { color: STATUS_COLORS.out.fg }]}>
              {m.outCount} {m.outCount === 1 ? 'ruptura' : 'rupturas'}
            </Text>
          </View>
        )}
        {m.lowCount > 0 && (
          <View style={[styles.pill, { backgroundColor: STATUS_COLORS.low.bg }]}>
            <Text style={[styles.pillText, { color: STATUS_COLORS.low.fg }]}>
              {m.lowCount} baixo
            </Text>
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.row}>
            <View style={{ width: LABEL_W }} />
            {m.sizes.map((size) => (
              <Text key={size} style={[styles.headCell, { width: CELL_W }]}>{size}</Text>
            ))}
            <Text style={[styles.headCell, styles.strong, { width: CELL_W }]}>Total</Text>
          </View>

          {m.colors.map((color) => (
            <View key={color} style={styles.row}>
              <Text style={[styles.labelCell, { width: LABEL_W }]} numberOfLines={1}>{color}</Text>
              {m.sizes.map((size) => {
                const cell = m.cells[color]?.[size];
                if (!cell) {
                  return (
                    <View key={size} style={[styles.cellWrap, { width: CELL_W }]}>
                      <Text style={styles.noCell}>·</Text>
                    </View>
                  );
                }
                const c = STATUS_COLORS[cell.status];
                return (
                  <View key={size} style={[styles.cellWrap, { width: CELL_W }]}>
                    <View style={[styles.cell, { backgroundColor: c.bg }]}>
                      <Text style={[styles.cellText, { color: c.fg }]}>{cell.stock}</Text>
                    </View>
                  </View>
                );
              })}
              <Text style={[styles.totalCell, { width: CELL_W }]}>{m.totalByColor[color] ?? 0}</Text>
            </View>
          ))}

          <View style={styles.row}>
            <Text style={[styles.labelCell, styles.strong, { width: LABEL_W }]}>Total</Text>
            {m.sizes.map((size) => (
              <Text key={size} style={[styles.totalCell, { width: CELL_W }]}>{m.totalBySize[size] ?? 0}</Text>
            ))}
            <Text style={[styles.totalCell, styles.grandTotal, { width: CELL_W }]}>{m.total}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  summaryText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  labelCell: { fontSize: 12, fontWeight: '600', color: Colors.light.text, paddingRight: 6 },
  headCell: { fontSize: 12, fontWeight: '700', color: Colors.light.textSecondary, textAlign: 'center' },
  strong: { color: Colors.light.text },
  cellWrap: { alignItems: 'center' },
  cell: { minWidth: 40, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  cellText: { fontSize: 13, fontWeight: '700' },
  noCell: { color: Colors.light.textTertiary, fontSize: 16 },
  totalCell: { fontSize: 13, fontWeight: '700', color: Colors.light.text, textAlign: 'center' },
  grandTotal: { color: Colors.light.primary },
});

export default VariantStockMatrix;
