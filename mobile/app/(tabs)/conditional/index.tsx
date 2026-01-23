import { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Searchbar, Text, FAB, Card, Chip } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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

export default function ConditionalShipmentsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');

  // Query baseada no filtro ativo
  const getQueryFn = () => {
    switch (filterType) {
      case 'pending':
        return getPendingShipments;
      case 'overdue':
        return getOverdueShipments;
      default:
        return () => listShipments({});
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

  // Auto-refresh quando a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      if (user) {
        refetch();
      }
    }, [user, refetch])
  );

  // Filtro de busca local (por nome de cliente) + ordenação por data
  const filteredShipments = (searchQuery
    ? (shipments || []).filter((s) =>
        s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : (shipments || [])
  ).sort((a, b) => {
    // Ordenar por data de criação (mais recente primeiro)
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  // Contadores para header
  const counts = useMemo(() => {
    const all = shipments || [];
    return {
      pending: all.filter(s => s.status === 'PENDING').length,
      sent: all.filter(s => s.status === 'SENT').length,
      overdue: all.filter(s => s.is_overdue).length,
    };
  }, [shipments]);

  const renderShipmentCard = ({ item }: { item: ConditionalShipmentList }) => {
    const statusColor = SHIPMENT_STATUS_COLORS[item.status] ?? Colors.light.info;
    const statusLabel = SHIPMENT_STATUS_LABELS[item.status];
    const deadlineColor = item.deadline ? getDeadlineColor(item.deadline) : undefined;
    const isFinished = item.status === 'COMPLETED_FULL_SALE' || item.status === 'COMPLETED_PARTIAL_SALE' || item.status === 'CANCELLED';

    return (
      <TouchableOpacity
        onPress={() => router.push(`/(tabs)/conditional/${item.id}`)}
        activeOpacity={0.7}
      >
        <Card style={[styles.card, item.is_overdue && styles.cardOverdue]}>
          <Card.Content style={styles.cardContent}>
            {/* Linha principal: Cliente + Valor */}
            <View style={styles.cardHeader}>
              <View style={styles.customerInfo}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={styles.customerName} numberOfLines={1}>
                  {item.customer_name}
                </Text>
              </View>
              <Text style={styles.cardValue}>
                {formatCurrency(item.total_value_sent)}
              </Text>
            </View>

            {/* Linha secundária: Status + Itens + Prazo */}
            <View style={styles.cardFooter}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
              <Text style={styles.cardMeta}>
                {item.total_items_sent} {item.total_items_sent === 1 ? 'item' : 'itens'}
              </Text>
              {item.deadline && !isFinished && (
                <Text style={[styles.cardMeta, deadlineColor && { color: deadlineColor }]}>
                  {formatDeadline(item.deadline)}
                </Text>
              )}
              {item.is_overdue && (
                <View style={styles.overdueTag}>
                  <Ionicons name="alert-circle" size={12} color={Colors.light.error} />
                  <Text style={styles.overdueText}>Atrasado</Text>
                </View>
              )}
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>Condicionais</Text>
              <Text style={styles.headerSubtitle}>
                {filteredShipments.length} {filteredShipments.length === 1 ? 'envio' : 'envios'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={() => router.push('/(tabs)/more')}
            >
              <View style={styles.profileIcon}>
                <Ionicons name="person" size={24} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Resumo rápido */}
          {filterType === 'all' && (counts.pending > 0 || counts.sent > 0 || counts.overdue > 0) && (
            <View style={styles.headerCounters}>
              {counts.sent > 0 && (
                <View style={styles.counterPill}>
                  <Ionicons name="cube" size={14} color="#fff" />
                  <Text style={styles.counterText}>{counts.sent} com cliente</Text>
                </View>
              )}
              {counts.pending > 0 && (
                <View style={styles.counterPill}>
                  <Ionicons name="time" size={14} color="#fff" />
                  <Text style={styles.counterText}>{counts.pending} pendentes</Text>
                </View>
              )}
              {counts.overdue > 0 && (
                <View style={[styles.counterPill, styles.counterDanger]}>
                  <Ionicons name="alert-circle" size={14} color="#fff" />
                  <Text style={styles.counterText}>{counts.overdue} atrasados</Text>
                </View>
              )}
            </View>
          )}
        </LinearGradient>
      </View>

      {/* Barra de busca */}
      <Searchbar
        placeholder="Buscar por cliente..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
        iconColor={Colors.light.primary}
      />

      {/* Filtros */}
      <View style={styles.filtersContainer}>
        <Chip
          selected={filterType === 'all'}
          onPress={() => setFilterType('all')}
          style={styles.filterChip}
          showSelectedOverlay
        >
          Todos
        </Chip>
        <Chip
          selected={filterType === 'pending'}
          onPress={() => setFilterType('pending')}
          style={styles.filterChip}
          showSelectedOverlay
        >
          Pendentes
        </Chip>
        <Chip
          selected={filterType === 'overdue'}
          onPress={() => setFilterType('overdue')}
          style={styles.filterChip}
          showSelectedOverlay
          icon="alert-circle"
        >
          Atrasados
        </Chip>
      </View>

      {/* Lista */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : isError ? (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
          <Text style={styles.errorText}>Erro ao carregar envios</Text>
        </View>
      ) : filteredShipments.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="cube-outline" size={64} color={Colors.light.tabIconDefault} />
          <Text style={styles.emptyText}>Nenhum envio encontrado</Text>
          <Text style={styles.emptySubtext}>
            {filterType === 'all'
              ? 'Crie seu primeiro envio condicional'
              : `Sem envios ${filterType === 'pending' ? 'pendentes' : 'atrasados'}`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredShipments}
          renderItem={renderShipmentCard}
          keyExtractor={(item) => item.id.toString()}
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

      {/* FAB: Criar novo envio */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/(tabs)/conditional/create')}
        label="Novo Envio"
        color="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerContainer: {
    marginBottom: 0,
  },
  headerGradient: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
  },
  greeting: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.md,
    color: '#fff',
    opacity: 0.9,
  },
  headerCounters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  counterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterDanger: {
    backgroundColor: 'rgba(244,67,54,0.4)',
  },
  counterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  profileButton: {
    marginLeft: theme.spacing.md,
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchbar: {
    margin: 16,
    elevation: 2,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  filterChip: {
    marginRight: 4,
  },
  listContent: {
    padding: theme.spacing.md,
    paddingBottom: 100,
  },
  card: {
    marginBottom: 10,
    elevation: 1,
    borderRadius: 12,
  },
  cardOverdue: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.light.error,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  cardValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.light.text,
    marginLeft: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  overdueTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  overdueText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.error,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: Colors.light.error,
    marginTop: 16,
    fontWeight: '600',
  },
  errorSubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 18,
    color: Colors.light.text,
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: Colors.light.primary,
  },
});
