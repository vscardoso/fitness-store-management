import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

interface ActionButton {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}

interface ActionButtonsProps {
  /** Lista de botões de ação */
  actions: ActionButton[];
  /** Layout: horizontal (lado a lado) ou vertical (empilhado) */
  layout?: 'horizontal' | 'vertical';
}

export default function ActionButtons({
  actions,
  layout = 'horizontal',
}: ActionButtonsProps) {
  return (
    <View style={[styles.container, layout === 'vertical' && styles.vertical]}>
      {actions.map((action, index) => (
        <TouchableOpacity
          key={index}
          onPress={action.onPress}
          disabled={action.disabled}
          style={[
            styles.button,
            { backgroundColor: action.color || Colors.light.primary },
            layout === 'vertical' && styles.buttonVertical,
            action.disabled && styles.buttonDisabled,
          ]}
        >
          <Ionicons
            name={action.icon}
            size={24}
            color="#fff"
            style={styles.icon}
          />
          <Text style={styles.label}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  vertical: {
    flexDirection: 'column',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    minWidth: 80,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonVertical: {
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  icon: {
    marginBottom: 4,
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
