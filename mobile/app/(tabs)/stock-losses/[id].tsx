/**
 * Detalhe do prejuízo. No alto, o que se perdeu e quanto custou; abaixo, só os dados que o lançamento realmente tem
 * (peças, custo de cada uma, cliente e item do envio, SKU) e a observação de quem lançou, sem os códigos técnicos.
 */
import { useCallback } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { getExpense } from '@/services/expenseService';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { Money } from '@/components/ui/PriceDisplay';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { goBackOr } from '@/utils/navBack';
import { useDesktopContentStyle } from '@/hooks/useLayout';
import { lossProductName, parseStockLoss } from '@/utils/stockLossNotes';

export default function StockLossDetailScreen() {
  const router = useRouter();
  const desktopContent = useDesktopContentStyle();
  const { id } = useLocalSearchParams<{ id: string }>();

  const expenseId = id ? Number(id) : NaN;
  const isValidId = !Number.isNaN(expenseId) && expenseId > 0;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stock-loss-detail', expenseId],
    queryFn: () => getExpense(expenseId),
    enabled: isValidId,
  });

  const handleBack = useCallback(() => {
    goBackOr(router, '/(tabs)/stock-losses');
  }, [router]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Detalhe do Prejuízo" subtitle="Carregando..." showBackButton onBack={handleBack} />
        <ScreenLoader message="Carregando lançamento..." />
      </View>
    );
  }

  if (!isValidId || isError || !data) {
    const detail = error instanceof Error ? error.message : 'Não foi possível carregar este prejuízo.';
    return (
      <View style={styles.container}>
        <PageHeader title="Detalhe do Prejuízo" subtitle="Falha ao carregar" showBackButton onBack={handleBack} />
        <EmptyState type="error" title="Erro ao carregar" description={detail} actionLabel="Tentar Novamente" onAction={() => refetch()} />
      </View>
    );
  }

  const info = parseStockLoss(data.notes);
  const unitCost = typeof info.unitCost === 'number' ? formatCurrency(info.unitCost) : info.unitCost;
  // só as linhas que o lançamento tem (nada de "-" no lugar do que não existe)
  const facts: { label: string; value: string }[] = [
    info.quantity ? { label: 'Peças perdidas', value: info.quantity } : null,
    unitCost ? { label: 'Custo de cada peça', value: unitCost } : null,
    info.customer ? { label: 'Cliente', value: info.customer } : null,
    info.shipmentItem ? { label: 'Item do envio', value: info.shipmentItem } : null,
    info.sku ? { label: 'SKU', value: info.sku } : null,
  ].filter((x): x is { label: string; value: string } => !!x);

  return (
    <View style={styles.container}>
      <PageHeader title="Detalhe do Prejuízo" subtitle={data.category?.name || 'Perda de Estoque'} showBackButton onBack={handleBack} />

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, desktopContent]} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroIcon}>
              <Ionicons name="warning-outline" size={22} color={VALUE_COLORS.negative} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{lossProductName(data.description)}</Text>
              <Text style={styles.heroDate}>{data.expense_date.split('-').reverse().join('/')}</Text>
            </View>
          </View>
          <Text style={styles.heroLabel}>Valor perdido</Text>
          <Money style={styles.heroAmount} value={Number(data.amount)} />
        </View>

        {facts.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>O que foi perdido</Text>
            {facts.map((f) => (
              <View key={f.label} style={styles.kvRow}>
                <Text style={styles.kvLabel}>{f.label}</Text>
                <Text style={styles.kvValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        )}

        {!!info.observation && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Observações</Text>
            <Text style={styles.observationText}>{info.observation}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  heroCard: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, ...theme.shadows.sm,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  heroIcon: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: VALUE_COLORS.negative + '12',
  },
  heroCopy: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: theme.fontSize.base, color: Colors.light.text, fontWeight: theme.fontWeight.bold },
  heroDate: { marginTop: 4, fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  heroLabel: { marginTop: theme.spacing.md, fontSize: theme.fontSize.sm, color: Colors.light.textSecondary },
  heroAmount: { fontSize: theme.fontSize.xxxl, fontWeight: theme.fontWeight.extrabold, letterSpacing: -0.5, color: VALUE_COLORS.negative },
  sectionCard: {
    backgroundColor: Colors.light.card, borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: Colors.light.border,
    padding: theme.spacing.md, ...theme.shadows.sm,
  },
  sectionTitle: { fontSize: theme.fontSize.md, color: Colors.light.text, fontWeight: theme.fontWeight.bold, marginBottom: theme.spacing.sm },
  kvRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1, borderBottomColor: Colors.light.border,
  },
  kvLabel: { fontSize: theme.fontSize.md, color: Colors.light.textSecondary },
  kvValue: { fontSize: theme.fontSize.md, color: Colors.light.text, fontWeight: theme.fontWeight.bold, maxWidth: '56%', textAlign: 'right' },
  observationText: { fontSize: theme.fontSize.md, color: Colors.light.text, lineHeight: 20 },
});
