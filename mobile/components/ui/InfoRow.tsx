import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

interface InfoRowProps {
  /** Ícone (opcional) */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Label/título da informação */
  label: string;
  /** Valor da informação */
  value: string;
  /** Layout: horizontal (label:valor) ou vertical (label acima do valor) */
  layout?: 'horizontal' | 'vertical';
  /** Mostrar ícone no layout vertical */
  showIconInVertical?: boolean;
}

export default function InfoRow({
  icon,
  label,
  value,
  layout = 'horizontal',
  showIconInVertical = true,
}: InfoRowProps) {
  if (layout === 'vertical') {
    return (
      <View style={styles.verticalContainer}>
        {icon && showIconInVertical && (
          <Ionicons
            name={icon}
            size={20}
            color={Colors.light.icon}
            style={styles.verticalIcon}
          />
        )}
        <View style={styles.verticalContent}>
          <Text style={styles.verticalLabel}>{label}</Text>
          <Text style={styles.verticalValue}>{value}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.horizontalContainer}>
      <Text style={styles.horizontalLabel}>{label}</Text>
      <Text style={styles.horizontalValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Layout Horizontal (label: valor)
  horizontalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  horizontalLabel: {
    color: Colors.light.icon,
    flex: 1,
  },
  horizontalValue: {
    flex: 2,
    textAlign: 'right',
    fontWeight: '500',
  },
  // Layout Vertical (ícone + label + valor empilhados)
  verticalContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  verticalIcon: {
    marginTop: 2,
  },
  verticalContent: {
    flex: 1,
  },
  verticalLabel: {
    fontSize: 12,
    color: Colors.light.icon,
    marginBottom: 2,
  },
  verticalValue: {
    fontSize: 16,
    fontWeight: '500',
  },
});
