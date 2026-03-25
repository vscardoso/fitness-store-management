import { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Searchbar, Text, Card, Button } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
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
import { Colors, theme } from '@/constants/Colors';

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
  const pendingColor = counts.pending > 0 ? Colors.light.warning : Colors.light.textTertiary;
  const overdueColor = counts.overdue > 0 ? Colors.light.error : Colors.light.textTertiary;

  return (
    <View style={styles.summaryStrip}>
      <View style={styles.summaryItem}>
        <View style={styles.summaryTopRow}>
          <Ionicons name="cube-outline" size={16} color={Colors.light.primary} />
          <Text style={[styles.summaryValue, { color: Colors.light.primary }]}>{counts.sent}</Text>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

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
      if (user) refetch();
    }, [user, refetch])
  );

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

    return (
      <TouchableOpacity
        onPress={() => router.push(`/(tabs)/conditional/${item.id}`)}
        activeOpacity={0.7}
      >
        <Card style={[styles.card, item.is_overdue && styles.cardOverdue]}>
          <Card.Content style={styles.cardContent}>
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
              <Text style={styles.cardValue}>{formatCurrency(item.total_value_sent)}</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  const shipmentCount = filteredShipments.length;

  return (
    <View style={styles.container}>
      <PageHeader
        title="Condicionais"
        subtitle={`${shipmentCount} ${shipmentCount === 1 ? 'envio' : 'envios'}`}
        rightActions={[
          { icon: 'help-circle-outline', onPress: () => startTutorial('conditionals') },
        ]}
      />

      {/* KPI strip */}
      {!isLoading && (
        <SummaryStrip counts={counts} />
      )}

      {/* Search */}
      <Searchbar
        placeholder="Buscar por cliente..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
      />

      {/* Filter buttons */}
      <View style={styles.filtersContainer}>
        <View style={styles.filtersRow}>
          <Button
            mode="contained-tonal"
            onPress={() => setFilterType('all')}
            style={[styles.filterButton, filterType === 'all' && styles.filterButtonActive]}
            labelStyle={styles.filterButtonLabel}
            contentStyle={styles.filterButtonContent}
          >
            <View style={styles.filterButtonInner}>
              <Ionicons
                name={filterType === 'all' ? 'list' : 'list-outline'}
                size={15}
                color={filterType === 'all' ? Colors.light.primary : Colors.light.textSecondary}
              />
              <Text style={[styles.filterButtonText, filterType === 'all' && styles.filterButtonTextActive]}>
                Todos
              </Text>
            </View>
          </Button>
          <Button
            mode="contained-tonal"
            onPress={() => setFilterType('pending')}
            style={[styles.filterButton, filterType === 'pending' && styles.filterButtonActive]}
            labelStyle={styles.filterButtonLabel}
            contentStyle={styles.filterButtonContent}
          >
            <View style={styles.filterButtonInner}>
              <Ionicons
                name={filterType === 'pending' ? 'time' : 'time-outline'}
                size={15}
                color={filterType === 'pending' ? Colors.light.primary : Colors.light.textSecondary}
              />
              <Text style={[styles.filterButtonText, filterType === 'pending' && styles.filterButtonTextActive]}>
                Pendentes
              </Text>
            </View>
          </Button>
          <Button
            mode="contained-tonal"
            onPress={() => setFilterType('overdue')}
            style={[
              styles.filterButton,
              filterType === 'overdue' && styles.filterButtonActiveDanger,
            ]}
            labelStyle={styles.filterButtonLabel}
            contentStyle={styles.filterButtonContent}
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
          </Button>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
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
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[Colors.light.primary]}
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
    backgroundColor: Colors.light.backgroundSecondary,
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
  searchbar: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: 8,
    elevation: 2,
    backgroundColor: Colors.light.card,
  },
  filtersContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
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
  },
  filterButtonActive: {
    backgroundColor: Colors.light.primary + '15',
    borderColor: Colors.light.primary,
  },
  filterButtonActiveDanger: {
    backgroundColor: Colors.light.error + '12',
    borderColor: Colors.light.error,
  },
  filterButtonLabel: {
    marginVertical: 0,
    marginHorizontal: 0,
  },
  filterButtonContent: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    height: 'auto',
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
    elevation: 1,
    backgroundColor: Colors.light.card,
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
    color: Colors.light.text,
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
