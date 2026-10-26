/**
 * GenderToggle: escolha de gênero em dois botões lado a lado (uma batida só, sem lista suspensa).
 * Ao tocar, recolhe o teclado, que antes tapava a lista e obrigava a fechá-lo à mão.
 */
import { Keyboard, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { GENDER_OPTIONS } from '@/utils/gender';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

interface Props {
  value?: string;
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function GenderToggle({ value, onChange, style }: Props) {
  const brand = useBrandingColors();
  return (
    <View style={[styles.row, style]}>
      {GENDER_OPTIONS.map((option) => {
        const selected = value === option;
        return (
          <TouchableOpacity
            key={option}
            activeOpacity={0.8}
            onPress={() => {
              Keyboard.dismiss();
              onChange(option);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Gênero ${option}`}
            style={[
              styles.option,
              selected && { borderColor: brand.primary, backgroundColor: brand.primary + '18' },
            ]}
          >
            <Text style={[styles.text, selected && { color: brand.primary, fontWeight: '700' }]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  text: { fontSize: 15, color: Colors.light.text },
});

export default GenderToggle;
