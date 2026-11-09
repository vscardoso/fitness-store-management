/**
 * OptionListField: escolha de UMA opção em lista (padrão do app: nada de chips soltos).
 *
 * Mostra uma linha com o rótulo, o valor escolhido e a seta; ao tocar abre uma folha de baixo (BottomSheet)
 * com as opções em linhas, a escolhida marcada. Uso:
 *
 *   <OptionListField
 *     label="Mostrar produtos"
 *     value={view}
 *     options={[{ value: 'original', label: 'Ordem de entrada' }, ...]}
 *     onChange={setView}
 *   />
 */
import { useState } from 'react';
import { Keyboard, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import BottomSheet from '@/components/ui/BottomSheet';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

export interface OptionItem<T extends string> {
  value: T;
  label: string;
  /** Frase curta embaixo do nome da opção */
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: OptionItem<T>[];
  onChange: (value: T) => void;
  /** Título da folha (padrão: o rótulo) */
  sheetTitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

export default function OptionListField<T extends string>({ label, value, options, onChange, sheetTitle, icon = 'swap-vertical-outline', style }: Props<T>) {
  const brand = useBrandingColors();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={style}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}. Toque para mudar`}
        style={styles.field}
      >
        <Ionicons name={icon} size={18} color={brand.primary} />
        <View style={styles.fieldText}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>{current?.label ?? '—'}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={Colors.light.textSecondary} />
      </TouchableOpacity>

      <BottomSheet visible={open} onDismiss={() => setOpen(false)} title={sheetTitle ?? label}>
        <View style={styles.list}>
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <TouchableOpacity
                key={o.value}
                activeOpacity={0.8}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={o.label}
                style={[styles.row, selected && { borderColor: brand.primary, backgroundColor: brand.primary + '12' }]}
              >
                {o.icon ? <Ionicons name={o.icon} size={20} color={selected ? brand.primary : Colors.light.textSecondary} /> : null}
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, selected && { color: brand.primary, fontWeight: '700' }]}>{o.label}</Text>
                  {o.description ? <Text style={styles.rowDesc}>{o.description}</Text> : null}
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={20} color={brand.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.card,
  },
  fieldText: { flex: 1 },
  fieldLabel: { fontSize: 11, color: Colors.light.textSecondary },
  fieldValue: { fontSize: 15, fontWeight: '600', color: Colors.light.text, marginTop: 1 },
  list: { gap: 10, paddingBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, color: Colors.light.text },
  rowDesc: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
});
