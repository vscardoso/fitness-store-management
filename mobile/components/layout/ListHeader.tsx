import { View, StyleSheet, StatusBar } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
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
      <StatusBar barStyle="light-content" backgroundColor={Colors.light.primary} />
      <LinearGradient
        colors={[Colors.light.primary, '#7c4dff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text variant="headlineMedium" style={styles.title}>
          {title}
        </Text>
        {showCount && (
          <Text variant="bodyMedium" style={styles.count}>
            {count} {countLabel}
          </Text>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Container vazio para não afetar layout
  },
  gradient: {
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
