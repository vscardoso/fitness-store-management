/**
 * Tela de Historico Unificado
 * Timeline com vendas, entradas e condicionais
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors, theme, VALUE_COLORS } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import { useBrandingColors } from '@/store/brandingStore';
import PageHeader from '@/components/layout/PageHeader';
import useBackToList from '@/hooks/useBackToList';
import {
  getHistory,
  HistoryPeriod,
  HistoryEventType,
  HistoryEvent,
  HistoryGroup,
} from '@/services/reportService';

const periodOptions: { value: HistoryPeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'last_7_days', label: '7 dias' },
  { value: 'last_30_days', label: '30 dias' },
  { value: 'last_3_months', label: '3 meses' },
  { value: 'this_year', label: 'Este ano' },
];

const typeOptions: { value: HistoryEventType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: null, label: 'Todos', icon: 'apps-outline' },
  { value: 'sale', label: 'Vendas', icon: 'cart-outline' },
  { value: 'entry', label: 'Entradas', icon: 'cube-outline' },
  { value: 'conditional', label: 'Condicionais', icon: 'airplane-outline' },
];

function EventCard({ event, onPress }: { event: HistoryEvent; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.eventCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.eventIconWrap, { backgroundColor: event.color + '18' }]}>
        <Ionicons name={event.icon as any} size={16} color={event.color} />
      </View>

      <View style={styles.eventContent}>
        <View style={styles.eventTopRow}>
          <View style={styles.eventMainInfo}>
            <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
            <Text style={styles.eventSubtitle} numberOfLines={1}>{event.subtitle}</Text>
          </View>
          <View style={styles.eventMeta}>
            <Text style={styles.eventTime}>{event.time}</Text>
            {event.value !== null ? (
              <Text style={[styles.eventValue, { color: event.color }]} numberOfLines={1}>
                {formatCurrency(event.value)}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.eventFooter}>
          <View style={[styles.badge, { backgroundColor: event.color + '14', borderColor: event.color + '2A' }]}>
            <Text style={[styles.badgeText, { color: event.color }]}>{event.type_label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: event.color + '14', borderColor: event.color + '2A' }]}>
            <Text style={[styles.badgeText, { color: event.color }]}>{event.status}</Text>
          </View>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={Colors.light.textTertiary} />
    </TouchableOpacity>
  );
}

function DateGroup({ group, onEventPress }: { group: HistoryGroup; onEventPress: (event: HistoryEvent) => void }) {
  const formatDateHeader = (dateStr: string) => {
    const [day, month, year] = dateStr.split('/');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Hoje';
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';

    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  return (
    <View style={styles.dateGroupCard}>
      <View style={styles.dateHeader}>
        <View style={styles.dateHeaderLeft}>
          <Ionicons name="calendar-outline" size={14} color={Colors.light.info} />
          <Text style={styles.dateTitle}>{formatDateHeader(group.date)}</Text>
        </View>
        <View style={styles.dateCountBadge}>
          <Text style={styles.dateCountText}>{group.events.length}</Text>
        </View>
      </View>

      <View style={styles.groupDivider} />

      {group.events.map((event) => (
        <EventCard key={event.id} event={event} onPress={() => onEventPress(event)} />
      ))}
    </View>
  );
}

function QuickStats({ events, brandingPrimary }: { events: HistoryEvent[]; brandingPrimary: string }) {
  const sales = events.filter((e) => e.type === 'sale');
  const entries = events.filter((e) => e.type === 'entry');
  const conditionals = events.filter((e) => e.type === 'conditional');
  const totalSales = sales.reduce((sum, e) => sum + (e.value || 0), 0);

  return (
    <View style={styles.statsGrid}>
      <View style={styles.statCard}>
        <Ionicons name="cart-outline" size={18} color={VALUE_COLORS.positive} />
        <Text style={styles.statValue}>{sales.length}</Text>
        <Text style={styles.statLabel}>Vendas</Text>
      </View>

      <View style={styles.statCard}>
        <Ionicons name="cube-outline" size={18} color={Colors.light.info} />
        <Text style={styles.statValue}>{entries.length}</Text>
        <Text style={styles.statLabel}>Entradas</Text>
      </View>

      <View style={styles.statCard}>
        <Ionicons name="airplane-outline" size={18} color={VALUE_COLORS.warning} />
        <Text style={styles.statValue}>{conditionals.length}</Text>
        <Text style={styles.statLabel}>Condicionais</Text>
      </View>

      <View style={styles.statCard}>
        <Ionicons name="cash-outline" size={18} color={brandingPrimary} />
        <Text style={styles.statValueSmall} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(totalSales)}</Text>
        <Text style={styles.statLabel}>Vendido</Text>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { goBack } = useBackToList('/(tabs)/reports');
  const brandingColors = useBrandingColors();

  const [selectedPeriod, setSelectedPeriod] = useState<HistoryPeriod>('last_30_days');
  const [selectedType, setSelectedType] = useState<HistoryEventType>(null);
  const [refreshing, setRefreshing] = useState(false);

  const headerOpacity  = useSharedValue(0);
  const headerScale    = useSharedValue(0.94);
  const contentOpacity = useSharedValue(0);
  const contentTransY  = useSharedValue(24);

  const headerAnimStyle  = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ scale: headerScale.value }],
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTransY.value }],
  }));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['history', selectedPeriod, selectedType],
    queryFn: () => getHistory(selectedPeriod, selectedType, 100, 0),
  });

  useFocusEffect(
    useCallback(() => {
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
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleEventPress = (event: HistoryEvent) => {
    switch (event.link_type) {
      case 'sale':
        router.push(`/sales/${event.link_id}` as any);
        break;
      case 'entry':
        router.push(`/entries/${event.link_id}` as any);
        break;
      case 'conditional':
        router.push(`/conditionals/${event.link_id}` as any);
        break;
      default:
        break;
    }
  };

  const totalCount = data?.total_count || 0;

  return (
    <View style={styles.container}>
      <Animated.View style={headerAnimStyle}>
        <PageHeader
          title="Historico"
          subtitle={`${totalCount} atividades no periodo`}
          showBackButton
          onBack={goBack}
          rightActions={[{ icon: 'time-outline', onPress: () => undefined }]}
        />
      </Animated.View>

      <Animated.View style={[styles.contentAnimation, contentAnimStyle]}>
        <View style={styles.filtersArea}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
            {typeOptions.map((option) => {
              const selected = selectedType === option.value;
              return (
                <TouchableOpacity
                  key={option.value || 'all'}
                  style={[
                    styles.filterChip,
                    selected && {
                      backgroundColor: brandingColors.primary + '14',
                      borderColor: brandingColors.primary + '40',
                    },
                  ]}
                  onPress={() => setSelectedType(option.value)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={option.icon}
                    size={14}
                    color={selected ? brandingColors.primary : Colors.light.textSecondary}
                  />
                  <Text style={[styles.filterChipText, selected && { color: brandingColors.primary }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
            {periodOptions.map((option) => {
              const selected = selectedPeriod === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.periodChip,
                    selected && {
                      backgroundColor: brandingColors.primary,
                      borderColor: brandingColors.primary,
                    },
                  ]}
                  onPress={() => setSelectedPeriod(option.value)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.periodChipText, selected && { color: '#fff' }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {isLoading ? (
          <View style={styles.stateCard}>
            <Ionicons name="hourglass-outline" size={38} color={brandingColors.primary} />
            <Text style={styles.stateTitle}>Carregando historico...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Ionicons name="alert-circle-outline" size={38} color={VALUE_COLORS.negative} />
            <Text style={styles.stateTitle}>Erro ao carregar historico</Text>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: brandingColors.primary }]} onPress={() => refetch()}>
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : data && data.events.length > 0 ? (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[brandingColors.primary]}
                tintColor={brandingColors.primary}
              />
            }
          >
            <QuickStats events={data.events} brandingPrimary={brandingColors.primary} />

            <View style={styles.timelineSection}>
              {data.timeline.map((group) => (
                <DateGroup key={group.date} group={group} onEventPress={handleEventPress} />
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyStateCard}>
            <View style={[styles.emptyIconWrap, { backgroundColor: brandingColors.primary + '12' }]}>
              <Ionicons name="time-outline" size={28} color={brandingColors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Sem atividades</Text>
            <Text style={styles.emptyText}>Nenhuma atividade encontrada no periodo selecionado.</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerAnimation: {
    zIndex: 2,
  },
  contentAnimation: {
    flex: 1,
  },
  filtersArea: {
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  filtersRow: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs + 2,
  },
  filterChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  periodChip: {
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.card,
    paddingHorizontal: theme.spacing.sm + 4,
    paddingVertical: theme.spacing.xs + 2,
  },
  periodChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: Colors.light.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs + 2,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  stateCard: {
    margin: theme.spacing.md,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
    gap: theme.spacing.sm,
  },
  stateTitle: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
  },
  retryButton: {
    marginTop: theme.spacing.xs,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: theme.fontSize.sm,
  },
  emptyStateCard: {
    margin: theme.spacing.md,
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
    marginBottom: theme.spacing.xs,
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs + 2,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 2,
    ...theme.shadows.sm,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    color: Colors.light.text,
    letterSpacing: -0.4,
  },
  statValueSmall: {
    width: '100%',
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    color: Colors.light.text,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timelineSection: {
    gap: theme.spacing.sm,
  },
  dateGroupCard: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: theme.spacing.sm + 2,
    ...theme.shadows.sm,
    gap: theme.spacing.sm,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  dateTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
    textTransform: 'capitalize',
  },
  dateCountBadge: {
    backgroundColor: Colors.light.info + '15',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.light.info + '30',
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: 2,
  },
  dateCountText: {
    fontSize: theme.fontSize.xxs + 1,
    fontWeight: '700',
    color: Colors.light.info,
  },
  groupDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    padding: theme.spacing.xs + 4,
  },
  eventIconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eventContent: {
    flex: 1,
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  eventMainInfo: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: Colors.light.text,
  },
  eventSubtitle: {
    fontSize: theme.fontSize.xs,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  eventMeta: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  eventTime: {
    fontSize: theme.fontSize.xxs + 1,
    color: Colors.light.textTertiary,
  },
  eventValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  eventFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  badge: {
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: theme.fontSize.xxs + 1,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
