import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Colors } from '@/constants/Colors';

interface ListHeaderProps {
  /** Título da tela */
  title: string;
  /** Contador de itens (ex: "15 produtos") */
  count?: number;
  /** Label singular (ex: "produto") */
  singularLabel?: string;
  /** Label plural (ex: "produtos") */
  pluralLabel?: string;
  /** Mostrar contador */
  showCount?: boolean;
}

export default function ListHeader({
  title,
  count = 0,
  singularLabel = 'item',
  pluralLabel = 'itens',
  showCount = true,
}: ListHeaderProps) {
  const countLabel = count === 1 ? singularLabel : pluralLabel;

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        {title}
      </Text>
      {showCount && (
        <Text variant="bodyMedium" style={styles.count}>
          {count} {countLabel}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  count: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
});
