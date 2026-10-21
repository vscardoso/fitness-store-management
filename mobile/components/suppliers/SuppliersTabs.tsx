/**
 * SuppliersTabs: atalhos entre as telas de fornecedores (lista, ranking, custos, reposição).
 * Usa replace para trocar de tela sem empilhar histórico.
 */
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

export type SuppliersTab = 'list' | 'ranking' | 'costs' | 'restock';

const TABS: { key: SuppliersTab; label: string; icon: keyof typeof Ionicons.glyphMap; href: string }[] = [
  { key: 'list', label: 'Fornecedores', icon: 'business-outline', href: '/suppliers' },
  { key: 'ranking', label: 'Ranking', icon: 'trophy-outline', href: '/suppliers/ranking' },
  { key: 'costs', label: 'Custos', icon: 'pricetags-outline', href: '/suppliers/costs' },
  { key: 'restock', label: 'Reposição', icon: 'cart-outline', href: '/suppliers/restock' },
];

export default function SuppliersTabs({ active }: { active: SuppliersTab }) {
  const router = useRouter();
  const brandingColors = useBrandingColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.8}
            onPress={() => !isActive && router.replace(tab.href as any)}
            style={[
              styles.chip,
              isActive
                ? { backgroundColor: brandingColors.primary, borderColor: brandingColors.primary }
                : { backgroundColor: Colors.light.card, borderColor: Colors.light.border },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Ionicons name={tab.icon} size={15} color={isActive ? '#fff' : Colors.light.textSecondary} />
            <Text style={[styles.label, { color: isActive ? '#fff' : Colors.light.textSecondary }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  label: { fontSize: 13, fontWeight: '600' },
});
