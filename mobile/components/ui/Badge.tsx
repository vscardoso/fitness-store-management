import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { BADGE } from '@/constants/tokens';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: keyof typeof Ionicons.glyphMap;
  uppercase?: boolean;
}

const VARIANT_COLORS: Record<BadgeVariant, { color: string; bg: string }> = {
  success: { color: Colors.light.success,   bg: Colors.light.successLight },
  warning: { color: Colors.light.warning,   bg: Colors.light.warningLight },
  error:   { color: Colors.light.error,     bg: Colors.light.errorLight   },
  info:    { color: Colors.light.info,      bg: Colors.light.infoLight    },
  primary: { color: Colors.light.primary,   bg: Colors.light.primaryLight },
  neutral: { color: Colors.light.textSecondary, bg: Colors.light.backgroundSecondary },
};

export default function Badge({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  uppercase = false,
}: BadgeProps) {
  const { color, bg } = VARIANT_COLORS[variant];
  const tok = BADGE[size];

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: bg,
        paddingHorizontal: tok.paddingH,
        paddingVertical: tok.paddingV,
        borderRadius: tok.borderRadius,
      },
    ]}>
      {icon && (
        <Ionicons name={icon} size={tok.fontSize + 2} color={color} style={styles.icon} />
      )}
      <Text style={[
        styles.label,
        { fontSize: tok.fontSize, color },
        uppercase && styles.uppercase,
      ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: theme.spacing.xs,
  },
  label: {
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  uppercase: {
    textTransform: 'uppercase',
  },
});
