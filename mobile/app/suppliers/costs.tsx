/**
 * Comparação de custo: o mesmo produto comprado de fornecedores diferentes + alertas de aumento.
 */
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import SuppliersTabs from '@/components/suppliers/SuppliersTabs';
import { Colors, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { useCostComparison } from '@/hooks/useSupplierInsights';
import { formatCurrency } from '@/utils/format';

export default function SupplierCostsScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const { data, isLoading, isRefetching, refetch, error } = useCostComparison();
  const products = data?.products ?? [];
  const increases = data?.price_increases ?? [];

  return (
    <View style={styles.container}>
      <PageHeader
        title="Custos"
        subtitle="Quem vende mais barato"
        showBackButton
        onBack={() => router.replace('/suppliers' as any)}
      />
      <SuppliersTabs active="costs" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[brandingColors.primary]} />}
      >
        {isLoading ? (
          <Text style={styles.hint}>Calculando...</Text>
        ) : error ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.light.error} />
            <Text style={styles.emptyTitle}>Erro ao carregar os custos</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={[styles.link, { color: brandingColors.primary }]}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {increases.length > 0 && (
              <View style={styles.alertBox}>
                <View style={styles.alertHead}>
                  <Ionicons name="trending-up" size={18} color={Colors.light.warning} />
                  <Text style={styles.alertTitle}>Aumentos de custo</Text>
                </View>
                {increases.map((i) => (
                  <Text key={`${i.product_id}-${i.supplier_id}`} style={styles.alertLine}>
                    {i.supplier_name} subiu {i.product_name} de {formatCurrency(i.previous_unit_cost)} para{' '}
                    {formatCurrency(i.last_unit_cost)} (+{i.change_pct.toFixed(0)}%)
                  </Text>
                ))}
              </View>
            )}

            {products.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="pricetags-outline" size={56} color={Colors.light.textTertiary} />
                <Text style={styles.emptyTitle}>Nada para comparar ainda</Text>
                <Text style={styles.hint}>
                  A comparação aparece quando o mesmo produto é comprado de 2 ou mais fornecedores.
                </Text>
              </View>
            ) : (
              products.map((p) => (
                <View key={p.product_id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.name} numberOfLines={2}>{p.product_name}</Text>
                    {p.savings_per_unit > 0 && (
                      <View style={styles.saveBadge}>
                        <Text style={styles.saveText}>
                          economiza {formatCurrency(p.savings_per_unit)} ({p.savings_pct.toFixed(0)}%)
                        </Text>
                      </View>
                    )}
                  </View>

                  {p.suppliers.map((s) => (
                    <TouchableOpacity
                      key={s.supplier_id}
                      style={styles.row}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/suppliers/${s.supplier_id}` as any)}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.supplier} numberOfLines={1}>{s.supplier_name}</Text>
                        <Text style={styles.meta}>
                          {s.purchase_count} {s.purchase_count === 1 ? 'compra' : 'compras'}
                          {s.change_pct !== null && s.change_pct !== 0
                            ? ` · ${s.change_pct > 0 ? '+' : ''}${s.change_pct.toFixed(0)}% desde a anterior`
                            : ''}
                        </Text>
                      </View>
                      {s.is_cheapest && p.savings_per_unit > 0 && (
                        <Ionicons name="checkmark-circle" size={16} color={Colors.light.success} />
                      )}
                      <Text style={[styles.cost, s.is_cheapest && p.savings_per_unit > 0 && { color: Colors.light.success }]}>
                        {formatCurrency(s.last_unit_cost)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xxl, gap: theme.spacing.sm },
  hint: { fontSize: theme.fontSize.sm, color: Colors.light.textSecondary, textAlign: 'center' },
  alertBox: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.warning,
    gap: 6,
  },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  alertLine: { fontSize: 13, color: Colors.light.textSecondary },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 10,
    ...theme.shadows.sm,
  },
  cardHead: { gap: 6 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  saveBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.light.success + '1F',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  saveText: { fontSize: 12, fontWeight: '600', color: Colors.light.success },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  supplier: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  meta: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 1 },
  cost: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  empty: { alignItems: 'center', paddingVertical: theme.spacing.xl, gap: theme.spacing.sm },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.light.text, textAlign: 'center' },
  link: { fontSize: theme.fontSize.sm, fontWeight: '600' },
});
