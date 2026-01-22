import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Searchbar, Text, FAB, Card, Chip, Badge } from 'react-native-paper';
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
  SHIPMENT_STATUS_ICONS,
  formatDeadline,
  getDeadlineColor,
} from '@/types/conditional';
import { formatCurrency } from '@/utils/format';
import { Colors, theme } from '@/constants/Colors';

type FilterType = 'all' | 'pending' | 'overdue';

/**
 * Formata data/hora para exibição compacta
 * Ex: "25/12 14:30" ou "Hoje 14:30"
 */
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const isTomorrow =
    date.getDate() === now.getDate() + 1 &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  if (isToday) return `Hoje ${time}`;
  if (isTomorrow) return `Amanhã ${time}`;

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');

  return `${day}/${month} ${time}`;
}

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

  /**
   * Renderizar loading inicial
   */
  if (isLoading && !isRefetching) {
    return (
      <View style={styles.container}>
        {/* Header Premium */}
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>Envios</Text>
                <Text style={styles.headerSubtitle}>Carregando...</Text>
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
          </LinearGradient>
        </View>

        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando envios...</Text>
        </View>
      </View>
    );
  }

  /**
   * Renderizar erro
   */
  if (isError) {
    return (
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerInfo}>
                <Text style={styles.greeting}>Envios</Text>
                <Text style={styles.headerSubtitle}>Erro ao carregar</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={64} color={Colors.light.error} />
          <Text style={styles.errorText}>Erro ao carregar envios</Text>
          <Text style={styles.errorSubtext}>Tente novamente mais tarde</Text>
        </View>
      </View>
    );
  }

  const renderShipmentCard = ({ item }: { item: ConditionalShipmentList }) => {
    const statusColor = SHIPMENT_STATUS_COLORS[item.status] ?? Colors.light.info;
    const statusLabel = SHIPMENT_STATUS_LABELS[item.status];
    const statusIcon = SHIPMENT_STATUS_ICONS[item.status];
    const deadlineColor = item.deadline ? getDeadlineColor(item.deadline) : undefined;

    return (
      <TouchableOpacity
        onPress={() => router.push(`/(tabs)/conditional/${item.id}`)}
        activeOpacity={0.7}
      >
        <Card style={styles.card}>
          <Card.Content>
            {/* Header: Cliente + Status */}
            <View style={styles.cardHeader}>
              <View style={styles.customerInfo}>
                <Ionicons name="person" size={20} color={Colors.light.text} />
                <Text style={styles.customerName} numberOfLines={1}>
                  {item.customer_name}
                </Text>
              </View>
              <Chip
                icon={statusIcon}
                style={{ backgroundColor: statusColor + '20' }}
                textStyle={{ color: statusColor, fontSize: 11 }}
                compact
              >
                {statusLabel}
              </Chip>
            </View>

            {/* Métricas */}
            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Itens</Text>
                <Text style={styles.metricValue}>{item.total_items_sent}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricLabel}>Valor</Text>
                <Text style={styles.metricValue}>
                  {formatCurrency(item.total_value_sent)}
                </Text>
              </View>
              {/* Ocultar prazo quando venda foi finalizada (total ou parcial) */}
              {item.deadline && item.status !== 'COMPLETED_FULL_SALE' && item.status !== 'COMPLETED_PARTIAL_SALE' && (
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Prazo</Text>
                  <Text
                    style={[
                      styles.metricValue,
                      deadlineColor && { color: deadlineColor },
                    ]}
                  >
                    {formatDeadline(item.deadline)}
                  </Text>
                </View>
              )}
            </View>

            {/* Agendamento de Envio e Retorno */}
            {(item.departure_datetime || item.return_datetime) && (
              <View style={styles.schedulingInfo}>
                {item.departure_datetime && (
                  <View style={styles.schedulingRow}>
                    <Ionicons name="arrow-forward-circle" size={16} color={Colors.light.primary} />
                    <Text style={styles.schedulingLabel}>Envio:</Text>
                    <Text style={styles.schedulingValue}>
                      {formatDateTime(item.departure_datetime)}
                    </Text>
                  </View>
                )}
                {item.return_datetime && (
                  <View style={styles.schedulingRow}>
                    <Ionicons name="arrow-back-circle" size={16} color={Colors.light.info} />
                    <Text style={styles.schedulingLabel}>Retorno:</Text>
                    <Text style={styles.schedulingValue}>
                      {formatDateTime(item.return_datetime)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Badge de "Atrasado" se aplicável */}
            {item.is_overdue && (
              <Badge
                style={[styles.overdueBadge, { backgroundColor: Colors.light.error }]}
                size={20}
              >
                Atrasado
              </Badge>
            )}
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerInfo}>
              <Text style={styles.greeting}>Envios</Text>
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
  filterChipText: {
    fontSize: 12,
  },
  listContent: {
    padding: theme.spacing.md,
    paddingBottom: 100,
  },
  card: {
    marginBottom: theme.spacing.md,
    elevation: 2,
    borderRadius: theme.borderRadius.lg,
  },
  emptyCard: {
    height: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.xs,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.light.text,
  },
  sentDate: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
  },
  overdueBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  schedulingInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 6,
  },
  schedulingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  schedulingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  schedulingValue: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.light.text,
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
