/**
 * Início: atalhos fixos, todos à vista (sem rolar para o lado, que escondia metade deles no celular).
 * Quatro por linha; o resto da navegação fica no menu. Os atalhos mudam por papel (quem não gerencia não vê Financeiro).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, theme } from '@/constants/Colors';

export interface Shortcut {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}

export default function ShortcutGrid({ items, columns = 4 }: { items: Shortcut[]; columns?: 2 | 4 }) {
  return (
    <View style={[styles.row, columns === 2 && styles.rowTwo]} testID="home-shortcuts">
      {items.map((a) => (
        <TouchableOpacity key={a.id} style={[styles.cell, columns === 2 && styles.cellTwo]} activeOpacity={0.7} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.title} testID={`home-shortcut-${a.id}`}>
          <View style={[styles.icon, { backgroundColor: a.color + '1A' }]}>
            <Ionicons name={a.icon} size={24} color={a.color} />
          </View>
          <Text style={styles.label} numberOfLines={2}>{a.title}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  rowTwo: { flexWrap: 'wrap' },
  cellTwo: { flexGrow: 0, flexShrink: 0, flexBasis: '48.5%' },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: Colors.light.border },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: Colors.light.text, textAlign: 'center' },
});
