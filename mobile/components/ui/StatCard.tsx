import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

interface StatCardProps {
  /** Label da estatística */
  label: string;
  /** Valor principal */
  value: string;
  /** Ícone (opcional) */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Cor do valor (opcional) */
  valueColor?: string;
  /** Valor secundário (opcional, ex: "un", "%") */
  suffix?: string;
}

export default function StatCard({
  label,
  value,
  icon,
  valueColor = Colors.light.primary,
  suffix,
}: StatCardProps) {
  return (
    <View style={styles.container}>
      {icon && (
        <Ionicons
          name={icon}
          size={20}
          color={Colors.light.icon}
          style={styles.icon}
        />
      )}
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueContainer}>
        <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
  },
  icon: {
    marginBottom: 8,
    opacity: 0.8,
  },
  label: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
    justifyContent: 'center',
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  suffix: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginLeft: 3,
    fontWeight: '600',
  },
});
