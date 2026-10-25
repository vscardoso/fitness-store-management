import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';

interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color: string;
  error?: string;
}

/** "Li e aceito os Termos de Uso e a Política de Privacidade", com links para os dois textos. */
export function TermsCheckbox({ checked, onChange, color, error }: TermsCheckboxProps) {
  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => onChange(!checked)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel="Li e aceito os Termos de Uso e a Política de Privacidade"
          hitSlop={8}
          style={[styles.box, { borderColor: error ? Colors.light.error : color }, checked && { backgroundColor: color }]}
        >
          {checked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </TouchableOpacity>
        <Text style={styles.text}>
          <Text onPress={() => onChange(!checked)}>Li e aceito os </Text>
          <Text style={[styles.link, { color }]} onPress={() => router.push('/termos')} accessibilityRole="link">
            Termos de Uso
          </Text>
          <Text onPress={() => onChange(!checked)}> e a </Text>
          <Text style={[styles.link, { color }]} onPress={() => router.push('/privacidade')} accessibilityRole="link">
            Política de Privacidade
          </Text>
          <Text onPress={() => onChange(!checked)}>.</Text>
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  text: { flex: 1, fontSize: 14, lineHeight: 21, color: Colors.light.text },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
  error: { color: Colors.light.error, fontSize: 13, marginTop: 6, marginLeft: 36 },
});

export default TermsCheckbox;
