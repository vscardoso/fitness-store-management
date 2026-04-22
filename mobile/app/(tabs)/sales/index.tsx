import { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Text,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { getSales } from '@/services/saleService';
import { formatCurrency } from '@/utils/format';
import { Colors, VALUE_COLORS, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';
import type { Sale } from '@/types';

const statusMap: Record<string, { label: string; color: string; icon: string }> = {
  pending:            { label: 'Pendente',     color: '#F59E0B',             icon: 'time-outline' },
  completed:          { label: 'Concluída',    color: VALUE_COLORS.positive, icon: 'checkmark-circle-outline' },
  cancelled:          { label: 'Cancelada',    color: VALUE_COLORS.negative, icon: 'close-circle-outline' },
  partially_refunded: { label: 'Dev. Parcial', color: '#F59E0B',             icon: 'return-down-back-outline' },
  refunded:           { label: 'Devolvida',    color: '#7B1FA2',             icon: 'refresh-outline' },
};

export default function SalesListScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilterValue>('this_month');

  // ── Animação de entrada ──
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(24);

  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (selectedPeriod) {
      case 'this_month':     start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'last_30_days':   start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case 'last_2_months':  start = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()); break;
      case 'last_3_months':  start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
      case 'last_6_months':  start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
      case 'this_year':      start = new Date(now.getFullYear(), 0, 1); break;
      default:               start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start_date: fmt(start), end_date: fmt(now) };
  }, [selectedPeriod]);

  const { data: sales, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['sales', skip, search, dateRange],
    queryFn: async () => {
      const params: any = { skip, limit: 50, ...dateRange };
      if (search.trim().length > 0) params.sale_number = search.trim();
      return getSales(params);
    },
  });

  useFocusEffect(
    useCallback(() => {
      refetch();

      headerOpacity.value  = 0;
      headerScale.value    = 0.94;
      contentOpacity.value = 0;
      contentTransY.value  = 24;

      headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
      headerScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
      const t = setTimeout(() => {
        contentOpacity.value = withTiming(1, { duration: 340 });
        contentTransY.value  = withSpring(0, { damping: 18, stiffness: 200 });
      }, 140);
      return () => clearTimeout(t);
    }, [refetch])
  );

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const loadMore = () => {
    if (sales && sales.length === 50) setSkip(prev => prev + 50);
  };

  // ── Métricas rápidas ──
  const salesCount     = sales?.length || 0;
  const completedCount = sales?.filter((s: Sale) => s.status === 'completed').length || 0;
  const totalRevenue   = sales?.reduce((acc: number, s: Sale) =>
    s.status === 'completed' ? acc + Number(s.total_amount) : acc, 0) || 0;

  const renderItem = ({ item }: { item: Sale }) => {
    const status = statusMap[item.status] || statusMap.pending;
    const date   = new Date(item.created_at);
    const formattedDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/sales/${item.id}`)}
        style={styles.cardWrapper}
      >
        <View style={styles.saleCard}>
          {/* Faixa lateral colorida por status */}
          <View style={[styles.statusStripe, { backgroundColor: status.color }]} />

          <View style={styles.cardInner}>
            {/* Linha superior: número + badge */}
            <View style={styles.cardTop}>
              <View style={styles.saleNumberRow}>
                <Ionicons name="receipt-outline" size={15} color={brandingColors.primary} />
                <Text style={styles.saleNumber} numberOfLines={1}>{item.sale_number}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: status.color + '18' }]}>
                <Ionicons name={status.icon as any} size={11} color={status.color} />
                <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
              </View>
            </View>

            {/* Valor em destaque */}
            <Text style={[styles.amount, { color: brandingColors.primary }]}>
              {formatCurrency(item.total_amount)}
            </Text>

            {/* Linha inferior: cliente + data/hora */}
            <View style={styles.cardBottom}>
              <View style={[styles.metaRow, { flex: 1, minWidth: 0 }]}>
                <Ionicons name="person-outline" size={12} color={Colors.light.textTertiary} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.customer_name || 'Sem cliente'}
                </Text>
              </View>
              <View style={[styles.metaRow, { flexShrink: 0 }]}>
                <Ionicons name="time-outline" size={12} color={Colors.light.textTertiary} />
                <Text style={styles.metaText}>{formattedDate} · {formattedTime}</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.container}>
        <PageHeader title="Vendas" subtitle="Carregando..." />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
          <Text style={styles.loadingText}>Carregando vendas...</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <PageHeader title="Vendas" subtitle="0 vendas" />
        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar vendas"
          description="Verifique sua conexão e tente novamente"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── Header animado ── */}
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Vendas"
          subtitle={`${salesCount} ${salesCount === 1 ? 'venda' : 'vendas'}`}
        />
      </Animated.View>

      {/* ── Conteúdo animado ── */}
      <Animated.View style={[{ flex: 1 }, contentAnimStyle]}>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryTitleWrap}>
              <View style={styles.summaryIcon}>
                <Ionicons name="trending-up-outline" size={16} color={VALUE_COLORS.positive} />
              </View>
              <Text style={styles.summaryLabel}>Receita no período</Text>
            </View>
            <PeriodFilter
              value={selectedPeriod}
              onChange={(value) => { setSelectedPeriod(value); setSkip(0); }}
              compact
            />
          </View>

          <View style={styles.summaryBody}>
            <Text style={styles.summaryValue}>{formatCurrency(totalRevenue)}</Text>
            <Text style={styles.summaryMeta}>
              {salesCount} {salesCount === 1 ? 'venda' : 'vendas'} • {completedCount} concluídas
            </Text>
          </View>

          <View style={styles.moduleBadge}>
            <Ionicons name="calendar-outline" size={14} color={Colors.light.textSecondary} />
            <Text style={styles.moduleBadgeText}>Filtro de período aplicado na listagem</Text>
          </View>
        </View>

        {/* ── Busca ── */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={Colors.light.textTertiary} style={{ flexShrink: 0 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por número da venda..."
            placeholderTextColor={Colors.light.textTertiary}
            value={search}
            onChangeText={(text) => { setSearch(text); setSkip(0); }}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={sales || []}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[brandingColors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="Nenhuma venda encontrada"
              description={search ? 'Tente buscar por outro número' : 'As vendas realizadas aparecerão aqui'}
            />
          }
        />
      </Animated.View>

      <FAB directRoute="/checkout" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: Colors.light.textSecondary,
    fontSize: theme.fontSize.sm,
  },

  summaryCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
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
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VALUE_COLORS.positive + '15',
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
    color: VALUE_COLORS.positive,
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

  // ── Busca ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.sm,
    height: 44,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    paddingVertical: 0,
  },

  // ── Lista ──
  listContent: {
    paddingTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  cardWrapper: {},

  // ── Card de venda ──
  saleCard: {
    flexDirection: 'row',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  statusStripe: {
    width: 4,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderBottomLeftRadius: theme.borderRadius.xl,
  },
  cardInner: {
    flex: 1,
    padding: theme.spacing.sm + 6,
    gap: theme.spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  saleNumber: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
    flexShrink: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
  },
  statusText: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  amount: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },

  amount: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});

