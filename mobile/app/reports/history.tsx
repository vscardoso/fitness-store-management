/**
 * Tela de Histórico Unificado
 * Timeline com vendas, entradas e condicionais
 */

import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  FlatList,
} from 'react-native';
import { Text, Chip, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors, theme } from '@/constants/Colors';
import { formatCurrency } from '@/utils/format';
import {
  getHistory,
  HistoryPeriod,
  HistoryEventType,
  HistoryEvent,
  HistoryGroup,
} from '@/services/reportService';

/**
 * Opções de período
 */
const periodOptions: { value: HistoryPeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'last_7_days', label: '7 dias' },
  { value: 'last_30_days', label: '30 dias' },
  { value: 'last_3_months', label: '3 meses' },
  { value: 'this_year', label: 'Este ano' },
];

/**
 * Opções de tipo de evento
 */
const typeOptions: { value: HistoryEventType; label: string; icon: string }[] = [
  { value: null, label: 'Todos', icon: 'apps' },
  { value: 'sale', label: 'Vendas', icon: 'cart' },
  { value: 'entry', label: 'Entradas', icon: 'cube' },
  { value: 'conditional', label: 'Condicionais', icon: 'airplane' },
];

/**
 * Componente de card de evento
 */
function EventCard({ event, onPress }: { event: HistoryEvent; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.eventTimeline}>
        <View style={[styles.eventDot, { backgroundColor: event.color }]} />
        <View style={styles.eventLine} />
      </View>

      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          <View style={[styles.eventIconBg, { backgroundColor: event.color + '20' }]}>
            <Ionicons
              name={event.icon as any}
              size={18}
              color={event.color}
            />
          </View>
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {event.title}
            </Text>
            <Text style={styles.eventSubtitle} numberOfLines={1}>
              {event.subtitle}
            </Text>
          </View>
          <View style={styles.eventMeta}>
            <Text style={styles.eventTime}>{event.time}</Text>
            {event.value !== null && (
              <Text style={[styles.eventValue, { color: event.color }]}>
                {formatCurrency(event.value)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.eventFooter}>
          <View style={[styles.eventBadge, { backgroundColor: event.color + '15' }]}>
            <Text style={[styles.eventBadgeText, { color: event.color }]}>
              {event.type_label}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: event.color + '15' }]}>
            <Text style={[styles.statusText, { color: event.color }]}>
              {event.status}
            </Text>
          </View>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color={Colors.light.textTertiary} />
    </TouchableOpacity>
  );
}

/**
 * Componente de grupo por data
 */
function DateGroup({ group, onEventPress }: { group: HistoryGroup; onEventPress: (event: HistoryEvent) => void }) {
  // Formatar data
  const formatDateHeader = (dateStr: string) => {
    const [day, month, year] = dateStr.split('/');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Hoje';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    } else {
      return date.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }
  };

  return (
    <View style={styles.dateGroup}>
      <View style={styles.dateHeader}>
        <Ionicons name="calendar-outline" size={16} color={Colors.light.primary} />
        <Text style={styles.dateTitle}>{formatDateHeader(group.date)}</Text>
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeText}>{group.events.length}</Text>
        </View>
      </View>

      {group.events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          onPress={() => onEventPress(event)}
        />
      ))}
    </View>
  );
}

/**
 * Estatísticas resumidas
 */
