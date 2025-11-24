import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={80} color={Colors.light.tabIconDefault} />
      </View>
      <Text variant="headlineSmall" style={styles.title}>
        {title}
      </Text>
      {description && (
        <Text variant="bodyMedium" style={styles.description}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button
          mode="contained"
          onPress={onAction}
          style={styles.button}
          icon="plus"
        >
          {actionLabel}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 300,
  },
  iconContainer: {
    marginBottom: 24,
    opacity: 0.4,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: Colors.light.text,
  },
  description: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    marginBottom: 24,
    maxWidth: 280,
    lineHeight: 22,
  },
  button: {
    marginTop: 8,
  },
});
