import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';

interface StatCardProps {
  label: string;
  value: string;
  icon?: keyof typeof Ionicons.glyphMap;
  valueColor?: string;
  suffix?: string;
  /** índice para animação staggered (0, 1, 2...) */
  index?: number;
}

export default function StatCard({
  label,
  value,
  icon,
  valueColor,
  suffix,
  index = 0,
}: StatCardProps) {
  const color = valueColor ?? Colors.light.primary;

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    const delay = index * 60;
    const timer = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
      translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      scale.value = withSpring(1, { damping: 16, stiffness: 200 });
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {icon && (
        <Ionicons name={icon} size={20} color={Colors.light.icon} style={styles.icon} />
      )}
      <Text style={[styles.label]}>{label}</Text>
      <View style={styles.valueContainer}>
        <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {suffix && <Text style={[styles.suffix]}>{suffix}</Text>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 100,
    padding: theme.spacing.sm + 4,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: Colors.light.card,
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
  },
  icon: { marginBottom: theme.spacing.sm, opacity: 0.8 },
  label: {
    fontSize: theme.fontSize.xs,
    marginBottom: 6,
    fontWeight: theme.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
    color: Colors.light.textSecondary,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
    justifyContent: 'center',
  },
  value: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.extrabold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  suffix: {
    fontSize: theme.fontSize.md,
    marginLeft: 3,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
  },
});
