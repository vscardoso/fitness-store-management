/** Passo 1 da tela de etiquetas: quais peças e quantas etiquetas de cada. */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import type { StickerItem } from './useLabelPrint';

interface Props {
  items: StickerItem[];
  qty: Record<number, number>;
  focusId?: number;
  onFocus: (variantId: number) => void;
  onChange: (variantId: number, quantity: number) => void;
  onFill: (fn: (it: StickerItem) => number) => void;
  /** Mostra o nome do produto em cada linha (quando a lista mistura produtos). */
  showProduct?: boolean;
  onRemove?: (variantId: number) => void;
  onAddMore?: () => void;
  emptyText?: string;
}

const label = (it: StickerItem) => [it.color, it.size].filter(Boolean).join(' · ') || 'Única';

export default function LabelItems({ items, qty, focusId, onFocus, onChange, onFill, showProduct, onRemove, onAddMore, emptyText }: Props) {
  const brand = useBrandingColors();
  const styles = useMemo(() => makeStyles(brand.primary), [brand.primary]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>1. O que imprimir</Text>
        {onAddMore ? (
          <TouchableOpacity onPress={onAddMore} style={styles.link} accessibilityRole="button">
            <Ionicons name="add" size={16} color={brand.primary} />
            <Text style={styles.linkText}>Adicionar peças</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {items.length === 0 ? (
        <Text style={styles.muted}>{emptyText ?? 'Nenhuma peça ainda.'}</Text>
      ) : (
        <>
          <View style={styles.quick}>
            <TouchableOpacity style={styles.chip} onPress={() => onFill(() => 1)}><Text style={styles.chipText}>1 de cada</Text></TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => onFill((it) => it.stock)}><Text style={styles.chipText}>Igual ao estoque</Text></TouchableOpacity>
            <TouchableOpacity style={styles.chip} onPress={() => onFill(() => 0)}><Text style={styles.chipText}>Zerar</Text></TouchableOpacity>
          </View>
          {items.map((it) => {
            const q = qty[it.variantId] ?? 0;
            return (
              <TouchableOpacity
                key={it.variantId}
                style={[styles.row, it.variantId === focusId && styles.rowFocused, q === 0 && styles.rowOff]}
                onPress={() => onFocus(it.variantId)}
                activeOpacity={0.8}
                accessibilityLabel={`${it.productName} ${label(it)}, ${q} etiquetas`}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{showProduct ? it.productName : label(it)}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {showProduct ? `${label(it)} · ` : ''}{it.code ?? 'sem código ainda'} · estoque {it.stock}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(it.variantId, q - 1)} accessibilityLabel="Menos uma etiqueta" hitSlop={6}>
                    <Ionicons name="remove" size={18} color={Colors.light.text} />
                  </TouchableOpacity>
                  <Text style={styles.qty}>{q}</Text>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(it.variantId, q + 1)} accessibilityLabel="Mais uma etiqueta" hitSlop={6}>
                    <Ionicons name="add" size={18} color={Colors.light.text} />
                  </TouchableOpacity>
                </View>
                {onRemove ? (
                  <TouchableOpacity onPress={() => onRemove(it.variantId)} accessibilityLabel="Tirar da lista" hitSlop={8} style={{ marginLeft: 8 }}>
                    <Ionicons name="close-circle-outline" size={20} color={Colors.light.textTertiary} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </View>
  );
}

const makeStyles = (primary: string) => StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: theme.fontSize.base, fontWeight: '800', color: Colors.light.text },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  linkText: { color: primary, fontWeight: '700', fontSize: theme.fontSize.sm },
  muted: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.light.card },
  chipText: { fontSize: theme.fontSize.xs, fontWeight: '700', color: Colors.light.text },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl,
    borderWidth: 1.5, borderColor: Colors.light.border, padding: theme.spacing.md,
  },
  rowFocused: { borderColor: primary },
  rowOff: { opacity: 0.6 },
  rowTitle: { fontSize: theme.fontSize.sm, fontWeight: '800', color: Colors.light.text },
  rowSub: { fontSize: theme.fontSize.xs, color: Colors.light.textSecondary, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 34, height: 34, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: Colors.light.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.background,
  },
  qty: { minWidth: 30, textAlign: 'center', fontSize: theme.fontSize.base, fontWeight: '800', color: Colors.light.text },
});
