/**
 * Início: "Estoque e análise". Mais vendidos, giro, compras e capital investido são para olhar de vez em quando,
 * não a cada vez que se abre o app; ficam recolhidos e só carregam do servidor quando a pessoa abre.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, theme } from '@/constants/Colors';

interface Props {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function AnalysisFold({ open, onToggle, children }: Props) {
  return (
    <View style={styles.wrap} testID="home-analysis">
      <TouchableOpacity style={styles.head} onPress={onToggle} activeOpacity={0.8} accessibilityRole="button"
        accessibilityState={{ expanded: open }} accessibilityLabel="Estoque e análise" testID="home-analysis-toggle">
        <View style={styles.icon}>
          <Ionicons name="analytics-outline" size={20} color={Colors.light.textSecondary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Estoque e análise</Text>
          <Text style={styles.sub} numberOfLines={2}>Mais vendidos, giro, compras e capital investido</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.light.textSecondary} />
      </TouchableOpacity>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border, padding: 14 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.light.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.bold, color: Colors.light.text },
  sub: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  body: { gap: 16 },
});
