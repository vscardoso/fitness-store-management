/**
 * SectionTitle: título de seção ou de cartão (16, peso 700), com subtítulo opcional e um elemento à direita.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Text } from 'react-native-paper';
import { Colors, theme } from '@/constants/Colors';

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function SectionTitle({ title, subtitle, action, style }: SectionTitleProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  subtitle: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, lineHeight: 17 },
});
