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
        <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: Colors.light.card,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  icon: {
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: Colors.light.icon,
    marginBottom: 8,
    fontWeight: '600',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  suffix: {
    fontSize: 14,
    color: Colors.light.icon,
    marginLeft: 4,
  },
});
