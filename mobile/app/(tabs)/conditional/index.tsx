import { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  TextInput,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { useTutorialContext } from '@/components/tutorial';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import { useAuth } from '@/hooks/useAuth';
import {
  listShipments,
  getPendingShipments,
  getOverdueShipments,
} from '@/services/conditionalService';
import {
  ConditionalShipmentList,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_COLORS,
  formatDeadline,
  getDeadlineColor,
} from '@/types/conditional';
import { formatCurrency } from '@/utils/format';
import { Colors, VALUE_COLORS, theme } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';

type FilterType = 'all' | 'pending' | 'overdue';

// ── KPI strip moderno ─────────────────────────────────────────────
interface SummaryStripProps {
  counts: {
    sent: number;
    pending: number;
    overdue: number;
  };
}

function SummaryStrip({ counts }: SummaryStripProps) {
  const brandingColors = useBrandingColors();
  const pendingColor = counts.pending > 0 ? Colors.light.warning : Colors.light.textTertiary;
  const overdueColor = counts.overdue > 0 ? Colors.light.error : Colors.light.textTertiary;

  return (
    <View style={styles.summaryStrip}>
      <View style={styles.summaryItem}>
        <View style={styles.summaryTopRow}>
          <Ionicons name="cube-outline" size={16} color={brandingColors.primary} />
          <Text style={[styles.summaryValue, { color: brandingColors.primary }]}>{counts.sent}</Text>
        </View>
        <Text style={styles.summaryLabel}>enviados</Text>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryItem}>
        <View style={styles.summaryTopRow}>
          <Ionicons name="time-outline" size={16} color={pendingColor} />
          <Text style={[styles.summaryValue, { color: pendingColor }]}>{counts.pending}</Text>
        </View>
        <Text style={styles.summaryLabel}>pendentes</Text>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryItem}>
        <View style={styles.summaryTopRow}>
          <Ionicons name="alert-circle-outline" size={16} color={overdueColor} />
          <Text style={[styles.summaryValue, { color: overdueColor }]}>{counts.overdue}</Text>
        </View>
        <Text style={styles.summaryLabel}>atrasados</Text>
      </View>
    </View>
  );
}

