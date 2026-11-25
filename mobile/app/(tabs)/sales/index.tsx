import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Text,
  TextInput,
  ScrollView,
} from 'react-native';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import PageHeader from '@/components/layout/PageHeader';
import { getSales } from '@/services/saleService';
import { formatCurrency, formatClock, formatDayMonth } from '@/utils/format';
import { Colors, REFUNDED_COLOR, VALUE_COLORS, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import PeriodFilter, { PeriodFilterValue } from '@/components/PeriodFilter';
import type { Sale } from '@/types';
import { useIsDesktop } from '@/hooks/useLayout';
import DesktopSalesTable from '@/components/sale/DesktopSalesTable';
import { saleCodesText } from '@/utils/saleCodes';
import { paymentSummary, fiadoPaymentText } from '@/utils/paymentLabel';
import { FLAG_CHIPS, NO_FLAGS, flagsToParams, hasFlags, isChipOn, toggleChip } from '@/utils/salesFilters';
import type { SalesFlags } from '@/utils/salesFilters';

import { Money } from '@/components/ui/PriceDisplay';
import ScreenLoader from '@/components/ui/ScreenLoader';
import { ActivityIndicator } from '@/components/ui/MagnifierLoader';
const PAY_ICON: Record<string, string> = {
  card: 'card-outline', cash: 'cash-outline', pix: 'qr-code-outline', fiado: 'time-outline', points: 'gift-outline',
  transfer: 'swap-horizontal-outline', mixed: 'wallet-outline',
};

const statusMap: Record<string, { label: string; color: string; icon: string }> = {
  pending:            { label: 'Pendente',     color: Colors.light.warning,             icon: 'time-outline' },
  completed:          { label: 'Concluída',    color: VALUE_COLORS.positive, icon: 'checkmark-circle-outline' },
  cancelled:          { label: 'Cancelada',    color: VALUE_COLORS.negative, icon: 'close-circle-outline' },
  partially_refunded: { label: 'Dev. Parcial', color: Colors.light.warning,             icon: 'return-down-back-outline' },
  refunded:           { label: 'Devolvida',    color: REFUNDED_COLOR,             icon: 'refresh-outline' },
};

/** Notebook (app web com 1024 px ou mais): tabela. Celular: a lista de cartões de sempre. */
export default function SalesListScreen() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopSalesTable /> : <MobileSalesListScreen />;
}

function MobileSalesListScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();
  const [flags, setFlags] = useState<SalesFlags>(NO_FLAGS);
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

  // a busca só vai ao servidor 400 ms depois da última letra, e a lista antiga fica na tela até a nova chegar (sem tela de carregando por letra)
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // A lista carrega de 50 em 50 e ACUMULA as páginas (antes a página nova trocava a anterior e o começo da lista sumia)
  const PAGE = 50;
  const { data: pages, isLoading, isError, refetch, isRefetching, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['sales', debouncedSearch, dateRange, flags],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params: any = { skip: pageParam, limit: PAGE, ...dateRange, ...flagsToParams(flags) };
      if (debouncedSearch.length > 0) params.q = debouncedSearch;
      return getSales(params, { skipLoading: debouncedSearch.length > 0 || pageParam > 0 });
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
    placeholderData: keepPreviousData,
  });
  const sales = useMemo(() => pages?.pages.flat(), [pages]);

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
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  // ── Métricas rápidas ──
  const salesCount     = sales?.length || 0;
  const completedCount = sales?.filter((s: Sale) => s.status === 'completed').length || 0;
  const totalRevenue   = sales?.reduce((acc: number, s: Sale) =>
    s.status === 'completed' ? acc + Number(s.total_amount) : acc, 0) || 0;

  const renderItem = ({ item }: { item: Sale }) => {
    const status = statusMap[item.status] || statusMap.pending;
    const formattedDate = formatDayMonth(item.created_at);
    const formattedTime = formatClock(item.created_at);
    const pay0 = paymentSummary(item as any);
    // "Concluída" não quer dizer paga: no fiado o cartão diz se já foi pago, quanto falta ou se venceu
    const fiadoTxt = fiadoPaymentText(pay0.text, item.fiado_status, item.fiado_outstanding, formatCurrency);
    const pay = { ...pay0, text: fiadoTxt.text };
    const payColor = fiadoTxt.tone === 'paid' ? Colors.light.successDark : fiadoTxt.tone === 'overdue' ? Colors.light.error : Colors.light.textSecondary;

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

            {/* Valor em destaque + como foi pago (PIX, cartão, dinheiro, fiado) */}
            <View style={styles.amountRow}>
              <View style={styles.amountWrap}>
                <Money style={[styles.amount, { color: brandingColors.primary }]} value={Number(item.total_amount)} />
              </View>
              {!!pay.text && (
                <View style={[styles.payPill, !!fiadoTxt.tone && { maxWidth: '72%', borderColor: payColor }]} accessibilityLabel={`Pagamento: ${pay.text}`}>
                  <Ionicons name={(fiadoTxt.tone === 'paid' ? 'checkmark-circle-outline' : PAY_ICON[pay.kind ?? 'mixed']) as any} size={13} color={payColor} />
                  <Text style={[styles.payPillText, { color: payColor }]} numberOfLines={1}>{pay.text}</Text>
                </View>
              )}
            </View>

            {!!saleCodesText(item, 3) && (
              <Text style={styles.metaText} numberOfLines={1}>{saleCodesText(item, 3)}</Text>
            )}

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
        <PageHeader showBackButton hideBackOnDesktop backFallback="/(tabs)/more" title="Vendas" subtitle="Carregando..." />
        <ScreenLoader message="Carregando vendas..." />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <PageHeader showBackButton hideBackOnDesktop backFallback="/(tabs)/more" title="Vendas" subtitle="0 vendas" />
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
        <PageHeader showBackButton hideBackOnDesktop backFallback="/(tabs)/more"
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
              onChange={(value) => { setSelectedPeriod(value); }}
              compact
            />
          </View>

          <View style={styles.summaryBody}>
            <Money style={styles.summaryValue} value={Number(totalRevenue)} />
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
            placeholder="Buscar por número, cliente, vendedor ou peça..."
            placeholderTextColor={Colors.light.textTertiary}
            value={search}
            onChangeText={(text) => { setSearch(text); }}
            autoCorrect={false}
            returnKeyType="search"
          />
          {isFetching && search.length > 0 && <ActivityIndicator size="small" />}
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => { setSearch(''); setDebouncedSearch(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Filtros sugeridos: o app oferece os recortes que a loja mais usa; combinam com a busca e o período ── */}
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} keyboardShouldPersistTaps="handled">
            {hasFlags(flags) && (
              <TouchableOpacity onPress={() => setFlags(NO_FLAGS)} style={[styles.flagChip, styles.flagChipClear]} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel="Limpar filtros" testID="flag-clear">
                <Ionicons name="close-outline" size={14} color={Colors.light.textSecondary} />
                <Text style={styles.flagChipText}>Limpar</Text>
              </TouchableOpacity>
            )}
            {FLAG_CHIPS.map((c) => {
              const on = isChipOn(flags, c);
              const color = on ? Colors.light.onPrimary : c.tone === 'danger' ? Colors.light.error : Colors.light.textSecondary;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setFlags((f) => toggleChip(f, c))}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                  style={[styles.flagChip, c.tone === 'danger' && !on && styles.flagChipDanger, on && { backgroundColor: c.tone === 'danger' ? Colors.light.error : brandingColors.primary, borderColor: 'transparent' }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${c.label}${on ? ', ligado' : ''}`}
                  testID={`flag-${c.id}`}
                >
                  <Ionicons name={(on ? 'checkmark' : c.icon) as any} size={14} color={color} />
                  <Text style={[styles.flagChipText, { color }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="Nenhuma venda encontrada"
              description={hasFlags(flags) ? 'Nenhuma venda com estes filtros neste período. Limpe os filtros ou escolha outro período.' : search ? 'Tente buscar por outro nome, número ou peça' : 'As vendas realizadas aparecerão aqui'}
              actionLabel={hasFlags(flags) ? 'Limpar filtros' : undefined}
              onAction={hasFlags(flags) ? () => setFlags(NO_FLAGS) : undefined}
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
  chipsRow: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm, gap: 8, alignItems: 'center' },
  flagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.border,
  },
  flagChipDanger: { borderColor: Colors.light.error },
  flagChipClear: { backgroundColor: Colors.light.backgroundSecondary },
  flagChipText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
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
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountWrap: { flex: 1, minWidth: 0 },
  payPill: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, maxWidth: '58%', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: Colors.light.backgroundSecondary, borderWidth: 1, borderColor: Colors.light.border },
  payPillText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary, flexShrink: 1 },
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

