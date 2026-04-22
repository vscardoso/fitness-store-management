import { useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { getExpense } from '@/services/expenseService';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';

function parseNoteValue(notes: string | null | undefined, key: string): string | null {
  if (!notes) return null;
  const tokens = notes.split('|').map((part) => part.trim());
  const found = tokens.find((part) => part.toLowerCase().startsWith(key.toLowerCase()));
  if (!found) return null;
  return found.substring(found.indexOf(':') + 1).trim();
}

export default function StockLossDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const expenseId = id ? Number(id) : NaN;
  const isValidId = !Number.isNaN(expenseId) && expenseId > 0;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stock-loss-detail', expenseId],
    queryFn: () => getExpense(expenseId),
    enabled: isValidId,
  });

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <PageHeader title="Detalhe do Prejuízo" subtitle="Carregando..." showBackButton onBack={handleBack} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={VALUE_COLORS.negative} />
          <Text style={styles.centerText}>Carregando lançamento...</Text>
        </View>
      </View>
    );
  }

  if (!isValidId || isError || !data) {
    const detail = error instanceof Error ? error.message : 'Não foi possível carregar este prejuízo.';
    return (
      <View style={styles.container}>
        <PageHeader title="Detalhe do Prejuízo" subtitle="Falha ao carregar" showBackButton onBack={handleBack} />
        <View style={styles.centerContainer}>
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={38} color={VALUE_COLORS.warning} />
            <Text style={styles.errorTitle}>Erro ao carregar</Text>
            <Text style={styles.errorText}>{detail}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()} activeOpacity={0.75}>
              <Text style={styles.retryButtonText}>Tentar Novamente</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const noteCustomer = parseNoteValue(data.notes, 'Cliente');
  const noteShipmentItem = parseNoteValue(data.notes, 'Item do envio');
  const noteQuantity = parseNoteValue(data.notes, 'Quantidade perdida');
  const noteUnitCost = parseNoteValue(data.notes, 'Custo unitário');
  const noteObservation = parseNoteValue(data.notes, 'Observações');

  return (
    <View style={styles.container}>
      <PageHeader title="Detalhe do Prejuízo" subtitle={data.category?.name || 'Perda de Estoque'} showBackButton onBack={handleBack} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroIcon}>
              <Ionicons name="warning-outline" size={22} color={VALUE_COLORS.negative} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{data.description}</Text>
              <Text style={styles.heroDate}>{data.expense_date.replace(/-/g, '/')}</Text>
            </View>
          </View>
          <Text style={styles.heroAmount}>{formatCurrency(data.amount)}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Contexto Operacional</Text>

          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Cliente</Text>
            <Text style={styles.kvValue}>{noteCustomer || '-'}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Item do envio</Text>
            <Text style={styles.kvValue}>{noteShipmentItem || '-'}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Quantidade perdida</Text>
            <Text style={styles.kvValue}>{noteQuantity || '-'}</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Custo unitário</Text>
            <Text style={styles.kvValue}>{noteUnitCost ? formatCurrency(Number(noteUnitCost)) : '-'}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Observações</Text>
          <Text style={styles.observationText}>{noteObservation || data.notes || 'Sem observações adicionais.'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  centerText: {
    marginTop: theme.spacing.sm,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.base,
  },
  errorCard: {
    width: '100%',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  errorTitle: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: Colors.light.text,
  },
  errorText: {
    marginTop: theme.spacing.xs,
    textAlign: 'center',
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: theme.spacing.md,
    minHeight: 46,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.backgroundSecondary,
  },
  retryButtonText: {
    color: Colors.light.text,
    fontWeight: '700',
    fontSize: theme.fontSize.base,
  },
  heroCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VALUE_COLORS.negative + '12',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: theme.fontSize.base,
    color: Colors.light.text,
    fontWeight: '700',
  },
  heroDate: {
    marginTop: 4,
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
  },
  heroAmount: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: VALUE_COLORS.negative,
  },
  sectionCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  kvLabel: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  kvValue: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    fontWeight: '700',
    maxWidth: '56%',
    textAlign: 'right',
  },
  observationText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    lineHeight: 20,
  },
});