function QuickStats({ events }: { events: HistoryEvent[] }) {
  const sales = events.filter(e => e.type === 'sale');
  const entries = events.filter(e => e.type === 'entry');
  const conditionals = events.filter(e => e.type === 'conditional');

  const totalSales = sales.reduce((sum, e) => sum + (e.value || 0), 0);

  return (
    <View style={styles.statsContainer}>
      <View style={styles.statCard}>
        <Ionicons name="cart" size={20} color={Colors.light.success} />
        <Text style={styles.statValue}>{sales.length}</Text>
        <Text style={styles.statLabel}>Vendas</Text>
      </View>
      <View style={styles.statCard}>
        <Ionicons name="cube" size={20} color={Colors.light.info} />
        <Text style={styles.statValue}>{entries.length}</Text>
        <Text style={styles.statLabel}>Entradas</Text>
      </View>
      <View style={styles.statCard}>
        <Ionicons name="airplane" size={20} color={Colors.light.warning} />
        <Text style={styles.statValue}>{conditionals.length}</Text>
        <Text style={styles.statLabel}>Condicionais</Text>
      </View>
      <View style={styles.statCard}>
        <Ionicons name="cash" size={20} color={Colors.light.primary} />
        <Text style={styles.statValueSmall}>{formatCurrency(totalSales)}</Text>
        <Text style={styles.statLabel}>Vendido</Text>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<HistoryPeriod>('last_30_days');
  const [selectedType, setSelectedType] = useState<HistoryEventType>(null);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['history', selectedPeriod, selectedType],
    queryFn: () => getHistory(selectedPeriod, selectedType, 100, 0),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleEventPress = (event: HistoryEvent) => {
    switch (event.link_type) {
      case 'sale':
        router.push(`/sales/${event.link_id}`);
        break;
      case 'entry':
        router.push(`/entries/${event.link_id}`);
        break;
      case 'conditional':
        router.push(`/conditionals/${event.link_id}`);
        break;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header Premium */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.primary, Colors.light.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>Histórico</Text>
              <Text style={styles.headerSubtitle}>
                {data?.total_count || 0} atividades no período
              </Text>
            </View>
            <View style={styles.headerIcon}>
              <Ionicons name="time" size={28} color="rgba(255,255,255,0.9)" />
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Filtro de Tipo */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {typeOptions.map((option) => (
            <Chip
              key={option.value || 'all'}
              selected={selectedType === option.value}
              onPress={() => setSelectedType(option.value)}
              style={[
                styles.filterChip,
                selectedType === option.value && styles.filterChipSelected,
              ]}
              textStyle={[
                styles.filterChipText,
                selectedType === option.value && styles.filterChipTextSelected,
              ]}
              icon={() => (
                <Ionicons
                  name={option.icon as any}
                  size={16}
                  color={selectedType === option.value ? '#fff' : Colors.light.textSecondary}
                />
              )}
            >
              {option.label}
            </Chip>
          ))}
        </ScrollView>
      </View>

      {/* Filtro de Período */}
      <View style={styles.periodContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.periodContent}
        >
          {periodOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.periodButton,
                selectedPeriod === option.value && styles.periodButtonSelected,
              ]}
              onPress={() => setSelectedPeriod(option.value)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === option.value && styles.periodButtonTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Conteúdo */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>Carregando histórico...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={Colors.light.error} />
          <Text style={styles.errorText}>Erro ao carregar histórico</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : data && data.events.length > 0 ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.light.primary]}
            />
          }
        >
          {/* Estatísticas Rápidas */}
          <QuickStats events={data.events} />

          {/* Timeline */}
          <View style={styles.timelineSection}>
            {data.timeline.map((group) => (
              <DateGroup
                key={group.date}
                group={group}
                onEventPress={handleEventPress}
              />
            ))}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={64} color={Colors.light.textTertiary} />
          <Text style={styles.emptyTitle}>Sem atividades</Text>
          <Text style={styles.emptyText}>
            Nenhuma atividade encontrada no período selecionado.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  headerContainer: {
    overflow: 'hidden',
  },
  headerGradient: {
    paddingTop: theme.spacing.xl + 32,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: theme.spacing.xxs,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    paddingVertical: 12,
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: Colors.light.backgroundSecondary,
    borderColor: Colors.light.border,
    marginRight: 8,
  },
  filterChipSelected: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  filterChipText: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  filterChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  periodContainer: {
    paddingVertical: 8,
    backgroundColor: Colors.light.background,
  },
  periodContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  periodButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.light.backgroundSecondary,
    marginRight: 8,
  },
  periodButtonSelected: {
    backgroundColor: Colors.light.primaryLight,
  },
  periodButtonText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  periodButtonTextSelected: {
    color: Colors.light.primary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  errorText: {
    color: Colors.light.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.light.primary,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  emptyText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    marginTop: 4,
  },
  statValueSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.text,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  timelineSection: {
    marginBottom: 20,
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  dateTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    textTransform: 'capitalize',
  },
  dateBadge: {
    backgroundColor: Colors.light.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.primary,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  eventTimeline: {
    alignItems: 'center',
    marginRight: 12,
  },
  eventDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  eventLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.light.border,
    marginTop: 4,
    display: 'none',
  },
  eventContent: {
    flex: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
  },
  eventSubtitle: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  eventMeta: {
    alignItems: 'flex-end',
  },
  eventTime: {
    fontSize: 11,
    color: Colors.light.textTertiary,
  },
  eventValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  eventFooter: {
    flexDirection: 'row',
    gap: 8,
  },
  eventBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  eventBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 24,
  },
});
