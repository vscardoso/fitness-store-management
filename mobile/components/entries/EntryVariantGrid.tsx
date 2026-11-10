/**
 * Grade de lançamento: toque nas cores e nos tamanhos que chegaram e digite a quantidade de cada combinação.
 * Combinação que o produto já tem usa a peça dela (mesmo SKU e código; entra um lote novo na entrada); combinação nova cria a
 * variação com SKU gerado e o próximo código. Custo, preço cheio e fornecedor valem para todas as linhas do lançamento.
 * A lógica (casar combinação com peça, montar as linhas) está em `utils/entryGrid.ts`.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/ui/AppButton';
import HScroll from '@/components/ui/HScroll';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { colorNameToHex } from '@/utils/colorHex';
import { buildCells, cellKey, existingColors, gridSummary, gridText, suggestedSizes, type GridVariant } from '@/utils/entryGrid';
import { maskCurrencyBR } from '@/utils/priceFormatter';
import type { ProductGrouped } from '@/types';

interface Props {
  product: ProductGrouped;
  colors: string[];
  sizes: string[];
  qty: Record<string, string>;
  onColors: (colors: string[]) => void;
  onSizes: (sizes: string[]) => void;
  onQty: (qty: Record<string, string>) => void;
  cost: string;
  onCost: (v: string) => void;
  listPrice: string;
  onListPrice: (v: string) => void;
  supplierName: string;
  onPickSupplier: () => void;
  error?: string;
}

const CELL_W = 68;
const LABEL_W = 104;

export default function EntryVariantGrid({
  product, colors, sizes, qty, onColors, onSizes, onQty, cost, onCost, listPrice, onListPrice, supplierName, onPickSupplier, error,
}: Props) {
  const brand = useBrandingColors();
  const variants = (product.variants ?? []) as unknown as GridVariant[];
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');

  const colorOptions = useMemo(() => {
    const own = existingColors(variants);
    const extra = colors.filter((c) => !own.some((o) => o.toLowerCase() === c.toLowerCase()));
    return [...own, ...extra];
  }, [variants, colors]);
  const sizeOptions = useMemo(() => {
    const base = suggestedSizes(variants);
    const extra = sizes.filter((s) => !base.includes(s.toUpperCase()));
    return [...base, ...extra];
  }, [variants, sizes]);

  const cells = useMemo(() => buildCells(variants, colors, sizes, qty), [variants, colors, sizes, qty]);
  const summary = useMemo(() => gridSummary(cells), [cells]);
  const hasColorAxis = colors.length > 0 || variants.some((v) => (v.color ?? '').trim());
  const hasSizeAxis = sizes.length > 0 || variants.some((v) => (v.size ?? '').trim());

  const toggle = (list: string[], value: string, set: (v: string[]) => void, upper: boolean) => {
    const same = (a: string) => (upper ? a.toUpperCase() === value.toUpperCase() : a.toLowerCase() === value.toLowerCase());
    set(list.some(same) ? list.filter((x) => !same(x)) : [...list, value]);
  };
  const addNew = (text: string, list: string[], set: (v: string[]) => void, clear: () => void, upper: boolean) => {
    const v = text.trim();
    if (!v) return;
    const value = upper ? v.toUpperCase() : v;
    if (!list.some((x) => (upper ? x.toUpperCase() === value : x.toLowerCase() === value.toLowerCase()))) set([...list, value]);
    clear();
  };
  const setCell = (key: string, text: string) => onQty({ ...qty, [key]: text.replace(/[^0-9]/g, '').slice(0, 6) });

  const chip = (label: string, on: boolean, onPress: () => void, key: string) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      style={[styles.chip, on && { borderColor: brand.primary, backgroundColor: brand.primary + '14' }]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      {on ? <Ionicons name="checkmark" size={14} color={brand.primary} /> : null}
      <Text style={[styles.chipText, on && { color: brand.primary, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );

  const colorRows = hasColorAxis ? cells.reduce<Record<string, typeof cells>>((acc, c) => { (acc[c.color] ??= []).push(c); return acc; }, {}) : { '': cells };
  const headerSizes = hasSizeAxis ? [...new Set(cells.map((c) => c.size))] : [''];

  return (
    <View>
      <Text style={styles.note}>
        Toque nas cores e nos tamanhos que chegaram e digite a quantidade de cada um. Combinação que o produto já tem usa a mesma peça
        (mesmo código); combinação nova ganha SKU e o próximo código.
      </Text>

      <Text style={styles.sectionLabel}>CORES</Text>
      <View style={styles.chipRow}>{colorOptions.map((c) => chip(c, colors.some((x) => x.toLowerCase() === c.toLowerCase()), () => toggle(colors, c, onColors, false), `c-${c}`))}</View>
      <View style={styles.addRow}>
        <TextInput
          mode="outlined" dense label="Outra cor" value={newColor} onChangeText={setNewColor} style={styles.addInput}
          onSubmitEditing={() => addNew(newColor, colors, onColors, () => setNewColor(''), false)} returnKeyType="done"
        />
        <AppButton label="Adicionar cor" icon="add" variant="outlined" size="sm" disabled={!newColor.trim()}
          onPress={() => addNew(newColor, colors, onColors, () => setNewColor(''), false)} />
      </View>

      <Text style={styles.sectionLabel}>TAMANHOS</Text>
      <View style={styles.chipRow}>{sizeOptions.map((s) => chip(s, sizes.some((x) => x.toUpperCase() === s.toUpperCase()), () => toggle(sizes, s, onSizes, true), `s-${s}`))}</View>
      <View style={styles.addRow}>
        <TextInput
          mode="outlined" dense label="Outro tamanho" value={newSize} onChangeText={setNewSize} autoCapitalize="characters" style={styles.addInput}
          onSubmitEditing={() => addNew(newSize, sizes, onSizes, () => setNewSize(''), true)} returnKeyType="done"
        />
        <AppButton label="Adicionar tamanho" icon="add" variant="outlined" size="sm" disabled={!newSize.trim()}
          onPress={() => addNew(newSize, sizes, onSizes, () => setNewSize(''), true)} />
      </View>

      {cells.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>QUANTIDADE DE CADA COMBINAÇÃO</Text>
          <HScroll showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.gridRow}>
                <View style={{ width: LABEL_W }} />
                {headerSizes.map((s) => (
                  <Text key={`h-${s}`} style={[styles.gridHead, { width: CELL_W }]}>{s || 'Única'}</Text>
                ))}
              </View>
              {Object.entries(colorRows).map(([color, row]) => (
                <View key={`r-${color}`} style={styles.gridRow}>
                  <View style={[styles.colorLabel, { width: LABEL_W }]}>
                    {color ? <View style={[styles.swatch, { backgroundColor: colorNameToHex(color) ?? Colors.light.border }]} /> : null}
                    <Text style={styles.colorName} numberOfLines={2}>{color || 'Sem cor'}</Text>
                  </View>
                  {headerSizes.map((s) => {
                    const cell = row.find((c) => c.size === s);
                    if (!cell) return <View key={`e-${color}-${s}`} style={{ width: CELL_W }} />;
                    const key = cellKey(cell.color, cell.size);
                    const filled = cell.qty > 0;
                    return (
                      <View key={key} style={[styles.cell, { width: CELL_W }]}>
                        <RNTextInput
                          value={qty[key] ?? ''}
                          onChangeText={(t) => setCell(key, t)}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={Colors.light.textTertiary}
                          selectTextOnFocus
                          style={[styles.cellInput, filled && { borderColor: brand.primary, backgroundColor: brand.primary + '10' }]}
                          accessibilityLabel={`Quantidade ${cell.color} ${cell.size}`}
                        />
                        <Text style={[styles.cellTag, cell.variantId == null && { color: brand.primary, fontWeight: '700' }]} numberOfLines={1}>
                          {cell.variantId == null ? 'nova' : cell.code ?? 'já tem'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </HScroll>
          <Text style={[styles.summary, summary.pieces > 0 && { color: brand.primary }]}>{gridText(summary)}</Text>
        </>
      ) : (
        <Text style={styles.hint}>Escolha ao menos uma cor e um tamanho para aparecer a grade.</Text>
      )}

      <TextInput
        mode="outlined" label="Quanto você pagou em cada peça" value={cost} onChangeText={(t) => onCost(maskCurrencyBR(t))}
        keyboardType="numeric" left={<TextInput.Affix text="R$" />} style={styles.input}
      />
      <TextInput
        mode="outlined" label="Preço cheio do fornecedor (opcional)" value={listPrice} onChangeText={(t) => onListPrice(maskCurrencyBR(t))}
        keyboardType="numeric" left={<TextInput.Affix text="R$" />} style={styles.input}
      />
      <Text style={styles.hint}>Vale para todas as combinações deste lançamento. Se o custo muda de uma peça para outra, lance em duas vezes.</Text>

      <TouchableOpacity style={styles.supplierRow} onPress={onPickSupplier} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Escolher o fornecedor desta compra">
        <View style={[styles.supplierIcon, { backgroundColor: brand.primary + '20' }]}>
          <Ionicons name="business" size={18} color={brand.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.supplierMeta}>Fornecedor desta compra</Text>
          <Text style={styles.supplierName} numberOfLines={1}>{supplierName}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
      </TouchableOpacity>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, marginBottom: theme.spacing.sm },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: Colors.light.textTertiary, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 36, borderRadius: theme.borderRadius.full,
    borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card,
  },
  chipText: { fontSize: theme.fontSize.sm, color: Colors.light.text },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  addInput: { flex: 1, backgroundColor: Colors.light.card },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm },
  gridHead: { textAlign: 'center', fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.textSecondary },
  colorLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: Colors.light.border },
  colorName: { flex: 1, fontSize: theme.fontSize.sm, fontWeight: '600', color: Colors.light.text },
  cell: { alignItems: 'center', gap: 2 },
  cellInput: {
    width: CELL_W - 12, height: 40, textAlign: 'center', fontSize: theme.fontSize.base, fontWeight: '700', color: Colors.light.text,
    borderWidth: 1, borderColor: Colors.light.border, borderRadius: theme.borderRadius.md, backgroundColor: Colors.light.card,
  },
  cellTag: { fontSize: 10, color: Colors.light.textTertiary },
  summary: { marginTop: theme.spacing.sm, fontSize: theme.fontSize.sm, fontWeight: '700', color: Colors.light.textSecondary },
  hint: { marginTop: theme.spacing.sm, fontSize: theme.fontSize.xs, color: Colors.light.textSecondary },
  input: { marginTop: theme.spacing.md, backgroundColor: Colors.light.card },
  supplierRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginTop: theme.spacing.md, padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg, backgroundColor: Colors.light.card,
  },
  supplierIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  supplierMeta: { fontSize: 12, color: Colors.light.textSecondary },
  supplierName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  error: { color: Colors.light.error, marginTop: theme.spacing.md, fontSize: 13 },
});
