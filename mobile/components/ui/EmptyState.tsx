import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { ICON_SIZE } from '@/constants/tokens';

type EmptyStateType = 'empty' | 'search' | 'error' | 'offline';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  type?: EmptyStateType;
}

const TYPE_DEFAULTS: Record<EmptyStateType, {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
}> = {
  empty:   { icon: 'cube-outline',        iconColor: Colors.light.tabIconDefault },
  search:  { icon: 'search-outline',      iconColor: Colors.light.info           },
  error:   { icon: 'alert-circle-outline',iconColor: Colors.light.error          },
  offline: { icon: 'cloud-offline-outline',iconColor: Colors.light.warning       },
};

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  type = 'empty',
}: EmptyStateProps) {
  const defaults = TYPE_DEFAULTS[type];
  const resolvedIcon = icon ?? defaults.icon;
  const iconColor = type !== 'empty' ? defaults.iconColor : Colors.light.tabIconDefault;

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name={resolvedIcon} size={ICON_SIZE.hero} color={iconColor} />
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
        <Button mode="contained" onPress={onAction} style={styles.button} icon="plus">
          {actionLabel}
        </Button>
      )}
      {secondaryActionLabel && onSecondaryAction && (
        <Button mode="outlined" onPress={onSecondaryAction} style={styles.secondaryButton}>
          {secondaryActionLabel}
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
    padding: theme.spacing.xl,
    minHeight: 300,
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
    opacity: 0.4,
  },
  title: {
    fontWeight: theme.fontWeight.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    color: Colors.light.text,
  },
  description: {
    textAlign: 'center',
    color: Colors.light.textSecondary,
    marginBottom: theme.spacing.lg,
    maxWidth: 280,
    lineHeight: 22,
  },
  button: {
    marginTop: theme.spacing.sm,
  },
  secondaryButton: {
    marginTop: theme.spacing.sm,
  },
});
