/** Etiqueta de conversa: nome sobre a cor do tema escolhida pela loja (chave do servidor -> token do tema). */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useChatColors } from '@/hooks/useThemeColors';

interface Props {
  name: string;
  colorKey: string;
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
}

export default function LabelChip({ name, colorKey, selected, onPress, small }: Props) {
  const c = useChatColors();
  const tone = (c.label as Record<string, { bg: string; fg: string }>)[colorKey] ?? c.label.primary;
  const body = (
    <View style={[styles.chip, small && styles.small, { backgroundColor: tone.bg, borderColor: selected ? tone.fg : tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.text, small && styles.smallText, { color: tone.fg }]} numberOfLines={1}>{name}</Text>
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={`Etiqueta ${name}`} accessibilityState={{ selected: !!selected }}>
      {body}
    </TouchableOpacity>
  ) : body;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1.5, alignSelf: 'flex-start' },
  small: { paddingHorizontal: 8, paddingVertical: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 13, fontWeight: '600', maxWidth: 160 },
  smallText: { fontSize: 11 },
});
