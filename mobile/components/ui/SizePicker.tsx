/**
 * SizePicker: escolha de tamanho em lista (BottomSheet padrão do app), com letras, duplos (P/M, M/G, G/GG),
 * ÚNICO, numeração e um campo "Outro" para o que não está na lista. Recolhe o teclado ao abrir.
 */
import { useState } from 'react';
import { Keyboard, StyleProp, StyleSheet, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import BottomSheet from '@/components/ui/BottomSheet';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

const LETTER_SIZES = ['ÚNICO', 'PP', 'P', 'P/M', 'M', 'M/G', 'G', 'G/GG', 'GG', 'XG', 'XGG'];
const NUMBER_SIZES = ['34', '36', '38', '40', '42', '44', '46', '48'];

interface Props {
  value?: string;
  onChange: (value: string) => void;
  /** 'paper': campo outlined do react-native-paper (cadastro). 'plain': caixa simples com o estilo de `plainStyle`. */
  variant?: 'paper' | 'plain';
  label?: string;
  style?: StyleProp<ViewStyle>;
  plainStyle?: StyleProp<ViewStyle>;
  plainTextStyle?: StyleProp<TextStyle>;
}

export function SizePicker({ value, onChange, variant = 'paper', label = 'Tamanho', style, plainStyle, plainTextStyle }: Props) {
  const brand = useBrandingColors();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const current = (value ?? '').trim().toUpperCase();

  const show = () => {
    Keyboard.dismiss();
    setCustom('');
    setOpen(true);
  };
  const pick = (size: string) => {
    onChange(size);
    setOpen(false);
  };

  const chip = (size: string) => {
    const selected = current === size;
    return (
      <TouchableOpacity
        key={size}
        activeOpacity={0.8}
        onPress={() => pick(size)}
        accessibilityRole="button"
        accessibilityLabel={`Tamanho ${size}`}
        style={[styles.chip, selected && { borderColor: brand.primary, backgroundColor: brand.primary + '18' }]}
      >
        <Text style={[styles.chipText, selected && { color: brand.primary, fontWeight: '700' }]}>{size}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={style}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'não selecionado'}`}
      >
        {variant === 'paper' ? (
          <View pointerEvents="none">
            <TextInput
              label={label}
              value={value ?? ''}
              mode="outlined"
              editable={false}
              left={<TextInput.Icon icon="ruler" />}
              right={<TextInput.Icon icon="menu-down" />}
            />
          </View>
        ) : (
          <View style={[plainStyle, styles.plainRow]} pointerEvents="none">
            <Text style={[plainTextStyle, !value && { color: Colors.light.textTertiary }]}>{value || 'Selecione'}</Text>
            <Ionicons name="chevron-down" size={18} color={Colors.light.textTertiary} />
          </View>
        )}
      </TouchableOpacity>

      <BottomSheet visible={open} onDismiss={() => setOpen(false)} title="Tamanho" icon="resize-outline">
        <View style={styles.grid}>{LETTER_SIZES.map(chip)}</View>
        <Text style={styles.section}>Numeração</Text>
        <View style={styles.grid}>{NUMBER_SIZES.map(chip)}</View>
        <Text style={styles.section}>Outro tamanho</Text>
        <View style={styles.customRow}>
          <TextInput
            value={custom}
            onChangeText={(t) => setCustom(t.toUpperCase())}
            mode="outlined"
            dense
            placeholder="Ex: 3 ANOS"
            autoCapitalize="characters"
            style={{ flex: 1 }}
          />
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={!custom.trim()}
            onPress={() => pick(custom.trim())}
            style={[styles.apply, { backgroundColor: brand.primary }, !custom.trim() && { opacity: 0.4 }]}
          >
            <Text style={styles.applyText}>Usar</Text>
          </TouchableOpacity>
        </View>
        {value ? (
          <TouchableOpacity onPress={() => pick('')} style={styles.clear} activeOpacity={0.8}>
            <Text style={styles.clearText}>Limpar tamanho</Text>
          </TouchableOpacity>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  plainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  chipText: { fontSize: 15, color: Colors.light.text },
  section: { marginTop: 16, marginBottom: 8, fontSize: 13, color: Colors.light.textSecondary },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  apply: { paddingHorizontal: 18, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontWeight: '700' },
  clear: { marginTop: 16, alignSelf: 'flex-start', paddingVertical: 6 },
  clearText: { color: Colors.light.error, fontSize: 14 },
});

export default SizePicker;
