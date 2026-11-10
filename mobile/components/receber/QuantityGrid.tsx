/**
 * Grade de quantidades da compra: um cartão por cor (nome em cima), um passo por tamanho com as setas − e +, e os botões
 * de grade fechada da própria cor (cada toque soma uma caixa). Alvos de toque de 44 px ou mais.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { addGrade, colorTotal, gradePresets, setQuantity, type Quantities } from '@/utils/receivePurchase';

interface Props {
  colors: string[];
  sizes: string[];
  q: Quantities;
  onChange: (q: Quantities) => void;
}

export default function QuantityGrid({ colors, sizes, q, onChange }: Props) {
  const brand = useBrandingColors();
  const presets = gradePresets(sizes);

  if (!colors.length) {
    return (
      <View style={[styles.hint, { backgroundColor: Colors.light.warningLight }]}>
        <Text style={styles.hintText}>Escolha pelo menos uma cor para lançar as quantidades.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {colors.map((color) => {
        const total = colorTotal(q, color);
        return (
          <View key={color} style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.colorName}>{color}</Text>
              <Text style={styles.colorTotal}>{total} peça{total === 1 ? '' : 's'}</Text>
            </View>
            <View style={styles.tiles}>
              {sizes.map((size) => {
                const v = q[color]?.[size] ?? 0;
                return (
                  <View key={size} style={styles.tile}>
                    <Text style={styles.size}>{size}</Text>
                    <View style={[styles.step, v > 0 && { borderColor: brand.primary, backgroundColor: brand.primary + '12' }]}>
                      <TouchableOpacity
                        style={styles.stepSide}
                        onPress={() => onChange(setQuantity(q, color, size, v - 1))}
                        accessibilityRole="button"
                        accessibilityLabel={`Menos uma peça, ${color} tamanho ${size}`}
                      >
                        <Text style={[styles.stepIcon, { color: brand.primary }]}>−</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.cell}
                        value={v > 0 ? String(v) : ''}
                        placeholder="0"
                        placeholderTextColor={Colors.light.textTertiary}
                        keyboardType="number-pad"
                        selectTextOnFocus
                        maxLength={3}
                        onChangeText={(t) => onChange(setQuantity(q, color, size, parseInt(t.replace(/\D/g, ''), 10) || 0))}
                        accessibilityLabel={`${color} tamanho ${size}`}
                      />
                      <TouchableOpacity
                        style={styles.stepSide}
                        onPress={() => onChange(setQuantity(q, color, size, v + 1))}
                        accessibilityRole="button"
                        accessibilityLabel={`Mais uma peça, ${color} tamanho ${size}`}
                      >
                        <Text style={[styles.stepIcon, { color: brand.primary }]}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={styles.grade}>
              {!!presets.length && <Text style={styles.gradeLabel}>Grade fechada</Text>}
              {presets.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={styles.chip}
                  onPress={() => onChange(addGrade(q, color, sizes, p.per))}
                  accessibilityRole="button"
                  accessibilityLabel={`Somar uma caixa ${p.label} de ${color}`}
                >
                  <Text style={styles.chipText}>+ grade {p.label}</Text>
                </TouchableOpacity>
              ))}
              {total > 0 && (
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => onChange({ ...q, [color]: {} })}
                  accessibilityRole="button"
                  accessibilityLabel={`Zerar ${color}`}
                >
                  <Text style={styles.chipText}>Zerar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 16, padding: 12, gap: 10, backgroundColor: Colors.light.card },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  colorName: { fontSize: 17, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  colorTotal: { fontSize: 12, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, gap: 4 },
  size: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary, paddingLeft: 2 },
  step: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.light.surfaceSoft },
  stepSide: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  stepIcon: { fontSize: 22, fontWeight: theme.fontWeight.bold, lineHeight: 24 },
  cell: { flex: 1, minWidth: 0, height: 48, textAlign: 'center', fontSize: 18, fontWeight: theme.fontWeight.bold, color: Colors.light.text, padding: 0 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  gradeLabel: { fontSize: 12, fontWeight: theme.fontWeight.semibold, color: Colors.light.textSecondary },
  chip: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 999, backgroundColor: Colors.light.card },
  chipText: { fontSize: 13, fontWeight: theme.fontWeight.semibold, color: Colors.light.text },
  hint: { borderRadius: 12, padding: 12 },
  hintText: { fontSize: 13, color: Colors.light.warningDark },
});
