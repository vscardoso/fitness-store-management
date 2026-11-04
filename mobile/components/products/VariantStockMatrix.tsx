/**
 * Matriz de estoque tamanho x cor, com totais por linha/coluna e destaque de rupturas.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '@/constants/Colors';
import type { VariantGrid } from '@/types/productVariant';
import { buildVariantMatrix, type CellStatus } from '@/utils/variantMatrix';
import { useBrandingColors } from '@/store/brandingStore';
import HScroll from '@/components/ui/HScroll';
import { colorNameToHex } from '@/utils/colorHex';

interface Props {
  grid: VariantGrid;
}

// A coluna da cor ocupa o que sobra (a tabela usa a largura toda do cartão); as células ficam entre 40 e 64 px.
const LABEL_MIN = 104;
const CELL_MIN = 40;
const CELL_MAX = 64;
const CELL_DEFAULT = 52;

const STATUS_COLORS: Record<CellStatus, { fg: string; bg: string }> = {
  out: { fg: Colors.light.error, bg: Colors.light.errorLight },
  low: { fg: Colors.light.warning, bg: Colors.light.warningLight },
  ok: { fg: Colors.light.success, bg: Colors.light.successLight },
};

export function VariantStockMatrix({ grid }: Props) {
  const brandingColors = useBrandingColors();
  const styles = useMemo(() => createStyles(brandingColors.primary), [brandingColors.primary]);
  const m = useMemo(() => buildVariantMatrix(grid), [grid]);
  const [availWidth, setAvailWidth] = useState(0);

  // Ajusta a largura das células para caber tamanhos + coluna Total na tela;
  // se ainda não couber (muitos tamanhos), a tabela rola na horizontal.
  const cols = m.sizes.length + 1;
  const CELL_W = availWidth > 0
    ? Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor((availWidth - LABEL_MIN) / cols)))
    : CELL_DEFAULT;
  const LABEL_W = availWidth > 0 ? Math.max(LABEL_MIN, availWidth - CELL_W * cols) : LABEL_MIN;

  if (m.existingCount === 0) return null;

  return (
    <View onLayout={(e) => setAvailWidth(e.nativeEvent.layout.width)}>
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

      <HScroll showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.headCell, styles.headLabel, { width: LABEL_W }]}>Cor</Text>
            {m.sizes.map((size) => (
              <Text key={size} style={[styles.headCell, { width: CELL_W }]}>{size}</Text>
            ))}
            <Text style={[styles.headCell, styles.strong, { width: CELL_W }]}>Total</Text>
          </View>

          {m.colors.map((color, idx) => (
            <View key={color} style={[styles.row, styles.bodyRow, idx % 2 === 1 && styles.zebra]}>
              <View style={[styles.labelWrap, { width: LABEL_W }]}>
                <View style={[styles.dot, { backgroundColor: colorNameToHex(color) ?? Colors.light.border }]} />
                <Text style={styles.labelCell} numberOfLines={1}>{color}</Text>
              </View>
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

          <View style={[styles.row, styles.totalRow]}>
            <Text style={[styles.labelCell, styles.strong, styles.totalLabel, { width: LABEL_W }]}>Total</Text>
            {m.sizes.map((size) => (
              <Text key={size} style={[styles.totalCell, { width: CELL_W }]}>{m.totalBySize[size] ?? 0}</Text>
            ))}
            <Text style={[styles.totalCell, styles.grandTotal, { width: CELL_W }]}>{m.total}</Text>
          </View>
        </View>
      </HScroll>
    </View>
  );
}

const createStyles = (brand: string) => StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  summaryText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center' },
  headRow: { paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  bodyRow: { paddingVertical: 5, borderRadius: 8 },
  zebra: { backgroundColor: Colors.light.backgroundSecondary },
  totalRow: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.light.border },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8, paddingRight: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  labelCell: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: Colors.light.text },
  totalLabel: { paddingLeft: 8 },
  headCell: { fontSize: 12, fontWeight: '700', color: Colors.light.textSecondary, textAlign: 'center' },
  headLabel: { textAlign: 'left', paddingLeft: 8 },
  strong: { color: Colors.light.text },
  cellWrap: { alignItems: 'center' },
  cell: { minWidth: 34, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  cellText: { fontSize: 13, fontWeight: '700' },
  noCell: { color: Colors.light.textTertiary, fontSize: 16 },
  totalCell: { fontSize: 13, fontWeight: '700', color: Colors.light.text, textAlign: 'center' },
  grandTotal: { color: brand },
});

export default VariantStockMatrix;
