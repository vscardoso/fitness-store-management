import { useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import FAB from '@/components/FAB';
import { getTrips } from '@/services/tripService';
import { TripStatus, type Trip } from '@/types';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import { formatCurrency, formatDate } from '@/utils/format';

export default function TripsScreen() {
  const router = useRouter();
  const brandingColors = useBrandingColors();

  const headerScale = useRef(new Animated.Value(0.94)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslate = useRef(new Animated.Value(24)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  const {
    data: trips = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['trips'],
    queryFn: () => getTrips({ limit: 100 }),
  });

  useFocusEffect(
    useCallback(() => {
      headerScale.setValue(0.94);
      headerOpacity.setValue(0);
      contentTranslate.setValue(24);
      contentOpacity.setValue(0);

      refetch();

      Animated.parallel([
        Animated.spring(headerScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 70,
        }),
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(140),
          Animated.parallel([
            Animated.spring(contentTranslate, {
              toValue: 0,
              useNativeDriver: true,
              friction: 9,
              tension: 72,
            }),
            Animated.timing(contentOpacity, {
              toValue: 1,
              duration: 240,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start();

      return () => {
        headerScale.stopAnimation();
        headerOpacity.stopAnimation();
        contentTranslate.stopAnimation();
        contentOpacity.stopAnimation();
      };
    }, [refetch, headerScale, headerOpacity, contentTranslate, contentOpacity])
  );

  const stats = useMemo(() => {
    const totalTrips = trips.length;
    const completedTrips = trips.filter((t) => t.status === TripStatus.COMPLETED).length;
    const inProgressTrips = trips.filter((t) => t.status === TripStatus.IN_PROGRESS).length;
    const totalCost = trips.reduce((sum, t) => sum + Number(t.travel_cost_total || 0), 0);
    const avgCost = totalTrips > 0 ? totalCost / totalTrips : 0;

    return {
      totalTrips,
      completedTrips,
      inProgressTrips,
      totalCost,
      avgCost,
    };
  }, [trips]);

  const getStatusColor = (status: TripStatus) => {
    switch (status) {
      case TripStatus.COMPLETED:
        return Colors.light.success;
      case TripStatus.IN_PROGRESS:
        return Colors.light.warning;
      case TripStatus.PLANNED:
        return Colors.light.info;
      default:
        return Colors.light.textSecondary;
    }
  };

  const getStatusLabel = (status: TripStatus) => {
    switch (status) {
      case TripStatus.COMPLETED:
        return 'CONCLUIDA';
      case TripStatus.IN_PROGRESS:
        return 'EM ANDAMENTO';
      case TripStatus.PLANNED:
        return 'PLANEJADA';
      default:
        return String(status).toUpperCase();
    }
  };

  const renderTrip = ({ item }: { item: Trip }) => {
    const statusColor = getStatusColor(item.status);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/trips/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.tripCode} numberOfLines={1}>{item.trip_code}</Text>
            <Text style={styles.destination} numberOfLines={1}>{item.destination}</Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={15} color={Colors.light.textSecondary} />
            <Text style={styles.metaText}>{formatDate(item.trip_date)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="cash-outline" size={15} color={Colors.light.textSecondary} />
            <Text style={styles.metaText}>{formatCurrency(item.travel_cost_total)}</Text>
          </View>
        </View>

        {!!item.notes && (
          <Text style={styles.notes} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale: headerScale }], opacity: headerOpacity }}>
        <PageHeader
          title="Viagens"
          subtitle={`${stats.totalTrips} ${stats.totalTrips === 1 ? 'viagem' : 'viagens'}`}
        />
      </Animated.View>

      <Animated.View style={{ flex: 1, transform: [{ translateY: contentTranslate }], opacity: contentOpacity }}>
        {isLoading && !isRefetching ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={brandingColors.primary} />
            <Text style={styles.loadingText}>Carregando viagens...</Text>
          </View>
        ) : isError ? (
          <View style={styles.centerContainer}>
            <EmptyState
              icon="alert-circle-outline"
              title="Erro ao carregar viagens"
              description="Verifique sua conexao e tente novamente"
            />
          </View>
        ) : (
          <>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Total</Text>
                <Text style={[styles.kpiValue, { color: brandingColors.primary }]}>{stats.totalTrips}</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Concluidas</Text>
                <Text style={[styles.kpiValue, { color: Colors.light.success }]}>{stats.completedTrips}</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Em andamento</Text>
                <Text style={[styles.kpiValue, { color: Colors.light.warning }]}>{stats.inProgressTrips}</Text>
              </View>
            </View>

            <View style={styles.financialCard}>
              <View style={styles.financialBlock}>
                <Text style={styles.financialLabel}>CUSTO TOTAL</Text>
                <Text style={[styles.financialValue, { color: VALUE_COLORS.negative }]} numberOfLines={1}>
                  {formatCurrency(stats.totalCost)}
                </Text>
              </View>
              <View style={styles.financialDivider} />
              <View style={styles.financialBlock}>
                <Text style={styles.financialLabel}>CUSTO MEDIO</Text>
                <Text style={[styles.financialValue, { color: VALUE_COLORS.warning }]} numberOfLines={1}>
                  {formatCurrency(stats.avgCost)}
                </Text>
              </View>
            </View>

            <FlatList
              data={trips}
              renderItem={renderTrip}
              keyExtractor={(item) => item.id.toString()}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={refetch}
                  colors={[brandingColors.primary]}
                />
              }
              ListEmptyComponent={
                <EmptyState
                  icon="airplane-outline"
                  title="Nenhuma viagem cadastrada"
                  description="Toque no botao + para adicionar uma nova viagem"
                />
              }
            />
          </>
        )}
      </Animated.View>

      <FAB directRoute="/trips/add" />
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    ...theme.shadows.sm,
  },
  kpiLabel: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textTertiary,
    fontWeight: '600',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
  },
  financialCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    ...theme.shadows.sm,
  },
  financialBlock: {
    flex: 1,
    minWidth: 0,
    paddingVertical: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
  },
  financialLabel: {
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    color: Colors.light.textTertiary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  financialValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  financialDivider: {
    width: 1,
    backgroundColor: Colors.light.border,
    marginVertical: theme.spacing.sm,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  card: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  tripCode: {
    fontSize: theme.fontSize.base,
    fontWeight: '800',
    color: Colors.light.text,
  },
  destination: {
    marginTop: 2,
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
    flex: 1,
  },
  metaText: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
  notes: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontStyle: 'italic',
  },
});