export default function ConditionalShipmentsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { startTutorial } = useTutorialContext();
  const brandingColors = useBrandingColors();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

  // ── Animação de entrada ──
  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(24);

  // Query baseada no filtro ativo
  const getQueryFn = () => {
    switch (filterType) {
      case 'pending': return getPendingShipments;
      case 'overdue': return getOverdueShipments;
      default: return () => listShipments({});
    }
  };

  const {
    data: shipments,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['conditional-shipments', filterType],
    queryFn: getQueryFn(),
    enabled: !!user,
  });

  const { data: summaryShipments } = useQuery({
    queryKey: ['conditional-shipments-summary'],
    queryFn: () => listShipments({ limit: 1000 }),
    enabled: !!user,
  });

  useFocusEffect(
    useCallback(() => {
      if (user) {
        // Evita loop de refetch por dependência instável e mantém dados atualizados ao focar.
        queryClient.invalidateQueries({ queryKey: ['conditional-shipments'] });
        queryClient.invalidateQueries({ queryKey: ['conditional-shipments-summary'] });
      }

      // Animação de entrada
      headerOpacity.value  = 0;
      headerScale.value    = 0.94;
      contentOpacity.value = 0;
      contentTransY.value  = 24;

      headerOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });
      headerScale.value   = withSpring(1, { damping: 16, stiffness: 200 });
      const timer = setTimeout(() => {
        contentOpacity.value = withTiming(1, { duration: 340 });
        contentTransY.value  = withSpring(0, { damping: 18, stiffness: 200 });
      }, 140);
      return () => clearTimeout(timer);
    }, [user, queryClient])
  );

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  const filteredShipments = useMemo(() => {
    const base = shipments || [];
    const filtered = searchQuery
      ? base.filter(s => s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()))
      : base;
    return [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [shipments, searchQuery]);

  const counts = useMemo(() => {
    const all = summaryShipments || shipments || [];
    return {
      pending: all.filter(s => s.status === 'PENDING').length,
      sent: all.filter(s => s.status === 'SENT').length,
      overdue: all.filter(s => s.is_overdue).length,
    };
  }, [summaryShipments, shipments]);

  const renderShipmentCard = ({ item }: { item: ConditionalShipmentList }) => {
    const statusColor = SHIPMENT_STATUS_COLORS[item.status] ?? Colors.light.info;
    const statusLabel = SHIPMENT_STATUS_LABELS[item.status];
    const deadlineColor = item.deadline ? getDeadlineColor(item.deadline) : undefined;
    const isFinished =
      item.status === 'COMPLETED_FULL_SALE' ||
      item.status === 'COMPLETED_PARTIAL_SALE' ||
      item.status === 'RETURNED_NO_SALE';
    const initials = (item.customer_name || '?')
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    // Cor do valor baseada no status
    const valueColor = isFinished ? VALUE_COLORS.positive : VALUE_COLORS.neutral;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/(tabs)/conditional/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={[styles.card, item.is_overdue && styles.cardOverdue]}>
          <View style={styles.cardContent}>
            {/* Left: avatar circle */}
            <View style={[styles.avatarCircle, { backgroundColor: statusColor + '18' }]}>
              <Text style={[styles.avatarInitials, { color: statusColor }]}>{initials}</Text>
            </View>

            {/* Middle: info */}
            <View style={styles.cardMiddle}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.customer_name}
              </Text>
              <View style={styles.cardMetaRow}>
                <View style={[styles.statusPill, { backgroundColor: statusColor + '15' }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
                <Text style={styles.itemsCountText}>
                  {item.total_items_sent} {item.total_items_sent === 1 ? 'item' : 'itens'}
                </Text>
              </View>
              {item.deadline && !isFinished && (
                <View style={styles.deadlineRow}>
                  <Ionicons
                    name={item.is_overdue ? 'alert-circle' : 'time-outline'}
                    size={12}
                    color={deadlineColor || Colors.light.textSecondary}
                  />
                  <Text style={[styles.deadlineText, deadlineColor ? { color: deadlineColor } : {}]}>
                    {formatDeadline(item.deadline)}
                  </Text>
                </View>
              )}
            </View>

            {/* Right: value + chevron */}
            <View style={styles.cardRight}>
              <Text style={[styles.cardValue, { color: valueColor }]}>
                {formatCurrency(item.total_value_sent)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const shipmentCount = filteredShipments.length;

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Condicionais"
          subtitle={`${shipmentCount} ${shipmentCount === 1 ? 'envio' : 'envios'}`}
          rightActions={[
            { icon: 'help-circle-outline', onPress: () => startTutorial('conditionals') },
          ]}
        />
      </Animated.View>

      <Animated.View style={contentAnimStyle}>
        {/* KPI strip */}
        {!isLoading && (
          <SummaryStrip counts={counts} />
        )}

        {/* Search */}
        <View style={styles.searchbarRow}>
          <Ionicons name="search-outline" size={18} color={Colors.light.textTertiary} style={{ flexShrink: 0 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cliente..."
            placeholderTextColor={Colors.light.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.light.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter buttons */}
        <View style={styles.filtersContainer}>
          <View style={styles.filtersRow}>
            <TouchableOpacity
              onPress={() => setFilterType('all')}
              style={[
                styles.filterButton,
                filterType === 'all' && { ...styles.filterButtonActive, borderColor: brandingColors.primary },
              ]}
              activeOpacity={0.75}
            >
              <View style={styles.filterButtonInner}>
                <Ionicons
                  name={filterType === 'all' ? 'list' : 'list-outline'}
                  size={15}
                  color={filterType === 'all' ? brandingColors.primary : Colors.light.textSecondary}
                />
                <Text
                  style={[
                    styles.filterButtonText,
                    filterType === 'all' && { ...styles.filterButtonTextActive, color: brandingColors.primary },
                  ]}
                >
                  Todos
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFilterType('pending')}
              style={[
                styles.filterButton,
                filterType === 'pending' && { ...styles.filterButtonActive, borderColor: brandingColors.primary },
              ]}
              activeOpacity={0.75}
            >
              <View style={styles.filterButtonInner}>
                <Ionicons
                  name={filterType === 'pending' ? 'time' : 'time-outline'}
                  size={15}
                  color={filterType === 'pending' ? brandingColors.primary : Colors.light.textSecondary}
                />
                <Text
                  style={[
                    styles.filterButtonText,
                    filterType === 'pending' && { ...styles.filterButtonTextActive, color: brandingColors.primary },
                  ]}
                >
                  Pendentes
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFilterType('overdue')}
              style={[
                styles.filterButton,
                filterType === 'overdue' && styles.filterButtonActiveDanger,
              ]}
              activeOpacity={0.75}
            >
              <View style={styles.filterButtonInner}>
                <Ionicons
                  name="alert-circle"
                  size={15}
                  color={filterType === 'overdue' ? Colors.light.error : Colors.light.textSecondary}
                />
                <Text style={[styles.filterButtonText, filterType === 'overdue' && styles.filterButtonTextDanger]}>
                  Atrasados
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brandingColors.primary} />
          <Text style={styles.loadingText}>Carregando envios...</Text>
        </View>
      ) : isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Erro ao carregar envios"
          description="Verifique sua conexão e tente novamente"
        />
      ) : filteredShipments.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title="Nenhum envio encontrado"
          description={
            searchQuery
              ? 'Tente buscar por outro nome'
              : filterType === 'all'
              ? 'Crie seu primeiro envio condicional'
              : `Sem envios ${filterType === 'pending' ? 'pendentes' : 'atrasados'}`
          }
          actionLabel={filterType === 'all' && !searchQuery ? 'Novo Envio' : undefined}
          onAction={() => router.push('/(tabs)/conditional/create')}
        />
      ) : (
        <FlatList
          data={filteredShipments}
          renderItem={renderShipmentCard}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isLoading}
              onRefresh={() => {
                void refetch();
              }}
              colors={[brandingColors.primary]}
            />
          }
        />
      )}

      <FAB directRoute="/(tabs)/conditional/create" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },

  // ── KPI strip ────────────────────────────────────────────────
  summaryStrip: {
    marginHorizontal: theme.spacing.md,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.light.border,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    overflow: 'hidden',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 68,
    paddingVertical: 10,
    paddingHorizontal: 8,
    position: 'relative',
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  summaryLabel: {
    fontSize: 10,
    color: Colors.light.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.25,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 10,
  },

  // ── Search & Filters ─────────────────────────────────────────
  searchbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: 8,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.sm,
    height: 46,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: Colors.light.text,
    paddingVertical: 0,
  },
  filtersContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    marginBottom: 0,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  filterButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    ...theme.shadows.sm,
  },
  filterButtonActive: {
    backgroundColor: Colors.light.primary + '15',
    borderColor: Colors.light.primary,
  },
  filterButtonActiveDanger: {
    backgroundColor: Colors.light.error + '12',
    borderColor: Colors.light.error,
  },
  filterButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  filterButtonTextActive: {
    color: Colors.light.primary,
  },
  filterButtonTextDanger: {
    color: Colors.light.error,
  },

  // ── List ───────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 4,
    paddingBottom: 100,
  },

  // ── Shipment Card ──────────────────────────────────────────
  card: {
    marginBottom: 10,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.light.error,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardMiddle: {
    flex: 1,
    gap: 4,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemsCountText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deadlineText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  cardValue: {
    fontSize: 15,
    fontWeight: '700',
  },

  // ── States ────────────────────────────────────────────────
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
});
