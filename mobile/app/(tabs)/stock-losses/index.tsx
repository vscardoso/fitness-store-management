import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';
import { getStockLosses } from '@/services/expenseService';
import { formatCurrency } from '@/utils/format';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import type { Expense } from '@/types/expense';

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function useDateRange(period: PeriodFilterValue) {
  return useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (period) {
      case 'this_month': start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'last_30_days': start = new Date(now.getTime() - 30 * 86400000); break;
      case 'last_2_months': start = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()); break;
      case 'last_3_months': start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
      case 'last_6_months': start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
      case 'this_year': start = new Date(now.getFullYear(), 0, 1); break;
      default: start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { start_date: fmt(start), end_date: fmt(now) };
  }, [period]);
}

export default function StockLossListScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodFilterValue>('this_month');
  const [refreshing, setRefreshing] = useState(false);
  const dateRange = useDateRange(period);
  const summaryAnim = React.useRef(new Animated.Value(0)).current;
  const listAnim = React.useRef(new Animated.Value(0)).current;

  const { data: losses, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stock-losses', dateRange],
    queryFn: () => getStockLosses(dateRange),
  });

  useFocusEffect(useCallback(() => {
    summaryAnim.setValue(0);
    listAnim.setValue(0);

    Animated.spring(summaryAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 14,
      stiffness: 120,
      mass: 0.9,
    }).start();

    Animated.spring(listAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 16,
      stiffness: 110,
      mass: 1,
      delay: 120,
    }).start();

    refetch();
  }, [listAnim, refetch, summaryAnim]));

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const total = useMemo(
    () => (losses ?? []).reduce((sum, item) => sum + Number(item.amount), 0),
    [losses]
  );

  const renderItem = ({ item }: { item: Expense }) => {
    const dateStr = item.expense_date.replace(/-/g, '/');

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => router.push({ pathname: '/(tabs)/stock-losses/[id]' as any, params: { id: String(item.id) } })}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={20} color={VALUE_COLORS.negative} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
          <View style={styles.metaRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{item.category?.name ?? 'Prejuízo'}</Text>
            </View>
            <Text style={styles.dateLabel}>{dateStr}</Text>
          </View>
          {item.notes ? (
            <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text>
          ) : null}
        </View>
        <View style={styles.amountWrap}>
          <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
          <Ionicons name="chevron-forward-outline" size={16} color={Colors.light.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && !losses) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Prejuízos"
          subtitle="Carregando lançamentos..."
          showBackButton
          rightActions={[
            { icon: 'add-circle-outline', onPress: () => router.push('/(tabs)/stock-losses/register') },
          ]}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={VALUE_COLORS.negative} />
          <Text style={styles.centerText}>Carregando prejuízos...</Text>
        </View>
      </View>
    );
  }

  if (!isLoading && (isError || !losses)) {
    const detail = error instanceof Error ? error.message : 'Falha ao consultar os lançamentos de prejuízo.';
    return (
      <View style={styles.container}>
        <PageHeader
          title="Prejuízos"
          subtitle="Falha ao carregar"
          showBackButton
          rightActions={[
            { icon: 'add-circle-outline', onPress: () => router.push('/(tabs)/stock-losses/register') },
          ]}
        />
        <View style={styles.centerContainer}>
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={38} color={VALUE_COLORS.warning} />
            <Text style={styles.errorTitle}>Não foi possível carregar</Text>
            <Text style={styles.errorText}>
              {detail}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()} activeOpacity={0.75}>
              <Text style={styles.retryButtonText}>Tentar Novamente</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PageHeader
        title="Prejuízos"
        subtitle="Perdas de estoque em módulo separado"
        showBackButton
        rightActions={[
          { icon: 'add-circle-outline', onPress: () => router.push('/(tabs)/stock-losses/register') },
        ]}
      />

      <Animated.View
        style={[
          styles.summaryCard,
          {
            opacity: summaryAnim,
            transform: [
              {
                translateY: summaryAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.summaryHeader}>
          <View style={styles.summaryTitleWrap}>
            <View style={styles.summaryIcon}>
              <Ionicons name="trending-down-outline" size={16} color={VALUE_COLORS.negative} />
            </View>
            <Text style={styles.summaryLabel}>Total no período</Text>
          </View>
          <PeriodFilter value={period} onChange={setPeriod} compact />
        </View>

        <View style={styles.summaryBody}>
          <Text style={styles.summaryValue}>{formatCurrency(total)}</Text>
          <Text style={styles.summaryMeta}>
            {losses?.length ?? 0} {(losses?.length ?? 0) === 1 ? 'lançamento' : 'lançamentos'}
          </Text>
        </View>
        <View style={styles.moduleBadge}>
          <Ionicons name="layers-outline" size={14} color={Colors.light.textSecondary} />
          <Text style={styles.moduleBadgeText}>Módulo separado de despesas gerais</Text>
        </View>
      </Animated.View>

      <Animated.View
        style={{
          flex: 1,
          opacity: listAnim,
          transform: [
            {
              translateY: listAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        }}
      >
        <FlatList
          data={losses ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={losses?.length ? styles.listContent : styles.emptyContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[VALUE_COLORS.negative]} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            isLoading ? null : (
              <EmptyState
                icon="warning-outline"
                title="Nenhum prejuízo no período"
                description="As perdas de estoque registradas em fluxos operacionais aparecerão aqui, em um módulo separado das despesas gerais."
                actionLabel="Novo Prejuízo"
                onAction={() => router.push('/(tabs)/stock-losses/register')}
              />
            )
          }
        />
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
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
  summaryCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  summaryTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  summaryIcon: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.md,
    backgroundColor: VALUE_COLORS.negative + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  summaryBody: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
  },
  summaryValue: {
    fontSize: theme.fontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: VALUE_COLORS.negative,
  },
  summaryMeta: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  moduleBadge: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  moduleBadgeText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    ...theme.shadows.sm,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: VALUE_COLORS.negative + '12',
    flexShrink: 0,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  description: {
    color: Colors.light.text,
    fontSize: theme.fontSize.base,
    fontWeight: '700',
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: VALUE_COLORS.negative + '12',
  },
  categoryBadgeText: {
    color: VALUE_COLORS.negative,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dateLabel: {
    color: Colors.light.textTertiary,
    fontSize: theme.fontSize.xs,
  },
  notes: {
    marginTop: 8,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  amount: {
    color: VALUE_COLORS.negative,
    fontSize: theme.fontSize.base,
    fontWeight: '800',
    flexShrink: 0,
  },
  amountWrap: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 42,
  },
});
